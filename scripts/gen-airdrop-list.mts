/**
 * Ordinals airdrop recipient-list generator.
 *
 * Reads the DISTINCT contributor pubkeys from the posts DB, derives each one's
 * ordinals-receive address (and payment address, for reference), and writes a
 * CSV a partner can use to airdrop tokens/collectibles.
 *
 * IMPORTANT — production data:
 *   The REAL airdrop run MUST point at the PRODUCTION database (the live
 *   Railway volume DB, e.g. /data/local.db), NOT the bundled genesis seed. For
 *   LOCAL TESTING you can point it at `seed/genesis.db` (2006 posts, 25
 *   pubkeys). The script prints which DB it opened at startup so a mistake is
 *   obvious.
 *
 * Derivation source of truth:
 *   The ord-receive address is derived by `ordAddressFromPubkey` using the
 *   PUBLIC, PERMANENT `ORD_RECEIVE_INVOICE` constant — BOTH imported from
 *   `src/lib/ord-derivation.ts`. A settled DECISIONS.md rule forbids re-typing
 *   the invoice literal or re-implementing the derivation anywhere; this script
 *   imports them so the airdrop generator and the UI can never drift.
 *
 * Output CSV columns (exactly): pubkey,ord_address,payment_address,post_count
 *   No weight/share/percentage column — airdrop weighting is a PARKED decision;
 *   this script emits raw post_count only, baking in no allocation policy.
 *
 * Usage:
 *   npx tsx scripts/gen-airdrop-list.mts <dbPath> [outCsvPath]
 *   - dbPath    : process.argv[2] ?? process.env.DATABASE_PATH ?? "./local.db"
 *   - outCsvPath: process.argv[3] — if given, write the CSV there; else print
 *                 to stdout. The conventional default file target for a run is
 *                 "./airdrop-list.csv" (git-ignored). Example:
 *                   npx tsx scripts/gen-airdrop-list.mts /data/local.db ./airdrop-list.csv
 *
 * The output CSV is a recipient list and is git-ignored (see .gitignore).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PublicKey } from "@bsv/sdk";
import Database from "better-sqlite3";
import { ORD_RECEIVE_INVOICE, ordAddressFromPubkey } from "../src/lib/ord-derivation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mainnet P2PKH address shape (base58, version byte 1 or 3).
const P2PKH_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;

type PubkeyRow = { pubkey: string; post_count: number };

function resolveDbPath(): string {
  return process.argv[2] ?? process.env.DATABASE_PATH ?? path.join(process.cwd(), "local.db");
}

function main(): void {
  const dbPath = resolveDbPath();
  const outPath = process.argv[3]; // undefined => stdout
  const genesisSeed = path.join(__dirname, "..", "seed", "genesis.db");

  console.error("[airdrop] Ordinals airdrop recipient-list generator");
  console.error(`[airdrop] Reading DB: ${dbPath}`);
  if (path.resolve(dbPath) === path.resolve(genesisSeed)) {
    console.error(
      "[airdrop] NOTE: this is the GENESIS SEED (local test data). The real airdrop run must point at the PRODUCTION database."
    );
  } else {
    console.error(
      "[airdrop] REMINDER: for a real airdrop this must be the PRODUCTION database, not seed/genesis.db."
    );
  }
  console.error(`[airdrop] Ord invoice: "${ORD_RECEIVE_INVOICE}"`);

  const db = new Database(dbPath, { readonly: true });
  let rows: PubkeyRow[];
  try {
    rows = db
      .prepare(
        "SELECT pubkey, COUNT(*) AS post_count FROM posts WHERE pubkey IS NOT NULL AND pubkey != '' GROUP BY pubkey ORDER BY post_count DESC"
      )
      .all() as PubkeyRow[];
  } finally {
    db.close();
  }

  const inputCount = rows.length;
  let skipped = 0;
  let collisions = 0;
  const seenOrd = new Set<string>();
  const csvLines: string[] = ["pubkey,ord_address,payment_address,post_count"];

  for (const row of rows) {
    const { pubkey, post_count } = row;
    let ordAddress: string;
    let paymentAddress: string;
    try {
      ordAddress = ordAddressFromPubkey(pubkey);
      paymentAddress = PublicKey.fromString(pubkey).toAddress().toString();
    } catch (err) {
      skipped++;
      console.error(
        `[airdrop] SKIP malformed pubkey ${pubkey}: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

    if (!P2PKH_RE.test(ordAddress)) {
      skipped++;
      console.error(
        `[airdrop] SKIP pubkey ${pubkey}: derived ord_address failed P2PKH validation (${ordAddress})`
      );
      continue;
    }
    if (!P2PKH_RE.test(paymentAddress)) {
      skipped++;
      console.error(
        `[airdrop] SKIP pubkey ${pubkey}: derived payment_address failed P2PKH validation (${paymentAddress})`
      );
      continue;
    }

    if (seenOrd.has(ordAddress)) {
      collisions++;
      console.error(
        `[airdrop] COLLISION: pubkey ${pubkey} derives to ord_address ${ordAddress} already emitted — keeping first, skipping this one.`
      );
      continue;
    }
    seenOrd.add(ordAddress);

    csvLines.push(`${pubkey},${ordAddress},${paymentAddress},${post_count}`);
  }

  const emitted = csvLines.length - 1; // minus header
  const csv = `${csvLines.join("\n")}\n`;

  if (outPath) {
    fs.writeFileSync(outPath, csv);
    console.error(`[airdrop] Wrote CSV → ${outPath}`);
  } else {
    process.stdout.write(csv);
  }

  console.error("[airdrop] --- summary ---");
  console.error(`[airdrop] input pubkeys : ${inputCount}`);
  console.error(`[airdrop] emitted rows  : ${emitted}`);
  console.error(`[airdrop] skipped       : ${skipped}`);
  console.error(`[airdrop] collisions    : ${collisions}`);
}

main();
