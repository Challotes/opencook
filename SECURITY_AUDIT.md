# Security Audit — 2026-03-28

> Combined findings from code auditor (Jerry) and security ops (Paul). 53 total findings.
> Fix criticals before any real users. Fix highs this sprint. Fix mediums before public launch.

## CRITICAL (9 findings — must fix before real users)

### C1: CSP allows unsafe-inline + unsafe-eval — PARTIALLY FIXED
**File:** next.config.ts line 37
**Risk:** XSS = instant key theft. Any injected script reads localStorage WIF.
**Fix:** Removed unsafe-eval. unsafe-inline remains (needed for Next.js). Nonce-based CSP is the full fix (future).

### C2: WIF cached in JS module-scope variables
**File:** src/services/bsv/identity.ts lines 39-45
**Risk:** `_cachedWif` and `_sessionIdentity.wif` in memory for entire session. Any script can read.
**Fix:** Cache CryptoKey object instead of WIF string where possible. Accepted risk for plaintext path.
**Partial mitigation (2026-04-30, Stage 7):** the manage-gate session (`manageAuthed` in IdentityBar) is now destroyed on tab blur (`visibilitychange === "hidden"`). This bounds the *manage-flow* exposure window to active tab focus — but the underlying `_cachedWif` / `_sessionIdentity` caches in `identity.ts` still persist for the session. Full mitigation requires extending the tab-blur destroy to the identity-module caches and adding a configurable idle timer.

