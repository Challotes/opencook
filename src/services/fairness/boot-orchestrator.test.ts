import { PrivateKey } from "@bsv/sdk";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBalance, getServerAddress, isServerSpendDisabled } from "@/services/bsv/wallet";
import { executeBoot } from "./boot-orchestrator";
import { buildSplitTransaction } from "./boot-payment";
import { getBootPrice, getBootPriceForUser } from "./pricing";
import { _clearWeightsCache } from "./weights";

// Mock the broadcast (server wallet), the server address, and pricing so we can
// drive isFree + observe the boot_grants state at broadcast time. calculateSplit
// + calculateWeights stay real (operate on the in-memory DB).
vi.mock("./boot-payment");
vi.mock("@/services/bsv/wallet");
vi.mock("./pricing");

const FREE_LIMIT = 15;

function createTestDb() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, author_name TEXT NOT NULL,
    signature TEXT, pubkey TEXT, tx_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE bootboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, boosted_by TEXT NOT NULL,
    booted_at TEXT NOT NULL DEFAULT (datetime('now')), held_until TEXT, boosted_by_name TEXT,
    is_free INTEGER NOT NULL DEFAULT 0)`);
  db.exec(`CREATE TABLE boot_grants (
    pubkey TEXT PRIMARY KEY, free_boots_used INTEGER NOT NULL DEFAULT 0, total_boots INTEGER NOT NULL DEFAULT 0)`);
  db.exec(`CREATE TABLE payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, boot_event_id INTEGER NOT NULL, recipient_pubkey TEXT NOT NULL,
    recipient_address TEXT NOT NULL, amount_sats INTEGER NOT NULL, payout_type TEXT NOT NULL, txid TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  return db;
}

function grant(
  db: InstanceType<typeof Database>,
  addr: string
): { free_boots_used: number; total_boots: number } {
  const row = db
    .prepare("SELECT free_boots_used, total_boots FROM boot_grants WHERE pubkey = ?")
    .get(addr) as { free_boots_used: number; total_boots: number } | undefined;
  return row ?? { free_boots_used: 0, total_boots: 0 };
}

function freeBootsUsed(db: InstanceType<typeof Database>, addr: string): number {
  return grant(db, addr).free_boots_used;
}

