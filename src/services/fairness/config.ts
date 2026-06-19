/**
 * Tunable fairness parameters — the governance surface.
 * Phase 1: hardcoded. Phase 2+: AI agent suggests/adjusts within ranges.
 */

export const FAIRNESS_CONFIG = {
  platformCut: 0.05,
  creatorBonus: 0.15,
  poolShare: 0.8,
  halfLifeDays: 30,
  engagementMultiplier: 1.5,
  scalingFn: Math.sqrt,
  bootPriceFloor: 1_000,
  bootPriceCeiling: 250_000,
  satsPerContributor: 156,
  priceCacheTtlMs: 60 * 60 * 1000,
  activeWindowDays: 30,
  // Phase 4: count only pubkeys with >= this many posts in the window toward the
  // dynamic boot price, so drive-by fake identities (one post each) can't inflate
  // the price real payers face. A genuine contributor crosses it; a spammer
  // minting one identity per post does not.
  minPostsForPricing: 3,
  freeBootsPerUser: 15,
  // Server-wallet ops threshold (Phase 2 Build B): emit a low-balance alert when
  // the server wallet's spendable balance drops below this, so the operator can
  // top up BEFORE free boots start routing to paid.
  serverLowBalanceAlertSats: 10_000,
  formulaVersion: "0.1.0",
} as const;
