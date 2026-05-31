import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PUBKEY_HEX_PATTERN, shouldCheckStaleness } from "./key-status-validation";

const ENV_KEY = "E30_STALE_KEY_ENABLED";

// Canonical fixtures — these are the public keys derived from two well-known
// secp256k1 private keys (both =1 and =2). Using fixed values keeps the test
// deterministic without pulling in the BSV SDK.
const VALID_COMPRESSED_02 = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"; // pubkey for k=1
const VALID_COMPRESSED_03 = "03c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5"; // pubkey for k=2
const VALID_UNCOMPRESSED =
  "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";

describe("PUBKEY_HEX_PATTERN", () => {
  it("accepts a valid compressed pubkey (02 prefix)", () => {
    expect(PUBKEY_HEX_PATTERN.test(VALID_COMPRESSED_02)).toBe(true);
  });

  it("accepts a valid compressed pubkey (03 prefix)", () => {
    expect(PUBKEY_HEX_PATTERN.test(VALID_COMPRESSED_03)).toBe(true);
  });

  it("accepts a valid uncompressed pubkey (04 prefix)", () => {
    expect(PUBKEY_HEX_PATTERN.test(VALID_UNCOMPRESSED)).toBe(true);
  });

  it("rejects a pubkey with an invalid prefix (01)", () => {
    const bad = `01${VALID_COMPRESSED_02.slice(2)}`;
    expect(PUBKEY_HEX_PATTERN.test(bad)).toBe(false);
  });

  it("rejects a compressed pubkey of wrong length (too short)", () => {
    expect(PUBKEY_HEX_PATTERN.test(VALID_COMPRESSED_02.slice(0, -2))).toBe(false);
  });

  it("rejects a compressed pubkey of wrong length (too long)", () => {
    expect(PUBKEY_HEX_PATTERN.test(`${VALID_COMPRESSED_02}aa`)).toBe(false);
  });

  it("rejects non-hex characters", () => {
    const bad = `02${"z".repeat(64)}`;
    expect(PUBKEY_HEX_PATTERN.test(bad)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(PUBKEY_HEX_PATTERN.test("")).toBe(false);
  });

  it("rejects whitespace-padded input", () => {
    expect(PUBKEY_HEX_PATTERN.test(` ${VALID_COMPRESSED_02} `)).toBe(false);
  });
});

describe("shouldCheckStaleness — fail-open posture (F1+F2)", () => {
  const originalEnv = process.env[ENV_KEY];

  afterEach(() => {
    // Restore env to whatever the runner inherits, not unset — preserves the
    // assumption that other tests can rely on the original state.
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  describe("when E30 flag is unset", () => {
    beforeEach(() => {
      delete process.env[ENV_KEY];
    });

    it("returns false even for a valid pubkey", () => {
      expect(shouldCheckStaleness(VALID_COMPRESSED_02)).toBe(false);
    });

    it("returns false for any input shape", () => {
      expect(shouldCheckStaleness(null)).toBe(false);
      expect(shouldCheckStaleness("")).toBe(false);
      expect(shouldCheckStaleness("garbage")).toBe(false);
    });
  });

  describe("when E30 flag is set to anything other than 'true'", () => {
    it("treats 'false' as off", () => {
      process.env[ENV_KEY] = "false";
      expect(shouldCheckStaleness(VALID_COMPRESSED_02)).toBe(false);
    });

    it("treats '1' as off (no truthy-coercion)", () => {
      process.env[ENV_KEY] = "1";
      expect(shouldCheckStaleness(VALID_COMPRESSED_02)).toBe(false);
    });

    it("treats 'TRUE' (uppercase) as off (strict string compare)", () => {
      process.env[ENV_KEY] = "TRUE";
      expect(shouldCheckStaleness(VALID_COMPRESSED_02)).toBe(false);
    });
  });

  describe("when E30 flag is set to 'true'", () => {
    beforeEach(() => {
      process.env[ENV_KEY] = "true";
    });

    it("returns true for a valid compressed pubkey", () => {
      expect(shouldCheckStaleness(VALID_COMPRESSED_02)).toBe(true);
    });

    it("returns true for a valid uncompressed pubkey", () => {
      expect(shouldCheckStaleness(VALID_UNCOMPRESSED)).toBe(true);
    });

    it("returns false (fail-open) for null pubkey", () => {
      expect(shouldCheckStaleness(null)).toBe(false);
    });

    it("returns false (fail-open) for undefined pubkey", () => {
      expect(shouldCheckStaleness(undefined)).toBe(false);
    });

    it("returns false (fail-open) for empty-string pubkey", () => {
      expect(shouldCheckStaleness("")).toBe(false);
    });

    it("returns false (fail-open) for shape-invalid pubkey", () => {
      expect(shouldCheckStaleness("not-a-pubkey")).toBe(false);
    });
  });
});
