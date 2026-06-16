import { describe, expect, it } from "vitest";
import { parseDenylist, screenContent } from "./content-filter";

describe("content-filter", () => {
  it("permits any content when the denylist is unconfigured (best-effort, permissive by design)", () => {
    expect(screenContent("anything goes here", undefined).ok).toBe(true);
    expect(screenContent("anything", "").ok).toBe(true);
    expect(screenContent("anything", "   \n # only a comment").ok).toBe(true);
  });

  it("blocks a substring pattern, case-insensitively", () => {
    const list = "badword";
    expect(screenContent("this has a BadWord in it", list)).toEqual({
      ok: false,
      reason: "denylisted",
    });
    expect(screenContent("a totally clean builder post", list).ok).toBe(true);
  });

  it("blocks a regex pattern (/slashes/) and leaves clean content alone", () => {
    const list = "/foo.?bar/";
    expect(screenContent("foo bar", list).ok).toBe(false);
    expect(screenContent("foobar", list).ok).toBe(false);
    expect(screenContent("foo then later baz", list).ok).toBe(true);
  });

  it("parses multi-line + comma lists, ignores blanks/comments, skips malformed regex", () => {
    const raw = "# a comment\n\nalpha\n/be+ta/\n/(/";
    const patterns = parseDenylist(raw);
    expect(patterns.length).toBe(2); // alpha (substring) + /be+ta/ (regex); malformed /(/ skipped
    expect(screenContent("ALPHA here", raw).ok).toBe(false);
    expect(screenContent("beeeta", raw).ok).toBe(false);
    expect(screenContent("a clean post", raw).ok).toBe(true);
  });

  it("supports comma-separated patterns", () => {
    expect(screenContent("contains x2 here", "x1,x2,x3").ok).toBe(false);
    expect(screenContent("contains none", "x1,x2,x3").ok).toBe(true);
  });
});
