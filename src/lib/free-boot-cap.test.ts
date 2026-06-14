import { describe, expect, it, vi } from "vitest";
import { tryConsumeFreeBootForIp } from "./free-boot-cap";
import * as rl from "./rate-limit";

// The cap reuses the in-memory sliding-window limiter, which is process-global,
// so each test uses a UNIQUE ip to avoid cross-test bucket contamination.

describe("tryConsumeFreeBootForIp", () => {
  it("allows the first 40 free boots for an IP, then routes to paid on the 41st", () => {
    const ip = "203.0.113.1";
    for (let i = 0; i < 40; i++) {
      expect(tryConsumeFreeBootForIp(ip)).toBe(true);
    }
    // 41st within the window is capped → false (route to paid).
    expect(tryConsumeFreeBootForIp(ip)).toBe(false);
  });

  it("fails toward paid for a missing/unknown IP (never grants an uncappable free boot)", () => {
    expect(tryConsumeFreeBootForIp("")).toBe(false);
    expect(tryConsumeFreeBootForIp("unknown")).toBe(false);
  });

  it("keeps independent buckets per IP", () => {
    const a = "203.0.113.2";
    const b = "203.0.113.3";
    // Exhaust A.
    for (let i = 0; i < 40; i++) tryConsumeFreeBootForIp(a);
    expect(tryConsumeFreeBootForIp(a)).toBe(false);
    // B is untouched.
    expect(tryConsumeFreeBootForIp(b)).toBe(true);
  });

  it("fails toward paid if the limiter throws (never fail-open into a free boot)", () => {
    const spy = vi.spyOn(rl, "rateLimit").mockImplementation(() => {
      throw new Error("limiter unavailable");
    });
    expect(tryConsumeFreeBootForIp("203.0.113.9")).toBe(false);
    spy.mockRestore();
  });
});
