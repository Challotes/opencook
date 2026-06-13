/**
 * Multi-output BSV transaction builder for boot fee splits.
 * Single transaction: payer → all contributors + platform + OP_RETURN.
 */

import type { LockingScript } from "@bsv/sdk";
import { OP, P2PKH, Script } from "@bsv/sdk";
import { type BroadcastResult, buildAndBroadcast } from "@/services/bsv/wallet";
import { FAIRNESS_CONFIG } from "./config";
import type { SplitResult } from "./split";

/**
 * Build and broadcast the split transaction for a boot.
 * Retries once after 1 second on failure (handles stale UTXO contention).
 */
export async function buildSplitTransaction(
  split: SplitResult,
  postId: number
): Promise<BroadcastResult> {
  const p2pkh = new P2PKH();

  // Collect all payment outputs (deduplicate by address)
  const outputsByAddress = new Map<string, number>();

  // Platform output
  if (split.platform.sats > 0) {
    outputsByAddress.set(
      split.platform.address,
      (outputsByAddress.get(split.platform.address) ?? 0) + split.platform.sats
    );
  }

  // Creator bonus (if not already merged into pool entry)
  if (split.creatorBonus.sats > 0) {
    outputsByAddress.set(
      split.creatorBonus.address,
      (outputsByAddress.get(split.creatorBonus.address) ?? 0) + split.creatorBonus.sats
    );
  }

  // Pool shares
  for (const recipient of split.pool) {
    if (recipient.sats > 0) {
      outputsByAddress.set(
        recipient.address,
        (outputsByAddress.get(recipient.address) ?? 0) + recipient.sats
      );
    }
  }

  // Build transaction outputs
  const outputs: Array<{ lockingScript: LockingScript; satoshis: number }> = [];

  for (const [address, sats] of outputsByAddress) {
    if (sats > 0) {
      outputs.push({
        lockingScript: p2pkh.lock(address) as LockingScript,
        satoshis: sats,
      });
    }
  }

  // OP_RETURN audit trail
  const auditPayload = JSON.stringify({
    v: 1,
    app: "bsvibes",
    type: "boot_split",
    post_id: postId,
    total: split.totalDistributed,
    recipients: outputsByAddress.size,
    formula_version: FAIRNESS_CONFIG.formulaVersion,
    ts: Date.now(),
  });

  const opReturnScript = new Script();
  opReturnScript.writeOpCode(OP.OP_FALSE);
  opReturnScript.writeOpCode(OP.OP_RETURN);
  opReturnScript.writeBin(Array.from(new TextEncoder().encode(auditPayload)));

  outputs.push({
    lockingScript: opReturnScript as LockingScript,
    satoshis: 0,
  });

  const result = await buildAndBroadcast(outputs);
  if (result.status === "success") return result;

  // First attempt failed — wait 1s and retry once with fresh UTXO state.
  // The mutex ensures the retry waits for any in-flight transaction to finish.
  // Common cause: stale WoC data returned an already-spent UTXO.
  console.warn(
    `BSVibes: boot split first attempt failed for post ${postId}, retrying in 1s...`,
    result
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return buildAndBroadcast(outputs);
}
