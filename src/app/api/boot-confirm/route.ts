import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getServerAddress } from "@/services/bsv/wallet";
import { getBootPrice } from "@/services/fairness/pricing";
import { calculateSplit } from "@/services/fairness/split";
import { calculateWeights } from "@/services/fairness/weights";

interface BootConfirmBody {
  postId: number;
  txid: string;
  rawTx?: string;
  booterAddress: string;
  booterName: string;
}

export async function POST(req: NextRequest) {
  let body: BootConfirmBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { postId, txid, rawTx, booterAddress, booterName } = body;

  if (!Number.isInteger(postId) || postId <= 0) {
    return NextResponse.json({ error: "Invalid postId" }, { status: 400 });
  }
  if (typeof txid !== "string" || txid.trim().length === 0) {
    return NextResponse.json({ error: "Missing txid" }, { status: 400 });
  }

  // Validate txid format: must be exactly 64 hex characters
  if (!/^[a-fA-F0-9]{64}$/.test(txid.trim())) {
    return NextResponse.json({ error: "Invalid txid format" }, { status: 400 });
  }

  // Rate limit: 10 confirmations per minute per IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`boot-confirm:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Replay protection: reject if this txid was already recorded
  const existingPayout = db
    .prepare("SELECT id FROM payouts WHERE txid = ? LIMIT 1")
    .get(txid.trim()) as { id: number } | undefined;
  if (existingPayout) {
    return NextResponse.json({ error: "Transaction already recorded" }, { status: 409 });
  }

  // Verify the transaction by parsing the raw tx hex sent by the client.
  // The tx bytes are self-authenticating: txid = hash(bytes), so a forged
  // rawTx produces a different txid and fails the binding check below.
  // This removes the dependency on WhatsOnChain indexing (which has 5-30s+
  // propagation lag from ARC and can rate-limit the server).
  if (typeof rawTx !== "string" || rawTx.trim().length === 0) {
    return NextResponse.json({ error: "Missing rawTx" }, { status: 400 });
  }
  if (!/^[a-fA-F0-9]+$/.test(rawTx.trim()) || rawTx.trim().length % 2 !== 0) {
    return NextResponse.json({ error: "Invalid rawTx format" }, { status: 400 });
  }

  interface ParsedVout {
    sats: number;
    address: string | null;
  }
  let txVouts: ParsedVout[] = [];
  try {
    const { Transaction, Utils } = await import("@bsv/sdk");
    const OP_DUP = 0x76;
    const OP_HASH160 = 0xa9;
    const OP_EQUALVERIFY = 0x88;
    const OP_CHECKSIG = 0xac;
    const parsed = Transaction.fromHex(rawTx.trim());

    // Bind rawTx to claimed txid — prevents substitution attacks
    const parsedTxid = parsed.id("hex") as string;
    if (parsedTxid !== txid.trim()) {
      return NextResponse.json({ error: "rawTx does not match txid" }, { status: 400 });
    }

    // Server re-broadcasts the signed tx via ARC as an idempotent safety net.
    // If the client's broadcast succeeded, ARC returns code 257 "already known"
    // (still success — tx is in mempool). If the client's broadcast silently
    // failed, ARC accepts the fresh submission. Either way, past this point
    // the tx is GUARANTEED in ARC's mempool — eliminates phantom recordings.
    const broadcast = await parsed.broadcast();
    const bcResult = broadcast as {
      status?: string | number;
      code?: string | number;
      description?: string;
    };
    const bcCode = String(bcResult.code ?? "").trim();
    const bcDesc = (bcResult.description ?? "").toLowerCase();
    const bcAlreadyKnown =
      broadcast.status !== "success" &&
      bcCode !== "258" &&
      !bcDesc.includes("conflict") &&
      (bcCode === "257" ||
        /\balready[- ]known\b/.test(bcDesc) ||
        bcDesc.includes("already in the mempool"));

    if (broadcast.status !== "success" && !bcAlreadyKnown) {
      if (bcCode === "258" || bcDesc.includes("conflict") || bcDesc.includes("missing inputs")) {
        console.warn(
          `[BSVibes] boot-confirm: TX_CONFLICT for ${txid.slice(0, 16)}… — ${bcDesc || bcCode}`
        );
        return NextResponse.json(
          {
            error: "Transaction conflicts with chain (inputs already spent)",
            code: "TX_CONFLICT",
          },
          { status: 409 }
        );
      }
      console.warn(
        `[BSVibes] boot-confirm: ARC_UNAVAILABLE for ${txid.slice(0, 16)}… — ${bcDesc || bcCode}`
      );
      return NextResponse.json(
        { error: "Could not confirm broadcast, please retry", code: "ARC_UNAVAILABLE" },
        { status: 503 }
      );
    }

    // Extract (sats, address) from each output by matching P2PKH locking scripts.
    // Inspect chunks directly — P2PKH.lock() builds { op: 20, data } for the push,
    // which toASM() can render inconsistently across SDK versions.
    txVouts = parsed.outputs.map((out) => {
      const sats = out.satoshis ?? 0;
      let address: string | null = null;
      try {
        const chunks = out.lockingScript.chunks;
        if (
          chunks.length === 5 &&
          chunks[0].op === OP_DUP &&
          chunks[1].op === OP_HASH160 &&
          chunks[2].op === 20 &&
          chunks[2].data?.length === 20 &&
          chunks[3].op === OP_EQUALVERIFY &&
          chunks[4].op === OP_CHECKSIG
        ) {
          // toBase58Check defaults prefix=[0x00] (mainnet) and prepends it to
          // `bin`. Pass raw 20-byte hash, NOT versioned bytes, to avoid the
          // double-prefix that produces 35-char "11..." addresses.
          address = Utils.toBase58Check(chunks[2].data);
        }
      } catch {
        /* non-P2PKH output (e.g. OP_RETURN) — no address */
      }
      return { sats, address };
    });
  } catch (err) {
    console.error("[BSVibes] boot-confirm: rawTx parse failed", err);
    return NextResponse.json({ error: "Could not parse rawTx" }, { status: 400 });
  }

  if (typeof booterAddress !== "string" || booterAddress.trim().length === 0) {
    return NextResponse.json({ error: "Missing booterAddress" }, { status: 400 });
  }
  // booterName defaults to booterAddress if not provided (backward compat)
  const displayName =
    typeof booterName === "string" && booterName.trim().length > 0
      ? booterName.trim()
      : booterAddress;

  // Validate the post exists and has a pubkey (so we can pay the creator)
  const post = db.prepare("SELECT id, pubkey FROM posts WHERE id = ?").get(postId) as
    | { id: number; pubkey: string | null }
    | undefined;

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (!post.pubkey) {
    return NextResponse.json({ error: "Post is unsigned — cannot be booted" }, { status: 422 });
  }

  const platformAddress = getServerAddress();
  if (!platformAddress) {
    return NextResponse.json({ error: "Server wallet not configured" }, { status: 503 });
  }

  // Recalculate the split at current prices so we have accurate payout records
  const bootPrice = getBootPrice(db);
  const weights = calculateWeights(db);

  let creatorAddress: string;
  try {
    const { PublicKey } = await import("@bsv/sdk");
    creatorAddress = PublicKey.fromString(post.pubkey).toAddress().toString();
  } catch {
    return NextResponse.json({ error: "Invalid creator pubkey" }, { status: 422 });
  }

  const split = calculateSplit(bootPrice, post.pubkey, creatorAddress, platformAddress, weights);

  // Verify on-chain outputs match the expected split.
  // Build a map of expected address → sats from the split.
  const expectedOutputs = new Map<string, number>();
  if (split.platform.sats > 0) {
    expectedOutputs.set(
      split.platform.address,
      (expectedOutputs.get(split.platform.address) ?? 0) + split.platform.sats
    );
  }
  if (split.creatorBonus.sats > 0) {
    expectedOutputs.set(
      split.creatorBonus.address,
      (expectedOutputs.get(split.creatorBonus.address) ?? 0) + split.creatorBonus.sats
    );
  }
  for (const r of split.pool) {
    if (r.sats > 0) {
      expectedOutputs.set(r.address, (expectedOutputs.get(r.address) ?? 0) + r.sats);
    }
  }

  // Check that each expected recipient appears in the tx outputs with at least the expected sats.
  // Allow 2 sat tolerance per output for fee rounding differences.
  const onChainByAddr = new Map<string, number>();
  for (const vout of txVouts) {
    if (vout.address) {
      onChainByAddr.set(vout.address, (onChainByAddr.get(vout.address) ?? 0) + vout.sats);
    }
  }

  for (const [addr, expectedSats] of expectedOutputs) {
    const actualSats = onChainByAddr.get(addr) ?? 0;
    if (actualSats < expectedSats - 2) {
      console.warn(
        `[BSVibes] boot-confirm: output mismatch for ${addr} — expected ${expectedSats}, got ${actualSats}`
      );
      console.warn("[BSVibes] boot-confirm: expected split:", [...expectedOutputs.entries()]);
      console.warn("[BSVibes] boot-confirm: on-chain outputs:", [...onChainByAddr.entries()]);
      console.warn("[BSVibes] boot-confirm: boot price:", bootPrice);
      return NextResponse.json(
        { error: "Transaction outputs do not match expected split" },
        { status: 400 }
      );
    }
  }

  // All SQLite writes wrapped in a single transaction
  db.transaction(() => {
    // Close the current bootboard holder
    db.prepare(`
      UPDATE bootboard SET held_until = datetime('now')
      WHERE held_until IS NULL
    `).run();

    // Insert the new bootboard entry.
    // boosted_by = BSV address (used for activity feed queries by address)
    // boosted_by_name = human-readable display name (anon_XXXX)
    const bootboardInsert = db
      .prepare(`
      INSERT INTO bootboard (post_id, boosted_by, boosted_by_name) VALUES (?, ?, ?)
    `)
      .run(postId, booterAddress, displayName);

    // Use the unique bootboard row ID as bootEventId so multiple boots on the
    // same post each get their own payout set — prevents double-counting in earnings.
    const bootEventId = bootboardInsert.lastInsertRowid as number;

    // Update or create boot_grants (paid boot — increment total_boots only)
    const existing = db
      .prepare("SELECT pubkey FROM boot_grants WHERE pubkey = ?")
      .get(booterAddress);

    if (existing) {
      db.prepare("UPDATE boot_grants SET total_boots = total_boots + 1 WHERE pubkey = ?").run(
        booterAddress
      );
    } else {
      db.prepare(
        "INSERT INTO boot_grants (pubkey, free_boots_used, total_boots) VALUES (?, 0, 1)"
      ).run(booterAddress);
    }

    // Record payouts for the audit trail
    if (split.platform.sats > 0) {
      db.prepare(
        "INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(bootEventId, "platform", split.platform.address, split.platform.sats, "platform", txid);
    }

    if (split.creatorBonus.sats > 0) {
      db.prepare(
        "INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(
        bootEventId,
        split.creatorBonus.pubkey,
        split.creatorBonus.address,
        split.creatorBonus.sats,
        "boost_bonus",
        txid
      );
    }

    for (const recipient of split.pool) {
      if (recipient.sats > 0) {
        db.prepare(
          "INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(bootEventId, recipient.pubkey, recipient.address, recipient.sats, "pool_share", txid);
      }
    }
  })();

  return NextResponse.json({ success: true });
}
