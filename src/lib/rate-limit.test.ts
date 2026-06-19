import { describe, expect, it } from "vitest";
import { __test, rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows requests within the limit", () => {
    const key = `test-allow-${Date.now()}`;
    const config = { limit: 3, windowMs: 60_000 };

    expect(rateLimit(key, config).success).toBe(true);
    expect(rateLimit(key, config).success).toBe(true);
    expect(rateLimit(key, config).success).toBe(true);
  });

  it("blocks requests exceeding the limit", () => {
    const key = `test-block-${Date.now()}`;
    const config = { limit: 2, windowMs: 60_000 };

    rateLimit(key, config);
    rateLimit(key, config);
    const result = rateLimit(key, config);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetMs).toBeGreaterThan(0);
  });

  it("tracks remaining count correctly", () => {
    const key = `test-remaining-${Date.now()}`;
    const config = { limit: 3, windowMs: 60_000 };

    expect(rateLimit(key, config).remaining).toBe(2);
    expect(rateLimit(key, config).remaining).toBe(1);
    expect(rateLimit(key, config).remaining).toBe(0);
  });

  it("isolates different keys", () => {
    const config = { limit: 1, windowMs: 60_000 };
    const keyA = `test-iso-a-${Date.now()}`;
    const keyB = `test-iso-b-${Date.now()}`;

    rateLimit(keyA, config);
    // keyA exhausted, keyB should still work
    expect(rateLimit(keyB, config).success).toBe(true);
    expect(rateLimit(keyA, config).success).toBe(false);
  });

  it("cleanup prunes each key against its own window, not a shared one", () => {
    // Regression: a short-window caller registering first must NOT cause a
    // long-window key (e.g. the 24h free-boot cap) to be pruned early.
    const now = Date.now();
    const shortKey = `test-win-short-${now}`;
    const longKey = `test-win-long-${now}`;
    const shortCfg = { limit: 5, windowMs: 60_000 }; // 60s
    const longCfg = { limit: 40, windowMs: 24 * 60 * 60_000 }; // 24h

    rateLimit(shortKey, shortCfg);
    rateLimit(longKey, longCfg);

    // Simulate the cleanup loop running 2 minutes later.
    __test.pruneStore(now + 2 * 60_000);

    // Short key's lone timestamp is >60s old → pruned → key reset → fresh slot.
    expect(rateLimit(shortKey, shortCfg).remaining).toBe(4);
    // Long key's timestamp is well inside 24h → survives → count carries over
    // (remaining 38 = limit 40 − 1 prior − 1 this call). The bug would give 39.
    expect(rateLimit(longKey, longCfg).remaining).toBe(38);
  });
});
