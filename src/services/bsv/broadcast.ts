/**
 * Thin seam wrapping the BSV SDK's Transaction.broadcast().
 *
 * Extracted so integration tests can mock ARC / broadcast without touching
 * the money-path logic in boot-confirm. The signature is identical to calling
 * `parsed.broadcast()` directly — this is a pure additive extraction with no
 * behavioral change.
 *
 * IMPORTANT: do not add retry logic, error-wrapping, or any additional
 * behavior here. The existing boot-confirm callers depend on the EXACT
 * return shape produced by the SDK.
 */

type BsvTransaction = import("@bsv/sdk").Transaction;

export async function broadcastTx(
  tx: BsvTransaction
): Promise<Awaited<ReturnType<BsvTransaction["broadcast"]>>> {
  return tx.broadcast();
}
