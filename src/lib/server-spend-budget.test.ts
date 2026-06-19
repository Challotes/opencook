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
