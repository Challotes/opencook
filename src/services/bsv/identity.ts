/**
 * BSV identity management for BSVibes.
 * Auto-generates a keypair on first visit.
 * Supports plaintext (Phase 1) and encrypted (Phase 4) storage.
 * Private key never leaves the browser.
 */

const STORAGE_KEY = "bfn_keypair";
const OLD_IDENTITY_KEY = "bfn_identity";
const ENCRYPTED_KEY = "bfn_keypair_enc";

interface StoredIdentity {
  wif: string;
  name: string;
  address: string;
}

import type { Identity } from "@/types";

export type { Identity };

import { generateAnonName } from "@/lib/utils";
import { decryptWif, encryptWif, isEncrypted } from "./crypto";

// Rotation lock — prevents concurrent Move + Upgrade from racing
let _rotationInProgress = false;

/**
 * Cached BSV SDK module promise — imported once, reused everywhere.
 */
let _bsvSdkPromise: Promise<typeof import("@bsv/sdk")> | null = null;

function getBsvSdk(): Promise<typeof import("@bsv/sdk")> {
  if (!_bsvSdkPromise) {
    _bsvSdkPromise = import("@bsv/sdk");
  }
  return _bsvSdkPromise;
}

/**
 * Cached PrivateKey — WIF never changes for a session, so parse it once.
 */
let _cachedWif: string | null = null;
let _cachedPrivateKey: import("@bsv/sdk").PrivateKey | null = null;

/**
 * Session-cached identity for encrypted mode — decrypted once per session.
 */
let _sessionIdentity: Identity | null = null;

/** Get existing identity from storage (plaintext only). */
function getStoredIdentity(): StoredIdentity | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  let parsed: StoredIdentity;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed.wif) return null;
  return parsed as StoredIdentity;
}

/** Check if the identity is stored in encrypted format. */
export function isIdentityEncrypted(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(ENCRYPTED_KEY);
  if (raw === null) return false;
  // The encrypted store is a JSON wrapper: { encrypted: "enc:...", name, address }.
  // isEncrypted() checks for the "enc:" prefix, so we must check the inner field,
  // not the raw JSON string (which starts with "{").
  try {
    const parsed = JSON.parse(raw) as { encrypted?: string };
    if (typeof parsed.encrypted === "string") {
      return isEncrypted(parsed.encrypted);
    }
  } catch {
    // Fallback: maybe it was stored as a bare "enc:..." string (legacy).
  }
  // Legacy fallback: bare encrypted string without JSON wrapper.
  return isEncrypted(raw);
}

/** Check for old identity format (just a name string, no keypair). */
function getOldIdentityName(): string | null {
  if (typeof window === "undefined") return null;
  const oldName = localStorage.getItem(OLD_IDENTITY_KEY);
  if (oldName && /^anon_[a-z0-9]{4}$/.test(oldName)) return oldName;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    let parsed: StoredIdentity;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed.wif && parsed.name) return parsed.name;
  }
  return null;
}

/** Get or create the user's identity. Returns null if encrypted (needs unlock). */
export async function getIdentity(): Promise<Identity | null> {
  if (typeof window === "undefined") return null;

  // If session has a decrypted identity, use it
  if (_sessionIdentity) return _sessionIdentity;

  // If encrypted, check whether a plaintext identity also exists (interrupted upgrade).
  // If so, prefer the plaintext one so the user isn't locked out.
  if (isIdentityEncrypted()) {
    const plaintext = getStoredIdentity();
    if (plaintext) {
      console.warn(
        "[BSVibes] getIdentity: encrypted key exists but plaintext key also present — " +
          "likely an interrupted upgrade. Using plaintext identity."
      );
      getBsvSdk();
      return { name: plaintext.name, address: plaintext.address, wif: plaintext.wif };
    }
    return null;
  }

  const stored = getStoredIdentity();
  if (stored) {
    // Double-check: if an encrypted key ALSO exists, this plaintext is stale (from a race).
    // Remove it and return null so the unlock prompt appears.
    if (isIdentityEncrypted()) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return null;
    }
    getBsvSdk();
    return { name: stored.name, address: stored.address, wif: stored.wif };
  }

  // Don't generate a new key if an encrypted identity exists — user needs to unlock
  if (isIdentityEncrypted()) return null;

  const oldName = getOldIdentityName();

  const { PrivateKey } = await getBsvSdk();
  const key = PrivateKey.fromRandom();
  const address = key.toAddress().toString();
  const name = oldName ?? generateAnonName();
  const wif = key.toWif();

  // Final guard before writing: re-check both keys in case a concurrent call or
  // a commitUpgrade() wrote something between the async getBsvSdk() await above.
  if (isIdentityEncrypted()) return null;
  const raceCheck = getStoredIdentity();
  if (raceCheck) {
    return { name: raceCheck.name, address: raceCheck.address, wif: raceCheck.wif };
  }

  const store: StoredIdentity = { wif, name, address };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn("BSVibes: could not persist identity to localStorage", err);
  }

  if (oldName) {
    try {
      localStorage.removeItem(OLD_IDENTITY_KEY);
    } catch {
      // Non-critical
    }
  }

  return { name, address, wif };
}

