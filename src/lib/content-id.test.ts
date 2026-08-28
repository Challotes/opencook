import { describe, expect, it } from "vitest";
import { contentId } from "./content-id";

// A fixed 66-char (compressed-hex-shaped) sample pubkey for the known-answer
// fixtures. Not a real key — just fixed input so the expected hashes are stable.
const PK = `02${"a".repeat(64)}`;

describe("contentId", () => {
  it("matches a known-answer fixture (sha256_hex of pubkey \\n content)", () => {
    // Expected values computed independently via
    //   sha256_hex( utf8(PK) + "\n" + utf8(content) )
    // and pinned here — if the derivation ever changes, these must fail.
    expect(PK.length).toBe(66);
    expect(contentId(PK, "hello world")).toBe(
      "02bd70ee88f19c1839887b01089e8346261427ece67b59ff758aba53e132a2ee"
    );
  });

  it("outputs lowercase 64-char hex", () => {
    const cid = contentId(PK, "anything");
    expect(cid).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", () => {
    expect(contentId(PK, "repeatable content")).toBe(contentId(PK, "repeatable content"));
  });

  it("hashes content containing a newline stably (pubkey is the field boundary)", () => {
    // A "\n" inside content must NOT change the field boundary — pubkey is
    // fixed-width 66 chars, so the FIRST "\n" is always the separator.
    expect(contentId(PK, "line one\nline two")).toBe(
      "a2b700cf518bc4b75cebc3eec39d3492a87d6168b4c6e30c4b2ea8a6606adb0e"
    );
  });

  it("does NOT trim/normalize — surrounding whitespace changes the hash", () => {
    // The helper hashes the exact bytes passed (callers pass the already-trimmed
    // stored value). Proving no internal trim keeps chain-reproducibility intact.
    expect(contentId(PK, "abc")).not.toBe(contentId(PK, " abc "));
  });
});
