import path from "node:path";
import Database from "better-sqlite3";
import { contentId } from "./content-id";

let db: ReturnType<typeof Database>;

try {
  db = new Database(process.env.DATABASE_PATH || path.join(process.cwd(), "local.db"));
} catch (err) {
  throw new Error(
    `OpenCook DB: failed to open local.db — ${err instanceof Error ? err.message : String(err)}`
  );
}

try {
  // Concurrency guard for `next build`: it collects page data across ~31 worker
  // processes that each import this module and run schema init against the SAME
  // fresh DB file. Without this, two writers collide → "database is locked".
  // busy_timeout makes a blocked writer WAIT (up to 10s) for the lock instead of
  // throwing immediately, so the parallel inits serialize cleanly. Set FIRST, so
  // even the journal_mode/DDL writes below honor it. (Runtime is single-process,
  // so this is effectively a no-op there.)
  db.pragma("busy_timeout = 10000");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
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
    CREATE TABLE IF NOT EXISTS bootboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      boosted_by TEXT NOT NULL,
      booted_at TEXT NOT NULL DEFAULT (datetime('now')),
      held_until TEXT,
      FOREIGN KEY (post_id) REFERENCES posts(id)
    )
  `);

  // ALTER TABLE ADD COLUMN is NOT idempotent, and `next build` collects page
  // data across many parallel worker processes that each import this module and
  // run these migrations against the SAME database file. On a FRESH db they race
  // — two workers both see a column missing and both ADD it → "duplicate column
  // name" (this broke the Railway build on a fresh /data). Guard each add so a
  // lost race is a harmless no-op; the column ends up present either way.
  const addColumnIfMissing = (table: string, column: string, definition: string): boolean => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.some((c) => c.name === column)) return false;
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
      return true;
    } catch (err) {
      // Another process won the race and added it first — the column now exists,
      // which is exactly what we wanted. Re-throw anything that ISN'T that.
      if (err instanceof Error && /duplicate column name/i.test(err.message)) return false;
      throw err;
    }
  };

  // bootboard.boosted_by_name — display name (anon_XXXX); boosted_by holds the
  // BSV address (stable ID for queries). Back-fill copies the old display name.
  if (addColumnIfMissing("bootboard", "boosted_by_name", "boosted_by_name TEXT")) {
    db.exec("UPDATE bootboard SET boosted_by_name = boosted_by WHERE boosted_by_name IS NULL");
  }
  // bootboard.is_free — 1 = server-funded free boot, 0 = user-paid. Existing rows
  // pre-date this column; the DEFAULT 0 treats them as paid (conservative).
  addColumnIfMissing("bootboard", "is_free", "is_free INTEGER NOT NULL DEFAULT 0");

  // posts.signature / posts.pubkey — added after the original posts schema.
  addColumnIfMissing("posts", "signature", "signature TEXT");
  addColumnIfMissing("posts", "pubkey", "pubkey TEXT");

  // posts.content_id — chain-reproducible content identifier
  // (sha256_hex(pubkey \n content), see lib/content-id.ts). Additive; links a
  // boost to the post it boosted from the chain alone. One-time backfill runs
  // only when the column is freshly added; the WHERE predicate makes any re-run
  // a cheap no-op. Posts with NULL pubkey can't be boosted → stay NULL (correct).
  if (addColumnIfMissing("posts", "content_id", "content_id TEXT")) {
    const rows = db
      .prepare(
        "SELECT id, pubkey, content FROM posts WHERE content_id IS NULL AND pubkey IS NOT NULL"
      )
      .all() as { id: number; pubkey: string; content: string }[];
    const setCid = db.prepare("UPDATE posts SET content_id = ? WHERE id = ?");
    db.transaction(() => {
      for (const row of rows) {
        setCid.run(contentId(row.pubkey, row.content), row.id);
      }
    })();
  }

  // Boot grants — free boot tracking per user (no custody)
  db.exec(`
    CREATE TABLE IF NOT EXISTS boot_grants (
      pubkey TEXT PRIMARY KEY,
      free_boots_used INTEGER NOT NULL DEFAULT 0,
      total_boots INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Payout records — audit trail only, no balances held
  db.exec(`
    CREATE TABLE IF NOT EXISTS payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      boot_event_id INTEGER NOT NULL,
      recipient_pubkey TEXT NOT NULL,
      recipient_address TEXT NOT NULL,
      amount_sats INTEGER NOT NULL,
      payout_type TEXT NOT NULL,
      txid TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Indexes for query performance
  db.exec("CREATE INDEX IF NOT EXISTS idx_bootboard_post_id ON bootboard(post_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_bootboard_held_until ON bootboard(held_until)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_posts_pubkey ON posts(pubkey)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_payouts_boot ON payouts(boot_event_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_payouts_recipient ON payouts(recipient_pubkey)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_payouts_address ON payouts(recipient_address)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_txid ON payouts(txid, recipient_address)");
} catch (err) {
  throw new Error(
    `OpenCook DB: failed during schema init — ${err instanceof Error ? err.message : String(err)}`
  );
}

export { db };