/**
 * Unlock an encrypted identity with a passphrase.
 * Returns the identity if passphrase is correct, null if wrong.
 * Caches the decrypted identity in memory for the session.
 */
export async function unlockIdentity(passphrase: string): Promise<Identity | null> {
  if (typeof window === "undefined") return null;

  const enc = localStorage.getItem(ENCRYPTED_KEY);
  if (!enc) return null;

  // The encrypted format stores: enc:<base64> with metadata as a JSON wrapper
  let encData: { encrypted: string; name: string; address: string };
  try {
    encData = JSON.parse(enc);
  } catch {
    return null;
  }

  const wif = await decryptWif(encData.encrypted, passphrase);
  if (!wif) return null;

  // Cache for session
  _sessionIdentity = { name: encData.name, address: encData.address, wif };

  // Pre-warm SDK and cache key
  const { PrivateKey } = await getBsvSdk();
  _cachedWif = wif;
  _cachedPrivateKey = PrivateKey.fromWif(wif);

  return _sessionIdentity;
}

/**
 * Fetch source tx hexes in batches through our server-side proxy (/api/tx-hex).
 *
 * Since the proxy runs server-to-server (no CORS, no browser rate limit),
 * we can use larger batches with shorter delays. Default: 10 concurrent
 * requests per batch with 100ms gaps — fetches 92 unique txs in ~1 second.
 */
async function fetchSourceTxsBatched(
  txHashes: string[],
  _wocBase: string,
  batchSize = 10,
  delayMs = 100
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  // Deduplicate: multiple UTXOs can share the same parent tx
  const unique = [...new Set(txHashes)];

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (txHash) => {
        // Proxy through our server to avoid CORS on WoC /tx/hex endpoint
        const hexRes = await fetch(`/api/tx-hex?txid=${txHash}`);
        if (!hexRes.ok) {
          throw new Error(`Source tx fetch failed for ${txHash}: HTTP ${hexRes.status}`);
        }
        const hex = await hexRes.text();
        result.set(txHash, hex);
      })
    );
    // Throttle between batches (skip delay after last batch)
    if (i + batchSize < unique.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return result;
}

/**
 * Auto-transfer ALL funds from old address to new address during upgrade.
 * Builds a single P2PKH transaction spending every UTXO from old → new.
 *
 * No input cap — a tx with 200 P2PKH inputs is ~30 KB, well within BSV's
 * standard limits. Source txs are fetched through our server-side proxy
 * in batches of 10 with 100ms gaps (~1 second for 100 unique txs).
 *
 * Returns the txid on success, null if no funds or transfer fails.
 */
