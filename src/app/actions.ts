"use server";

import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { generateAnonName } from "@/lib/utils";

async function getBsvSdk() {
  const { PublicKey, Signature } = await import("@bsv/sdk");
  return { PublicKey, Signature };
}

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
