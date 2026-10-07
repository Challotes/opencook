/**
 * Canonical post-content form — the ONE string that is signed, verified, length-checked,
 * stored, content-id'd and logged on-chain.
 *
 * Line endings are normalized to LF (CRLF / lone CR → LF) then trimmed. This is
 * load-bearing: the server-action transport serializes FormData as multipart/form-data,
 * which converts every LF to CRLF in transit. The client signs the LF string, so the
 * server MUST normalize before verifying or every multi-line post fails
 * `invalid_signature`. Both sides call this so the signed bytes are byte-identical.
 *
 * NOTE: this normalizes INPUT before storage. `contentId` (content-id.ts) still hashes
 * the stored bytes with NO further normalization — stored content is simply always LF.
 * See DECISIONS.md "Post content is LF-normalized".
 */
export const MAX_POST_LENGTH = 2000;

export function normalizePostContent(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").trim();
}

/** True if the (normalized) content holds C0/DEL control chars other than \t and \n. */
export function hasDisallowedControlChars(content: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control chars is the point
  return /[\u0000-\u0008\u000B-\u001F\u007F]/.test(content);
}