async function autoTransferFunds(
  oldWif: string,
  oldAddress: string,
  newAddress: string
): Promise<{ txid: string | null; transferredSats: number; error?: string; noFunds?: boolean }> {
  try {
    console.log(`[BSVibes] autoTransferFunds: fetching UTXOs for ${oldAddress}`);

    // Use the cached proxy instead of hitting WoC directly — gets retry,
    // stale fallback, and rate-limit protection. fresh=1 bypasses cache TTL.
    const utxoRes = await fetch(`/api/unspent?address=${encodeURIComponent(oldAddress)}&fresh=1`);
    if (!utxoRes.ok) {
      const msg = `UTXO fetch failed: HTTP ${utxoRes.status} for ${oldAddress}`;
      console.error(`[BSVibes] autoTransferFunds: ${msg}`);
      return { txid: null, transferredSats: 0, error: msg };
    }

    const utxoData = await utxoRes.json();
    if (!Array.isArray(utxoData) || utxoData.length === 0) {
      console.log(
        `[BSVibes] autoTransferFunds: no UTXOs found at ${oldAddress} — nothing to transfer`
      );
      return { txid: null, transferredSats: 0, noFunds: true };
    }

    const utxos = utxoData as Array<{ tx_hash: string; tx_pos: number; value: number }>;
    const totalSats = utxos.reduce((sum, u) => sum + u.value, 0);
    if (totalSats === 0) {
      return { txid: null, transferredSats: 0, noFunds: true };
    }

    console.log(
      `[BSVibes] autoTransferFunds: found ${utxos.length} UTXOs, total ${totalSats} sats`
    );

    const { Transaction, PrivateKey, P2PKH, SatoshisPerKilobyte } = await getBsvSdk();
    const oldKey = PrivateKey.fromWif(oldWif);

    const txHashes = utxos.map((u) => u.tx_hash);
    console.log(
      `[BSVibes] autoTransferFunds: fetching ${new Set(txHashes).size} unique source txs via proxy`
    );
    const sourceTxHexMap = await fetchSourceTxsBatched(txHashes, "");

    const tx = new Transaction();
    for (const utxo of utxos) {
      const hex = sourceTxHexMap.get(utxo.tx_hash);
      if (!hex) throw new Error(`Missing source tx hex for ${utxo.tx_hash}`);
      const sourceTx = Transaction.fromHex(hex);
      tx.addInput({
        sourceTransaction: sourceTx,
        sourceOutputIndex: utxo.tx_pos,
        unlockingScriptTemplate: new P2PKH().unlock(oldKey),
      });
    }

    tx.addOutput({
      lockingScript: new P2PKH().lock(newAddress),
      change: true,
    });

    await tx.fee(new SatoshisPerKilobyte(100));
    await tx.sign();

    console.log(`[BSVibes] autoTransferFunds: broadcasting tx with ${utxos.length} inputs`);
    const broadcastResult = await tx.broadcast();

    if (broadcastResult.status === "success") {
      const txid = tx.id("hex") as string;
      console.log(
        `[BSVibes] autoTransferFunds: SUCCESS — transferred ${totalSats} sats. txid: ${txid}`
      );
      return { txid, transferredSats: totalSats };
    }

    const broadcastError = `Broadcast failed: ${
      typeof broadcastResult === "object"
        ? JSON.stringify(broadcastResult)
        : String(broadcastResult)
    }`;
    console.error(`[BSVibes] autoTransferFunds: ${broadcastError}`);
    return { txid: null, transferredSats: 0, error: broadcastError };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[BSVibes] autoTransferFunds: exception —", msg, e);
    return { txid: null, transferredSats: 0, error: msg };
  }
}

/**
 * Upgrade identity: generate new key, encrypt it, sign migration.
 * Auto-transfers any funds from old address to new address.
 * Returns the new identity + migration data for on-chain posting.
 */
/**
 * Commit an upgrade that was prepared by upgradeIdentity().
 * Writes the encrypted store to localStorage and removes the old plaintext key.
 * Call this ONLY after the server migration has been confirmed.
 */
export function commitUpgrade(encStore: string, identity?: Identity): void {
  try {
    localStorage.setItem(ENCRYPTED_KEY, encStore);
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("BSVibes: could not commit upgrade to localStorage", err);
  }
  if (identity) {
    _sessionIdentity = identity;
    _cachedWif = identity.wif;
    _cachedPrivateKey = null;
  }
}

export async function upgradeIdentity(
  passphrase: string,
  oldWif: string,
  currentName: string,
  hint?: string
): Promise<{
  identity: Identity;
  encStore: string;
  migration: {
    oldPubkey: string;
    newPubkey: string;
    migrationMessage: string;
    migrationSignature: string;
  };
  fundTransfer: {
    txid: string | null;
    transferredSats: number;
    error?: string;
    noFunds?: boolean;
  };
}> {
  if (_rotationInProgress) {
    throw new Error("An identity change is already in progress");
  }
  _rotationInProgress = true;
  try {
    return await _upgradeIdentityInner(passphrase, oldWif, currentName, hint);
  } finally {
    _rotationInProgress = false;
  }
}

