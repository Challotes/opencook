import { describe, expect, it } from "vitest";
import { hasDisallowedControlChars, MAX_POST_LENGTH, normalizePostContent } from "./post-content";

describe("normalizePostContent", () => {
  it("converts CRLF and lone CR to LF", () => {
    expect(normalizePostContent("a\r\n\r\nb\rc\nd")).toBe("a\n\nb\nc\nd");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizePostContent("\r\n  hello \r\n")).toBe("hello");
  });

  it("is idempotent", () => {
    const once = normalizePostContent("x\r\ny\n");
    expect(normalizePostContent(once)).toBe(once);
  });

  it("flags control chars except tab/newline", () => {
    expect(hasDisallowedControlChars("a\tb\nc 😄")).toBe(false);
    expect(hasDisallowedControlChars("a\u0001b")).toBe(true);
    expect(hasDisallowedControlChars("a\u007Fb")).toBe(true);
  });

  it("limit is 2000", () => {
    expect(MAX_POST_LENGTH).toBe(2000);
  });
});
