/**
 * Ordinals receive-address derivation for OpenCook.
 *
 * Derives a user's "ordinals receive address" from their existing BSV identity
 * key using BRC-42 / Type-42 key derivation with an "anyone" counterparty
 * (`new PrivateKey(1)`) and a fixed, PUBLIC invoice string. This is the address
 * partner-airdropped tokens/collectibles are sent to — it is DISPLAY / RECEIVE
 * only.
 *
 * Security / correctness notes:
 * - The invoice string (`ORD_RECEIVE_INVOICE`) is PUBLIC and PERMANENT. It is
 *   not a secret — anyone can compute a user's ord address from their public
 *   pubkey (that is the whole point: the airdrop generator does exactly this).
 * - Funds/tokens landing at the derived address are spendable ONLY with the
 *   user's base key (the derivation is deterministic from that key). No new key
 *   material is created or stored.
 * - The server/anyone path (`ordAddressFromPubkey`) and the holder path
 *   (`ordAddressFromWif`) MUST produce the byte-identical address — the unit
 *   test pins this. If they ever diverge, airdrops go to an address the holder
 *   cannot derive-and-spend from.
 *
 * Import convention: static top-level `@bsv/sdk` import, mirroring the sibling
 * shared crypto util `boot-message.ts` / its unit test (which import from
 * "@bsv/sdk" statically and run under vitest without a browser). These are pure,
 * synchronous functions with no bundling concerns.
 */

import { PrivateKey, PublicKey } from "@bsv/sdk";

/**
 * PUBLIC, PERMANENT constant. A single trailing space changes every derived
 * address. Both the airdrop-list generator (server) AND the Collectibles UI
 * (client) MUST import THIS constant — never re-type the literal. Changing it
 * strands every prior airdrop. Do not "v2" it.
 */
export const ORD_RECEIVE_INVOICE = "opencook ord receive 1";

/**
 * Server / "anyone" path: compute the RECEIVE ADDRESS from a user's PUBLIC
 * pubkey hex. Used by the airdrop-list generator to address token outputs.
 */
export function ordAddressFromPubkey(pubkeyHex: string): string {
  const userPub = PublicKey.fromString(pubkeyHex);
  const anyone = new PrivateKey(1);
  return userPub.deriveChild(anyone, ORD_RECEIVE_INVOICE).toAddress().toString();
}

/**
 * Client path (holder of the WIF): computes the SAME address; used later when
 * the holder wants to send an ordinal from it. Must equal the pubkey-path
 * address byte-for-byte.
 */
export function ordAddressFromWif(wif: string): string {
  const userPriv = PrivateKey.fromWif(wif);
  const anyonePub = new PrivateKey(1).toPublicKey();
  return userPriv.deriveChild(anyonePub, ORD_RECEIVE_INVOICE).toPublicKey().toAddress().toString();
}
