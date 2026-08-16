import { PrivateKey } from "@bsv/sdk";
import { describe, expect, it } from "vitest";
import { ORD_RECEIVE_INVOICE, ordAddressFromPubkey, ordAddressFromWif } from "./ord-derivation";

// Known-answer fixture, verified against @bsv/sdk 2.0.7. If any of these change,
// real tokens sent to the user would land at a different address — treat a
// mismatch as a hard failure, never "adjust the expected value to match".
const FIXTURE_WIF = "KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFUWdoAJVPCU";
const FIXTURE_PUBKEY_HEX = "023ef30130654689a64c864d6dd38760481c55fc525e2c6c7084e2d2d3d4d51be9";
// Base payment address (NOT produced by this module) — used only to prove the
// ord address is a DISTINCT output.
const FIXTURE_PAYMENT_ADDRESS = "1KvP21twgz7RTnDbAztPGTjx3YCAk3Evpu";
// This module's output.
const FIXTURE_ORD_ADDRESS = "1XUhuWkUzegwiEj9JBcxabeC665KS7bpL";

describe("ord-derivation", () => {
  it("derives the expected ORD address from the public pubkey hex (server/anyone path)", () => {
    expect(ordAddressFromPubkey(FIXTURE_PUBKEY_HEX)).toBe(FIXTURE_ORD_ADDRESS);
  });

  it("derives the SAME ORD address from the WIF (client path) — both paths agree byte-for-byte", () => {
    expect(ordAddressFromWif(FIXTURE_WIF)).toBe(FIXTURE_ORD_ADDRESS);
    // Explicit cross-path equality (the money-critical invariant).
    expect(ordAddressFromWif(FIXTURE_WIF)).toBe(ordAddressFromPubkey(FIXTURE_PUBKEY_HEX));
  });

  it("produces an ORD address distinct from the base payment address", () => {
    // Sanity: the fixture pubkey really is the base payment key's pubkey.
    const basePayment = PrivateKey.fromWif(FIXTURE_WIF).toPublicKey().toAddress().toString();
    expect(basePayment).toBe(FIXTURE_PAYMENT_ADDRESS);
    // The ord address must be a different output, or tokens would land on the
    // spendable-payments address instead of the dedicated ord address.
    expect(FIXTURE_ORD_ADDRESS).not.toBe(FIXTURE_PAYMENT_ADDRESS);
    expect(ordAddressFromPubkey(FIXTURE_PUBKEY_HEX)).not.toBe(FIXTURE_PAYMENT_ADDRESS);
  });

  it('pins ORD_RECEIVE_INVOICE to exactly "opencook ord receive 1" (guards silent drift)', () => {
    // A single character or trailing space here strands tokens already sent.
    expect(ORD_RECEIVE_INVOICE).toBe("opencook ord receive 1");
  });
});
