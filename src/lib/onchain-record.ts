/**
 * Canonical envelope for EVERY app on-chain OP_RETURN record (post, boot_split).
 * Single source of the `app` tag, the `v` envelope version, and the `ts` stamp,
 * so the envelope can't drift between record types and the `app` literal lives
 * in ONE place (directly de-risks the Phase-7 OpenCook rename — see DECISIONS.md
 * "OpenCook Rebrand": a partial sweep of the `app` literal is an execution
 * hazard). Both builders — `onchain.ts` (post) and `lib/boot-audit.ts`
 * (boot_split) — produce their payload through this function.
 *
 * READER CONTRACT — any future consumer of these on-chain records MUST follow
 * these rules, so that records written today stay readable forever:
 *  - IGNORE unknown fields. A reader for `v:1` that encounters a `v:1` record
 *    carrying an extra field it doesn't recognize MUST NOT reject it (this is
 *    what makes adding a field later backward-safe).
 *  - SELECT a record stream by `(app, type)`. `type` is THE discriminator key
 *    (never `action`/`kind`). `post_id` is a per-app SQLite rowid, not global —
 *    key on `(app, post_id)`.
 *  - A MISSING `v` means a legacy / pre-version record — treat as `v: 0`.
 *  - BUMP `v` ONLY when an existing field's MEANING changes, or a field is
 *    removed/renamed. ADD new optional fields freely WITHOUT bumping `v`.
 *  - `ts` is the WRITER's clock: the server clock for server-built records
 *    (post, free boot), but the USER's browser clock for client-built records
 *    (paid boot — `client-boot.ts` runs in the browser). It is ADVISORY. The
 *    authoritative time is the block/confirmation time, NOT this `ts` — do not
 *    let attribution logic trust a client-built record's `ts` as ground truth.
 *
 * `app` stays "bsvibes" until the Phase-7 name-only sweep flips this single
 * constant. NOTE: the (now-removed) migration signed-message `app` literal is a
 * DIFFERENT concern — its bytes are signed and re-verified, so it must never be
 * routed through this audit-record helper.
 */
export const ONCHAIN_APP = "bsvibes";
export const ONCHAIN_RECORD_VERSION = 1;

export function onchainRecord(type: string, body: Record<string, unknown>): string {
  return JSON.stringify({
    v: ONCHAIN_RECORD_VERSION,
    app: ONCHAIN_APP,
    type,
    ...body,
    ts: Date.now(),
  });
}
