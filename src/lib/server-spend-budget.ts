/**
 * In-memory daily server-wallet spend ceiling.
 *
 * Caps total sats the server wallet spends per UTC day across BOTH post
 * on-chain logging AND free-boost payouts (they share one wallet). It is the
 * aggregate backstop behind the per-IP controls (free-boot-cap, the per-IP post
 * cap) — those bound a single origin; this bounds the sum across ALL origins
 * (e.g. a distributed attack where each IP stays under its per-IP limit).
 *
 * In-memory by design (resets on restart + at UTC midnight): a redeploy mid-day
 * could let one UTC day exceed the ceiling once (worst case ~2x ~$0.20 = ~$0.40,
 * trivial vs the ~$50/mo budget). A DB-backed counter was deliberately NOT built
 * — see DECISIONS.md. The limit is env-adjustable (SERVER_DAILY_SPEND_SATS).
 *
 * Gate semantics: callers CHECK hasDailyBudget() before ACCEPTING new spend
 * (refuse / route-to-paid if false) and recordDailySpend() after the wallet
 * actually spends. Already-accepted posts MUST still anchor (the durable sweep
 * RECORDS but never GATES) — accept-gating protects the wallet; the anchor
 * guarantee protects already-accepted posts. See DECISIONS.md all-posts-on-chain.
 */

// ~$0.20/day at ~$11.62/BSV (2026-06-19). Env-adjustable.
const DEFAULT_DAILY_SPEND_SATS = 1_721_170;

// Conservative per-action spend estimates (the wallet's real fee/split varies;
// a ceiling tolerates approximation, and over-estimating refuses earlier = safe).
export const POST_LOG_COST_SATS = 70; // typical post OP_RETURN fee (~66 verified 2026-06-19)
export const FREE_BOOT_COST_SATS = 1300; // floor split (1000) + ~300 network fee

function dailyLimitSats(): number {
  const v = Number(process.env.SERVER_DAILY_SPEND_SATS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_DAILY_SPEND_SATS;
}

let _spentSats = 0;
let _dayKey = "";

function rollDay(): void {
  const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  if (today !== _dayKey) {
    _dayKey = today;
    _spentSats = 0;
  }
}

/** True if `sats` more spend fits under today's ceiling. Does NOT consume. */
export function hasDailyBudget(sats: number): boolean {
  rollDay();
  return _spentSats + sats <= dailyLimitSats();
}

/** Record sats the server wallet actually spent today. */
export function recordDailySpend(sats: number): void {
  if (sats <= 0) return;
  rollDay();
  _spentSats += sats;
}

/** Current spend status (observability). */
export function dailySpendStatus(): {
  spentSats: number;
  limitSats: number;
  remainingSats: number;
} {
  rollDay();
  const limit = dailyLimitSats();
  return {
    spentSats: _spentSats,
    limitSats: limit,
    remainingSats: Math.max(0, limit - _spentSats),
  };
}