describe("executeBoot — free-boot idempotency (Step 8)", () => {
  let db: InstanceType<typeof Database>;
  const creatorKey = PrivateKey.fromRandom();
  const creatorPubkey = creatorKey.toPublicKey().toString();
  const platformAddress = PrivateKey.fromRandom().toPublicKey().toAddress().toString();
  const booter = PrivateKey.fromRandom().toPublicKey().toAddress().toString();

  beforeEach(() => {
    vi.clearAllMocks();
    _clearWeightsCache();
    db = createTestDb();
    // One signed post so calculateWeights/calculateSplit have a contributor.
    db.prepare("INSERT INTO posts (content, author_name, pubkey) VALUES (?, ?, ?)").run(
      "hello",
      "anon_creator",
      creatorPubkey
    );
    vi.mocked(getServerAddress).mockReturnValue(platformAddress);
    vi.mocked(getBootPrice).mockReturnValue(1000);
    // Build B/C defaults: ample server balance + kill-switch OFF, so the
    // pre-consume prechecks pass and the normal path runs unless a test overrides.
    vi.mocked(getBalance).mockResolvedValue(1_000_000);
    vi.mocked(isServerSpendDisabled).mockReturnValue(false);
    // Realistic free check that reads the DB (so the consume guard is exercised).
    vi.mocked(getBootPriceForUser).mockImplementation((database, addr) => {
      const used = freeBootsUsed(database as InstanceType<typeof Database>, addr);
      const isFree = used < FREE_LIMIT;
      return { price: isFree ? 0 : 1000, isFree, freeRemaining: Math.max(0, FREE_LIMIT - used) };
    });
  });

  it("consumes the free grant BEFORE broadcasting, exactly once on success", async () => {
    let usedAtBroadcast = -1;
    vi.mocked(buildSplitTransaction).mockImplementation(async () => {
      usedAtBroadcast = freeBootsUsed(db, booter);
      return { status: "success", txid: "a".repeat(64) };
    });

    const result = await executeBoot(db, 1, booter, "anon_booter");

    expect(result.success).toBe(true);
    expect(result.isFree).toBe(true);
    // The grant was already consumed when the broadcast fired (idempotency key).
    expect(usedAtBroadcast).toBe(1);
    // And it is consumed exactly once (not double-incremented by the record step).
    // total_boots === 1 confirms the consume-INSERT → record-UPDATE compose did
    // not collide on the boot_grants PK or double-count.
    expect(grant(db, booter)).toEqual({ free_boots_used: 1, total_boots: 1 });
    // Step 9: the booter is threaded into the on-chain audit record (3rd arg).
    expect(buildSplitTransaction).toHaveBeenCalledWith(expect.anything(), 1, booter);
  });

  it("refuses a free boot when the server wallet is unconfigured — no grant burned, no phantom boot (Finding 4)", async () => {
    vi.mocked(getServerAddress).mockReturnValue(null);

    const result = await executeBoot(db, 1, booter, "anon_booter");

    expect(result.success).toBe(false);
    expect(result.error).toBe("SERVER_WALLET_UNCONFIGURED");
    expect(buildSplitTransaction).not.toHaveBeenCalled();
    // No grant consumed, no bootboard row recorded (the old behavior burned a
    // grant + recorded a payout-less boot here — that was the bug).
    expect(grant(db, booter)).toEqual({ free_boots_used: 0, total_boots: 0 });
    const bootRows = db.prepare("SELECT COUNT(*) as c FROM bootboard").get() as { c: number };
    expect(bootRows.c).toBe(0);
  });

  it("does NOT refund the free grant when the broadcast fails", async () => {
    vi.mocked(buildSplitTransaction).mockResolvedValue({
      status: "broadcast_failed",
      error: "arc down",
    });

    const result = await executeBoot(db, 1, booter, "anon_booter");

    expect(result.success).toBe(false);
    // Consumed before broadcast, NOT refunded on failure (ambiguous-failure safety).
    expect(freeBootsUsed(db, booter)).toBe(1);
  });

  it("routes to paid (isFree:false) without broadcasting when the grant is exhausted", async () => {
    // Force the race: isFree reads true, but the DB shows the grant already maxed
    // (a concurrent boot consumed the last slot) → the atomic consume must bail.
    db.prepare(
      "INSERT INTO boot_grants (pubkey, free_boots_used, total_boots) VALUES (?, ?, 0)"
    ).run(booter, FREE_LIMIT);
    vi.mocked(getBootPriceForUser).mockReturnValue({ price: 0, isFree: true, freeRemaining: 0 });

    const result = await executeBoot(db, 1, booter, "anon_booter");

    expect(result.success).toBe(false);
    expect(result.isFree).toBe(false);
    expect(result.error).toBe("FREE_GRANT_EXHAUSTED");
    // Never spent the server wallet.
    expect(buildSplitTransaction).not.toHaveBeenCalled();
    // Grant unchanged (not over-incremented).
    expect(freeBootsUsed(db, booter)).toBe(FREE_LIMIT);
  });

  it("routes to paid (isFree:false) without broadcasting when server spending is disabled (kill-switch, Build C)", async () => {
    vi.mocked(isServerSpendDisabled).mockReturnValue(true);

    const result = await executeBoot(db, 1, booter, "anon_booter");

    expect(result.success).toBe(false);
    expect(result.isFree).toBe(false);
    expect(result.error).toBe("SERVER_SPEND_DISABLED");
    // Checked PRE-consume: the server wallet is never spent and the free grant is
    // never consumed (tripping the switch must not strand a grant).
    expect(buildSplitTransaction).not.toHaveBeenCalled();
    expect(grant(db, booter)).toEqual({ free_boots_used: 0, total_boots: 0 });
  });
});