async function _upgradeIdentityInner(
  passphrase: string,
  oldWif: string,
  currentName: string,
  hint?: string
): Promise<{
  identity: Identity;
  encStore: string;
  migration: {
    oldPubkey: string;
    newPubkey: string;
    migrationMessage: string;
    migrationSignature: string;
  };
  fundTransfer: {
    txid: string | null;
    transferredSats: number;
    error?: string;
    noFunds?: boolean;
  };
}> {
  const { PrivateKey } = await getBsvSdk();

  // Generate new keypair
  const newKey = PrivateKey.fromRandom();
  const newWif = newKey.toWif();
  const newAddress = newKey.toPublicKey().toAddress().toString();
  const newPubkey = newKey.toPublicKey().toString();

  // Old key signs migration message
  const oldKey = PrivateKey.fromWif(oldWif);
  const oldPubkey = oldKey.toPublicKey().toString();
  const oldAddress = oldKey.toPublicKey().toAddress().toString();

  const migrationMessage = JSON.stringify({
    app: "bsvibes",
    type: "migration",
    from_pubkey: oldPubkey,
    to_pubkey: newPubkey,
    ts: Date.now(),
  });

  const msgBytes = Array.from(new TextEncoder().encode(migrationMessage));
  const sig = oldKey.sign(msgBytes);
  const migrationSignature = sig.toDER("hex") as string;

  // Auto-transfer funds from old address to new address BEFORE storing new key
  const fundTransfer = await autoTransferFunds(oldWif, oldAddress, newAddress);

  // Encrypt new WIF
  const encrypted = await encryptWif(newWif, passphrase);

  // Build encrypted store string — caller must commit this after server confirms migration
  const encStore = JSON.stringify({
    encrypted,
    name: currentName,
    address: newAddress,
    ...(hint ? { hint } : {}),
  });

  // Do NOT set session caches here. Caller must call commitUpgrade() after
  // migrateIdentity() succeeds. If we set caches now and migration fails,
  // the in-memory signing key diverges from the server's identity record.
  const identity: Identity = { name: currentName, address: newAddress, wif: newWif };

  return {
    identity,
    encStore,
    migration: {
      oldPubkey,
      newPubkey,
      migrationMessage,
      migrationSignature,
    },
    fundTransfer,
  };
}

/**
 * Sweep all UTXOs from old address to new address.
 * At 100 sat/kb (GorillaPool's minimum), all txs confirm in the next block,
 * so unconfirmed UTXOs are safe to include.
 *
 * Exported so MoveAddressModal can retry independently on failure.
 */
