import { PrivateKey } from "@bsv/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionCaches, getIdentity, hasEncryptedStorePresent } from "./identity";

// Deep-audit Findings 1 & 3: getIdentity recovery branches.

const STORAGE_KEY = "bfn_keypair";
const ENCRYPTED_KEY = "bfn_keypair_enc";

function makeLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

function makePlaintext(address?: string) {
  const key = PrivateKey.fromRandom();
  return {
    wif: key.toWif(),
    name: "anon_old",
    address: address ?? key.toPublicKey().toAddress().toString(),
    pubkey: key.toPublicKey().toString(),
  };
}

describe("getIdentity recovery (deep-audit Findings 1 & 3)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", makeLocalStorage());
    clearSessionCaches();
  });
  afterEach(() => {
    clearSessionCaches();
    vi.unstubAllGlobals();
  });

  // ── Finding 1: both stores present ──
  it("SAME address → uses the plaintext (interrupted encrypt-in-place, no lockout)", async () => {
    const pt = makePlaintext();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pt));
    localStorage.setItem(
      ENCRYPTED_KEY,
      JSON.stringify({ encrypted: "enc:abc", name: pt.name, address: pt.address })
    );

    const id = await getIdentity({ allowAutoGen: false });

    expect(id?.address).toBe(pt.address);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull(); // plaintext kept
  });

  it("DIFFERENT address → routes to unlock, drops stale plaintext, KEEPS the restored key (interrupted restore)", async () => {
    const pt = makePlaintext(); // the device's OLD key
    const restoredAddr = PrivateKey.fromRandom().toPublicKey().toAddress().toString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pt));
    localStorage.setItem(
      ENCRYPTED_KEY,
      JSON.stringify({ encrypted: "enc:restored", name: "anon_new", address: restoredAddr })
    );

    const id = await getIdentity({ allowAutoGen: false });

    expect(id).toBeNull(); // → needsUnlock, NOT a silent revert to the old key
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull(); // stale old plaintext removed
    expect(localStorage.getItem(ENCRYPTED_KEY)).not.toBeNull(); // restored key preserved
  });

  it("encrypted store missing address metadata → defensively routes to unlock (does NOT use plaintext)", async () => {
    const pt = makePlaintext();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pt));
    localStorage.setItem(ENCRYPTED_KEY, JSON.stringify({ encrypted: "enc:noaddr", name: "x" }));

    const id = await getIdentity({ allowAutoGen: false });

    expect(id).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(ENCRYPTED_KEY)).not.toBeNull();
  });

  // ── Finding 3: corrupt encrypted store must never be auto-genned over ──
  it("corrupt/unparseable encrypted store → never auto-generates a new identity", async () => {
    localStorage.setItem(ENCRYPTED_KEY, '{ "encrypted": "enc:AAAA'); // truncated JSON

    const id = await getIdentity({ allowAutoGen: true });

    expect(id).toBeNull(); // routed to unlock, not a fresh anon
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull(); // no new plaintext written
    expect(hasEncryptedStorePresent()).toBe(true);
  });

  it("no encrypted store → first-visit auto-gen still works", async () => {
    const id = await getIdentity({ allowAutoGen: true });
    expect(id).not.toBeNull();
    expect(id?.wif).toBeTruthy();
  });

  it("empty/whitespace encrypted store is treated as absent (not a trap) → auto-gen proceeds", async () => {
    localStorage.setItem(ENCRYPTED_KEY, "   ");
    const id = await getIdentity({ allowAutoGen: true });
    expect(id).not.toBeNull();
  });
});
