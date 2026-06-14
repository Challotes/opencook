import path from "node:path";
import Database from "better-sqlite3";

let db: ReturnType<typeof Database>;

try {
  db = new Database(process.env.DATABASE_PATH || path.join(process.cwd(), "local.db"));
} catch (err) {
  throw new Error(
    `BSVibes DB: failed to open local.db — ${err instanceof Error ? err.message : String(err)}`
  );
}

try {
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

  // Migrate bootboard: add boosted_by_name column if missing.
  // boosted_by now stores the BSV address (stable ID for queries),
  // boosted_by_name stores the display name (anon_XXXX).
  const bootboardCols = db.prepare("PRAGMA table_info(bootboard)").all() as { name: string }[];
  const bootboardColNames = bootboardCols.map((c) => c.name);
  if (!bootboardColNames.includes("boosted_by_name")) {
    db.exec("ALTER TABLE bootboard ADD COLUMN boosted_by_name TEXT");
    // Back-fill: existing rows stored the display name in boosted_by,
    // so copy it to boosted_by_name (address unknown for old rows).
    db.exec("UPDATE bootboard SET boosted_by_name = boosted_by WHERE boosted_by_name IS NULL");
  }
  // Migrate bootboard: add is_free column if missing.
  // is_free = 1 means the server paid for this boot (user used a free boot grant).
  // is_free = 0 means the user paid out of their own wallet.
  // Back-fill: existing rows pre-date this column, treat as paid (conservative — avoids hiding real costs).
  if (!bootboardColNames.includes("is_free")) {
    db.exec("ALTER TABLE bootboard ADD COLUMN is_free INTEGER NOT NULL DEFAULT 0");
  }

  // Migrate: add columns if they don't exist yet
  const columns = db.prepare("PRAGMA table_info(posts)").all() as { name: string }[];
  const columnNames = columns.map((c) => c.name);

  if (!columnNames.includes("signature")) {
    db.exec("ALTER TABLE posts ADD COLUMN signature TEXT");
  }
  if (!columnNames.includes("pubkey")) {
    db.exec("ALTER TABLE posts ADD COLUMN pubkey TEXT");
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
    `BSVibes DB: failed during schema init — ${err instanceof Error ? err.message : String(err)}`
  );
}

export { db };