export async function sweepFunds(
  oldWif: string,
  oldAddress: string,
  newAddress: string
): Promise<{ txid: string | null; transferredSats: number; error?: string; noFunds?: boolean }> {
  try {
    console.log(`[BSVibes] sweepFunds: fetching UTXOs for ${oldAddress}`);

    // Use the cached proxy instead of hitting WoC directly — gets retry,
    // stale fallback, and rate-limit protection. fresh=1 bypasses cache TTL.
    const utxoRes = await fetch(`/api/unspent?address=${encodeURIComponent(oldAddress)}&fresh=1`);
    if (!utxoRes.ok) {
      const msg = `UTXO fetch failed: HTTP ${utxoRes.status} for ${oldAddress}`;
      console.error(`[BSVibes] sweepFunds: ${msg}`);
      return { txid: null, transferredSats: 0, error: msg };
    }

    const utxoData = await utxoRes.json();
    if (!Array.isArray(utxoData) || utxoData.length === 0) {
      console.log(`[BSVibes] sweepFunds: no UTXOs found at ${oldAddress} — nothing to transfer`);
      return { txid: null, transferredSats: 0, noFunds: true };
    }

    const utxos = utxoData as Array<{ tx_hash: string; tx_pos: number; value: number }>;
    const totalSats = utxos.reduce((sum, u) => sum + u.value, 0);
    if (totalSats === 0) {
      return { txid: null, transferredSats: 0, noFunds: true };
    }

    console.log(`[BSVibes] sweepFunds: spending ${utxos.length} inputs, total ${totalSats} sats`);

    const { Transaction, PrivateKey, P2PKH, SatoshisPerKilobyte } = await getBsvSdk();
    const oldKey = PrivateKey.fromWif(oldWif);

    const txHashes = utxos.map((u) => u.tx_hash);
    console.log(
      `[BSVibes] sweepFunds: fetching ${new Set(txHashes).size} unique source txs via proxy`
    );
    const sourceTxHexMap = await fetchSourceTxsBatched(txHashes, "");

    const tx = new Transaction();
    for (const utxo of utxos) {
      const hex = sourceTxHexMap.get(utxo.tx_hash);
      if (!hex) throw new Error(`Missing source tx hex for ${utxo.tx_hash}`);
      const sourceTx = Transaction.fromHex(hex);
      tx.addInput({
        sourceTransaction: sourceTx,
        sourceOutputIndex: utxo.tx_pos,
        unlockingScriptTemplate: new P2PKH().unlock(oldKey),
      });
    }

    tx.addOutput({
      lockingScript: new P2PKH().lock(newAddress),
      change: true,
    });

    await tx.fee(new SatoshisPerKilobyte(100));
    await tx.sign();

    console.log(`[BSVibes] sweepFunds: broadcasting tx with ${utxos.length} inputs`);
    const broadcastResult = await tx.broadcast();

    if (broadcastResult.status === "success") {
      const txid = tx.id("hex") as string;
      console.log(`[BSVibes] sweepFunds: SUCCESS — transferred ${totalSats} sats. txid: ${txid}`);
      return { txid, transferredSats: totalSats };
    }

    const broadcastError = `Broadcast failed: ${
      typeof broadcastResult === "object"
        ? JSON.stringify(broadcastResult)
        : String(broadcastResult)
    }`;
    console.error(`[BSVibes] sweepFunds: ${broadcastError}`);
    return { txid: null, transferredSats: 0, error: broadcastError };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[BSVibes] sweepFunds: exception —", msg, e);
    return { txid: null, transferredSats: 0, error: msg };
  }
}

/**
 * Reset identity: generate a fresh keypair, sweep CONFIRMED-only funds to the
 * new address, and store the new identity as plaintext (no passphrase required).
 *
 * This is a recovery escape hatch for wallets stuck due to phantom unconfirmed
 * UTXOs (orphan-mempool state poisoning). Encrypted users are reset to plaintext
 * — they can re-upgrade afterwards.
 */
export async function resetIdentity(
  currentWif: string,
  currentName: string,
  options?: { deferCommit?: boolean }
): Promise<{
  identity: Identity;
  migration: {
    oldPubkey: string;
    newPubkey: string;
    migrationMessage: string;
    migrationSignature: string;
  };
  fundTransfer: {
    txid: string | null;
    transferredSats: number;
    error?: string;
    noFunds?: boolean;
  };
  commit: () => void;
}> {
  if (_rotationInProgress) {
    throw new Error("An identity change is already in progress");
  }
  _rotationInProgress = true;
  try {
    return await _resetIdentityInner(currentWif, currentName, options);
  } finally {
    _rotationInProgress = false;
  }
}

