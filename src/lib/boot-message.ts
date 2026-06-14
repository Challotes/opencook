/**
 * Canonical message a booter signs to authenticate a paid boot at
 * `/api/boot-confirm`. The booter's identity key signs this string; the server
 * verifies the signature and derives the credited address from the verified
 * pubkey — so the client cannot forge boot attribution (see SECURITY_AUDIT.md
 * C3 / Step 7).
 *
 * SINGLE SOURCE OF TRUTH — both the client (`useBoot`) and the server
 * (`boot-confirm`) MUST build the signed string from this function. Any drift
 * (separator, ordering, trim) silently fails signature verification and 401s
 * EVERY real paid boot, so this is deliberately tiny and shared.
 *
 * Binds `postId` (cross-post replay defense) and `txid` (commits to the exact
 * tx bytes/outputs — the server independently re-derives txid from rawTx before
 * trusting it, so signing txid transitively binds to the broadcast outputs).
 */
export function bootConfirmMessage(postId: number, txid: string): string {
  return `boot:${postId}:${txid.trim()}`;
}
