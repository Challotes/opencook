"use server";

import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { generateAnonName } from "@/lib/utils";

async function getBsvSdk() {
  const { PublicKey, Signature } = await import("@bsv/sdk");
  return { PublicKey, Signature };
}

import { postMigrationOnChain } from "@/services/bsv/migration";
import { logPostOnChain } from "@/services/bsv/onchain";
import { executeBoot } from "@/services/fairness/boot-orchestrator";
import { getBootPriceForUser } from "@/services/fairness/pricing";
import type { BootboardData, BootboardHistoryRow, BootboardRow, Post } from "@/types";

export interface CreatePostResult {
  ok: boolean;
  reason?: "bad_input" | "missing_pubkey" | "rate_limited" | "invalid_signature";
}

export async function createPost(formData: FormData): Promise<CreatePostResult> {
  const content = formData.get("content");
  if (typeof content !== "string" || content.trim().length === 0)
    return { ok: false, reason: "bad_input" };
  if (content.length > 1000) return { ok: false, reason: "bad_input" };

  const author = formData.get("author");
  const authorName =
    typeof author === "string" && /^anon_[a-z0-9]{4}$/.test(author) ? author : generateAnonName();

  const signature = formData.get("signature");
  const pubkey = formData.get("pubkey");

  if (typeof pubkey !== "string" || pubkey.trim().length === 0)
    return { ok: false, reason: "missing_pubkey" };

  const rl = rateLimit(`createPost:${pubkey}`, { limit: 10, windowMs: 60_000 });
  if (!rl.success) return { ok: false, reason: "rate_limited" };

  if (typeof signature !== "string") return { ok: false, reason: "invalid_signature" };
  try {
    const { PublicKey, Signature } = await getBsvSdk();
    const messageBytes = Array.from(new TextEncoder().encode(content.trim()));
    const verified = PublicKey.fromString(pubkey).verify(
      messageBytes,
      Signature.fromDER(signature, "hex")
    );
    if (!verified) return { ok: false, reason: "invalid_signature" };
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }

  const result = db
    .prepare("INSERT INTO posts (content, author_name, signature, pubkey) VALUES (?, ?, ?, ?)")
    .run(
      content.trim(),
      authorName,
      typeof signature === "string" ? signature : null,
      typeof pubkey === "string" ? pubkey : null
    );

  // Fire-and-forget: log on-chain, update tx_id if successful
  const postId = result.lastInsertRowid as number;
  const trimmedContent = content.trim();
  const sigStr = typeof signature === "string" ? signature : null;
  const pkStr = typeof pubkey === "string" ? pubkey : null;

  logPostOnChain({ content: trimmedContent, author: authorName, signature: sigStr, pubkey: pkStr })
    .then((txid) => {
      if (txid) {
        db.prepare("UPDATE posts SET tx_id = ? WHERE id = ?").run(txid, postId);
      } else {
        console.error(`BSVibes: on-chain logging returned null for post ${postId}`);
      }
    })
    .catch((e) => {
      console.error(`BSVibes: on-chain logging failed for post ${postId}`, e);
    });

  return { ok: true };
}

export async function getPosts(beforeId?: number): Promise<Post[]> {
  if (beforeId !== undefined) {
    return db
      .prepare(`
      SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
      FROM posts p
      LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
        ON bc.post_id = p.id
      WHERE p.id < ?
      ORDER BY p.id DESC
      LIMIT 100
    `)
      .all(beforeId) as Post[];
  }
  return db
    .prepare(`
    SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
    FROM posts p
    LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
      ON bc.post_id = p.id
    ORDER BY p.id DESC
    LIMIT 100
  `)
    .all() as Post[];
}

export async function getNewPosts(sinceId: number): Promise<Post[]> {
  if (!Number.isInteger(sinceId) || sinceId < 0) return [];
  return db
    .prepare(`
    SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
    FROM posts p
    LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
      ON bc.post_id = p.id
    WHERE p.id > ?
    ORDER BY p.id DESC
  `)
    .all(sinceId) as Post[];
}

/**
 * Get posts that have been updated since the client last saw them.
 * Currently this means posts that recently received a tx_id (on-chain confirmation).
 * Returns posts with id <= sinceId that have a tx_id (the client may have them without tx_id).
 */