async function _resetIdentityInner(
  currentWif: string,
  currentName: string,
  options?: { deferCommit?: boolean }
): Promise<{
  identity: Identity;
  migration: {
    oldPubkey: string;
    newPubkey: string;
    migrationMessage: string;
    migrationSignature: string;
  };
  fundTransfer: {
    txid: string | null;
    transferredSats: number;
    error?: string;
    noFunds?: boolean;
  };
  commit: () => void;
}> {
  const { PrivateKey } = await getBsvSdk();

  // Generate new keypair
  const newKey = PrivateKey.fromRandom();
  const newWif = newKey.toWif();
  const newAddress = newKey.toPublicKey().toAddress().toString();
  const newPubkey = newKey.toPublicKey().toString();

  // Old key signs migration message
  const oldKey = PrivateKey.fromWif(currentWif);
  const oldPubkey = oldKey.toPublicKey().toString();
  const oldAddress = oldKey.toPublicKey().toAddress().toString();

  const migrationMessage = JSON.stringify({
    app: "bsvibes",
    type: "migration",
    from_pubkey: oldPubkey,
    to_pubkey: newPubkey,
    ts: Date.now(),
  });

  const msgBytes = Array.from(new TextEncoder().encode(migrationMessage));
  const sig = oldKey.sign(msgBytes);
  const migrationSignature = sig.toDER("hex") as string;

  // Sweep confirmed-only funds (leaves phantom UTXOs behind)
  const fundTransfer = await sweepFunds(currentWif, oldAddress, newAddress);

  const identity: Identity = { name: currentName, address: newAddress, wif: newWif };

  // Deferred commit: caller invokes commit() only after all downstream steps
  // (migrateIdentity, etc.) succeed. Prevents the bug where localStorage
  // updates to the new key but the sweep/migration failed — stranding funds.
  const commit = () => {
    const store: StoredIdentity = { wif: newWif, name: currentName, address: newAddress };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      localStorage.removeItem(ENCRYPTED_KEY);
    } catch (err) {
      console.warn("[BSVibes] resetIdentity commit failed", err);
    }
    _sessionIdentity = identity;
    _cachedWif = newWif;
    _cachedPrivateKey = newKey;
  };

  if (!options?.deferCommit) commit();

  return {
    identity,
    migration: {
      oldPubkey,
      newPubkey,
      migrationMessage,
      migrationSignature,
    },
    fundTransfer,
    commit,
  };
}

/** Sign post content. Returns signature + pubkey hex. */
export async function signPost(
  content: string
): Promise<{ signature: string; pubkey: string } | null> {
  if (typeof window === "undefined") return null;

  // Try session identity first (encrypted mode), then stored (plaintext mode)
  const wif = _sessionIdentity?.wif ?? getStoredIdentity()?.wif;
  if (!wif) return null;

  const { PrivateKey } = await getBsvSdk();

  if (_cachedWif !== wif || !_cachedPrivateKey) {
    _cachedWif = wif;
    _cachedPrivateKey = PrivateKey.fromWif(wif);
  }

  const messageBytes = Array.from(new TextEncoder().encode(content));
  const sig = _cachedPrivateKey.sign(messageBytes);

  return {
    signature: sig.toDER("hex") as string,
    pubkey: _cachedPrivateKey.toPublicKey().toString(),
  };
}

/** Pre-warm the BSV SDK by starting the download early. */
export function preWarmBsvSdk(): void {
  getBsvSdk();
}

/**
 * Import an identity from a raw WIF string (or a backup JSON file's WIF field).
 * Validates the WIF, derives the address, stores in localStorage (plaintext).
 * Replaces any existing identity — caller is responsible for confirming with the user.
 * @param wif    - A Base58-encoded WIF private key string.
 * @param name   - Optional display name. Falls back to generating a new anon name.
 */
export async function importIdentity(
  wif: string,
  name?: string
): Promise<Identity & { pubkey: string }> {
  if (typeof window === "undefined") {
    throw new Error("importIdentity can only run in the browser");
  }

  const trimmed = wif.trim();
  if (!trimmed) throw new Error("WIF is required");

  const { PrivateKey } = await getBsvSdk();

  let key: import("@bsv/sdk").PrivateKey;
  try {
    key = PrivateKey.fromWif(trimmed);
  } catch {
    throw new Error("Invalid key — please check and try again");
  }

  const pubkey = key.toPublicKey().toString();
  const address = key.toPublicKey().toAddress().toString();
  const identityName = (name ?? "").trim() || generateAnonName();

  const store: StoredIdentity = { wif: trimmed, name: identityName, address };

  // Clear any existing encrypted identity so the app uses the new plaintext one.
  // This is critical: a previous failed upgrade may have written bfn_keypair_enc
  // while leaving the user on a new key. Clearing it here ensures isIdentityEncrypted()
  // returns false after import, so the UI shows "Not protected" rather than "Identity protected".
  localStorage.removeItem(ENCRYPTED_KEY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

  // Reset ALL session caches — the identity has fully changed
  _sessionIdentity = null;
  _cachedWif = trimmed;
  _cachedPrivateKey = key;

  return { name: identityName, address, wif: trimmed, pubkey };
}