### C3: /api/boot-confirm accepts any txid without verification — FIXED
**File:** src/app/api/boot-confirm/route.ts
**Risk:** Attacker can fake boot confirmations, inflate contribution weight, game fairness system at zero cost.
**Fix:** (2026-04-03) Full fix: replay protection (txid dedup check + application-level SELECT before insert), rate limiting (10/min/IP), and on-chain output verification (parses WoC tx vout, compares addresses/amounts against recalculated split with 2 sat tolerance). DB-level uniqueness is composite `UNIQUE(txid, recipient_address)` at db.ts:117 — replay protection relies on the app-level check, not the index alone. **Upgrade (2026-04-14):** output verification no longer fetches from WoC. Client sends `rawTx`; server validates `hash(rawTx)===txid` (self-authenticating — can't be spoofed), parses P2PKH outputs locally from the raw bytes, and re-broadcasts via ARC as safety net. Eliminates 5–30s WoC indexing lag and removes a rate-limit chokepoint. Explicit `TX_CONFLICT` vs `ARC_UNAVAILABLE` error codes distinguish fatal from retriable. Trust boundary: the server accepts client bytes but the hash binding makes forgery computationally infeasible, so security posture is unchanged.

### C4: Auto-download backup only has NEW key when fund transfer fails — FIXED
**File:** src/components/MoveAddressModal.tsx (rotation flow), src/services/bsv/backup-template.ts
**Risk:** User told "old key is in backup file" but backup contains new key. Stranded funds unrecoverable.
**Fix:** (2026-04-30, Stage 7) Combined recovery file pattern. The stage-3 download from MoveAddressModal now contains BOTH keys: `wif_encrypted` (new key) and `oldWif_encrypted` (old key, also encrypted under the new passphrase). One file, one passphrase, recovers both addresses. Earlier Stage 6 work removed plaintext rotation from the primary UI (`resetIdentity` no longer reachable from the dropdown — every rotation runs through MoveAddressModal and produces an encrypted key). Sweep-failure paths in MoveAddressModal also block rotation with retry/proceed UI rather than silently committing the new key, so "transfer failed but backup only has new key" is no longer reachable on the primary path. Done-state copy ("Recovery file downloaded — it has both keys. Keep it safe... Without both, you can't get back in.") makes the dual-key contract explicit to the user.

### C5: Free boot consumes grant even when broadcast fails — FIXED
**File:** src/services/fairness/boot-orchestrator.ts lines 92-150
**Risk:** User loses free boot but nobody gets paid. Boot appears successful but no on-chain payment.
**Fix:** (2026-03-28) Grant consumed only after successful broadcast.

### C6: Interrupted upgrade locks user out — FIXED
**File:** src/services/bsv/identity.ts
**Risk:** Power failure between setItem(encrypted) and removeItem(plaintext) = both keys exist. System only checks encrypted, user locked out despite plaintext key being present.
**Fix:** (2026-04-12) Deferred localStorage commit pattern — `upgradeIdentity()` accepts an identity object and defers the session cache + storage commit until `commitUpgrade()` is called atomically only after the server-side `migrateIdentity()` succeeds. Matches the `resetIdentity({ deferCommit: true })` pattern. No intermediate state where both keys exist.

### C7: Double-upgrade from same key orphans intermediate posts — FIXED
**File:** src/app/actions.ts + src/services/fairness/weights.ts
**Risk:** INSERT OR REPLACE deletes A→B migration when A→C is inserted. Posts made with key B have no migration chain, are permanently orphaned.
**Fix:** (2026-03-28) Before replacing migration, check if old to_pubkey has posts. If so, insert B→C bridging migration.

### C8: cleanupMigrations has no authentication — FIXED
**File:** src/app/actions.ts lines 229-243
**Risk:** Anyone who knows a pubkey can delete that user's migration records via the server action. Targeted payout redirection attack.
**Fix:** (2026-03-28) Requires signed challenge with 5-minute timestamp replay protection.

### C9: Backup warning dot clears on dropdown OPEN, not on actual backup — FIXED
**File:** src/app/IdentityBar.tsx lines 110-115
**Risk:** User thinks they're backed up after opening dropdown, but never actually copied or downloaded.
**Fix:** `markBackedUp()` now only fires from `handleDownload()`, `handleSaveEncrypted()`, and `handleCopy()` handlers — no longer on dropdown open. Verified 2026-04-10. **Hardened 2026-04-16 (commit `e7ecf9f`):** backup download now requires explicit "Got it" acknowledgement before `backedUp` flips. Prevents silent download failures (popup blocker, disk full, CSP deny, user cancels save dialog) from clearing the warning dot. Applied to the You dropdown (green confirmation banner replaces the orange save-CTA on success) and `MoveAddressModal` stage 1 (new `saved-confirm` gate before the irreversible sweep broadcast).

## HIGH (7 findings — fix this sprint)

### H1: Rate limiting keyed on client-supplied author name — FIXED
**File:** src/app/actions.ts line 24
**Fix:** (2026-03-28) Now keyed on verified pubkey.

### H2: /api/boot-shares exposes all contributor addresses unauthenticated — PARTIAL
**File:** src/app/api/boot-shares/route.ts
**Fix:** Rate limiting added (30/min/IP) at boot-shares/route.ts:12. Signed request for detailed shares still TODO. Updated 2026-04-10.

### H3: Console logs leak addresses and amounts client-side
**File:** Multiple (identity.ts, IdentityBar.tsx)
**Fix:** Remove financial detail from console.log in production.

### H4: Server wallet private key in process memory
**File:** src/services/bsv/wallet.ts
**Fix:** Document risk. Move to signing oracle when value increases.

### H5: Unsigned posts accepted with no attribution — FIXED
**File:** src/app/actions.ts lines 36-37
**Fix:** `createPost` rejects posts with missing pubkey/signature (`missing_pubkey` / `missing_sig` error codes). All posts must be ECDSA-signed and attributable.

### H6: /api/tx-hex is an open proxy with no rate limiting — FIXED
**File:** src/app/api/tx-hex/route.ts
**Fix:** (2026-03-31) Added 500/min/IP rate limit. **Extended 2026-04-14:** `/api/balance` (10s cache, 120/min/IP) and `/api/unspent` (3s cache, 180/min/IP) joined the proxy fleet with equivalent rate limiting, address format validation, retries on 429/5xx, and stale-cache fallback. All direct browser→WoC reads have been eliminated.

### H7: Migration registration after local key storage — FIXED
**File:** src/services/bsv/identity.ts + src/app/IdentityBar.tsx
**Fix:** upgradeIdentity() no longer stores key. Returns encStore. IdentityBar calls migrateIdentity() first, then commitUpgrade() only on success. Atomic ordering.

### Additional findings from tester audit (2026-03-28):

**BUG-1 (High) — FIXED:** `unlockIdentity` was dead code. No passphrase prompt existed. Added unlock UI panel to IdentityBar. needsUnlock state flows through useIdentity → context.

**BUG-2 (High) — FIXED:** Same as H7 above. Migration now registered before key storage.

**BUG-10 (Critical) — FIXED:** `migrateIdentity()` return value was never checked. If server-side signature verification failed, migration silently didn't register but upgrade continued — orphaning all posts under the old key. Fixed: upgrade now aborts if `migrateIdentity` returns `{ success: false }`. Two manual chain repairs applied to reconnect 280 orphaned posts.

**BUG-6 (Medium) — OPEN:** boot-confirm stores booterPubkey as boosted_by but field expects BSV address. Mismatch for paid boots.

**BUG-9 (Critical) — FIXED:** `isIdentityEncrypted()` always returned false. Checked raw JSON string for "enc:" prefix but stored value is JSON wrapper. Every encrypted identity guard was broken — unlock prompt never appeared, stale key generated after upgrade. Fixed by JSON-parsing and checking .encrypted field.

## MEDIUM (8 findings — before public launch)

- M1: PBKDF2 at 100k iterations (increase to 600k)
- M2: Backup file contains plaintext WIF — PARTIAL (encrypted with passphrase for protected users; unprotected users still get plaintext WIF via doDownloadPlaintext path at IdentityBar.tsx:282-297). **Update (2026-04-30, Stage 7):** the combined recovery file produced by MoveAddressModal now also encrypts the *prior* key (`oldWif_encrypted`) under the new passphrase, so even during rotation no plaintext old WIF is written to disk for protected users. The remaining plaintext exposure is limited to the unprotected-user "Show recovery key" / "Save recovery file" paths.
- M3: Migration signature has no timestamp validation
- M4: Rate limiter is in-memory, resets on restart
- M5: /api/earnings exposes full financial history unauthenticated
- M6: WIF reveal has no auto-hide timeout. **Partial mitigation (2026-05-01, Stage 8 C6):** the Show-recovery-key panel now requires an explicit `[Reveal key]` click to expose the WIF (no longer revealed by default), and shows a red warning above the masked key (*"Anyone with this key owns your account and any funds in it. Never share it."*). Replaces the previous always-visible-until-Hide pattern. Auto-hide timer still TODO.
- M7: /api/boot-shares triggers full weight calc with no cache — FIXED (30s TTL cache added)
- M8: Posts during upgrade window may be unsigned

## LOW (6 findings — track as debt)

- L1: WIF paste field has no input masking
- L2: Backup filename contains user's anon name
- L3: Console error may leak partial server WIF
- L4: Rate limiter cleanup uses first caller's window
- L5: Direct WoC calls leak user addresses with IP
- L6: Clipboard not cleared after WIF copy

### L7: Stale-key attribution griefing (E30 deferred risk)
**Severity:** LOW — bounded per-victim, requires WIF compromise as prerequisite
**Files:** `src/app/actions.ts` (createPost), `src/services/fairness/weights.ts`
**Risk:** After rotation, the old key remains cryptographically valid. A party who obtained the old plaintext WIF (before passphrase protection) can broadcast signed posts under the old pubkey via direct BSV broadcast, bypassing the BSVibes UI. The fairness chain resolver (`weights.ts: resolveChain()`) follows migration records forward and attributes engagement weight to the CURRENT key-holder — attacker gains no earnings — but the attacker CAN produce posts that appear attributable to the current user's author name in the feed.

**Prerequisites for exploit:** (1) attacker obtained the old plaintext WIF (physical device access, unencrypted cloud sync leak, prior localStorage exposure); (2) user has rotated to a newer key; (3) attacker motivated to spam under target name.

**Mitigations in place:**
- Chain resolver redirects all attribution to current key — attacker gains no earnings
- **E30 (2026-05-28)**: session-lockout prevents the legitimate client on a stale-key device from accidentally contributing posts attributed to the wrong key. Detection is via `/api/posts` returning `key_status: { stale: true }` when the `x-bsvibes-pubkey` header matches a forward-migrated pubkey; client surfaces `<StaleKeyModal>` and replaces the textarea with an amber banner blocking the compose flow. UI-layer lock only — `createPost` server action still accepts cryptographically-valid signatures from the old key (which is the deliberate trade-off; see DECISIONS.md "E30 stale-key session-lockout").
- `createPost` rate limiting (pubkey-keyed) caps post rate per key regardless of origin

**Residual risk:** controlled spam — an attacker bypassing the UI entirely (direct BSV broadcast with the leaked WIF) can post as the old identity. Not mitigated by E30 alone. The on-chain audit trail (OP_RETURN post payloads) records these ghost posts permanently — attribution UI redirects forward via chain resolver, but the on-chain signature stays.

**Trigger to promote to per-mutation server gating:** if attribution griefing is observed in production (spam posts appearing under real users' names from revoked keys), add a server-side migration-chain check inside `createPost` that rejects posts from any pubkey with a forward migration record. One-session change: add a `getForwardMigration()` lookup to the createPost path, reject if non-null. Analogous to E29's `/api/restore-eligibility` check, just applied at mutation time instead of restore time.

**Cross-reference:** DECISIONS.md "E30 stale-key session-lockout (Design: UI-layer only)" · CLAUDE.md Hard Rule #7 (`requireIdentity()` universal pattern)
**Status:** DEFERRED — acceptable risk at current scale. Promote if griefing observed.
