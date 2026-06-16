/**
 * Prepares a committed `legal/*.md` DRAFT for public rendering (Phase 3 surfacing).
 *
 * The files in `legal/` are the lawyer-working DRAFTS — they carry an HTML draft
 * comment and inline `[LAWYER: …]` review notes that must NEVER be shown to users.
 * This strips that internal scaffolding. The `[TODO: …]` operator placeholders are
 * left intact on purpose — they are honest "not-yet-filled" gaps and the page shows
 * a DRAFT banner above them until the lawyer pass + rebrand land the final copy.
 */
export function cleanLegalMarkdown(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, "") // HTML draft/rebrand comment
    .replace(/`\[LAWYER:[\s\S]*?\]`/g, "") // inline [LAWYER: …] review notes (internal)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
