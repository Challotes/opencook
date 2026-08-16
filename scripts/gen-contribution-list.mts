/**
 * Contribution-list generator.
 *
 * Reads the DISTINCT contributor pubkeys from the posts DB, derives each one's
 * ordinals-receive address (and payment address, for reference), and writes a
 * contribution-list CSV a partner can use to send tokens/collectibles to
 * contributors.
 *
 * IMPORTANT — production data:
 *   The REAL run MUST point at the PRODUCTION database (the live Railway volume
 *   DB, e.g. /data/local.db), NOT the bundled genesis seed. For LOCAL TESTING
 *   you can point it at `seed/genesis.db` (2006 posts, 25 pubkeys). The script
 *   prints which DB it opened at startup so a mistake is obvious.
 *
 * Derivation source of truth:
 *   The ord-receive address is derived by `ordAddressFromPubkey` using the
 *   PUBLIC, PERMANENT `ORD_RECEIVE_INVOICE` constant — BOTH imported from
 *   `src/lib/ord-derivation.ts`. A settled DECISIONS.md rule forbids re-typing
 *   the invoice literal or re-implementing the derivation anywhere; this script
 *   imports them so the contribution-list generator and the UI can never drift.
 *
 * Output CSV columns (exactly): pubkey,ord_address,payment_address,post_count,share_pct
 *   `share_pct` = raw per-post share (post_count ÷ emitted-total), the same
 *   number the live `/api/fairness` panel shows — both go through the shared
 *   `buildContributionList` core so they can never drift.
 *
 * Usage:
 *   npx tsx scripts/gen-contribution-list.mts <dbPath> [outCsvPath]
 *   - dbPath    : process.argv[2] ?? process.env.DATABASE_PATH ?? "./local.db"
 *   - outCsvPath: process.argv[3] — if given, write the CSV there; else print
 *                 to stdout. The conventional default file target for a run is
 *                 "./contribution-list.csv" (git-ignored). Example:
 *                   npx tsx scripts/gen-contribution-list.mts /data/local.db ./contribution-list.csv
 *
 * The output CSV is a contribution list and is git-ignored (see .gitignore).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { buildContributionList, toContributionCsv } from "../src/lib/contribution-list";
import { ORD_RECEIVE_INVOICE } from "../src/lib/ord-derivation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDbPath(): string {
  return process.argv[2] ?? process.env.DATABASE_PATH ?? path.join(process.cwd(), "local.db");
}

function main(): void {
  const dbPath = resolveDbPath();
  const outPath = process.argv[3]; // undefined => stdout
  const genesisSeed = path.join(__dirname, "..", "seed", "genesis.db");

  console.error("[contribution] Contribution-list generator");
  console.error(`[contribution] Reading DB: ${dbPath}`);
  if (path.resolve(dbPath) === path.resolve(genesisSeed)) {
    console.error(
      "[contribution] NOTE: this is the GENESIS SEED (local test data). The real run must point at the PRODUCTION database."
    );
  } else {
    console.error(
      "[contribution] REMINDER: for a real run this must be the PRODUCTION database, not seed/genesis.db."
    );
  }
  console.error(`[contribution] Ord invoice: "${ORD_RECEIVE_INVOICE}"`);

  const db = new Database(dbPath, { readonly: true });
  let rows: ReturnType<typeof buildContributionList>["rows"];
  let totalPosts: number;
  let stats: ReturnType<typeof buildContributionList>["stats"];
  try {
    ({ rows, totalPosts, stats } = buildContributionList(db));
  } finally {
    db.close();
  }

  const csv = toContributionCsv(rows, totalPosts);

  if (outPath) {
    fs.writeFileSync(outPath, csv);
    console.error(`[contribution] Wrote CSV → ${outPath}`);
  } else {
    process.stdout.write(csv);
  }

  console.error("[contribution] --- summary ---");
  console.error(`[contribution] input pubkeys : ${stats.input}`);
  console.error(`[contribution] emitted rows  : ${stats.emitted}`);
  console.error(`[contribution] skipped       : ${stats.skipped}`);
  console.error(`[contribution] collisions    : ${stats.collisions}`);
  console.error(`[contribution] total posts   : ${totalPosts}`);
}

main();
