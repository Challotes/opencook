import { type NextRequest, NextResponse } from "next/server";
import { buildContributionList, sharePct, toContributionCsv } from "@/lib/contribution-list";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { FairnessContributor, FairnessResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/fairness  — live "Agentic Fairness" contributor shares.
 *
 * ONE route, two serializations built from ONE `buildContributionList` pass and
 * cached together, so the panel (JSON) and the CSV download are always the same
 * snapshot:
 *   - default        → JSON `{ totalPosts, contributors[] }` for <FairnessModal>
 *   - ?format=csv    → the contribution CSV (same rows/denominator as the script)
 *
 * The share basis is RAW per-post share (post_count ÷ total attributed posts) —
 * NOT the boost-payout pool weight. Read-only; exposes NO secret (never the
 * server WIF/address — the server wallet authors no posts, so it isn't even in
 * the list).
 */

// 30s TTL, mirroring the weights cache — long enough to shield the DB from a
// fan-out, short enough that new posts show up promptly. Both serializations
// are cached together so JSON and CSV can never disagree within a window.
const CACHE_TTL_MS = 30_000;
let cache: { json: string; csv: string; generatedAt: number; expires: number } | null = null;

/** Timestamped CSV download filename, e.g. "opencook-contributors-2026-08-17-143005.csv"
 *  — UTC, derived from the snapshot's generatedAt so the filename reflects WHEN the
 *  data was computed (not merely when it was downloaded). */
function csvFilename(generatedAtMs: number): string {
  const d = new Date(generatedAtMs);
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return `opencook-contributors-${stamp}.csv`;
}

/** Latest display name per pubkey — kept out of `buildContributionList` so the
 *  CSV path stays name-free and byte-identical to the script. */
function latestNamesByPubkey(): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT p.pubkey AS pubkey,
              (SELECT p2.author_name FROM posts p2 WHERE p2.pubkey = p.pubkey ORDER BY p2.id DESC LIMIT 1) AS name
       FROM posts p
       WHERE p.pubkey IS NOT NULL AND p.pubkey != ''
       GROUP BY p.pubkey`
    )
    .all() as { pubkey: string; name: string | null }[];
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.pubkey, r.name ?? "");
  return map;
}

function buildSnapshot(): { json: string; csv: string; generatedAt: number } {
  const generatedAt = Date.now();
  const { rows, totalPosts } = buildContributionList(db);

  const csv = toContributionCsv(rows, totalPosts);

  const names = latestNamesByPubkey();
  const contributors: FairnessContributor[] = rows
    .map((r) => ({
      name: names.get(r.pubkey) ?? "",
      pubkey: r.pubkey,
      postCount: r.postCount,
      sharePct: sharePct(r.postCount, totalPosts),
    }))
    .sort((a, b) => b.sharePct - a.sharePct);

  const response: FairnessResponse = {
    totalPosts,
    generatedAt: new Date(generatedAt).toISOString(),
    contributors,
  };
  return { json: JSON.stringify(response), csv, generatedAt };
}

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`fairness:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const now = Date.now();
  if (!cache || now >= cache.expires) {
    const snap = buildSnapshot();
    cache = { ...snap, expires: now + CACHE_TTL_MS };
  }

  if (req.nextUrl.searchParams.get("format") === "csv") {
    return new NextResponse(cache.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(cache.generatedAt)}"`,
      },
    });
  }

  return new NextResponse(cache.json, {
    headers: { "Content-Type": "application/json" },
  });
}
