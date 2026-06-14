import { rateLimit } from "@/lib/rate-limit";

// Per-IP cap on SERVER-FUNDED free boots. Sized generously (well above the
// per-identity 15-grant) so legitimate shared-NAT origins — a household, a
// small office, carrier CGNAT — aren't hit, while scripted "open N incognito
// tabs, each mints a fresh identity's free allotment" drain is bounded.
// Worst-case server exposure = 40 × bootPriceFloor (1000 sats) = 40k sats/IP/day.
const FREE_BOOT_IP_LIMIT = 40;
const FREE_BOOT_IP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h rolling

/**
 * Per-IP cap on server-funded free boots — additive defense BEHIND the durable
 * per-identity grant (the primary control). This is a speed-bump: it's keyed on
 * `x-forwarded-for`, which is client-spoofable without a trusted proxy (see
 * CLAUDE.md "Deployment Notes"). In-memory (resets on restart) — acceptable
 * because a restart only refreshes the speed-bump; it can never mint extra
 * per-identity free boots, which are tracked durably in `boot_grants`.
 *
 * Fails toward PAID: any error, or a missing/untrustworthy IP, returns false so
 * the boot routes to the paid (client-funded) path. It MUST NEVER fail-open into
 * a free boot — that would re-open the server-wallet drain. See DECISIONS.md
 * "Per-IP free-boot cap as additive defense" + "Free-boot path consumes the
 * grant BEFORE paying".
 *
 * Consumes a slot at call time (the limiter records on success), i.e. BEFORE the
 * broadcast. If the subsequent broadcast fails the slot is spent on a failed
 * boot — the intended server-protective bias (no money moved, 40/day has ample
 * headroom). Do NOT move this check after the broadcast: that reintroduces
 * fail-open under retry.
 *
 * @returns true if this IP may still take a free boot; false → route to paid.
 */
export function tryConsumeFreeBootForIp(ip: string): boolean {
  try {
    // No trustworthy IP → fail toward paid (never grant a free boot we can't cap).
    if (!ip || ip === "unknown") return false;
    const rl = rateLimit(`freeBootIp:${ip}`, {
      limit: FREE_BOOT_IP_LIMIT,
      windowMs: FREE_BOOT_IP_WINDOW_MS,
    });
    return rl.success;
  } catch {
    return false; // fail toward PAID — never fail-open into free boots
  }
}
