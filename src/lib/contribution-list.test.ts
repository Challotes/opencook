import { PrivateKey, PublicKey } from "@bsv/sdk";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { buildContributionList, sharePct, toContributionCsv } from "./contribution-list";
import { ordAddressFromPubkey } from "./ord-derivation";

// Real, valid compressed secp256k1 pubkeys derived from small scalars — so the
// derivation + P2PKH validation in buildContributionList exercises real crypto,
// not stand-in strings.
const PUB_A = new PrivateKey(11).toPublicKey().toString();
const PUB_B = new PrivateKey(22).toPublicKey().toString();
const PUB_C = new PrivateKey(33).toPublicKey().toString();

function makeDb(): import("better-sqlite3").Database {
  const db = new Database(":memory:");
  // Mirror the posts schema from src/lib/db.ts.
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
  const insert = db.prepare("INSERT INTO posts (content, author_name, pubkey) VALUES (?, ?, ?)");
  // A: 3 posts, B: 2 posts, C: 1 post → 6 attributed posts total.
  for (let i = 0; i < 3; i++) insert.run(`a${i}`, "anon_AAAA", PUB_A);
  for (let i = 0; i < 2; i++) insert.run(`b${i}`, "anon_BBBB", PUB_B);
  insert.run("c0", "anon_CCCC", PUB_C);
  // Excluded: NULL and empty-string pubkeys (e.g. unsigned posts, server rows).
  insert.run("nul", "anon_NULL", null);
  insert.run("empty", "anon_EMPTY", "");
  return db;
}

describe("contribution-list / buildContributionList", () => {
  let db: import("better-sqlite3").Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("returns rows sorted descending by postCount", () => {
    const { rows } = buildContributionList(db);
    expect(rows.map((r) => r.postCount)).toEqual([3, 2, 1]);
    expect(rows[0].pubkey).toBe(PUB_A);
    expect(rows[2].pubkey).toBe(PUB_C);
  });

  it("excludes NULL and empty-string pubkeys", () => {
    const { rows, totalPosts, stats } = buildContributionList(db);
    // 3 distinct valid pubkeys; the NULL and '' rows never reach input.
    expect(rows).toHaveLength(3);
    expect(stats.input).toBe(3);
    expect(stats.emitted).toBe(3);
    expect(stats.skipped).toBe(0);
    expect(stats.collisions).toBe(0);
    // totalPosts is the SUM over EMITTED rows (3 + 2 + 1), not the raw table.
    expect(totalPosts).toBe(6);
  });

  it("derives ord + payment addresses via the shared derivation constant", () => {
    const { rows } = buildContributionList(db);
    expect(rows[0].ordAddress).toBe(ordAddressFromPubkey(PUB_A));
    expect(rows[0].paymentAddress).toBe(PublicKey.fromString(PUB_A).toAddress().toString());
  });

  it("produces sharePct values that sum to ~100", () => {
    const { rows, totalPosts } = buildContributionList(db);
    const sum = rows.reduce((acc, r) => acc + sharePct(r.postCount, totalPosts), 0);
    expect(sum).toBeCloseTo(100, 2);
    // Spot-check the leading share: 3 / 6 = 50%.
    expect(sharePct(rows[0].postCount, totalPosts)).toBe(50);
  });

  it("guards sharePct against a zero denominator", () => {
    expect(sharePct(0, 0)).toBe(0);
    expect(sharePct(5, 0)).toBe(0);
  });
});

describe("contribution-list / toContributionCsv", () => {
  it("emits the expected header and a known top row", () => {
    const db = makeDb();
    const { rows, totalPosts } = buildContributionList(db);
    const csv = toContributionCsv(rows, totalPosts);
    const lines = csv.trimEnd().split("\n");

    expect(lines[0]).toBe("pubkey,ord_address,payment_address,post_count,share_pct");
    expect(lines[1]).toBe(
      `${PUB_A},${ordAddressFromPubkey(PUB_A)},${PublicKey.fromString(PUB_A)
        .toAddress()
        .toString()},3,50`
    );
    // Header + 3 data rows.
    expect(lines).toHaveLength(4);
  });

  it("omits post_count when includePostCount is false (public CSV)", () => {
    const db = makeDb();
    const { rows, totalPosts } = buildContributionList(db);
    const csv = toContributionCsv(rows, totalPosts, { includePostCount: false });
    const lines = csv.trimEnd().split("\n");

    expect(lines[0]).toBe("pubkey,ord_address,payment_address,share_pct");
    expect(lines[0]).not.toContain("post_count");
    // Same top row, minus the raw count column; share_pct still present.
    expect(lines[1]).toBe(
      `${PUB_A},${ordAddressFromPubkey(PUB_A)},${PublicKey.fromString(PUB_A)
        .toAddress()
        .toString()},50`
    );
    expect(lines).toHaveLength(4);
  });
});
