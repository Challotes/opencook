import { PrivateKey } from "@bsv/sdk";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { _clearWeightsCache, calculateWeights } from "./weights";

function createTestDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      author_name TEXT NOT NULL,
      signature TEXT,
      pubkey TEXT,
      tx_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE bootboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      boosted_by TEXT NOT NULL,
      booted_at TEXT NOT NULL DEFAULT (datetime('now')),
      held_until TEXT,
      boosted_by_name TEXT,
      is_free INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (post_id) REFERENCES posts(id)
    )
  `);
  return db;
}

function makeKey() {
  const priv = PrivateKey.fromRandom();
  return {
    pubkey: priv.toPublicKey().toString(),
    address: priv.toPublicKey().toAddress().toString(),
  };
}

function addPost(db: ReturnType<typeof Database>, pubkey: string, minutesAgo = 0) {
  const created = new Date(Date.now() - minutesAgo * 60_000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "")
    .slice(0, 19);
  db.prepare(
    "INSERT INTO posts (content, author_name, pubkey, created_at) VALUES (?, ?, ?, ?)"
  ).run("test post", "anon_test", pubkey, created);
}

function addBoot(db: ReturnType<typeof Database>, postId: number) {
  db.prepare("INSERT INTO bootboard (post_id, boosted_by) VALUES (?, ?)").run(postId, "someone");
}

describe("calculateWeights", () => {
  let db: ReturnType<typeof Database>;

  beforeEach(() => {
    _clearWeightsCache();
    db = createTestDb();
  });

  it("returns empty array for empty DB", () => {
    expect(calculateWeights(db)).toHaveLength(0);
  });

  it("returns empty for unsigned posts only", () => {
    db.prepare("INSERT INTO posts (content, author_name) VALUES (?, ?)").run("unsigned", "anon");
    expect(calculateWeights(db)).toHaveLength(0);
  });

  it("returns one contributor for a single signed post", () => {
    const key = makeKey();
    addPost(db, key.pubkey);
    const weights = calculateWeights(db);

    expect(weights).toHaveLength(1);
    expect(weights[0].pubkey).toBe(key.pubkey);
    expect(weights[0].address).toBe(key.address);
    expect(weights[0].weight).toBeGreaterThan(0);
    expect(weights[0].postCount).toBe(1);
    expect(weights[0].totalBoots).toBe(0);
  });

  it("aggregates multiple posts from same contributor", () => {
    const key = makeKey();
    addPost(db, key.pubkey, 0);
    addPost(db, key.pubkey, 5);
    const weights = calculateWeights(db);

    expect(weights).toHaveLength(1);
    expect(weights[0].postCount).toBe(2);
    // Two posts should produce higher total weight than one
    expect(weights[0].weight).toBeGreaterThan(1);
  });

  it("separates different contributors", () => {
    const keyA = makeKey();
    const keyB = makeKey();
    addPost(db, keyA.pubkey, 0);
    addPost(db, keyB.pubkey, 0);
    const weights = calculateWeights(db);

    expect(weights).toHaveLength(2);
    const pubkeys = weights.map((w) => w.pubkey);
    expect(pubkeys).toContain(keyA.pubkey);
    expect(pubkeys).toContain(keyB.pubkey);
  });

  it("boots increase weight via engagement multiplier", () => {
    const key = makeKey();
    addPost(db, key.pubkey, 0);
    const postId = (
      db.prepare("SELECT id FROM posts ORDER BY id DESC LIMIT 1").get() as { id: number }
    ).id;

    const weightBefore = calculateWeights(db)[0].weight;

    // Add 3 boots and clear cache to force recalc
    addBoot(db, postId);
    addBoot(db, postId);
    addBoot(db, postId);
    _clearWeightsCache();

    const weightsAfter = calculateWeights(db);
    expect(weightsAfter[0].weight).toBeGreaterThan(weightBefore);
    expect(weightsAfter[0].totalBoots).toBe(3);
  });

  it("older posts have lower weight (time decay)", () => {
    const key = makeKey();
    // One recent post and one 30-day old post from the same contributor
    addPost(db, key.pubkey, 0); // recent — high decay
    addPost(db, key.pubkey, 30 * 24 * 60); // 30 days — half-life decay

    const weights = calculateWeights(db);
    expect(weights).toHaveLength(1);
    // With half-life = 30 days, recent post contributes ~1.0, old post ~0.5
    // Total should be ~1.5, proving the old post decayed (not equal to recent)
    expect(weights[0].weight).toBeGreaterThan(1);
    expect(weights[0].weight).toBeLessThan(2); // would be 2 if no decay
  });

  it("does not produce NaN from SQLite datetime format", () => {
    const key = makeKey();
    // Insert with SQLite's native datetime() which produces space-separated format
    db.prepare(
      "INSERT INTO posts (content, author_name, pubkey, created_at) VALUES (?, ?, ?, datetime('now'))"
    ).run("test", "anon", key.pubkey);

    const weights = calculateWeights(db);
    expect(weights).toHaveLength(1);
    expect(weights[0].weight).toBeGreaterThan(0);
    expect(Number.isNaN(weights[0].weight)).toBe(false);
  });
});
