import { PrivateKey, PublicKey, Signature } from "@bsv/sdk";
import { describe, expect, it } from "vitest";
import { bootConfirmMessage } from "./boot-message";

describe("bootConfirmMessage", () => {
  it("builds the canonical boot:<postId>:<txid> string", () => {
    const txid = "a".repeat(64);
    expect(bootConfirmMessage(7, txid)).toBe(`boot:7:${txid}`);
  });

  it("trims whitespace in the txid so client/server agree", () => {
    const txid = "b".repeat(64);
    expect(bootConfirmMessage(7, `  ${txid}\n`)).toBe(`boot:7:${txid}`);
  });
});

// End-to-end of the auth mechanism: the client signs the message and the server
// verifies + derives the credited address from the verified pubkey. This pins
// the exact crypto contract boot-confirm relies on (sign side == verify side).
describe("boot-confirm signature round-trip", () => {
  const key = PrivateKey.fromRandom();
  const pubkey = key.toPublicKey().toString();
  const address = key.toPublicKey().toAddress().toString();
  const postId = 42;
  const txid = "c".repeat(64);

  function signClientSide(pId: number, tx: string): string {
    const message = bootConfirmMessage(pId, tx);
    return key.sign(Array.from(new TextEncoder().encode(message))).toDER("hex") as string;
  }

  function verifyServerSide(pId: number, tx: string, pk: string, sigHex: string): string | null {
    const messageBytes = Array.from(new TextEncoder().encode(bootConfirmMessage(pId, tx)));
    const verified = PublicKey.fromString(pk).verify(
      messageBytes,
      Signature.fromDER(sigHex, "hex")
    );
    if (!verified) return null;
    return PublicKey.fromString(pk).toAddress().toString();
  }

  it("verifies a correctly-signed boot and derives the booter address from the pubkey", () => {
    const sig = signClientSide(postId, txid);
    expect(verifyServerSide(postId, txid, pubkey, sig)).toBe(address);
  });

  it("rejects a signature over a different postId (cross-post replay defense)", () => {
    const sig = signClientSide(postId, txid);
    expect(verifyServerSide(postId + 1, txid, pubkey, sig)).toBeNull();
  });

  it("rejects a signature over a different txid", () => {
    const sig = signClientSide(postId, txid);
    expect(verifyServerSide(postId, "d".repeat(64), pubkey, sig)).toBeNull();
  });

  it("rejects a signature made by a different key than the claimed pubkey", () => {
    const sig = signClientSide(postId, txid);
    const otherPubkey = PrivateKey.fromRandom().toPublicKey().toString();
    expect(verifyServerSide(postId, txid, otherPubkey, sig)).toBeNull();
  });
});
