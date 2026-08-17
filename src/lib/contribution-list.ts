/**
 * Shared contributor-share core (anti-drift).
 *
 * The aggregate → derive → validate pipeline that BOTH the contribution-list
 * generator (`scripts/gen-contribution-list.mts`) and the live `/api/fairness`
 * route consume. Extracting it here means the contribution CSV a partner runs
 * and the numbers the FairnessModal shows come from ONE code path — they can
 * never drift.
 *
 * The metric is RAW per-post share: each post is one unit; a contributor's
 * share = their post_count ÷ total attributed posts. This is deliberately NOT
 * `calculateWeights` (sqrt × decay, launchTs-gated) — that is the boost-payout
 * pool weight, a different number. There is NO launchTs gate here; every
 * attributed post counts. The server wallet authors no posts, so it is
 * naturally excluded.
 *
 * Derivation source of truth:
 *   `ordAddress` is derived by `ordAddressFromPubkey`, which owns the PUBLIC,
 *   PERMANENT `ORD_RECEIVE_INVOICE` constant. A settled DECISIONS.md rule
 *   forbids re-typing the invoice literal or re-implementing the derivation —
 *   we import the function so nothing can drift.
 *
 * Import convention: static top-level `@bsv/sdk` import, mirroring
 * `ord-derivation.ts` (imported transitively by the `.mts` script and run under
 * vitest without a browser). These are pure, synchronous functions.
 */

import { PublicKey } from "@bsv/sdk";
import { ordAddressFromPubkey } from "@/lib/ord-derivation";

// Mainnet P2PKH address shape (base58, version byte 1 or 3).
const P2PKH_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;

/** One validated contributor row (name-free so the CSV path is identical). */
export type ContributionRow = {
  pubkey: string;
  ordAddress: string;
  paymentAddress: string;
  postCount: number;
};

/** Aggregate counts of what happened during a build (for stderr logging). */
export interface ContributionStats {
  /** Distinct pubkeys returned by the query. */
  input: number;
  /** Rows that passed derivation + validation + dedupe. */
  emitted: number;
  /** Rows dropped: malformed pubkey or an address that failed P2PKH validation. */
  skipped: number;
  /** Rows dropped because their ord_address duplicated an already-emitted one. */
  collisions: number;
}

interface PubkeyRow {
  pubkey: string;
  post_count: number;
}

/**
 * Aggregate + derive + validate the contributor list from a posts DB.
 *
 * Takes a better-sqlite3 `Database` as a PARAMETER so the script can pass its
 * own read-only DB at any path while the route passes the app singleton. Does
 * NOT open or close the connection — lifecycle belongs to the caller.
 *
 * `totalPosts` is the SUM of `postCount` over the EMITTED (validated) rows, so
 * the JSON percentages and the CSV rows share one denominator and sum to ~100%.
 */
export function buildContributionList(db: import("better-sqlite3").Database): {
  rows: ContributionRow[];
  totalPosts: number;
  stats: ContributionStats;
} {
  const pubkeyRows = db
    .prepare(
      "SELECT pubkey, COUNT(*) AS post_count FROM posts WHERE pubkey IS NOT NULL AND pubkey != '' GROUP BY pubkey ORDER BY post_count DESC"
    )
    .all() as PubkeyRow[];

  const rows: ContributionRow[] = [];
  const seenOrd = new Set<string>();
  let skipped = 0;
  let collisions = 0;

  for (const { pubkey, post_count } of pubkeyRows) {
    let ordAddress: string;
    let paymentAddress: string;
    try {
      ordAddress = ordAddressFromPubkey(pubkey);
      paymentAddress = PublicKey.fromString(pubkey).toAddress().toString();
    } catch {
      // Malformed pubkey — cannot derive an address for it.
      skipped++;
      continue;
    }

    if (!P2PKH_RE.test(ordAddress) || !P2PKH_RE.test(paymentAddress)) {
      // A derived address that isn't a mainnet P2PKH is unusable.
      skipped++;
      continue;
    }

    if (seenOrd.has(ordAddress)) {
      // Two pubkeys derive to the same ord address — keep first, skip this one.
      collisions++;
      continue;
    }
    seenOrd.add(ordAddress);

    rows.push({ pubkey, ordAddress, paymentAddress, postCount: post_count });
  }

  const totalPosts = rows.reduce((sum, r) => sum + r.postCount, 0);

  return {
    rows,
    totalPosts,
    stats: {
      input: pubkeyRows.length,
      emitted: rows.length,
      skipped,
      collisions,
    },
  };
}

/**
 * The single share formula: `count ÷ total` as a percentage, rounded to `dp`
 * decimal places. Guards `total === 0` → 0 (empty DB / no attributed posts).
 */
export function sharePct(count: number, total: number, dp = 4): number {
  if (total === 0) return 0;
  const factor = 10 ** dp;
  return Math.round((count / total) * 100 * factor) / factor;
}

/**
 * Serialize the validated rows to the contribution CSV. Shares the `totalPosts`
 * denominator with the JSON path so both sum to ~100%. Trailing newline for
 * POSIX-friendly file output.
 *
 * `includePostCount` (default true) controls the raw `post_count` column. The
 * offline payout generator keeps it (default); the PUBLIC `/api/fairness?format=csv`
 * download passes `false` to omit it — exposing raw counts would reveal the
 * drop is a flat post-count (share = count ÷ total) and let anyone read the
 * exact "posts to overtake". See DECISIONS "Agentic Fairness".
 */
export function toContributionCsv(
  rows: ContributionRow[],
  totalPosts: number,
  opts: { includePostCount?: boolean } = {}
): string {
  const includePostCount = opts.includePostCount ?? true;
  const header = includePostCount
    ? "pubkey,ord_address,payment_address,post_count,share_pct"
    : "pubkey,ord_address,payment_address,share_pct";
  const lines = [header];
  for (const r of rows) {
    const share = sharePct(r.postCount, totalPosts);
    lines.push(
      includePostCount
        ? `${r.pubkey},${r.ordAddress},${r.paymentAddress},${r.postCount},${share}`
        : `${r.pubkey},${r.ordAddress},${r.paymentAddress},${share}`
    );
  }
  return `${lines.join("\n")}\n`;
}
