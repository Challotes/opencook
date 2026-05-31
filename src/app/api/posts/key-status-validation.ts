/**
 * E30 shared validation for the staleness-detection input contract.
 *
 * Exported separately from `route.ts` so it can be unit-tested without
 * spinning up a NextRequest / DB. Kept as a single regex + env check so
 * the fail-open posture (F1+F2 in DECISIONS.md "E30 stale-key
 * session-lockout") is enforced in one obvious place.
 */

/**
 * Compressed secp256k1 = 66 hex chars prefixed `02`/`03`. Uncompressed =
 * 130 hex chars prefixed `04`. Matches `/api/restore-eligibility`'s shape
 * check exactly so a pubkey that's valid for one endpoint is valid for the
 * other.
 */
export const PUBKEY_HEX_PATTERN = /^(02|03)[a-fA-F0-9]{64}$|^04[a-fA-F0-9]{128}$/;

/**
 * Returns true when E30 is enabled AND the supplied pubkey passes shape
 * validation. Returns false otherwise — caller MUST treat false as "skip
 * the migration lookup, return undefined key_status, fail open." Never
 * throws.
 */
export function shouldCheckStaleness(pubkey: string | null | undefined): boolean {
  if (process.env.E30_STALE_KEY_ENABLED !== "true") return false;
  if (!pubkey) return false;
  return PUBKEY_HEX_PATTERN.test(pubkey);
}
