import { type NextRequest, NextResponse } from "next/server";
import { getBootboard, getNewPosts, getPosts, getUpdatedPosts } from "@/app/actions";
import { rateLimit } from "@/lib/rate-limit";
import { getForwardMigration } from "@/services/bsv/migration";
import { shouldCheckStaleness } from "./key-status-validation";

export const dynamic = "force-dynamic";

// E30: shape of the optional staleness signal returned alongside the feed.
// Absence of `key_status` in the response is the not-stale signal —
// the client treats undefined/null/malformed payloads as not-stale
// (see useFeedPolling.ts and the F1+F2 fail-open rule in DECISIONS.md
// "E30 stale-key session-lockout").
interface KeyStatus {
  stale: true;
}

/**
 * E30: gated server-side detection of forward-migrated keys.
 *
 * - Reads pubkey from the `x-bsvibes-pubkey` request header (NOT a query
 *   string — pubkey ↔ IP correlation in CDN/proxy access logs is the
 *   minor privacy concern flagged as P2 in the pre-implementation audit).
 * - Returns `{ stale: true }` only when ALL of (a) the env flag is on,
 *   (b) the header is present + shape-valid, (c) a forward migration row
 *   exists. Any failure mode in this chain MUST return undefined so the
 *   client falls through to the not-stale default — fail-open is a hard
 *   requirement (F1+F2): a server bug must never mass-lock the user base.
 * - Errors (DB failure, malformed input) are caught + swallowed at this
 *   boundary; the route never throws and the client treats absence of
 *   the field as not-stale.
 */
async function computeKeyStatus(pubkey: string | null): Promise<KeyStatus | undefined> {
  // shouldCheckStaleness centralises the env flag + pubkey shape gate so a
  // malformed header can't cause a DB roundtrip or stack trace. See
  // key-status-validation.ts for the rationale + the F1+F2 fail-open rule.
  if (!shouldCheckStaleness(pubkey)) return undefined;
  try {
    // shouldCheckStaleness guarantees pubkey is non-null + shape-valid here.
    const migration = await getForwardMigration(pubkey as string);
    return migration ? { stale: true } : undefined;
  } catch {
    // Fail-open on DB / SDK errors — surfacing stale on every poll for a
    // partial DB outage would be worse than the delayed detection of a
    // genuinely stale key.
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rl = rateLimit(`posts:${ip}`, { limit: 120, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sinceIdParam = request.nextUrl.searchParams.get("since_id");
  const sinceId = sinceIdParam !== null ? parseInt(sinceIdParam, 10) : null;
  // Client sends IDs of posts it has that are missing tx_id (chain icon)
  const pendingTxParam = request.nextUrl.searchParams.get("pending_tx");

  const pendingIds: number[] = pendingTxParam
    ? pendingTxParam.split(",").map(Number).filter(Number.isFinite).slice(0, 100)
    : [];

  // E30: pubkey from header, not query string (see computeKeyStatus rationale).
  const pubkey = request.headers.get("x-bsvibes-pubkey")?.trim() || null;

  const [posts, bootboard, updated, keyStatus] = await Promise.all([
    sinceId !== null && Number.isFinite(sinceId) && sinceId >= 0
      ? getNewPosts(sinceId)
      : getPosts(),
    getBootboard(),
    pendingIds.length > 0 ? getUpdatedPosts(pendingIds) : Promise.resolve([]),
    computeKeyStatus(pubkey),
  ]);

  return NextResponse.json({
    posts,
    bootboard,
    updated,
    // Omit the field entirely when not stale — keeps the response shape
    // stable for pre-E30 clients (they ignore unknown fields anyway) and
    // makes the staleness signal explicit-by-presence on the wire.
    ...(keyStatus ? { key_status: keyStatus } : {}),
  });
}