export async function getUpdatedPosts(knownIds: number[]): Promise<Post[]> {
  if (!knownIds.length) return [];
  // Only check posts the client already has — return those that now have a tx_id
  const placeholders = knownIds.map(() => "?").join(",");
  return db
    .prepare(`
    SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
    FROM posts p
    LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
      ON bc.post_id = p.id
    WHERE p.id IN (${placeholders}) AND p.tx_id IS NOT NULL
    ORDER BY p.id DESC
  `)
    .all(...knownIds) as Post[];
}

export async function getOlderPosts(beforeId: number): Promise<Post[]> {
  if (!Number.isInteger(beforeId) || beforeId <= 0) return [];
  return getPosts(beforeId);
}

export async function getBootboard(): Promise<BootboardData> {
  const current = db
    .prepare(`
    SELECT b.*, p.content, p.author_name, p.signature
    FROM bootboard b
    JOIN posts p ON p.id = b.post_id
    WHERE b.held_until IS NULL
    ORDER BY b.booted_at DESC
    LIMIT 1
  `)
    .get() as BootboardRow | undefined;

  const history = db
    .prepare(`
    SELECT b.post_id, b.boosted_by, b.boosted_by_name, b.booted_at, b.held_until,
      CAST((julianday(b.held_until) - julianday(b.booted_at)) * 86400 AS INTEGER) as duration_seconds,
      p.content, p.author_name
    FROM bootboard b
    JOIN posts p ON p.id = b.post_id
    WHERE b.held_until IS NOT NULL
    ORDER BY b.held_until DESC
    LIMIT 50
  `)
    .all() as BootboardHistoryRow[];

  const stats = db
    .prepare(`
    SELECT COUNT(*) as total_boots FROM bootboard
  `)
    .get() as { total_boots: number };

  return { current: current ?? null, history, totalBoots: stats.total_boots };
}

export interface BootPostResult {
  processingMs: number;
  // Present on success
  success?: boolean;
  isFree?: boolean;
  txid?: string;
  recipients?: number;
  // Present when the client must handle payment
  requiresPayment?: boolean;
  bootPrice?: number;
  // Present on failure
  error?: string;
}

export async function bootPost(
  postId: number,
  boostedBy: string,
  boostedByName: string
): Promise<BootPostResult> {
  const start = performance.now();

  // Input validation
  if (!Number.isInteger(postId) || postId <= 0) return { processingMs: 0, error: "Invalid postId" };
  if (typeof boostedBy !== "string" || boostedBy.length > 200 || boostedBy.trim().length === 0)
    return { processingMs: 0, error: "Invalid boostedBy" };
  if (typeof boostedByName !== "string" || boostedByName.trim().length === 0)
    return { processingMs: 0, error: "Invalid boostedByName" };

  // 30 boots per minute per caller.
  const rl = rateLimit(`bootPost:${boostedBy}`, { limit: 30, windowMs: 60_000 });
  if (!rl.success) return { processingMs: 0, error: "Rate limit exceeded" };

  // Check whether this boot is free (server pays) or paid (client must build tx)
  const { isFree, price: bootPrice } = getBootPriceForUser(db, boostedBy);

  if (!isFree) {
    // Paid boot: client must build and broadcast the split transaction itself,
    // then call /api/boot-confirm. Return the price so the client can proceed.
    const processingMs = Math.round((performance.now() - start) * 100) / 100;
    return { processingMs, requiresPayment: true, bootPrice, isFree: false };
  }

  // Free boot: server wallet pays, orchestrator handles the full workflow.
  const result = await executeBoot(db, postId, boostedBy, boostedByName);

  const processingMs = Math.round((performance.now() - start) * 100) / 100;

  if (!result.success) {
    return { processingMs, error: result.error ?? "Boot failed", isFree: true };
  }

  return {
    processingMs,
    success: true,
    isFree: true,
    txid: result.txid,
    recipients: result.recipients,
  };
}

/**
 * Clean up any migration records where `from_pubkey` matches the given pubkey.
 *
 * Called when a user imports a key back into their browser. If key A was
 * previously upgraded (creating a migration A → B), but the user is now
 * actively using A again, the migration is stale and would silently redirect
 * all payouts to B — an address the user may no longer control.
 *
 * Deleting the migration row restores direct payouts to A.
 * This is safe: the user holding the key proves ownership.
 */
