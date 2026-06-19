/**
 * Dynamic boot pricing — scales with active contributor count.
 */

import { FAIRNESS_CONFIG } from "./config";

const {
  bootPriceFloor,
  bootPriceCeiling,
  satsPerContributor,
  priceCacheTtlMs,
  activeWindowDays,
  minPostsForPricing,
} = FAIRNESS_CONFIG;

let cachedCount: number | null = null;
let cachedAt = 0;

export function calculateBootPrice(activeContributors: number): number {
  const raw = activeContributors * satsPerContributor;
  return Math.max(bootPriceFloor, Math.min(bootPriceCeiling, raw));
}

/**
 * Count ESTABLISHED contributors — pubkeys with >= minPostsForPricing posts in
 * the active window. A drive-by spammer minting one fresh identity per post
 * contributes 1 each and is filtered out, so it can't inflate the price real
 * payers face (Phase 4). Bonus: the HAVING collapses the spam long tail, so this
 * is also cheaper at scale. Uncached — getBootPrice() caches the result.
 */
export function countActiveContributors(db: import("better-sqlite3").Database): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM (
       SELECT pubkey
       FROM posts
       WHERE pubkey IS NOT NULL
       AND created_at > datetime('now', '-' || ? || ' days')
       GROUP BY pubkey
       HAVING COUNT(*) >= ?
     )`
    )
    .get(activeWindowDays, minPostsForPricing) as { count: number };
  return row.count;
}

export function getBootPrice(db: import("better-sqlite3").Database): number {
  const now = Date.now();
  if (cachedCount === null || now - cachedAt > priceCacheTtlMs) {
    cachedCount = Math.max(1, countActiveContributors(db));
    cachedAt = now;
  }
  return calculateBootPrice(cachedCount);
}

export function getBootPriceForUser(
  db: import("better-sqlite3").Database,
  pubkey: string
): { price: number; isFree: boolean; freeRemaining: number } {
  const price = getBootPrice(db);

  const grant = db
    .prepare("SELECT free_boots_used FROM boot_grants WHERE pubkey = ?")
    .get(pubkey) as { free_boots_used: number } | undefined;

  const used = grant?.free_boots_used ?? 0;
  const isFree = used < FAIRNESS_CONFIG.freeBootsPerUser;
  const freeRemaining = Math.max(0, FAIRNESS_CONFIG.freeBootsPerUser - used);

  return { price: isFree ? 0 : price, isFree, freeRemaining };
}
