import { describe, expect, it } from "vitest";
import { isSuppressedAt } from "./install-suppression";

describe("isSuppressedAt", () => {
  it("returns false when no suppression is set", () => {
    expect(isSuppressedAt(1000, null, false)).toBe(false);
  });

  it("returns true when engaged is set, regardless of dismissedUntil", () => {
    expect(isSuppressedAt(1000, null, true)).toBe(true);
    expect(isSuppressedAt(1000, 500, true)).toBe(true); // expired but engaged
  });

  it("returns true when dismissedUntil is in the future", () => {
    expect(isSuppressedAt(1000, 2000, false)).toBe(true);
  });

  it("returns false when dismissedUntil has passed", () => {
    expect(isSuppressedAt(3000, 2000, false)).toBe(false);
  });

  it("returns false when dismissedUntil equals now (boundary)", () => {
    expect(isSuppressedAt(2000, 2000, false)).toBe(false);
  });

  it("engaged dominates expired dismissal", () => {
    expect(isSuppressedAt(3000, 2000, true)).toBe(true);
  });
});