export async function cleanupMigrations(
  pubkey: string,
  signature?: string,
  timestamp?: number
): Promise<{ deleted: number }> {
  if (typeof pubkey !== "string" || pubkey.trim().length === 0) {
    return { deleted: 0 };
  }

  // Require signature verification — caller must prove key ownership
  if (typeof signature !== "string" || !signature || typeof timestamp !== "number") {
    console.warn("[BSVibes] cleanupMigrations: called without signature — rejecting");
    return { deleted: 0 };
  }

  // Reject timestamps older than 5 minutes to prevent replay attacks
  const age = Date.now() - timestamp;
  if (age > 5 * 60 * 1000 || age < -30_000) {
    console.warn("[BSVibes] cleanupMigrations: timestamp out of range — rejecting");
    return { deleted: 0 };
  }

  const message = `cleanup:${pubkey.trim()}:${timestamp}`;
  try {
    const { PublicKey, Signature } = await getBsvSdk();
    const messageBytes = Array.from(new TextEncoder().encode(message));
    const verified = PublicKey.fromString(pubkey.trim()).verify(
      messageBytes,
      Signature.fromDER(signature, "hex")
    );
    if (!verified) {
      console.warn("[BSVibes] cleanupMigrations: signature verification failed — rejecting");
      return { deleted: 0 };
    }
  } catch {
    console.warn("[BSVibes] cleanupMigrations: signature verification error — rejecting");
    return { deleted: 0 };
  }

  const trimmedPubkey = pubkey.trim();

  // Before deleting, check if the target key has posts that would be orphaned.
  // If so, insert a bridge migration (target → imported key) to preserve attribution.
  const existingMigrations = db
    .prepare("SELECT to_pubkey FROM migrations WHERE from_pubkey = ?")
    .all(trimmedPubkey) as Array<{ to_pubkey: string }>;

  db.transaction(() => {
    for (const { to_pubkey } of existingMigrations) {
      const postCount = db
        .prepare("SELECT COUNT(*) as c FROM posts WHERE pubkey = ?")
        .get(to_pubkey) as { c: number };

      if (postCount.c > 0) {
        // The intermediate key has posts — bridge it to the imported key
        db.prepare(
          "INSERT OR IGNORE INTO migrations (from_pubkey, to_pubkey, signature) VALUES (?, ?, ?)"
        ).run(to_pubkey, trimmedPubkey, "auto-bridge-on-import");
        console.log(
          `[BSVibes] cleanupMigrations: bridged orphaned key ${to_pubkey.slice(0, 16)}… → ${trimmedPubkey.slice(0, 16)}…`
        );
      }
    }

    db.prepare("DELETE FROM migrations WHERE from_pubkey = ?").run(trimmedPubkey);
  })();

  const deleted = existingMigrations.length;
  if (deleted > 0) {
    console.log(
      `[BSVibes] cleanupMigrations: removed ${deleted} stale migration(s) for pubkey ${trimmedPubkey.slice(0, 16)}…`
    );
  }

  return { deleted };
}

