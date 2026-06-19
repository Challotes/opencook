import { type NextRequest, NextResponse } from "next/server";
import { getBootboard, getNewPosts, getPosts, getUpdatedPosts } from "@/app/actions";
import { rateLimit } from "@/lib/rate-limit";
import { sweepOrphans } from "@/services/bsv/anchor-sweep";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rl = rateLimit(`posts:${ip}`, { limit: 120, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Ambient clock for the durable anchor sweep — drains any un-anchored post so
  // the "every post on-chain" invariant holds without a dedicated worker.
  // Fire-and-forget, single-flight (no-op if a sweep is already running).
  void sweepOrphans();

  const sinceIdParam = request.nextUrl.searchParams.get("since_id");
  const sinceId = sinceIdParam !== null ? parseInt(sinceIdParam, 10) : null;
  // Client sends IDs of posts it has that are missing tx_id (chain icon)
  const pendingTxParam = request.nextUrl.searchParams.get("pending_tx");

  const pendingIds: number[] = pendingTxParam
    ? pendingTxParam.split(",").map(Number).filter(Number.isFinite).slice(0, 100)
    : [];

  const [posts, bootboard, updated] = await Promise.all([
    sinceId !== null && Number.isFinite(sinceId) && sinceId >= 0
      ? getNewPosts(sinceId)
      : getPosts(),
    getBootboard(),
    pendingIds.length > 0 ? getUpdatedPosts(pendingIds) : Promise.resolve([]),
  ]);

  return NextResponse.json({ posts, bootboard, updated });
}
