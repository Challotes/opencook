/**
 * Full boot workflow coordinator.
 * Validates → prices → scores → splits → broadcasts → records.
 * SQLite bootboard only updates AFTER successful BSV broadcast.
 */

import type BetterSqlite3 from "better-sqlite3";
import { getServerAddress } from "@/services/bsv/wallet";
import { buildSplitTransaction } from "./boot-payment";
import { FAIRNESS_CONFIG } from "./config";
import { getBootPriceForUser } from "./pricing";
import { calculateSplit } from "./split";
import { calculateWeights } from "./weights";

export interface BootResult {
  success: boolean;
  txid?: string;
  price: number;
  recipients: number;
  error?: string;
  isFree: boolean;
}

/**
 * Execute a full boot: validate, price, score, split, broadcast, record.
 *
 * @param booterAddress  Stable identifier for the booter (BSV address) — used for boot_grants tracking
 * @param booterName    Human-readable name (e.g. anon_x4f2) — stored in bootboard for display
 */
export async function executeBoot(
  db: BetterSqlite3.Database,
  postId: number,
  booterAddress: string,
  booterName: string
): Promise<BootResult> {
  // 1. Validate the post exists and is boostable (has pubkey)
  const post = db.prepare("SELECT id, pubkey, author_name FROM posts WHERE id = ?").get(postId) as
    | { id: number; pubkey: string | null; author_name: string }
    | undefined;

  if (!post)
    return { success: false, price: 0, recipients: 0, error: "Post not found", isFree: false };
  if (!post.pubkey)
    return {
      success: false,
      price: 0,
      recipients: 0,
      error: "Post is unsigned — cannot be booted",
      isFree: false,
    };

  // 2. Check server wallet — if not configured, do SQLite-only boot (no on-chain split)
  const platformAddress = getServerAddress();

  // 3. Get dynamic price and check free boot eligibility
  const { price, isFree } = getBootPriceForUser(db, booterAddress);
  // Free boots pay the floor (1,000 sats), not the dynamic price.
  // Bounds per-user server subsidy at ~15,690 sats regardless of platform scale.
  // See DECISIONS.md "Free boots pay floor only (settled 2026-04-09)".
  const actualPrice = isFree ? FAIRNESS_CONFIG.bootPriceFloor : price;

  // 4. Calculate contribution weights (with migration chain resolution)
  const weights = calculateWeights(db);

  // 5. Derive boosted post creator's address from their pubkey
  let creatorAddress: string;
  try {
    const { PublicKey } = await import("@bsv/sdk");
    creatorAddress = PublicKey.fromString(post.pubkey).toAddress().toString();
  } catch {
    return {
      success: false,
      price: actualPrice,
      recipients: 0,
      error: "Invalid creator pubkey",
      isFree,
    };
  }

  // 6. Calculate the split
  let txid: string | undefined;
  let recipientCount = 0;
  let split: ReturnType<typeof calculateSplit> | null = null;

  if (platformAddress) {
    split = calculateSplit(actualPrice, post.pubkey, creatorAddress, platformAddress, weights);
    recipientCount = split.recipientCount;

    // 7. Build and broadcast the BSV split transaction
    const result = await buildSplitTransaction(split, postId);

    if (result.status === "success") {
      txid = result.txid;
    } else {
      // Log the failure — broadcast did not succeed, do not consume the grant.
      const errorDetail = result.status === "broadcast_failed" ? result.error : result.status;
      console.error(`BSVibes: boot split broadcast FAILED for post ${postId}: ${errorDetail}`);
      // C5 fix: grant must NOT be consumed when broadcast fails.
      return {
        success: false,
        price: actualPrice,
        recipients: 0,
        error: `Broadcast failed: ${errorDetail}`,
        isFree,
      };
    }
  }

  // 8. Update SQLite (bootboard + grants + payouts).
  // For free boots this block is only reached when platformAddress is set AND broadcast succeeded (txid defined).
  // For unconfigured-wallet boots (no platformAddress) we still record the bootboard entry — no grant to consume.
  db.transaction(() => {
    // Close current bootboard holder
    db.prepare(`
      UPDATE bootboard SET held_until = datetime('now')
      WHERE held_until IS NULL
    `).run();

    // New post takes the spot.
    // boosted_by = BSV address (used for activity feed queries by address)
    // boosted_by_name = human-readable display name (anon_XXXX)
    // is_free = 1 when the server wallet paid (user had a free boot grant)
    const bootboardInsert = db
      .prepare(`
      INSERT INTO bootboard (post_id, boosted_by, boosted_by_name, is_free) VALUES (?, ?, ?, ?)
    `)
      .run(postId, booterAddress, booterName, isFree ? 1 : 0);

    // Use the unique bootboard row ID as bootEventId so multiple boots on the
    // same post each get their own payout set — prevents double-counting in earnings.
    const bootEventId = bootboardInsert.lastInsertRowid as number;

    // Update free boot grants
    const existing = db
      .prepare("SELECT pubkey FROM boot_grants WHERE pubkey = ?")
      .get(booterAddress);
    if (isFree) {
      if (existing) {
        db.prepare(
          "UPDATE boot_grants SET free_boots_used = free_boots_used + 1, total_boots = total_boots + 1 WHERE pubkey = ?"
        ).run(booterAddress);
      } else {
        db.prepare(
          "INSERT INTO boot_grants (pubkey, free_boots_used, total_boots) VALUES (?, 1, 1)"
        ).run(booterAddress);
      }
    } else {
      if (existing) {
        db.prepare("UPDATE boot_grants SET total_boots = total_boots + 1 WHERE pubkey = ?").run(
          booterAddress
        );
      } else {
        db.prepare(
          "INSERT INTO boot_grants (pubkey, free_boots_used, total_boots) VALUES (?, 0, 1)"
        ).run(booterAddress);
      }
    }

    // Record payouts for audit trail (when split transaction was broadcast)
    if (split && txid) {
      if (split.platform.sats > 0) {
        db.prepare(
          "INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(
          bootEventId,
          "platform",
          split.platform.address,
          split.platform.sats,
          "platform",
          txid
        );
      }

      if (split.creatorBonus.sats > 0) {
        db.prepare(
          "INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(
          bootEventId,
          split.creatorBonus.pubkey,
          split.creatorBonus.address,
          split.creatorBonus.sats,
          "boost_bonus",
          txid
        );
      }

      for (const recipient of split.pool) {
        if (recipient.sats > 0) {
          db.prepare(
            "INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)"
          ).run(
            bootEventId,
            recipient.pubkey,
            recipient.address,
            recipient.sats,
            "pool_share",
            txid
          );
        }
      }
    }
  })();

  return {
    success: true,
    txid,
    price: actualPrice,
    recipients: recipientCount,
    isFree,
  };
}
