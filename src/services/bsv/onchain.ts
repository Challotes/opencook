/**
 * On-chain post logging via OP_RETURN.
 * Each post gets an OP_FALSE OP_RETURN transaction with its data.
 */

import type { LockingScript } from "@bsv/sdk";
import { OP, Script } from "@bsv/sdk";
import { buildAndBroadcast } from "./wallet";

interface PostData {
  content: string;
  author: string;
  signature: string | null;
  pubkey: string | null;
}

/**
 * Log a post on-chain via OP_RETURN.
 * Returns txid on success, null on failure.
 * Retries once after 1 second on failure (handles UTXO contention).
 * Failures are non-fatal — the post still exists in SQLite.
 */
export async function logPostOnChain(postData: PostData): Promise<string | null> {
  const attempt = async (): Promise<string | null> => {
    const payload = JSON.stringify({
      v: 1,
      app: "bsvibes",
      type: "post",
      content: postData.content,
      author: postData.author,
      sig: postData.signature,
      pubkey: postData.pubkey,
      ts: Date.now(),
    });

    // Build OP_FALSE OP_RETURN script (BSV standard — provably unspendable)
    const opReturnScript = new Script();
    opReturnScript.writeOpCode(OP.OP_FALSE);
    opReturnScript.writeOpCode(OP.OP_RETURN);
    opReturnScript.writeBin(Array.from(new TextEncoder().encode(payload)));

    const result = await buildAndBroadcast([
      {
        lockingScript: opReturnScript as LockingScript,
        satoshis: 0,
      },
    ]);

    return result.status === "success" ? result.txid : null;
  };

  try {
    const txid = await attempt();
    if (txid) return txid;

    // First attempt failed — wait 1s and retry once with fresh UTXO state.
    // The mutex ensures the retry waits for any in-flight transaction to finish.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return await attempt();
  } catch (e) {
    console.error("BSVibes: on-chain logging failed", e);
    return null;
  }
}
