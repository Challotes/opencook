import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Rate limit: 20 requests per minute per IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`earnings:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.success) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address || address.length === 0) {
    return Response.json({ totalEarned: 0, recentActivity: [] });
  }

  // Earnings are attributed to the single signing address. (Key rotation was
  // removed — there is no longer a migration chain to resolve across.) The
  // array shape is kept so the IN (...) queries below remain unchanged.
  const allAddresses = [address];
  const placeholders = allAddresses.map(() => "?").join(", ");

  // Fast path: ?summary=1 returns only totalEarned (used by background poll)
  if (searchParams.get("summary") === "1") {
    const total = db
      .prepare(
        `SELECT COALESCE(SUM(amount_sats), 0) as total FROM payouts WHERE recipient_address IN (${placeholders})`
      )
      .get(...allAddresses) as { total: number };
    return Response.json({ totalEarned: total.total });
  }

  // Sum all payouts across the full address chain
  const total = db
    .prepare(
      `SELECT COALESCE(SUM(amount_sats), 0) as total FROM payouts WHERE recipient_address IN (${placeholders})`
    )
    .get(...allAddresses) as { total: number };

  // Recent incoming payouts (last 50) across chain
  const incoming = db
    .prepare(
      `SELECT amount_sats, payout_type, txid, created_at FROM payouts WHERE recipient_address IN (${placeholders}) ORDER BY created_at DESC LIMIT 50`
    )
    .all(...allAddresses) as Array<{
    amount_sats: number;
    payout_type: string;
    txid: string;
    created_at: string;
  }>;

  // Recent boots by this user (outgoing) — across all known addresses in chain.
  // is_free = 1 → server paid (free boot grant) → show as 0 cost to user.
  // is_free = 0 → user paid → sum payouts to get actual amount spent.
  // Note: free boots still have payouts recorded (server→contributors) but those
  // are not the user's money, so we zero them out here via the is_free flag.
  const bootSpend = db
    .prepare(`
    SELECT
      b.id as boot_id,
      b.booted_at as created_at,
      b.is_free,
      CASE WHEN b.is_free = 1 THEN 0 ELSE COALESCE(SUM(py.amount_sats), 0) END as total_paid
    FROM bootboard b
    LEFT JOIN payouts py ON py.boot_event_id = b.id
    WHERE b.boosted_by IN (${placeholders})
    GROUP BY b.id, b.booted_at, b.is_free
    ORDER BY b.booted_at DESC
    LIMIT 50
  `)
    .all(...allAddresses) as Array<{
    boot_id: number;
    created_at: string;
    is_free: number;
    total_paid: number;
  }>;

  // Merge into a unified activity feed
  type Activity = {
    amount: number;
    direction: "in" | "out";
    label: string;
    created_at: string;
    txid?: string;
  };

  const activity: Activity[] = [];

  for (const p of incoming) {
    activity.push({
      amount: p.amount_sats,
      direction: "in",
      label:
        p.payout_type === "boost_bonus" ? "Agentic split · your post featured" : "Agentic split",
      created_at: p.created_at,
      txid: p.txid,
    });
  }

  for (const b of bootSpend) {
    activity.push({
      amount: b.total_paid, // 0 = free boot, >0 = paid boot with actual cost
      direction: "out",
      label: "Boot featured",
      created_at: b.created_at,
    });
  }

  // Sort by time descending
  activity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Cumulative earnings history for the sparkline chart (last 30 data points)
  // Query across the full address chain so history survives upgrades.
  const earningsHistory = db
    .prepare(`
    SELECT created_at as t, amount_sats
    FROM payouts
    WHERE recipient_address IN (${placeholders})
    ORDER BY created_at ASC
  `)
    .all(...allAddresses) as Array<{ t: string; amount_sats: number }>;

  let cumulative = 0;
  const history = earningsHistory.map((row) => {
    cumulative += row.amount_sats;
    return { t: row.t, cumulative };
  });

  // Keep last 30 points for chart (reduce noise on large datasets)
  const chartHistory =
    history.length > 30
      ? history.filter((_, i, arr) => i === arr.length - 1 || i % Math.ceil(arr.length / 30) === 0)
      : history;

  return Response.json({
    totalEarned: total.total,
    recentActivity: activity,
    earningsHistory: chartHistory,
  });
}
