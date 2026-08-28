import { createHash } from "node:crypto";

/**
 * Chain-reproducible content identifier for a post.
 *
 * Derivation (LOAD-BEARING — must stay byte-perfect, it's what makes the id
 * recomputable from the chain alone):
 *
 *   cid = sha256_hex( utf8(pubkey) || "\n" || utf8(content) )
 *
 * - `pubkey` is the post's compressed-hex public key (66 chars) EXACTLY as stored
 *   in `posts.pubkey`. Because it is fixed-width, the FIRST "\n" (0x0a) is always
 *   the field boundary even when `content` itself contains newlines.
 * - `content` is the post's stored content EXACTLY as stored in `posts.content`.
 *   It is ALREADY trimmed at insert time (createPost stores `content.trim()`), so
 *   callers pass the exact stored bytes and this helper hashes them with NO extra
 *   trimming/normalization. Any extra normalization here would break
 *   chain-reproducibility (the on-chain `content` equals the stored `content`, so
 *   hashing the stored bytes is the whole point). DO NOT normalize.
 *
 * Output is lowercase 64-char hex. Server-only (`node:crypto`) — only ever called
 * from server code paths (post creation, anchor sweep, boot record).
 */
export function contentId(pubkey: string, content: string): string {
  return createHash("sha256").update(`${pubkey}\n${content}`, "utf8").digest("hex");
}
