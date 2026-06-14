/**
 * Contribution weight calculation.
 * sqrt(engagement) × time_decay per post, summed per contributor.
 * Posts are attributed directly to their signing pubkey.
 */

import { PublicKey } from "@bsv/sdk";
import { FAIRNESS_CONFIG } from "./config";

const { halfLifeDays, engagementMultiplier, scalingFn } = FAIRNESS_CONFIG;

// Cache weights to avoid full table scan on every boot.
// Invalidated after 30 seconds — weights only change when posts or boots change.
const WEIGHTS_CACHE_TTL_MS = 30_000;
let _cachedWeights: ContributorWeight[] | null = null;
let _weightsCachedAt = 0;

/** Clear the weight cache. Exported for tests only. */
export function _clearWeightsCache(): void {
  _cachedWeights = null;
  _weightsCachedAt = 0;
}

export interface ContributorWeight {
  pubkey: string;
  address: string;
  weight: number;
  postCount: number;
  totalBoots: number;
}

interface PostRow {
  pubkey: string;
  boot_count: number;
  created_at: string;
}

/**
 * Derive BSV address from a pubkey string.
 */
function pubkeyToAddress(pubkey: string): string {
  try {
    return PublicKey.fromString(pubkey).toAddress().toString();
  } catch {
    return "";
  }
}

/**
 * Calculate contribution weights for all active contributors.
 * Results are cached for 30 seconds to avoid repeated full table scans.
 */
export function calculateWeights(db: import("better-sqlite3").Database): ContributorWeight[] {
  const now = Date.now();
  if (_cachedWeights && now - _weightsCachedAt < WEIGHTS_CACHE_TTL_MS) {
    return _cachedWeights;
  }

  // Get all signed posts with boot counts
  const posts = db
    .prepare(`
    SELECT p.pubkey, COALESCE(bc.boot_count, 0) as boot_count, p.created_at
    FROM posts p
    LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
      ON bc.post_id = p.id
    WHERE p.pubkey IS NOT NULL
  `)
    .all() as PostRow[];

  // Aggregate weights by pubkey
  const byPubkey = new Map<string, { weight: number; posts: number; boots: number }>();

  for (const post of posts) {
    const resolvedPubkey = post.pubkey;

    const ageDays =
      (now - new Date(`${post.created_at.replace(" ", "T")}Z`).getTime()) / 86_400_000;
    const decay = 0.5 ** (ageDays / halfLifeDays);
    const engagement = 1 + post.boot_count * engagementMultiplier;
    const postWeight = scalingFn(engagement) * decay;

    const entry = byPubkey.get(resolvedPubkey) ?? { weight: 0, posts: 0, boots: 0 };
    entry.weight += postWeight;
    entry.posts += 1;
    entry.boots += post.boot_count;
    byPubkey.set(resolvedPubkey, entry);
  }

  const result = Array.from(byPubkey.entries())
    .filter(([, data]) => data.weight > 0)
    .map(([pubkey, data]) => ({
      pubkey,
      address: pubkeyToAddress(pubkey),
      weight: data.weight,
      postCount: data.posts,
      totalBoots: data.boots,
    }))
    .filter((c) => c.address !== ""); // Exclude invalid pubkeys

  _cachedWeights = result;
  _weightsCachedAt = now;
  return result;
}