export async function migrateIdentity(
  oldPubkey: string,
  newPubkey: string,
  migrationSig: string,
  migrationMessage: string
): Promise<{ success: boolean }> {
  // Validate migration message structure — from_pubkey and to_pubkey must match params
  try {
    const parsed = JSON.parse(migrationMessage);
    if (parsed.from_pubkey !== oldPubkey || parsed.to_pubkey !== newPubkey) {
      console.warn("[BSVibes] migrateIdentity: message body does not match params");
      return { success: false };
    }
  } catch {
    return { success: false };
  }

  // Verify the migration signature — old key must have signed the message
  try {
    const { PublicKey, Signature } = await getBsvSdk();
    const messageBytes = Array.from(new TextEncoder().encode(migrationMessage));
    const verified = PublicKey.fromString(oldPubkey).verify(
      messageBytes,
      Signature.fromDER(migrationSig, "hex")
    );
    if (!verified) return { success: false };
  } catch {
    return { success: false };
  }

  // C7 fix: before replacing the migration row, check whether the existing to_pubkey
  // has any posts in the database. If it does, those posts would be orphaned (no migration
  // chain back to the contributor) once we overwrite the A→B row with A→C. Guard against
  // this by inserting a bridging migration B→C first so the full chain A→B→C is preserved.
  db.transaction(() => {
    const existingMigration = db
      .prepare("SELECT to_pubkey FROM migrations WHERE from_pubkey = ?")
      .get(oldPubkey) as { to_pubkey: string } | undefined;

    if (existingMigration) {
      const intermediatePubkey = existingMigration.to_pubkey;
      // Only bridge if the intermediate key actually posted something.
      const postCount = (
        db
          .prepare("SELECT COUNT(*) as count FROM posts WHERE pubkey = ?")
          .get(intermediatePubkey) as { count: number }
      ).count;

      if (postCount > 0) {
        // Insert bridging migration: intermediate → new. Use INSERT OR IGNORE so
        // a previously-recorded bridge is left intact with its own signature.
        db.prepare(
          "INSERT OR IGNORE INTO migrations (from_pubkey, to_pubkey, signature) VALUES (?, ?, ?)"
        ).run(intermediatePubkey, newPubkey, migrationSig);
      }
    }

    // Now replace (or insert) the original migration row pointing old → new.
    db.prepare(
      "INSERT OR REPLACE INTO migrations (from_pubkey, to_pubkey, signature) VALUES (?, ?, ?)"
    ).run(oldPubkey, newPubkey, migrationSig);
  })();

  // Fire-and-forget: post migration on-chain
  postMigrationOnChain({
    oldPubkey,
    newPubkey,
    migrationMessage,
    migrationSignature: migrationSig,
  })
    .then((txid) => {
      if (txid) {
        db.prepare("UPDATE migrations SET tx_id = ? WHERE from_pubkey = ? AND to_pubkey = ?").run(
          txid,
          oldPubkey,
          newPubkey
        );
      }
    })
    .catch(() => {
      // On-chain logging is best-effort
    });

  return { success: true };
}

/**
 * Verify that all pubkeys with posts resolve to the given currentPubkey
 * via the migration chain. Returns healthy=true if all connected, or a
 * list of orphaned pubkeys (with post counts) if any are disconnected.
 *
 * Called before key rotations to warn the user if rotating would orphan posts.
 */
export async function verifyMigrationChain(
  currentPubkey: string
): Promise<{ healthy: boolean; orphanedCount: number }> {
  // Build the migration resolver (same logic as weights.ts buildMigrationMap)
  const migrations = db
    .prepare("SELECT from_pubkey, to_pubkey FROM migrations ORDER BY id ASC")
    .all() as Array<{ from_pubkey: string; to_pubkey: string }>;

  const forward = new Map<string, string>();
  for (const m of migrations) {
    const existing = forward.get(m.from_pubkey);
    if (existing && existing !== m.to_pubkey) {
      if (!forward.has(existing)) {
        forward.set(existing, m.to_pubkey);
      }
    }
    forward.set(m.from_pubkey, m.to_pubkey);
  }

  // Resolve chains
  function resolve(pubkey: string): string {
    let current = pubkey;
    const visited = new Set<string>();
    while (forward.has(current) && !visited.has(current)) {
      visited.add(current);
      current = forward.get(current) ?? current;
    }
    return current;
  }

  // Find all distinct pubkeys that have posted
  const posters = db
    .prepare("SELECT DISTINCT pubkey FROM posts WHERE pubkey IS NOT NULL")
    .all() as Array<{ pubkey: string }>;

  let orphanedCount = 0;
  for (const p of posters) {
    const resolved = resolve(p.pubkey);
    // A pubkey is "ours" if it resolves to currentPubkey OR IS currentPubkey
    if (resolved !== currentPubkey && p.pubkey !== currentPubkey) {
      // Check if this is someone else's pubkey (not in our chain at all) — skip those
      // We only care about pubkeys that WERE ours but are now disconnected
      // Heuristic: if this pubkey appears anywhere in a chain that includes currentPubkey, it's ours
      // Simple check: does currentPubkey resolve through this pubkey, or does this pubkey
      // appear in any chain leading to currentPubkey?
      // For now, just count pubkeys that resolve to themselves (no migration) or to a
      // terminus that isn't currentPubkey — these are potentially orphaned
      // But we can't distinguish "someone else's posts" from "our orphaned posts" without
      // more context. Skip pubkeys that have no migration at all AND aren't currentPubkey —
      // those are likely other users.
      if (forward.has(p.pubkey) || resolve(p.pubkey) !== p.pubkey) {
        // This pubkey has a migration chain but doesn't reach currentPubkey — orphaned
        orphanedCount++;
      }
    }
  }

  return { healthy: orphanedCount === 0, orphanedCount };
}
