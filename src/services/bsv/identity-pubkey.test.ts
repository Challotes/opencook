import { describe, expect, it } from "vitest";
import { derivePubkeyFromWif } from "./identity";

/**
 * E30: pubkey derivation is the foundation of the staleness signal — the
 * client sends `pubkey` in the `x-bsvibes-pubkey` header on every poll, and
 * the server looks up forward migrations keyed on it. If derivation drifts
 * from what `/api/restore-eligibility` returns, the entire stale-key flow
 * mis-identifies keys and either over- or under-locks accounts.
 *
 * These tests pin the derive path to a known WIF↔pubkey pair so a future
 * @bsv/sdk upgrade or refactor in identity.ts surfaces the regression here
 * rather than in production telemetry.
 */
describe("derivePubkeyFromWif", () => {
  // Test vector: a fixed WIF compressed private key + its pubkey.
  // Sourced by running the BSV SDK locally one time:
  //   PrivateKey.fromWif("KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn")
  //     .toPublicKey().toString()
  //
  // Don't change this fixture casually — if the derive algorithm changes
  // (e.g. compressed ↔ uncompressed default), this test fails loudly,
  // which is the desired behavior.
  const KNOWN_WIF = "KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn";
  const EXPECTED_PUBKEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

  it("returns the canonical compressed pubkey for a known WIF", async () => {
    const pubkey = await derivePubkeyFromWif(KNOWN_WIF);
    expect(pubkey).toBe(EXPECTED_PUBKEY);
  });

  it("is deterministic — repeat calls return the same pubkey", async () => {
    const a = await derivePubkeyFromWif(KNOWN_WIF);
    const b = await derivePubkeyFromWif(KNOWN_WIF);
    expect(a).toBe(b);
  });

  it("trims surrounding whitespace before deriving", async () => {
    const padded = `  ${KNOWN_WIF}  \n`;
    const pubkey = await derivePubkeyFromWif(padded);
    expect(pubkey).toBe(EXPECTED_PUBKEY);
  });

  it("throws on malformed WIF rather than returning a garbage pubkey", async () => {
    await expect(derivePubkeyFromWif("not-a-wif")).rejects.toBeDefined();
  });
});
