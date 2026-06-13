import { PrivateKey } from "@bsv/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptWif, encryptWif } from "./crypto";
import {
  changePassphrase,
  clearSessionCaches,
  encryptInPlace,
  isEffectivelyProtected,
  isIdentityEncrypted,
} from "./identity";

// Storage keys (mirrors the private constants in identity.ts).
const STORAGE_KEY = "bfn_keypair";
const ENCRYPTED_KEY = "bfn_keypair_enc";

/** Minimal in-memory localStorage stub for the Node test environment. */
function makeLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

/** Build a real plaintext identity and seed the plaintext store. */
function seedPlaintext() {
  const key = PrivateKey.fromRandom();
  const wif = key.toWif();
  const address = key.toAddress().toString();
  const pubkey = key.toPublicKey().toString();
  const name = "anon_test";
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ wif, name, address, pubkey }));
  return { wif, address, pubkey, name };
}

describe("encrypt-in-place identity primitives", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", makeLocalStorage());
    clearSessionCaches();
  });

  afterEach(() => {
    clearSessionCaches();
    vi.unstubAllGlobals();
  });

  describe("encryptInPlace", () => {
    it("encrypts the existing key in place, removes plaintext, and round-trips", async () => {
      const { wif, address, name } = seedPlaintext();

      const result = await encryptInPlace("correct horse 8", "my reminder");

      // Same key/address — the whole point of encrypt-in-place.
      expect(result.wif).toBe(wif);
      expect(result.address).toBe(address);

      // Plaintext gone, encrypted present.
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(isIdentityEncrypted()).toBe(true);
      expect(isEffectivelyProtected()).toBe(true);

      // The encrypted store decrypts back to the SAME wif and carries the hint.
      const store = JSON.parse(localStorage.getItem(ENCRYPTED_KEY) as string);
      expect(store.name).toBe(name);
      expect(store.address).toBe(address);
      expect(store.hint).toBe("my reminder");
      expect(await decryptWif(store.encrypted, "correct horse 8")).toBe(wif);
      // Wrong passphrase does NOT decrypt.
      expect(await decryptWif(store.encrypted, "wrong pass")).toBeNull();
    });

    it("throws if no key exists to protect", async () => {
      await expect(encryptInPlace("correct horse 8")).rejects.toThrow(/no key to protect/i);
    });

    it("throws if already protected (use changePassphrase instead)", async () => {
      seedPlaintext();
      // Move to an encrypted-only state first, then a second protect must refuse.
      await encryptInPlace("correct horse 8");
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

      await expect(encryptInPlace("another one 9")).rejects.toThrow(/already protected/i);
    });

    it("requires a passphrase", async () => {
      seedPlaintext();
      await expect(encryptInPlace("")).rejects.toThrow(/passphrase is required/i);
    });
  });

  describe("changePassphrase", () => {
    async function seedEncrypted(pass: string) {
      const key = PrivateKey.fromRandom();
      const wif = key.toWif();
      const address = key.toAddress().toString();
      const name = "anon_test";
      const encrypted = await encryptWif(wif, pass);
      localStorage.setItem(ENCRYPTED_KEY, JSON.stringify({ encrypted, name, address }));
      return { wif, address, name };
    }

    it("re-encrypts the same key under a new passphrase", async () => {
      const { wif } = await seedEncrypted("old passphrase 1");

      const res = await changePassphrase("old passphrase 1", "new passphrase 2", "new hint");
      expect(res).toEqual({ ok: true });

      const store = JSON.parse(localStorage.getItem(ENCRYPTED_KEY) as string);
      // New passphrase works, old one no longer does — same underlying key.
      expect(await decryptWif(store.encrypted, "new passphrase 2")).toBe(wif);
      expect(await decryptWif(store.encrypted, "old passphrase 1")).toBeNull();
      expect(store.hint).toBe("new hint");
    });

    it("returns wrong_passphrase WITHOUT mutating the store on a bad old passphrase", async () => {
      await seedEncrypted("old passphrase 1");
      const before = localStorage.getItem(ENCRYPTED_KEY);

      const res = await changePassphrase("WRONG passphrase", "new passphrase 2");
      expect(res).toEqual({ ok: false, reason: "wrong_passphrase" });

      // Store is byte-for-byte unchanged — no overwrite on a failed decrypt.
      expect(localStorage.getItem(ENCRYPTED_KEY)).toBe(before);
    });

    it("rejects a too-short or unchanged new passphrase", async () => {
      await seedEncrypted("old passphrase 1");
      await expect(changePassphrase("old passphrase 1", "short")).rejects.toThrow(/at least 8/i);
      await expect(changePassphrase("old passphrase 1", "old passphrase 1")).rejects.toThrow(
        /different/i
      );
    });
  });
});
