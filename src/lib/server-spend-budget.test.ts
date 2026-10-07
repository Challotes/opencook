import { describe, expect, it } from "vitest";
import { dailySpendStatus, hasDailyBudget, recordDailySpend } from "./server-spend-budget";

describe("server-spend-budget", () => {
  it("refuses spend once the daily ceiling is reached", () => {
    process.env.SERVER_DAILY_SPEND_SATS = "1000";
    const start = dailySpendStatus().spentSats; // module-global; account for any prior spend
    const remaining = 1000 - start;

    expect(hasDailyBudget(remaining)).toBe(true);
    recordDailySpend(remaining); // fill to the ceiling
    expect(hasDailyBudget(1)).toBe(false); // now over → refuse
    expect(dailySpendStatus().remainingSats).toBe(0);
  });

  it("ignores non-positive records", () => {
    const before = dailySpendStatus().spentSats;
    recordDailySpend(-50);
    recordDailySpend(0);
    expect(dailySpendStatus().spentSats).toBe(before);
  });
});

describe("postLogCostSats", () => {
  it("floors short posts at POST_LOG_COST_SATS and scales with content bytes", async () => {
    const { postLogCostSats, POST_LOG_COST_SATS } = await import("./server-spend-budget");
    expect(postLogCostSats("hi")).toBeGreaterThanOrEqual(POST_LOG_COST_SATS);
    expect(postLogCostSats("hi")).toBeLessThan(100);
    expect(postLogCostSats("x".repeat(2000))).toBeGreaterThan(250);
    expect(postLogCostSats("界".repeat(2000))).toBeGreaterThan(postLogCostSats("x".repeat(2000)));
  });
});
