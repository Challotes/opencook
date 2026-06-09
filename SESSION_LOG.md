# Session Log

> Short summaries of each working session. AI agents: add an entry before ending any significant session.

## 2026-06-10 — MD audit Tier 4 complete (OBS-N1 + OBS-N2 closed)

Category: security hardening — the two LOW-severity findings surfaced by the 2026-06-03 MD audit. Both touched critical paths (rate limiting, boot single-flight) so each got an auditor pre-check on the proposed fix shape + post-check on the diff before commit.

**Commit `002788c` — OBS-N1: `/api/agent` x-forwarded-for parsing.**
Rate-limit IP extraction was using the raw `x-forwarded-for` header value. Other routes use `.split(",")[0]?.trim()` to take just the real client IP (first proxy hop). The agent route's raw-string key meant an attacker could prepend arbitrary IPs to get a fresh rate-limit bucket per crafted header — effectively bypassing the 30/min limit on the Anthropic-API-calling route. Bounded by Anthropic's own key rate limits, so worst case = "burn our budget faster" not "DOS forever."

Auditor pre-check upgraded the proposed one-line fix to also include the `x-real-ip` fallback used by 3 other external-API-proxying routes (`balance`, `tx-hex`, `unspent`) — without it, Vercel deploys would collapse to one shared "unknown" bucket since Vercel sets `x-real-ip` not `x-forwarded-for`. Final pattern matches those 3 routes verbatim.

**Commit `074937f` — OBS-N2: `BootContext.claimBoot` non-atomic lock.**
The "global single-flight" boot lock was using React state (asynchronous). Two near-simultaneous calls could both observe `bootingPostId === null` and proceed, both returning `true`. The caller in `useBoot.ts` made it worse with a separate `if (bootingPostId !== null) return` check before `claimBoot` — textbook TOCTOU against stale React state. Worst case bounded by 3 downstream locks (server rate limit, `client-boot.ts` mutex, on-chain double-spend rejection) → one redundant server roundtrip per concurrent click. No funds at risk; no state corruption.

Fix: new `bootingPostIdRef` (synchronous useRef) as authoritative lock. `claimBoot` does atomic check-and-claim and returns the actual result. `releaseBoot` / `failBoot` clear both ref and state. Caller switched from check-then-claim to atomic `if (!claimBoot(postId)) return`. `bootingPostId` dropped from `boot()`'s useCallback deps (no longer read inside). Auditor pre-check folded in two corrections (drop the stale "client-boot.ts mutex covers this" comment — wrong; drop deps entry — perf win).

### MD audit project — fully closed

| Tier | Commit | Closure date |
|---|---|---|
| 1 — Must-fix contradictions | `ddd3f97` | 2026-06-03 |
| 2 — Drift cleanup | `4c3ead8` | 2026-06-04 |
| 3 — Polish | `d6236f6` | 2026-06-05 |
| 4a — OBS-N1 | `002788c` | 2026-06-05 |
| 4b — OBS-N2 | `074937f` | 2026-06-05 |

Every observation logged in SECURITY_AUDIT.md now reflects code reality. The 5-day MD-vs-code audit project is done. Memory file `project_md_audit_2026_06_03.md` updated to mark all tiers complete.

### Next session — open items

Nothing from the audit is pending. Outstanding launch-prep work remains:
- LAUNCH_PLAN Bucket 2 — In-app browser splash (not started)
- LAUNCH_PLAN Bucket 3b — Notifications (blocked on Bucket 4)
- LAUNCH_PLAN Bucket 4 — Server-side resilience (`/api/broadcast` proxy)
- LAUNCH_PLAN Bucket 5 — Deploy (need to set `E30_STALE_KEY_ENABLED=true` on Railway/Vercel)

No technical-debt cliff. Pick up wherever feels right.

## 2026-06-04 / 2026-06-05 — MD audit follow-ups: Tier 2 (drift) + Tier 3 (polish) shipped

Category: documentation accuracy. Continuation of the 2026-06-03 MD audit. Tier 2 + Tier 3 both shipped; Tier 4 (two LOW-severity code fixes) remains for next session.

**Commit `4c3ead8` — Tier 2 drift fixes across 4 docs:**
- DECISIONS.md — FirstEarningToast localStorage key drift fixed (`bsvibes_first_earning_save_offered` → actual `bsvibes_first_earning_save_dismissed_until` timestamp with 48h backoff). Service-worker scope-discipline + notification-copy-discipline entries gained "Forward-looking — not yet built" qualifiers so future readers don't grep for `public/sw.js`.
- FAIRNESS.md — Parameters table extended with 4 missing constants (Boot price cache TTL, Weights cache TTL, Active window definition, Free boots per user). Implementation note added: `poolShare: 0.8` is documented but DERIVED in `split.ts` (dead config field). "Server-side for Phase 1" claim updated — paid boots are client-side now, only free boots remain server-side. Open Questions reorganized into "Settled in code" (Boot price dynamic, separate-tx-per-boot, unsigned posts rejected, day-one payments) and "Still open" (Genesis-contributor weight).
- LAUNCH_PLAN.md — "Where we are now" table refreshed: 4 rows flipped from "Not implemented" to "SHIPPED" (Bucket 1 modal restructure, Bucket 3a `beforeinstallprompt` + standalone-mode detection). Q1 (save trigger), Q3 (start fresh semantics), Q6 (in-app browser read-only) marked RESOLVED with backlinks.
- SECURITY_AUDIT.md — M5 updated (still unauthenticated but rate-limited 20/min/IP). New OBSERVATIONS section logging 4 silent improvements (OBS-S1 to S4: `/api/posts` rate limit, `/api/restore-eligibility` public endpoint, `dedupeUtxos` in sweep, E30 stale-key cross-ref) and 2 new audit findings (OBS-N1 `/api/agent` IP header parsing, OBS-N2 BootContext.claimBoot non-atomic) — both flagged for Tier 4 follow-up.

**Commit `d6236f6` — Tier 3 polish across 3 docs:**
- FUTURE.md — Dropped "Device sync via QR" spec bullet (full design lives in LAUNCH_PLAN.md Bucket 6; pointed to canonical source). Reframed "Patterns We've Noticed" section with per-bullet "shipped in-app" / "future reusable primitive" markers so future readers understand the in-app implementations are current reality, not future work.
- DIRECTION.md — Added canonical tagline + subtitle near top matching CLAUDE.md / README.md. Reconciled the two phase-numbering systems — renamed fairness phases to "Fairness Phase 1/2/3" and clarified "Phase 7" is from the build roadmap.
- README.md — Added Node 20+ requirement under Quick Start.

### Tier 4 still pending — two LOW-severity code fixes for next session

Both captured in SECURITY_AUDIT.md as OBS-N1 and OBS-N2; full fix detail in memory `project_md_audit_2026_06_03.md`:

1. **`src/app/api/agent/route.ts:28`** — `x-forwarded-for` header doesn't split on `,`. Other routes use `header.split(",")[0].trim()`. An attacker can prepend a fake IP to extend rate-limit budget. One-line fix. Needs auditor pre + post.
2. **`src/contexts/BootContext.tsx:50-57`** — `claimBoot` lock uses React `setState` (asynchronous). Two concurrent calls can both observe `null` and proceed. Fix: switch to `useRef` (synchronous read). Bounded by downstream locks (server rate limit + client-boot mutex + on-chain double-spend rejection) so impact is LOW.

Each fix is small (~5 lines) but touches a critical path (rate limiting / boot single-flight), so each should get its own auditor pass and its own commit.

**Push status:** 16 commits unpushed pre-push, then everything pushed to origin at end of session per Nige's explicit approval (Hard Rule #8 satisfied).

## 2026-06-02 / 2026-06-03 — E32 install pitch overhaul + Android device fixes + MD audit

Category: UX polish + Android device-test bug fixes + documentation accuracy sweep. 14 commits across two days, plus a comprehensive MD audit at end of session.

### Install pitch UX overhaul (E32) — 12 commits

Continued iteration on the install pitch surface after E32 scaffolding. Final shape:
- **Slide-up sheet** (`<InstallPitch variant="banner" />`) mounted globally in `Feed.tsx`, drives the full-impact first-tab-session experience via `installSheetMode` from `InstallContext`. Sheet has chevron-minimise (NOT X) to bookmark.
- **Bookmark chip** (`<InstallBookmark />`) — 34×34 chip with 30px BSVibes icon, geometry matches the Ask AI pill exactly (`border` not `ring`, `mt-1` baseline offset, `border-zinc-800` rest / `border-amber-500 + scale-110 + glow` highlight). Centered in PostForm footer via `grid-cols-3` layout. Highlight flash on sheet→bookmark collapse.
- **Inline variant** inside the You modal done-state — branches on `installType` so one-tap platforms (Android Chrome, desktop Chrome) fire `promptInstall()` directly on tap; manual-instructions platforms (iOS Safari, Firefox Android) open the slide-up sheet for instructions.
- **No timer-based dismissal anywhere** — the 30-day `dismissedUntil` suppression mechanism was removed entirely (`install-suppression.{ts,test.ts}` deleted). The chevron-minimise + bookmark IS the persistent reminder. `engaged` flag is set only on `appinstalled` event or native prompt "accepted" outcome.
- **Modal-overlap fix** — ref-counted `blockInstallPitch()` / `unblockInstallPitch()` in `InstallContext` (mirrors `blockSessionClear` pattern in `IdentityContext`). MoveAddressModal / ChangePassphraseModal / RestoreModal call it during their flows so the install pitch doesn't ambush the user mid-rotation. `installPitchBlockTick` is the React-observable proxy.
- **Collapse animation** centered (was previously `translate3d(-33vw, …)` from when the bookmark lived in the left-third of the bopen.ai row).
- **Protected gate** added to `shouldShowInstallPitch` (the predicate is now 5-condition: backedUp + protected + not-standalone + supported-platform + not-engaged).
- **DECISIONS.md** rewrite of the install pitch entry to document the three-surface no-timer model + anti-pattern guards (don't re-add the X, don't re-add the 30-day timer, don't make the icon a separate tap target).

Commits (oldest first): `19ecbfd`, `17ffc19`, `e414f09`, `37ad0c8`, `69c9857`, `b75f1ba`, `9d9e821`, `1a3687a` (geometry parity), `f33c20f` (icon 20→30px).

### Android device-test fixes — 2 commits

iPhone testing earlier verified E32 OK. Android Chrome testing surfaced three bugs, all fixed in commit `7891355`:
1. **`bad-txns-inputs-duplicate` on sweep during key rotation** — WhatsOnChain returned the same `(tx_hash, tx_pos)` outpoint twice in `/api/unspent`. Both `autoTransferFunds` and `sweepFunds` in `identity.ts` built the tx by iterating the raw list with no dedup. New `dedupeUtxos()` helper keyed on `${tx_hash}:${tx_pos}` (same pattern `client-boot.ts` uses via `utxoKey`). Both sweep paths now route raw WoC data through dedup. Confirmed in device testing: same txid `8fc71ef6…` rejected twice in a row, third attempt succeeded after WoC stabilized.
2. **Inline install row tapped twice on Android one-tap** — regression from the install-pitch consolidation: inline row always called `openSheetFromBookmark()`, so Android users went tap row → sheet → tap install → native dialog (two taps). Restored single-tap direct install via conditional `onClick` (`isOneTap = installType === "one-tap" && canPromptInstall` → `handleInstallTap`; else → `openSheetFromBookmark`).
3. **Retry/Continue modal cut off on Android Chrome** — `MoveAddressModal` used `vh` units. Android Chrome's `100vh` includes the collapsible address bar, so `80vh` could push the card's top out of view. Fixed in same commit with `pt-[8vh]` → `pt-[6svh]`, `max-h-[80vh]` → `max-h-[80svh]`.

Site-wide follow-up in commit `6b59c1d`: same `vh` → `svh` pattern applied to the other 6 centered modals (ChangePassphraseModal, StaleKeyModal, SignInModal, RestoreModal, FundAddress, IdentityBar You modal). DECISIONS.md entry updated with the canonical pattern + anti-pattern guard. IdentityBar dropdown (line 1127, absolute-positioned) intentionally left on `vh` — different shape.

**DB verification** of the user's Android testing: 2 posts from old address before rotation (19:16, 19:17), migration record id=163 at 19:22:24, 2 posts from new address after (19:43, 19:44). Migration chain resolves all 4 to new address for fairness/earnings.

### MD audit — comprehensive sweep across all 10 docs

User requested a deep doc-vs-code audit after noticing MDs hadn't been updated in a while. Dispatched 7 parallel agents — one per MD or grouped where related — to compare each doc's claims against current code. Findings:

- **CLAUDE.md (medium):** 10 new files undocumented (whole install pitch ecosystem + restore-eligibility + restore-from-file + FirstEarningToast/IosStorageToast/HomeScreenWelcomeGate), 3 stale descriptions, 1 internal contradiction. **Fixed in this session.**
- **DECISIONS.md (healthy):** 1 drift (FirstEarningToast localStorage key name), 3 forward-looking entries need "not yet built" qualifier (SW / NotificationPrompt / public/sw.js — all Bucket 3b). Zero reversed decisions across ~80+ verified entries. **Deferred to Tier 2.**
- **FAIRNESS.md (healthy):** All formulas + constants verified match code. 2 minor drifts (`poolShare` is dead constant, rounding remainder undocumented), 4 missing operational details, 1 stale "we plan to" (paid boots already client-side), 2 Open Questions resolved in code. **Deferred to Tier 2.**
- **SECURITY_AUDIT.md (healthy):** All 9 criticals + 3 highs verified still fixed. Zero regressions. 4 silent improvements not logged (`/api/posts` rate limit, `/api/restore-eligibility`, `dedupeUtxos`, E30 stale-key). One new LOW finding: `BootContext.claimBoot` non-atomic lock (bounded by server rate limit + client-boot mutex). One side-finding: `/api/agent` rate-limit header doesn't split on `,`. **Deferred to Tier 2/4.**
- **ROADMAP.md (stale — fixed this session):** Header dated 2026-05-03, missing ~30 commits, line 142 contradiction with E31 (cleanupMigrations gone). **Fixed in this session — new Phase 6.6 section added.**
- **LAUNCH_PLAN.md (medium):** Bucket status table accurate, but "Where we are now" table has 4 outdated rows; Q1/Q3/Q6 marked open but actually resolved. **Deferred to Tier 2.**
- **FUTURE.md (medium):** QR sync bullet duplicates LAUNCH_PLAN Bucket 6, "Patterns" section conflates "shipped in-app" with "future reusable primitive". **Deferred to Tier 3.**
- **DIRECTION.md (healthy):** Tagline mismatch (minor), Phase 7 vs Phases 1-3 inconsistency. **Deferred to Tier 3.**
- **README.md (medium — fixed this session):** Broken `your-org/bsvibes` repo URL. **Fixed.** (Audit also flagged `generate-wallet.mjs` as broken, but it actually exists — false alarm.) Node version note deferred to Tier 3.
- **SESSION_LOG.md (stale — fixed by this entry):** 14 commits since 2026-06-01 unlogged. **Fixed by this entry.**

### Files touched in Tier 1 doc updates (this session)
- README.md — repo URL
- ROADMAP.md — header date, line 142 strike, new Phase 6.6 section
- CLAUDE.md — 10 new file entries + E30 stale-key note in Universal pattern
- SESSION_LOG.md — this entry

### Next session — Tier 2/3/4 work remaining

Full breakdown in memory file `project_md_audit_2026_06_03.md`. Summary:

**Tier 2 (drift fixes):**
- DECISIONS.md: fix FirstEarningToast key name + add "not yet built" qualifier to SW/NotificationPrompt/public/sw.js entries
- FAIRNESS.md: note `poolShare` dead, mark Open Questions resolved with code answers, update "Server-side for Phase 1" claim
- LAUNCH_PLAN.md: refresh "Where we are now" table, mark Q1/Q3/Q6 resolved
- SECURITY_AUDIT.md: add 4 silent improvements + 2 side-findings as observations

**Tier 3 (polish):**
- FUTURE.md: drop QR-sync bullet (lives in LAUNCH_PLAN Bucket 6 now), distinguish "shipped in-app" patterns
- DIRECTION.md: tagline + Phase numbering consistency
- README.md: Node version note

**Tier 4 (actual code fixes — separate commits, each needs auditor):**
- `/api/agent` `x-forwarded-for` parsing inconsistency (other routes split on `","[0]`, agent route doesn't — minor rate-limit bypass vector)
- `BootContext.claimBoot` atomic lock via `useRef` (LOW severity — bounded by other locks)

13 commits unpushed at end of session (master 13 ahead of origin). Push deferred per Hard Rule #8 — awaiting explicit approval.

## 2026-06-01 — E31: block rotate-from-stale + delete cleanupMigrations (single commit)

Category: security architecture — closes a HIGH severity takeover vector discovered during E30 manual testing. Symmetric to E29's restore-from-stale block.

**Bug:** A stale-key holder could call `migrateIdentity` to rotate their already-rotated key. Old WIF signs a valid migration → server accepts → `INSERT OR REPLACE` silently overwrites the legitimate rotation → chain head takes over. Legitimate current key holder locked out. Same attack class as E29 just at a different endpoint. Tracked as SECURITY_AUDIT.md BUG-11.

**Implementation across 6 files:**
- `src/app/actions.ts` — `migrateIdentity` calls `getForwardMigration(oldPubkey)` after signature verification; rejects with `reason: "stale_key"` if a forward migration row exists. Return type extended to `MigrateIdentityResult` (success + optional reason). Fails CLOSED on DB lookup errors (rotate-from-stale must never succeed, even during partial DB outage). `cleanupMigrations` action DELETED entirely (~75 LOC removed).
- `src/components/MoveAddressModal.tsx` — added client-side preflight in `runCreating` (calls `/api/restore-eligibility` before `upgradeIdentity` runs the sweep — prevents funds-in-flight edge case). Added return-value check on `migrateIdentity` call (was previously fire-and-forget — same regression class as historical BUG-10). Imports `derivePubkeyFromWif`.
- `src/components/ChangePassphraseModal.tsx` — same client-side preflight pattern. Existing `migrateIdentity` return check now branches on `reason: "stale_key"` for specific user-facing copy. Catch block preserves specific error messages instead of always overwriting with generic boilerplate.
- `src/app/IdentityBar.tsx` — `openMoveModal` checks `staleKey` and routes to `openStaleKeyModal()` instead of mounting the rotation wizard. Three call sites feed through this function (Passphrase row, Not Protected red banner, manage-gate fallback). Imports `openStaleKeyModal` from context.
- `src/components/RestoreModal.tsx` — removed dead E29 comment about cleanupMigrations.
- `src/services/bsv/identity.ts` — updated two stale JSDoc/inline comments referencing cleanupMigrations.

**Docs:**
- DECISIONS.md — new entry "E31 block rotate-from-stale" with full F-CLOSED rationale, decisions made during design (hard-lockout gate considered and rejected), do-not-revert guards. The `cleanupMigrations` retention entry was rewritten to document the deletion (originally added 2026-03-28 commit `31a9d92` to fix payout-redirection after re-importing a rotated key; structurally obsoleted by E29 which blocked re-importing rotated keys; recoverable from git history if a future admin-reclaim feature ever materialises).
- SECURITY_AUDIT.md — new BUG-11 entry documenting the takeover vector + fix.
- CLAUDE.md — updated actions.ts inventory entry (removes cleanupMigrations, notes the E31 migrate guard).

**Three agents consulted during design (2026-06-01):**
1. Architecture reviewer — endpoint audit: identified `migrateIdentity` + `cleanupMigrations` as vulnerable. All other endpoints (createPost, bootPost free+paid, /api/boot-confirm, /api/boot-shares) confirmed OK. Surfaced the secondary `MoveAddressModal` BUG-10 regression. Flagged the funds-in-flight edge case requiring client preflight.
2. Designer — UX hardening: chip click while stale, You modal stale-state card, trigger guards on rotation modals.
3. Architecture reviewer (follow-up) — `cleanupMigrations` archaeology: traced introducing commit `1d93f2e` (Mar 28); confirmed the original payout-redirection bug; confirmed E29 obsoleted the scenario; zero active callers; recovery via `git show 31a9d92:src/app/actions.ts` is near-zero cost.

**Decisions made during the session:**
- UI hardening approach: stay with E30's modal+banner + add small trigger guards (vs hard-lockout gate). Both UX and architecture agents recommended against hard-gate.
- `cleanupMigrations`: delete entirely (vs guard or build admin reclaim now). Future admin reclaim would need different auth shape anyway.
- Scope: single E31 commit (vs split server/UI).

**Code-auditor verdict:** TBD (re-audit pending before commit). Earlier per-chunk auditor confirmed root cause (`INSERT OR REPLACE` enables clean overwrite) and identified the secondary regressions.

Biome clean, tsc clean, 87/87 tests pass, prod build clean.

## 2026-05-29 — E30: stale-key session-lockout (shipped, two commits)

Category: security architecture + UX — completes the rotation/revocation story by closing the "existing device unaware its key was revoked elsewhere" hole. E29 closed "new device adopts stale key"; E30 closes the symmetric case.

**Shape:** UI-layer session-lockout (not per-mutation server gating). Polling sends `x-bsvibes-pubkey` header on every `/api/posts` request; server returns `key_status: { stale: true }` when the pubkey has a forward migration. Client transitions identity to a `staleKey` state, surfaces `<StaleKeyModal>`, replaces the textarea with an amber banner. `createPost` / `bootPost` server actions UNMODIFIED — a malicious WIF holder bypassing the UI is documented as residual risk L7 with retreat path. Reasoning: open/closed principle — `requireIdentity()` Hard Rule #7 universal pattern automatically inherits the lock for any future mutation feature.

**Shipped as two commits:**

**E30a (3818e2c) — scaffolding, no user-visible change (~440 LOC).**
- `Identity` type gains required `pubkey: string`, derived in identity.ts and persisted to localStorage. Legacy `StoredIdentity` payloads backfilled via new `materializeFromStored` helper.
- `IdentityState` union gains `kind: "staleKey"` variant, plus `markIdentityStale` / `clearStaleKey` transitions.
- IdentityContext wraps `markIdentityStale` with `isSessionClearBlocked()` guard (F3 mitigation — prevents self-stale during own-device rotation).
- `requireIdentity()` gains stale-key branch with stub opener (replaced in E30b).
- RestoreModal z-[70] → z-[100]; `currentIdentity` prop made nullable.
- `/api/posts` flag-gated `key_status` field via `shouldCheckStaleness` helper; reads `x-bsvibes-pubkey` header (not query string — privacy P2); strict env flag check `=== "true"` (F1+F2 fail-open); errors caught + swallowed.
- 24 new tests (20 pubkey-shape + flag-gating + fail-open, 4 derivePubkeyFromWif pinning).
- Code-auditor verdict: SHIP. All invariants confirmed.

**E30b — UI + behavior live (~340 LOC + #50 revert + docs).**
- `<StaleKeyModal>` (NEW, ~210 LOC) — z-[90], mirrors SignInModal container. Body: primary CTA, zinc-500 device-each note, U1 escape-hatch link flips "I don't have the newer file" ↔ "Hide" with inline 3-paragraph honest explanation (no recovery promise, no support hook). Dismiss: backdrop / X / Escape / pagehide. RestoreModal rendered as sibling (not child) so closing the stale modal doesn't unmount the restore flow.
- `useFeedPolling` reads `key_status?.stale === true` strictly; captures `sentPubkey` pre-request and compares to current pubkey at response time (race guard — discards stale verdict if pubkey changed mid-flight, defense against in-flight poll resolving after cross-tab restore or same-tab rotation).
- `Feed.tsx` mounts `<StaleKeyModal />` alongside `<SignInModal />` inside `<IdentityProvider>`.
- `PostForm.tsx` swaps textarea → amber banner button when stale (rounded-3xl, min-h matches textarea so zero layout shift). `submitForm` now uses `requireIdentity()` instead of bare `!identity` check — defense in depth via stale-state branching.
- `IdentityBar.tsx` subscribes to `staleKey` and force-closes the dropdown on transition (R1 fix — prevents user photographing/copying a now-dead WIF mid-reveal).
- **Task #50 — reverted 3 diagnostic `console.warn` lines from PostForm's SpeechRecognition handler.** Bundled here since E30b touches PostForm anyway.
- DECISIONS.md gains "E30 stale-key session-lockout (UI-layer only)" entry with full F1+F2/F3 rationale, retreat path, do-not-revert guards.
- SECURITY_AUDIT.md gains L7 entry documenting residual griefing risk + escalation trigger.
- CLAUDE.md gains StaleKeyModal key-files entry.

**Auditor findings during E30b implementation and fixes applied before commit:**
- F1 (HIGH): StaleKeyModal `onSuccess` dropped the imported identity → re-open loop. **Fixed:** now calls `updateIdentity(imported)` before clearing.
- F2 (HIGH): Reset effect immediately undid `setRestoreOpen(true)` from the CTA handler → restore modal unmounted on next render. **Fixed:** reset effect now only resets `explanationOpen`, never `restoreOpen`.
- F3 (MEDIUM): Passing non-null `currentIdentity` to RestoreModal triggered save-outgoing-key prompt for a dead key. **Fixed:** pass `null` to match RestoreModal's documented stale-flow bypass.
- F4 (MEDIUM): F3 (block-guard) mitigation has a late-response race window — poll fired with OLD pubkey, returns after block released, marks new key stale. **Fixed:** captured `sentPubkey` pre-request, compare to current pubkey at response time.
- F5 (LOW): PostForm `submitForm` lacked stale guard at handler level (textarea hiding was the only defense). **Fixed:** routed through `requireIdentity()`.
- F7 (cosmetic): outdated "stub opener" comment. **Fixed.**

Re-audit verdict: SHIP. All five findings closed, no regressions to previously-confirmed invariants, no new issues introduced.

**Deploy precondition:** set `E30_STALE_KEY_ENABLED=true` on Railway/Vercel after deploy. Until set, the feature is dark (server omits `key_status`, client treats absence as not-stale via fail-open).

Biome clean, tsc clean, 87/87 tests pass, prod build clean.

## 2026-05-28 — E30 design lock (planning session, no code)

Category: design / planning — no code changes. Locked the full E30 (session-lockout for stale-key devices) implementation spec across three parallel agent reviews.

**Agents consulted:**
1. Technical pre-implementation map — surfaced 13 affected files, identified that `Identity` type needs a new `pubkey` field, and that `RestoreModal` needs nullable `currentIdentity` for the stale-key flow.
2. Adversarial bug hunt — verdict SHIP-WITH-FIXES, surfaced 5 MUST-FIX items (U1 lost-newer-file escape hatch, F1+F2 fail-open on malformed `key_status`, R6 chain-head walk, R1 Show Recovery Key collision, feature flag for rollback) plus 6 SHOULD-ADDRESS items.
3. UX lockdown + docs draft — final modal copy, amber banner spec, visual spec mirroring SignInModal, SECURITY_AUDIT.md L7 draft, DECISIONS.md entry draft, RestoreModal dead-end copy refinement.

**Q&A resolution after agent triage:**
- Q1 soak window → **same-day** (no soak instrumentation exists at BSVibes scale; signal value is low)
- Q2 chain head → **dropped** (poll returns `{stale: true}` only with no pubkey data; `/api/restore-eligibility` already handles each hop one at a time via 1-hop forward check, so R6 is non-issue with this design)
- Q3 modal stacking → **global bump RestoreModal z-[70] → z-[100]** (YAGNI on the z-prop option)
- Q4 feature flag default → **on** (`E30_STALE_KEY_ENABLED=true` at deploy time)
- Q5 scope split → **two commits** (E30a scaffolding ~210 LOC + 130 LOC tests, no user-visible change; E30b UI + behavior + #50 PostForm diagnostic revert + docs ~244 LOC + 80 LOC tests + 41 LOC docs)

**U1 escape-hatch design** (option A, explanation only):
- Trigger link `I don't have the newer file` (`text-[11px] text-zinc-500 underline`) below the primary CTA
- Inline expand-below within the same modal; link text flips to `Hide` when expanded (matches existing IdentityBar `View all`/`Hide` pattern)
- 3-paragraph explanation (~310 chars) in `text-zinc-400`: tells the user honestly that earnings + posting follow the newer key, the older key on this device can't post or earn, on-chain history is intact under the newer key. No support hook, no recovery promise, no "Got it" button (close X / backdrop are sufficient)

**Bundled into E30b:** task #50 (revert PostForm.tsx diagnostic console.warn lines from E24 mic debugging) — E30b modifies PostForm anyway for the textarea → amber banner swap, so the revert lands cleanly in the same commit.

**Identity.pubkey decision:** required field, not optional. Derives deterministically from WIF in `identity.ts` (`PrivateKey.fromWif(wif).toPublicKey().toString()`), backfill on load. TypeScript strict guarantees the rest. Avoids `??` chains across 8 consumer files.

**`requireIdentity()` branching:** lands in E30a with a stub opener (dead branch, no caller triggers it). E30b swaps the stub for `setStaleModalOpen(true)`. Keeps E30b purely additive.

**Next session:** explicit go-ahead → build E30a → build E30b → both in one push to origin (with explicit approval) → set `E30_STALE_KEY_ENABLED=true` on Railway/Vercel → close tasks #60 and #50.

PostForm.tsx mic diagnostic logs (task #50) still uncommitted, will land bundled in E30b.

## 2026-05-27 — E29a: skip Web Share API on desktop (UX hotfix)

Category: UX hotfix — desktop save sheets were opening OS-native share UI instead of the simple `<a download>` desktop users expect.

iPhone PWA testing of E29 surfaced an unrelated regression from E27/E28a's `navigator.share` migration: on **desktop** browsers, calling `navigator.share({ files: [file] })` opens the **OS-native share sheet** — AirDrop + nearby device options on macOS, Phone Link on Windows. Functional (file can still be saved) but surprising vs the legacy `<a download>` which just drops the file into Downloads with no prompt.

**Fix** (1 file, ~12 lines added): add an `isTouchPrimary()` helper to `src/services/bsv/backup-template.ts` using `window.matchMedia('(pointer: coarse)').matches`. Insert an early-return gate in `shareOrDownloadBackup` that bypasses the Web Share path entirely when the primary input is fine (mouse/trackpad), falling through to the legacy `downloadBackup` instead.

**Why `(pointer: coarse)` is the right detector** (per pre-commit audit):

- Posture-aware, not capability-aware: same Surface Pro returns `true` detached as a tablet, `false` with mouse plugged in
- iPad with Magic Keyboard/trackpad correctly returns `false` (iPadOS 13.4+ flips to fine pointer when trackpad is connected)
- W3C-blessed semantic; stable since 2018
- Doesn't depend on UA strings (iPadOS lies and claims to be Mac)

**Device behavior matrix after E29a:**

| Device | Behavior |
|---|---|
| iPhone (Safari + PWA) | share drawer (preserved E27/E28a win) |
| Android phone | share sheet (preserved) |
| iPad tablet posture | share sheet (preserved) |
| iPad + Magic Keyboard | `<a download>` (laptop posture) |
| Surface Pro tablet posture | share sheet |
| Surface Pro + mouse | `<a download>` (laptop posture) |
| macOS Chrome/Safari | `<a download>` (fix) |
| Windows Chrome/Edge | `<a download>` (fix) |
| Linux desktop | `<a download>` |

**Edge cases verified:**
- No SSR risk — function only invoked from client `onClick` handlers; `window.matchMedia` is safe in that context
- Firefox desktop on Linux with touchscreen as primary input would route to share sheet, but Firefox doesn't implement `navigator.canShare({files})` so falls through to download anyway — net harmless
- All three call sites (RestoreModal, MoveAddressModal, IdentityBar) inherit the fix automatically since they all route through `shareOrDownloadBackup`

Biome clean, tsc clean, 63/63 tests pass.

PostForm.tsx mic diagnostic logs (task #50) intentionally still uncommitted.

## 2026-05-26 — E29: block restore of rotated keys (Design C-strict)

Category: security architecture — block restoring any key that has been rotated forward on-chain.

**Why:** every BSVibes user's first identity is plaintext by default. Its recovery file is a permanent leak vector. If restore-then-reclaim were allowed (the previous behavior via the auto-`cleanupMigrations` chain rewrite), anyone who ever obtained the plaintext file could later take over the user's future earnings — even years after upgrading to a strong passphrase. E29 closes this by treating the on-chain migration record as a permanent revocation event (parallel to Google / Apple invalidating sessions on a password change). Three parallel architecture-reviewer agents independently arrived at the same conclusion — pure Design B (warn-only) and B-hybrid (opt-in reclaim) both leave the attack vector open; only Design C-strict (block entirely) closes it.

**Implementation across 6 files (~140 LOC added, ~25 removed):**

- `src/services/bsv/identity.ts` — new `derivePubkeyFromWif(wif): Promise<string>` helper. Single sync derivation pattern previously duplicated across import sites; shared between E29 gate sites going forward.
- `src/services/bsv/migration.ts` — new `getForwardMigration(pubkey): Promise<ForwardMigration | null>` helper. Server-side migration lookup, designed for reuse by E30 (stale-key mutation blocking, planned next).
- `src/app/api/restore-eligibility/route.ts` — new GET endpoint. Pubkey query param, validates 02/03/04 compressed/uncompressed shapes, rate-limited 30/min/IP. Returns `{ allowed }` or `{ allowed: false, rotatedAt, newAddrPrefix }`. Derives the new address from the to_pubkey via `PublicKey.fromString(...).toAddress()` — same pattern as `weights.ts`.
- `src/components/RestoreModal.tsx` — gate check in `doImport` BEFORE any identity write. AbortController wrapped (handleClose aborts in-flight check). New `blockedRestoreInfo` state + render branch with rotation date + new addr prefix + "Try a different file" button. ALSO removed the auto-`cleanupMigrations` call + the orphan `signPost` import (no other usage in the file).
- `src/components/HomeScreenWelcomeGate.tsx` — same gate at both call sites (plaintext branch in `handleFile`, encrypted branch in `handlePassphrase`). New `Mode = "blocked"` variant with explicit render branch (avoids silent fallthrough). Same AbortController pattern. Shared `checkEligibility` helper inside the component since both call sites use it.

**Doc updates:**
- `DECISIONS.md` — new entry "Restore of rotated keys is blocked outright (Design C-strict)" with full security rationale, do-not-revert guards, and bridged-then-rotated edge case explicitly called out.
- `DECISIONS.md` line 132 (`Identity import cleans up migrations`) marked SUPERSEDED with pointer to the new entry — prevents future contributors from reintroducing the old behavior thinking it's policy.

**`cleanupMigrations` server action** in `src/app/actions.ts` is intentionally retained — no UI calls it post-E29, but the bridge logic is non-trivial and may be reusable for a future signature-gated admin reclaim design (would require stronger auth than "anyone with the WIF can reclaim"). Documented as orphan-by-design.

**Fail-safe behavior:** any network/parse failure during the eligibility check ALSO blocks the restore with "Couldn't verify this key — check your connection and try again." Without verification we can't safely allow the restore.

**Trade-off accepted:** users who lost their newer key and only have a pre-rotation file cannot recover via BSVibes UI. Mitigated by the existing combined-recovery-file pattern (every rotation file contains BOTH keys under one passphrase), so only the very first plaintext save (before any rotation) is unrecoverable. UTXOs at old addresses remain spendable via external BSV wallets.

**Next**: E30 (planned) — block stale-key MUTATIONS (posts / boots) at the server. Different surface from E29: E29 handles "NEW device adopting stale key", E30 handles "EXISTING device discovering it's stale after rotation on another device". Will reuse the `getForwardMigration` helper from E29.

Biome clean, tsc clean, 63/63 tests pass.

PostForm.tsx mic diagnostic logs (task #50) intentionally still uncommitted.

## 2026-05-26 — E28c: welcome-gate restore preserves file's passphrase

Category: bugfix — first-PWA-install restore-from-encrypted-file landed unprotected.

iPhone PWA testing showed that restoring from a passphrase-protected recovery file via the welcome gate (first home-screen install) discarded the typed passphrase. The new identity was written plaintext to localStorage; `isEffectivelyProtected()` returned false; the You modal showed "Not protected" and prompted the user to set up a passphrase they had already typed seconds before.

Root cause: `IdentityContext.acceptRestoredIdentity(wif, name?)` only called `importIdentity` (plaintext path). The welcome gate decrypted the file then passed only WIF + name onward — passphrase dropped on the floor. RestoreModal had been fixed in E27 by branching to `importEncryptedIdentity` when a passphrase was provided; the welcome-gate path was missed.

**Fix (minimal, two files):**

- `IdentityContext.tsx` — widened `acceptRestoredIdentity` signature to `(wif, name?, passphrase?, hint?) => Promise<Identity>`. Internal branch: with passphrase → `importEncryptedIdentity(wif, passphrase, name, hint)` (re-encrypts the new identity with the file's passphrase, preserves hint, primes session caches); without passphrase → `importIdentity(wif, name)` (legacy plaintext path).
- `HomeScreenWelcomeGate.tsx` — widened `onRestore` prop type to match; in `handlePassphrase` forward `passphrase + encryptedPayload.hint` to `onRestore`. The plaintext-file branch (when source file had `wif`, not `wif_encrypted`) was already correct — leaves it as-is.

Single caller of `acceptRestoredIdentity` exists (Feed.tsx → `<HomeScreenWelcomeGate onRestore={acceptRestoredIdentity} />`); signature widening is backwards-compatible.

**Intentionally NOT in scope:**

- Auto-`cleanupMigrations` call. RestoreModal currently calls this; the welcome gate never has. E28c does NOT add it. The next commit (E29) will REMOVE the RestoreModal call entirely as part of a security-driven architecture change — restore of any rotated key will be blocked outright. See task #57 / DECISIONS.md (forthcoming) for full rationale.

Biome clean, tsc clean, 63/63 tests pass.

PostForm.tsx mic diagnostic logs (task #50) intentionally still uncommitted.

## 2026-05-26 — E28b: revert E28a diagnostics + migrate IdentityBar Save to Web Share

Category: cleanup + UX consistency.

E28a's diagnostic logs confirmed two things via iPhone PWA testing: (1) `text/html` MIME unblocked `navigator.share` on PWA — the share API now succeeds where `application/octet-stream` failed silently, (2) `isEffectivelyProtected` correctly returns `true` after a clean restore (the previous "Not protected" symptom was PWA cache serving pre-E28a code). With the diagnosis confirmed, E28b reverts the temporary logs and extends the Web Share migration to the remaining Save sites.

**Reverts (4 diagnostic blocks):**
- `backup-template.ts shareOrDownloadBackup` — pre-share gates log + catch-block error log
- `identity.ts isEffectivelyProtected` — branch logs (encrypted-missing and encrypted-present)
- `IdentityBar.tsx` protected-check `useEffect` — diagnostic block restored to simple form

**Migrations (IdentityBar Save row → Web Share):**

The original "Save recovery file" row in the You modal still routed through the legacy `downloadBackup` (`<a download>`), giving iPhone PWA users the intrusive full-page popup. The rotation done-state Save (E27) was the only path using `shareOrDownloadBackup`. E28b brings parity:

- `doDownloadPlaintext` — straightforward migration to `shareOrDownloadBackup` (sync, no `await` before share). Wrapped in `blockSessionClear()` / `unblockSessionClear()` to suppress iOS PWA's `visibilitychange→hidden` from torching the manage gate while the share drawer is open.
- `handleSaveEncrypted` — hybrid pattern. Synchronously reads the cached `wif_encrypted` from `bfn_keypair_enc` localStorage (the field that's always present for properly-protected accounts). If cached → calls `shareOrDownloadBackup` inline preserving iOS transient activation through the click → share boundary. If cache absent (rare degenerate state — interrupted upgrade) → falls back to legacy `downloadBackup` with the async `encryptWif` path. The legacy fallback keeps the rare case working; the hot path gets the native share UX.

**Pre-commit code-auditor verification — three preconditions all PASS:**

1. `setJustDownloaded(true)` gates on `result.shared && !result.cancelled` in both async paths. A cancelled iOS share drawer no longer falsely marks the account as backed up (security-adjacent guard: prevents data loss via false "saved" signal).
2. Both async share paths wrap `blockSessionClear()` / `unblockSessionClear()` correctly. The degenerate sync path does NOT (it doesn't open a share drawer — no need).
3. Degenerate sync fallback retained in `handleSaveEncrypted` so the rare cache-absent case still works.

Plus 5 additional checks all PASS: `cachedEnc` reads the right field, share payload parity with prior `downloadBackup` calls, `handleSaveFile` correctly `void`s the now-async `doDownloadPlaintext`, no missed migration sites, `markBackedUp` downstream contract unchanged.

**Deferred (out of E28b scope):**
- `ChangePassphraseModal.tsx` has 2 `downloadBackup` call sites that should also migrate to Web Share for consistency. Per earlier E26 audit, ChangePassphraseModal isn't actually mounted in IdentityBar (Passphrase row opens MoveAddressModal instead) — so this is effectively dead-code drift. Leave alone until/unless the modal is re-mounted.

Biome clean, tsc clean, 63/63 tests pass.

PostForm.tsx mic diagnostic logs (task #50) intentionally still uncommitted.

## 2026-05-25 — E28a: PWA share drawer fix + diagnostic instrumentation

Category: bugfix + diagnostic — follow-up to E27 after iPhone PWA testing surfaced two real issues.

**Issues found in PWA testing:**

1. **Spurious `.txt` sidecar file** on every Save. iOS treats `navigator.share({ files, title })` as TWO share items when both are passed — saves the HTML recovery file AND a `.txt` containing just the title string.
2. **PWA share drawer never appears.** Every Save / protect path on installed PWA triggers the full-page download popup instead of the rounded share drawer. Per Web Share API researcher: WebKit's PWA process uses a stricter file-MIME allow-list than Safari tab; `application/octet-stream` (E27 choice) is likely OFF that list while `text/html` is ON it. Silent fallback to `<a download>` hides the actual `navigator.share` error.
3. **PWA restore from encrypted file lands as "Not protected"** while Safari correctly adopts the file's passphrase. Code-auditor ruled out localStorage atomicity (writes ARE atomic within a microtask); most likely cause (H5): `IdentityBar.tsx` `useEffect` at lines 192-196 has deps `[identity?.address, identity?.wif, identity]` — if the restored identity has the same address/wif as prior state (or PWA renders one extra time vs Safari, shifting effect timing), the effect doesn't re-fire and `setIsProtected` stays stale.

**Three categories of change shipped in this commit:**

- **Definitive (Issue 1):** dropped `title` from `navigator.share` call in `backup-template.ts`. Files only.
- **Best-guess fix (Issue 2):** changed MIME from `application/octet-stream` to `text/html` in the share `File` constructor. Diagnostic logs will confirm if this is the fix.
- **Diagnostic instrumentation (Issue 2 + 3, will be reverted in E28b once root cause confirmed):**
  - `backup-template.ts` `shareOrDownloadBackup`: logs `canShareSupported`, `canShareFiles`, `shareSupported`, `file.type`, `file.size` before share gate; logs `error.name + error.message` in catch block on non-AbortError.
  - `identity.ts` `isEffectivelyProtected`: logs `hasEncrypted`, `hasPlaintext`, `result` on both branches.
  - `IdentityBar.tsx` protected-check `useEffect`: logs whether the effect fires + the resulting `isProtected` value on identity change.

DECISIONS.md updated: existing E27 Web Share entry amended to reflect the `text/html` MIME change (supersedes the earlier octet-stream decision); new "no `title` with files" entry added as a no-relitigate guard.

Pre-commit code-auditor review: PASS on all three categories; no secret leakage in logs; address logged is the first 8 chars of public address (not WIF / passphrase).

Biome clean, tsc clean, 63/63 tests pass. PostForm.tsx mic diagnostic logs (task #50) intentionally still uncommitted.

## 2026-05-23 — E27: save-flow redesign shipped (Bug A + Bug B + no auto-download + Web Share + per-addr saved flag)

Category: feature + bugfix — major UX redesign of the recovery-file save/restore flow.

Implementation guided by three pre-investigation agents (researcher for iOS Web Share API specifics, code-auditor for insertion-point mapping, architecture-reviewer for the redesign options). Pre-commit code-auditor review identified one fix-needed: premature `markBackedUp()` in MoveAddressModal `onComplete` — addressed by removing it and adding a new `onSaved` callback prop that fires only after successful share.

**Seven changes in one commit:**

1. **`importEncryptedIdentity(wif, passphrase, name?, hint?)` in `identity.ts`** — new export. When restoring from an encrypted file, the user's typed passphrase becomes the new identity's passphrase. Hint preserved from the file. Mirrors `upgradeIdentity` store shape; primes session caches so `signPost` (cleanupMigrations) works immediately. Fixes Bug A.

2. **IdentityBar RestoreModal dismissal moved from `onSuccess` to `onClose`** — modal stays mounted to show its done state with Got it button. Fixes Bug B (asymmetric with MoveAddressModal which was already correct).

3. **`MoveAddressModal.runRecording` no longer auto-downloads.** `combinedBackupRef` still holds the payload. Pre-rotation failure-path download untouched.

4. **MoveAddressModal done-state context card** — fetches earnings via `/api/earnings?summary=1` (chain-resolved), pairs with `useBsvPrice` for USD display. Primary "Save recovery file" + secondary "I'll do it later". On save: transitions to emerald "Saved" card with Got it button. `markAddressSaved(newAddr)` fires only after share completes; new `onSaved` callback notifies parent to flip global `backedUp` flag.

5. **`shareOrDownloadBackup(data): Promise<ShareResult>` in `backup-template.ts`** — new export. Uses `navigator.share({ files: [file] })` when available with `application/octet-stream` MIME (iOS HTML-MIME-hostile workaround). Builds `File` synchronously to preserve iOS transient activation across the click→share boundary. `AbortError` = user cancelled = no fallback (would re-trigger the intrusive download sheet). Other errors fall back to `downloadBackup`. Legacy `downloadBackup` retained for fallback + sync emergency paths.

6. **Per-address saved flag** — `bsvibes_saved:<addr6>` localStorage key, ISO date value. Helpers `markAddressSaved` / `isAddressSaved` / `getAddressSavedDate` in `backup-template.ts`. Global `backedUp` flag kept (drives install pitch, first-earning toast). `IdentityBar.showWarningDot` reads `backedUp === false || !isAddressSaved(identity.address)` — either condition surfaces the amber dot. `markBackedUp()` updated to also write the per-address flag (handles existing Save/Copy/Show key paths).

7. **RestoreModal restore-pre Save-or-Skip prompt** — `doImport` no longer auto-emits the outgoing identity's file. A `useEffect` lazily builds `outgoingBackupPayload` (encrypted if protected + reAuthPassphrase, plaintext if unprotected) so the Save click handler can call `shareOrDownloadBackup` synchronously. Two-step Skip: tap "Skip" → red warning state with "Go back" + "Skip & restore anyway" requiring second tap. Force-save explicitly rejected per design discussion.

**Cross-cutting fix:** premature `markBackedUp()` in `MoveAddressModal.onComplete` removed. The global `backedUp` flag now flips ONLY when the user actually completes a save (via the new `onSaved` callback). Pre-fix the flag was falsely flipping true on rotation completion alone — broke E27's "explicit save" premise.

DECISIONS.md gains five no-relitigate entries covering: re-encrypt on restore, no auto-download with stakes context, Web Share API + AbortError handling, per-address saved flag, two-step Skip confirmation. CLAUDE.md MoveAddressModal + RestoreModal entries updated.

Biome clean, tsc clean, 63/63 tests pass.

PostForm.tsx diagnostic console.warns (task #50) still uncommitted — mic flow stays parked.

## 2026-05-22 — E27 planned: save-flow redesign (approved, NOT implemented)

Category: planning checkpoint — implementation deferred to next session.

Three parallel agents (code-auditor, designer, architecture-reviewer) investigated two bugs and proposed a redesign for the recovery-file save flow.

**Bugs identified for fix:**

- **Bug A — Restore doesn't adopt the file's passphrase.** `importIdentity` writes plaintext WIF and discards the passphrase typed at decrypt time. Per `git log --all -S "encryptWif"`, this re-encrypt-on-restore behavior was NEVER in the codebase — the save flow has always re-encrypted, but restore never did. The desired behavior is a new feature, not a regression restoration.
- **Bug B — Modal closes on Done despite E26.** Code-auditor confirmed E26 IS in source and dev-server restart serves the E26 build, so this is the deployed code. Root cause: `IdentityBar.tsx` calls `setShowRestoreModal(false)` in the RestoreModal `onSuccess` handler, unmounting the modal before the done state renders. Asymmetric — MoveAddressModal's handler doesn't. E26 fixed the child component but missed the parent.

**Redesign approved (7 items, single E27 commit, awaiting go-ahead):**

1. Restore re-encrypts WIF with file's passphrase; preserve file's hint; protects new identity on first use.
2. IdentityBar stops unmounting RestoreModal on `onSuccess`; let modal control own dismissal.
3. Remove auto-download in `MoveAddressModal.runRecording`. Keep `combinedBackupRef`.
4. Rotation done-state becomes a context card with stats (*"This device has X posts and Y sats..."*) + primary Save button + secondary "I'll do it later" link.
5. Replace `<a download>` with `navigator.share({ files: [file] })` — iOS shows native share drawer instead of intrusive download sheet. Fall back to `<a download>` on browsers without Web Share API. Pattern used by Bitwarden.
6. Per-address saved flag (`bsvibes_saved:<addr6>: <ISO date>`); amber "Unsaved key" badge in IdentityBar persists until address is marked saved.
7. Same context-card pattern in RestoreModal restore-pre. Allow Skip with confirmation toggle ("I understand I'll lose this identity"). Force-save explicitly rejected.

**Filename improvement (Option E from architecture-reviewer's options)** DEFERRED. Stays in scope post-launch.

**Disaster-recovery safety preserved:** pre-rotation file still emits on failure mid-flight; file format unchanged; combined-rotation-file pattern unchanged.

PostForm.tsx diagnostic console.warns (task #50) still uncommitted — mic flow stays parked.

A-D iPhone testing paused at this point too — B5-B8, C1-C4, D1b, D3 still untested. Resume after E27 ships.

## 2026-05-18 — E26: iCloud Keychain hidden-username + PWA modal-close fixes

Category: iOS PWA bugfix — two distinct bugs surfaced in B-category iPhone testing on PWA.

**Bug 1 — iCloud Keychain stopped prompting after first rotation.** User saw exactly ONE saved entry in Settings → Passwords for bsvibes.com, regardless of how many rotations they performed. The form had no `autocomplete="username"` anchor, so iOS's heuristic for "is this a new credential or an update?" fell through to silent — no Save sheet, no Update sheet, nothing.

**Bug 2 — Rotation/Restore modals closed prematurely when iOS Save Password sheet dismissed.** User tapped Done on the iOS sheet; the BSVibes modal also closed, never showing the done state with Download again / Got it buttons. Reported for MoveAddressModal and RestoreModal.

Three parallel agents (code-auditor, researcher, nextjs) identified four distinct root causes:

1. Form has no `<input autocomplete="username">` — iOS can't match credentials on rotation.
2. E24's `blockSessionClear` only covered `pagehide`. iOS Save Password sheet also fires `visibilitychange→hidden` on PWA. IdentityBar's `visibilitychange` handler then sets `manageAuthed=false`, cascading through React re-renders.
3. RestoreModal had `setTimeout(handleClose, 1200)` auto-closing on success — fired regardless of iOS sheet timing.
4. MoveAddressModal called `onComplete(newIdentity)` BEFORE `setStage("done")`. Parent re-render raced against the stage transition; React Compiler's batching could unmount the child before done state rendered.

**Fixes:**

- **IdentityContext**: exposed `isSessionClearBlocked()` reader. Same ref, one source of truth across pagehide + visibilitychange consumers.
- **IdentityBar.tsx**: `visibilitychange` handler short-circuits when `isSessionClearBlocked()` returns true.
- **MoveAddressModal.tsx**: wrapped the passphrase entry in a `<form>` with hidden `<input type="text" autoComplete="username" value={identity.name} readOnly hidden />`. Continue button is now `type="submit"` so iOS sees a real form submission. Also swapped call order in `runRecording()`: `setStage("done")` BEFORE `onComplete(result.identity)`.
- **RestoreModal.tsx**: removed the 1200ms auto-close. Replaced "Identity restored." line + Cancel button with a proper done state (amber-bordered confirmation card + Got it button). Wired `blockSessionClear()` via `block()` / `unblock()` pair into `doImport` + `performImport`; useEffect cleanup releases on unmount. Same call-order fix: `setImportSuccess(true)` BEFORE `onSuccess(imported)`.

DECISIONS.md gained four no-relitigate entries: (1) iCloud Keychain username-anchor requirement, (2) block scope must cover pagehide + visibilitychange, (3) local-state-before-parent ordering in modal callbacks, (4) no auto-close timers on success states. CLAUDE.md IdentityContext description updated.

Biome clean, tsc clean, 63/63 tests pass.

Diagnostic console.warns in PostForm.tsx (E24 leftover, mic-flow parked) intentionally still uncommitted — task #50 tracks revert.

## 2026-05-18 — E25: iOS Quick Look fix for recovery file (noscript inversion + form-control selection)

Category: iOS bugfix — recovery file rendering in iOS Files / Quick Look.

**The bug.** Nige opened an encrypted recovery file on iPhone via iOS Files preview. The `<noscript>` banner that's meant to explain "your keys are safe — but this preview can't decrypt them" was not visible. Separately, long-press-to-copy on the address row didn't work in Quick Look.

**The diagnosis.** Researcher agent confirmed two iOS Quick Look quirks. (1) `<noscript>` content doesn't render in Quick Look because the WHATWG spec ties `<noscript>` visibility to whether the *engine* reports scripting as "disabled," not whether scripts actually run. iOS Quick Look's sandboxed WebKit reports scripting as "enabled" even though it never executes. (2) `user-select: all` is intercepted by Quick Look's preview UI layer, so the long-press copy gesture doesn't fire on `<div>` / `<span>` elements.

**The fix.** All in `src/services/bsv/backup-template.ts`:
- `<noscript>` → `<div id="quicklook-notice">` visible by default; tiny IIFE hides it when JS runs. Reliable across renderers.
- Address row `<span class="meta-value">` → `<input type="text" readonly value="...">` for 3 occurrences (current-only card, current+previous cards, and the previous-address row).
- WIF block `<div class="wif-value">` → `<textarea readonly rows="2">` for 3 occurrences (plaintext, encrypted-primary, encrypted-old). Native form controls retain iOS-OS-level tap-to-select / long-press handles in Quick Look.
- `showSuccess()` switched from `.textContent =` to `.value =` for the textareas.
- `copyText()` updated to read `el.value` for form controls (`'value' in el`) and `el.textContent` for spans (Saved date row).
- `copyText()` fallback path also gained native `el.select()` for inputs; range-based selection for the rest.
- CSS strips form-control defaults (border, padding, background, resize) so inputs/textareas look visually identical to today's spans/divs.
- `user-select: all` rules removed (irrelevant on form controls).

CLAUDE.md backup-template entry rewritten with the new pattern + explicit "do not revert" guards. DECISIONS.md gained a no-relitigate entry titled *"iOS Quick Look noscript / input-readonly pattern"* covering both quirks and the rationale, plus citing the 1Password Emergency Kit / Bitwarden precedent. Pattern matches industry-standard password-manager emergency sheets.

Biome clean, tsc clean, 11/11 backup-template-related tests pass (`restore-from-file.test.ts`). File-format data shape unchanged — only the HTML rendering layer differs. App-side decrypt/restore paths untouched.

Approved end-to-end by Nige before each edit (per `feedback_ask_before_code_change` rule).

## 2026-05-16 — E24: iPhone mic, Safari password save, PWA "Done" flow

Category: iOS bugfixes — three independent regressions discovered during B-category manual testing.

**Fix 1 — Mic permission stuck on denied (PostForm.tsx).** Removed the `navigator.permissions.query({ name: "microphone" })` pre-check that gated `recognition.start()`. On iOS Safari, that API returns a stale "denied" long after the user enables mic access in Settings → Safari → Microphone — the cache only refreshes on hard refresh / app reinstall. The pre-check was both redundant (recognition.start() already surfaces the native prompt) and broken (caused our "Enable in Settings" toast to fire forever even with permission granted). Now we call recognition.start() directly; the existing `onerror` handler catches `not-allowed` for genuine denials.

**Fix 2 — Safari stopped offering to save the password.** All seven password inputs across SignInModal, IdentityBar (manage gate), ChangePassphraseModal (verify + new + confirm), and MoveAddressModal (new + confirm) were missing `autoComplete` attributes. iOS 17+ iCloud Keychain only triggers the "Save Password?" prompt when fields carry the proper `current-password` (unlock paths, 3 inputs) or `new-password` (rotation paths, 4 inputs) signal. Added all seven.

**Fix 3 — PWA "Done" closes modal before "Download again / Got it" appears.** In standalone PWA mode, the iOS "Save Password?" system sheet fires `pagehide` on the host page. IdentityContext's pagehide handler then calls `clearSessionCaches()` (intentional password-manager-style backgrounding cleanup), which torches the session mid-rotation. The modal silently unmounts. Fix: added a ref-counted `blockSessionClear()` / `unblockSessionClear()` pair on IdentityContext. Pagehide handler checks the ref before clearing. ChangePassphraseModal calls block() at the entry of handleChange and unblocks in handleClose (with a useEffect-cleanup safety net). MoveAddressModal does the same at runCreating entry; every dismissal path is funneled through a wrapped `onClose` that always unblocks.

Mechanism is ref-counted so nested callers compose safely. Biome clean, tsc clean.

## 2026-05-12 — Bucket 1 complete: all modals refactored to bottom-sheet pattern

Category: Mobile polish

Five modals refactored to the in-house bottom-sheet-on-mobile / centered-on-desktop pattern (proven by SignInModal + AgentChat). All use the same Tailwind shape: outer `fixed inset-0 z-[N] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none`, panel `w-full sm:max-w-{sm|md} rounded-t-2xl sm:rounded-2xl pointer-events-auto animate-[slideUp_0.3s_ease-out]`, backdrop is a separate full-screen `<button>` with bg-black/75 + backdrop-blur-sm + fadeIn animation.

Per-modal specifics:
- **FundAddress** (6ee6441): half-height single-step. Z-60. max-w-sm.
- **RestoreModal** (e5a896f): full-height wizard. Z-70. max-w-md. min-h-[75vh] sm:min-h-0.
- **ChangePassphraseModal** (1356669): full-height wizard with flex-col so done-state buttons can pin to bottom via mt-auto. Z-60. max-w-md. min-h-[80vh] sm:min-h-0.
- **MoveAddressModal** (dea0b4b): full-height wizard. Z-70. max-w-md. min-h-[85vh] sm:min-h-0. Critical preserved logic: backdropDismissable gating (only dismissable in done/sweep-failed stages, ignored during active rotation stages). Implemented as conditional `<button>` vs `<div aria-hidden>` based on stage. moveCompletedRef + onComplete/onClose callbacks untouched.
- **IdentityBar You modal** (this commit): half-height with max-h-[92vh] overflow-y-auto (tallest modal). Z-60. max-w-sm. Locked-state cross-fade (`!manageAuthed && isProtected ? <lock> : <rows>`) preserved with key-based remount + fadeIn animation. Flattened 3-level nesting (outer flex → relative wrapper → panel) to 2-level (Fragment → outer flex → panel) by removing the redundant relative z-10 middle wrapper.

Each refactor was code-auditor-verified before commit. Type-check clean, 63/63 tests pass, Biome clean across all five files.

LATENT FOOTGUN noted: You modal (z-60) and FundAddress (z-60) tie at the same z-index. Currently safe because FundAddress is only opened from the dropdown context (not the You modal). If a future deposit affordance is added INSIDE the You modal body, FundAddress would render BEHIND it. Either close the You modal first when opening FundAddress, or bump FundAddress to z-[65].

Bucket 1 closes — all six modals (SignInModal earlier + these five) now responsive. Bucket 2 is next per LAUNCH_PLAN sequence (in-app browser splash).

## 2026-05-11 (cont. 6) — Bucket 3a complete: manual QA pass on iPhone

Category: QA, sign-off

Final manual QA pass walked through the full happy path on iPhone Safari + home-screen-installed PWA. All six test groups (Safari fundamentals, no-zoom compose, passphrase modal regression check across modal open/blur/reopen, save flow → inline pitch → bottom banner, welcome gate from home-screen install with recovery file restore, ITP toast on standalone launch) passed. The ITP toast didn't visibly fire on retest, but earlier diagnostic confirmed `nav.standalone=true`, `dm-standalone=true`, `shown=1` — code path proven correct, flag persistence across iOS icon delete + reinstall on this device version is the reason it can't be re-seen.

Bucket 3a closes with 14 tasks done, 9 commits this session (welcome gate sync wiring, restore-on-success marking, InstallPitch component + helper, FirstEarningToast, IosStorageToast, two passphrase-modal bug fixes, diagnostic + cleanup). No data-loss bugs remaining. Identity flow on iOS is now: install → welcome gate → restore (or instructional fallback) → first-earning prompt to save → save → inline + banner pitch to install → install → ITP heads-up. Each step is gated to prevent fresh-sandbox identity loss.

Next per LAUNCH_PLAN sequence: Bucket 1 (mobile modal bottom-sheet polish — `SignInModal` done early in this session, five modals remaining: You modal, MoveAddressModal, RestoreModal, ChangePassphraseModal, FundAddress).

## 2026-05-11 (cont. 5) — Bug fix: passphrase prompt firing for unprotected users

Category: Bug fix, identity flow

User reported a passphrase unlock popup appearing "in random places" for an account WITHOUT a passphrase set, including after tapping Save now on the FirstEarningToast. Code-auditor traced the root cause to `IdentityBar.tsx:524` where Task 12 wired `onSaveNow={() => setShowManage(true)}` directly instead of using the existing `openManageModal()` helper. The helper at line 305 has a critical second line — `if (!isProtected) setManageAuthed(true)` — that bypasses the locked-state passphrase prompt for unprotected users. Without that bypass, every unprotected user landing in the You modal via the toast hit the gate for a passphrase they never set, and `unlockIdentity()` against a non-existent encrypted store always failed.

The "random places" recurrence: the toast re-fires every 30s on the earnings poll while `earnedSats > 0 && !backedUp`. Closing the passphrase prompt with the X didn't tick the 48h dismissal flag (only Save now or Later do), so the toast came back on every poll — felt random because users were doing other things between firings.

Secondary fix in same commit: added `isEffectivelyProtected()` helper to identity.ts that returns true ONLY when encrypted key exists AND plaintext key does NOT. Updated IdentityBar's two `isProtected` effects to use the new helper instead of `isIdentityEncrypted()`. This protects against the interrupted-upgrade case where both keys are in localStorage — `getIdentity()` already correctly prefers plaintext in that case, but the UI was still treating the user as protected based on encrypted-store presence alone. Auditor confirmed `isIdentityEncrypted()` internal callers in `getIdentity()` race-handling remain correct with unchanged semantics.

DECISIONS.md updated with a "Two protection helpers, not one" entry explaining why these two helpers exist deliberately and must not be collapsed back into one (the doc comment alone wasn't sticky enough — auditor flagged future contributors would want to merge them).

Type-check clean, 63/63 tests pass, Biome clean.

## 2026-05-11 (cont. 4) — Bucket 3a task 13: iOS post-install ITP toast

Category: Build, iOS-specific resilience UX

Wired the one-time iOS standalone heads-up — fires on a user's first home-screen-icon launch surfacing iOS Intelligent Tracking Prevention reality (Safari may clear saved site data after long inactivity) and reassuring them their recovery file brings everything back. Card-shape (rounded-2xl), 8s auto-dismiss, single "Got it" button (no "Remind me later" — informational, not a save prompt). Detection: `navigator.standalone === true` (iOS-Safari-specific signal, NOT the broader `display-mode: standalone` that includes Android). Flag `bsvibes_ios_storage_notice_shown` set on display (not on dismiss) so backgrounding mid-toast still counts as shown — once per device guaranteed.

Mounted inside `FeedContent` in `Feed.tsx`, which only renders when `awaitingWelcomeGate === false` — satisfies the LAUNCH_PLAN #12 sequencing requirement (welcome gate FIRST, then ITP toast) by mount point alone, no coordination state needed.

Deviation from designer spec: LAUNCH_PLAN called for "Pill — match GoatModeToast exactly" with `rounded-full`, but the copy is structured headline + body + button (three parts) which doesn't fit a single-line pill. Used the `FirstEarningToast` shape instead (rounded-2xl card with stacked content + button). Auditor verified the deviation is correct given the copy structure.

Toast-stacking observation: three toasts (GoatMode, FirstEarning, IosStorage) now share the `fixed bottom-24 left-1/2 z-50` slot. Realistic collision (user upgrades to passphrase mid-iOS-session while ITP toast is up) is very narrow; auditor deferred a coordination layer as not worth the complexity at launch. iPadOS 13+ "desktop mode" may not set `navigator.standalone` — some iPad-installed users won't see this toast. Acceptable for v1. Type-check clean, 63/63 tests pass, Biome clean.

Bucket 3a build complete (tasks 6–13). Next: Task 14 — manual QA on iPhone (deploy via Cloudflare tunnel, full walkthrough of welcome gate, install pitch, first earning toast, ITP toast).

## 2026-05-11 (cont. 3) — Bucket 3a task 12: First earning event toast

Category: Build, growth surfaces

Wired the high-stakes save prompt — pill-card toast at `fixed bottom-24 left-1/2` that fires on the user's first non-zero earnings: *"You just earned your first sats. Save your recovery file — if you lose this device without it, they're gone."* with Save now / Later buttons. Both buttons set `bsvibes_first_earning_save_dismissed_until = now + 48h` (architect's correction on LAUNCH_PLAN intent — Save-now needs the same 48h backoff so the toast doesn't re-fire on the next 30s earnings poll if the user abandons the save mid-flow).

Mounted in IdentityBar near the existing `GoatModeToast` — `earnedSats`, `backedUp`, and `setShowManage` are all already in scope, no context refactor needed. `onSaveNow` opens the You modal (works for both protected and unprotected users; direct `handleSaveFile` call doesn't work for protected users without the manage gate). Trigger conditions: `earnedSats > 0 && backedUp === false && dismissed_until < now && !sessionDismissed`. Pre-hydration null guards on both `earnedSats` and `backedUp` prevent SSR mismatch.

Per architect refinement A in LAUNCH_PLAN, trigger wires to the existing `/api/earnings` 30s polling response — NOT to `/api/boot-confirm`. Avoids creating a new emit-site that Bucket 4's `publishPayout()` would have to coordinate with later. 30s detection latency is acceptable for a save prompt (not a real-time signal).

Also fixed a related gap: `HomeScreenWelcomeGate` now calls `markBackedUp()` after successful restore (both plain WIF and decrypted-from-encrypted paths). Without this, welcome-gate restorers would be bounced into the You modal's orange "Save your recovery file" CTA even though the file they just used to restore IS their backup — parity with `RestoreModal.onSuccess`.

Toast and bottom InstallPitch banner are mutually exclusive by `backedUp` state (toast requires `!backedUp`, banner requires `backedUp`). Verified by code-auditor pre-commit review. One Medium finding (narrow legacy-user edge case where `GoatModeToast` and `FirstEarningToast` could share `bottom-24` slot if user is protected but never went through `markBackedUp`) deferred as visual stacking, not a correctness bug. Type-check clean, 63/63 tests pass, Biome clean.

Next: Task 13 iOS post-install ITP toast (one-time, fires on first standalone launch).

## 2026-05-11 (cont. 2) — Bucket 3a task 11: InstallPitch component (inline + bottom banner)

Category: Build, growth surfaces

Wired the install pitch — single message *"Get notified when you earn."* on two surfaces: inline inside the You modal done-state (fires on the save event, not on every modal open), and a thin banner at the bottom of the feed above the compose area (full-width strip, dismissable with X for 30-day suppression).

Component is variant-discriminated (`<InstallPitch variant="inline" | "banner" />`) with shared internal logic + platform-branched CTA. Pure `shouldShowInstallPitch({ backedUp, standalone, installType, suppressed })` helper extracted to `src/lib/install-pitch.ts` mirroring the existing `install-suppression.ts` pattern (8 vitest cases covering the truth table — total tests now 63/63). Architect override on the LAUNCH_PLAN banner spec: rendered INSIDE the existing pinned-bottom container above PostForm via flex layout instead of `fixed bottom-0 z-40` (the spec was written without knowledge of the pinned compose; two `fixed bottom-0` strips would stack).

`InstallContext` extended with `backedUp: boolean` + `markBackedUp()` so the bottom banner reacts mid-session without a page reload — without this, `setItem` in IdentityBar would only become visible to the banner on the next mount. The three IdentityBar save sites (handleCopy, MoveAddressModal.onComplete, RestoreModal.onSuccess) all route through a unified local `markBackedUp()` that propagates to context first (idempotent) THEN flips local `backedUp` + new `justBackedUp` event flag. Inline pitch mounted after the green "Got it" confirmation block, gated on `justBackedUp` (cleared in both close handlers so re-opening the modal shows nothing — fires once per save event, not on every reopen where `backedUp === true`).

Platform branching covers all four installType values:
- `one-tap` (Android Chrome/Brave/Edge/Samsung, desktop Chrome/Edge): real Install button calling `promptInstall()`. If `canPromptInstall === false` (Chrome's engagement heuristic hasn't fired), falls back to manual menu instructions instead of a dead disabled button.
- `manual-instructions` (iOS Safari, desktop Safari, Firefox Android): one-line instructions per sub-platform.
- `open-in-safari` (iOS Brave/Chrome/Firefox): nudge to switch to Safari.
- `unsupported` / `null` (desktop Firefox, pre-hydration): render nothing.

iOS self-corrects without an `appinstalled` event — after Add to Home Screen, `useStandaloneMode()` returns true, gate fails, pitch hides forever on that device.

Code-auditor dispatched twice (architectural review before write + diff review before commit). Medium finding (markBackedUp early-return ordering + try/catch parity on the IdentityBar startup localStorage read) applied as part of this commit. Low 2 (dead disabled button on one-tap-without-prompt) applied — falls back to manual instructions. Type-check clean, 63/63 tests pass, Biome clean.

Next: Task 12 First earning event toast (wired to /api/earnings polling).

## 2026-05-11 (cont.) — Bucket 3a task 10: welcome gate detection (sync pre-hydration)

Category: Build, identity flow, state machine

Task 10 completes the Bucket 3a identity-flow layer. Wired `HomeScreenWelcomeGate` into the live mount path and rewrote `useIdentity` as a discriminated-union state machine (`loading | needsUnlock | awaitingWelcomeGate | ready`) so the impossible states the old boolean flags allowed (e.g. `loading + needsUnlock`) are no longer representable. `detectStandalone()` extracted as a pure synchronous function callable inside an effect, eliminating the SSR/hydration race where the reactive hook would briefly return false then flip — the previous shape would have let auto-gen fire in the gap.

`getIdentity()` gains an `allowAutoGen?: boolean` option (default true for back-compat). Welcome gate path passes false; cross-tab storage sync passes false (a storage event should never auto-create). `IdentityContext` adds `acceptRestoredIdentity(wif, name?)` as the SINGLE entry point for the gate to commit a restored identity — calls `importIdentity` then `updateIdentity` in lockstep so localStorage + React state can't desync. New `clearSessionCaches()` export from `identity.ts` runs on `visibilitychange → hidden` in standalone mode (password-manager parity), and at the top of the cross-tab `storage` handler so a restore-in-tab-A is observed by tab B against fresh localStorage, not its own stale in-memory cache.

`HomeScreenWelcomeGate` redesigned restore-only with three modes (`buttons | passphrase | no-file`) — the no-file branch is pure-render and does NOT call `localStorage.setItem`, which is the whole point of this fix. `Feed.tsx` adds an inner `FeedOrWelcomeGate` wrapper that reads `awaitingWelcomeGate` from context and short-circuits to the gate BEFORE FeedContent mounts, so IdentityBar/Header/PostForm never see a null identity in the awaiting state.

Code-auditor dispatched twice (pre-write architectural verification + post-write security review of the diff). Final verdict: SAFE TO COMMIT. One High finding (cross-tab session-cache desync risk) applied as a 3-line fix in the same commit — call `clearSessionCaches()` at top of the storage handler. Type-check clean, 55/55 tests pass, Biome clean.

Next: Task 11 InstallPitch component (inline section + bottom banner).

## 2026-05-11 — Bucket 3a detection layer + iOS Safari polish

Category: Build, iOS polish, architectural foundation

Started Bucket 1 with `SignInModal` bottom-sheet refactor — first proof of the `flex items-end sm:items-center` / `rounded-t-2xl sm:rounded-2xl` pattern adoption (proven in AgentChat, now applied to a second modal). iPhone testing then surfaced the iOS Safari auto-zoom bug — fixed in `globals.css` with a single `@media (max-width: 640px)` rule forcing 16px font-size on all inputs (eliminates zoom-and-stay-zoomed on every input across the app, not just PostForm).

Real-world iPhone testing then revealed the bigger issue: multiple "Add to Home Screen" actions on iOS create isolated storage sandboxes, each silently generating a new identity. Two-round agent review (architect + designer + marketer) converged on splitting Bucket 3 into 3a (identity flow, no Bucket 4 dep) and 3b (notifications, needs Bucket 4). Revised sequence: 3a → 1 → 2 → 4 → 3b → 5. LAUNCH_PLAN.md updated with the split + per-component shape specs (welcome gate is full-screen takeover, install pitch is inline section + bottom banner, toasts match GoatModeToast pattern).

Bucket 3a detection layer landed (tasks 6–8): `useStandaloneMode` hook (display-mode + navigator.standalone with reactive listener), `useInstallPlatform` hook with `classifyUA()` pure function + 11 vitest cases covering Android Chrome/Samsung/Firefox, iOS Safari/Chrome, iPad-as-Mac, desktop Chrome/Edge/Firefox, `InstallContext` with `beforeinstallprompt` capture + `appinstalled` handling + 30-day suppression and `markEngaged()` permanent flag, plus `isSuppressedAt()` pure helper with 6 vitest cases. `InstallProvider` nested inside `IdentityProvider` in `Feed.tsx`. Type augmentation in `src/types/install.d.ts` so `beforeinstallprompt` types correctly without casts.

New memory `feedback_consult_before_implementation.md` codifies the new workflow: dispatch agent for approach review BEFORE writing code for each meaningful implementation chunk (skip for trivial mechanical edits). Five consult cycles ran this session (welcome-gate hierarchy, sequence reorder, useStandaloneMode, useInstallPlatform, InstallContext) — each took ~30s of agent time and prevented genuine misimplementations every time.

Next: Bucket 3a continues with HomeScreenWelcomeGate component (task 9).

## 2026-05-10 — Launch readiness: two-round multi-agent review + LAUNCH_PLAN.md

Category: Planning, architecture

Brainstormed cross-device / mobile launch readiness. Identified gaps: no in-app browser detection, no standalone-mode detection, no `beforeinstallprompt` capture, no service worker, six modals not bottom-sheet on mobile. Ran two rounds of agent review (architect, designer, code-auditor, marketer). Iterated on 12 open questions, converged to 12 confirmed decisions. Architect caught welcome-gate detection inversion (sync pre-hydration check), ITP toast sequencing collision, and TAAL deferral with miner-agnostic result type guardrail. Designer locked per-modal Tailwind class specs. Code-auditor validated QR sync cryptography model (5 required deltas, deferred to Bucket 6). Marketer locked notification and install-pitch copy.

Shipped: `LAUNCH_PLAN.md` (temporary working doc, lifecycle in memory `project_launch_plan_lifecycle.md`). Six strategic decisions promoted into `DECISIONS.md` under new "Platform & Distribution" heading. CLAUDE.md Context Files + ROADMAP.md Phase 6.5 updated with pointers. Next: begin Bucket 1 (mobile modal bottom-sheet refactor, SignInModal first).

## 2026-05-04 (cont. 3) — Recovery file: static render for iOS Quick Look

Category: Bug fix, recovery-file resilience

User reported: downloaded the recovery HTML on iPhone, opened it from Files app, saw no name, no address, no saved date, no WIF. Static elements (title, subtitle, offline badge, context block) rendered fine, but every dynamic field was blank.

**Root cause:** iOS Files app uses Quick Look (WebKit-based previewer) for HTML, and Quick Look does NOT execute inline JavaScript in local HTML files for security reasons. Same engine + same restriction applies to: iOS Mail preview, Messages preview, AirDrop preview, macOS Finder Quick Look. The previous template populated every dynamic field via `document.getElementById(...).textContent = BACKUP_DATA.X`, which left the file blank in any non-JS viewer.

**Architect agent dispatched** for full validation — confirmed the diagnosis (ruled out CSP/encoding/Blob URL/WebKit version), validated `escapeHtml` is sufficient for body context (self-XSS only threat), recommended fixed `en-US` locale for date stability across server locales, suggested 8 specific refinements all of which were incorporated.

**Shipped (1 file + 3 doc updates):**
- `src/services/bsv/backup-template.ts` — static-render every renderable field:
  - `formatSavedDate(createdAt)` helper added; uses `en-US` locale (not `undefined`)
  - Metadata card: name, address, saved date interpolated at template-build time via `escapeHtml(...)`
  - Plaintext WIF: interpolated directly into `.wif-value` div (no JS needed for plaintext files at all)
  - Hint: rendered statically inside encrypted-file decrypt card so iOS users can recognize their file
  - Footer stamp (`Recovery file · <pathType> · saved <date>`): static
  - Encrypted ciphertext (`wif_encrypted`, `oldWif_encrypted`, `oldAddress`) stays in JSON for JS-driven decrypt (no other choice — `crypto.subtle` requires JS)
  - `<noscript>` banner added above the decrypt card on encrypted files: amber/yellow informational treatment, copy explains *"JavaScript is required to unlock this file. You're previewing this in a viewer that doesn't run JavaScript (e.g. iOS Files, Mail preview, AirDrop preview, macOS Finder Quick Look). Open it in Safari, Chrome, or Firefox..."*
  - `.meta-value` gets `user-select: all` so iOS users can long-press-copy the address even when the JS Copy button is inert in Quick Look
  - Dead JS removed (the now-pointless `meta-name`/`meta-address`/`meta-date`/`footer-stamp`/`wif-display`/`hint-text` textContent setters)
  - Plaintext variantJs reduced to a single comment (no JS needed for plaintext at all)
- DECISIONS.md gains "Recovery file: static render for iOS Quick Look compatibility" entry (above the 2026-05-04 copy/layout polish entry).
- CLAUDE.md `backup-template.ts` paragraph extended with the static-render-for-Quick-Look section + en-US locale note + `.meta-value` user-select rule.

**Verification:**
- `tsc --noEmit` clean (0 errors)
- `biome check` clean on the changed file
- **Manual smoke test** via tsx: generated both plaintext and encrypted HTML, confirmed via grep that name/address/saved-date/WIF/hint/footer-stamp/noscript-banner all appear in the rendered HTML body (not just in the script-tag JSON). Address found at offset 8459, WIF at 9343, footer stamp at 9672 etc.

**Threat model unchanged.** The WIF was always in the rendered DOM after JS ran AND in the JSON inside `<script>`. Moving it to HTML body adds one more place inside the same file — but anyone with the file already has full access regardless of how they open it. Plaintext red banner (*"This file is not encrypted. Anyone who can open it can take your account."*) renders statically in both old and new templates, so iOS Quick Look users see the warning above the WIF. Architect explicitly signed off with no security regressions.

**Surfaces fixed (strict improvement, no new failure modes):**
- iOS Files Quick Look — fully fixed for plaintext, partial (everything except decrypted WIF) for encrypted
- iOS Mail / Messages / AirDrop preview — same engine, same fix
- macOS Finder Quick Look — same engine, same fix
- Email webmail attachment previews — strict improvement (most strip JS aggressively)
- Real browsers (Safari/Chrome/Firefox) — identical UX as today, no regressions

## 2026-05-04 (cont. 2) — GitHub surface: pill tease + modal footer

Category: UX, positioning, brand surface

User: "i am thinking we add github somewhere here whats your thoughts." Conversation evolved through three placement candidates with designer + marketer agents involved at each step.

**Iteration history:**
1. **Round 1** — Designer recommended header (icon-only beside chip); marketer recommended manifesto inline-text (contextually anchored to the open-source pitch). Disagreed on placement.
2. **User redirected:** "next to the ask ai" — agents converged on PostForm footer row (above the fold for everyone landing on the site).
3. **User refined further:** "what if we included the github icon in the pill, the agent chat opened and the github link logo is then clickable, visible within the chat?" — designer initially flagged that embedding a clickable icon would break the affordance, but user's refined version (icon decorative-only inside the pill, real link in modal footer) solved it cleanly.
4. **Both agents validated round 3** — pill tease + modal footer is the durable design. Discoverable via pill (above the fold), meaningful via modal footer (room for tagline).
5. **Visibility tuning:** initial design too quiet (text-zinc-700 on pill, text-zinc-600 footer). User pushed back: "i still cant see the github logo." Bumped to text-zinc-300 / 14x14 pill, text-zinc-300 / 16x16 centered footer.
6. **Manifesto path bug noticed:** user clicked "Chat with the agent" in the manifesto and noticed the GitHub icon disappeared. Was hidden during `highlight` state (the amber pulse). Wrong call — the manifesto path is the highest-intent moment for the open-source signal. Fixed: icon now shows in both normal and highlight states (amber-tinted in highlight to harmonize with the pulse).

**Shipped (1 file, 3 doc updates):**
- `src/app/AgentChat.tsx` (pill button at lines 159-185) — added `group` class, decorative octocat SVG (14x14, `text-zinc-300` normal / `text-amber-200/70` highlight) after "Ask AI" label.
- `src/app/AgentChat.tsx` (modal footer after input row) — new `<div className="border-t border-zinc-800/50 px-4 py-2.5 flex justify-center">` containing an `<a>` to `github.com/Challotes/bsvibes-` with octocat (16x16) + "The code is open." + `↗` arrow, `text-xs text-zinc-300 hover:text-zinc-100`.
- DECISIONS.md gains "GitHub link: pill tease + modal footer" entry with full rationale + anti-patterns (rejected: header link, peer icon next to pill, manifesto-only, live star count widget, embedded clickable icon).
- CLAUDE.md `AgentChat.tsx` paragraph rewritten to describe the dual-surface structure + the anti-pattern guard.

**Verification:** `tsc --noEmit` clean (0 errors), `biome check src/app/AgentChat.tsx` clean (after fixing one nested-ternary formatting nit).

**Tagline copy selected:** "The code is open." Marketer's pick over "Built in the open" (generic) and "Open source by design — every fork proves this works" (too long for modal context).

**Deferred:** marketer also recommended layering a manifesto closing line ("The code is open. The fairness rules are the moat.") for the user who reads but doesn't click into the modal. User chose dual-surface only for now (option a). Manifesto line remains a future-decision option.

## 2026-05-04 (cont.) — Close You modal on rotation/restore success

Category: UX, friction reduction

User reported: after clicking the Passphrase row → going through MoveAddressModal → clicking "Got it" on the done state, the wizard closes and the You modal pops up asking for the passphrase again. They asked why and whether other routes had the same problem.

**Root cause** (per architect agent): only the Passphrase route was affected. After successful rotation, `onClose` explicitly cleared `manageAuthed` + `reAuthPassphraseRef.current` because the cached old passphrase was stale under the new one. Documented as intentional in DECISIONS.md "Wizard auto-close split" (2026-04-30/05-01). Other routes (Restore, Save, Show recovery key) didn't re-lock because they didn't change the passphrase.

**First proposal** (architect, round 1): extend `MoveAddressModal.onComplete` signature to `(identity, newPassphrase)` so the parent can update the cached passphrase and keep the manage gate unlocked. Safe but solves at the wrong altitude.

**User's counter** ("after upgrade why not just not show the you modal? why is it even showing?"): close the You modal entirely on rotation success. Sidesteps the cache question — there's no You modal to be locked or unlocked.

**Architect round 2 validation:** ship the user's simpler fix. Rationale: post-completion, the user has nothing useful to do in the You modal — Save is redundant (the rotation file IS the save), Show recovery key + Restore would re-prompt and are nonsensical 3 seconds after rotation. The "load-bearing" half of the original "wizard auto-close split" decision was about making sure the user sees the wizard's done-state (completed steps + sats moved + safeguard copy) — all INSIDE the wizard. Keeping the You modal open underneath was incidental, not principled. Architect also flagged a parity bonus: RestoreModal `onSuccess` should also close the You modal, since otherwise it shows the previous identity's stale state.

**Shipped (1 file + 3 doc updates, single commit):**
- `src/app/IdentityBar.tsx` (MoveAddressModal `onClose` block at line ~441) — replaced `setManageAuthed(false) + reAuthPassphraseRef.current = ""` with single `closeManageModal()` call when `moveCompletedRef.current === true`. Cancel mid-wizard branch unchanged (You modal stays open under the original passphrase).
- `src/app/IdentityBar.tsx` (RestoreModal `onSuccess` block at line ~472) — added `closeManageModal()` after the existing `setShowRestoreModal(false)`. Comment notes the parity rationale.
- DECISIONS.md "Wizard auto-close split" — rewritten to reflect new behavior + recorded the rejected alternative (propagate-new-passphrase) so future agents don't relitigate.
- CLAUDE.md `MoveAddressModal.tsx` paragraph — updated to mention `closeManageModal()` on success + RestoreModal parity.

**Verification:** `tsc --noEmit` clean (0 errors), `biome check src/app/IdentityBar.tsx` clean (0 errors).

**Dead code noted (NOT deleted):** `src/components/ChangePassphraseModal.tsx` has zero import sites — it was superseded by MoveAddressModal absorbing the change-passphrase flow. Per Hard Rule #2 won't delete without user confirmation. Flagged for a future commit.

## 2026-05-04 — Recovery file copy & layout polish (round 2)

Category: UX, copy, recovery-flow polish

User reviewed yesterday's backup overhaul output and flagged three issues: (1) the public address was being shown twice (in the metadata card AND inside each WIF block), (2) the previous-WIF block stacked two warnings that mostly repeated each other, and (3) the file didn't actually explain to the user where their posts/earnings live or what "previous" means. Asked me to dispatch agents to audit the full layout and copy.

**Agents dispatched in parallel:** designer (layout/visual hygiene) + documentation-writer (copy/explainer language). Both converged on the same direction; doc-writer pushed further on copy (kill the green privacy banner, replace generic subtitle, soften "Decryption successful" to "Key unlocked"). User picked recommended bundle (a) with one tweak: apply "secret key" terminology where appropriate (matching the existing `IdentityBar:797` pattern *"Secret key — handle with care"*).

**Shipped (1 file rewrite + 3 doc updates, single commit):**
- **Layout dedup:** removed the "Current public address" row + address-note italic from inside the current-WIF block (encrypted) and the plaintext WIF card. Address now appears once, in the metadata card, with an inline Copy button. Previous-public-address row stays inside the previous-WIF block (only place it's available).
- **Per-variant context block** beneath the metadata card. Five variants drafted: `save`-encrypted ("Posts and earnings are tied to the address above"), `save`-plaintext ("Because no passphrase was set, the secret key inside is readable by anyone..."), `rotation` ("Your account has moved. Posts and earnings now go to the address above. This file holds both keys..."), `pre-rotation` ("Temporary checkpoint... an updated file supersedes this one"), `restore-pre` ("Snapshot of the account that was on this device before you restored").
- **Previous-key warning consolidated** to one paragraph: *"⚠ **Previous secret key.** Your posts and earnings have moved to your current address — this key is only here in case any funds were in transit during the move. Treat it with the same care as your current key: anyone who has it controls that address. Never share it — not with support, not with friends, not with anyone."*
- **"Secret key" terminology** applied. WIF labels: *"Your secret key (WIF)"* / *"Previous secret key"*. Decrypt label: *"Enter your passphrase to unlock your secret key"*. Current-key warning: *"Anyone who has this secret key controls your account..."*. Pattern: feature/file = "recovery" (recovery file, Show recovery key row), value inside = "secret key".
- **Subtitle generic-ised** to *"Keep this file somewhere only you can find it."* — context block now does the variant-specific framing.
- **"Decryption successful" → "Key unlocked"** (warmer, shorter, consistent with the unlock framing of the decrypt label).
- **Metadata Address label** flips to *"Current address"* on rotation files (where the file contains both current + previous keys), stays as *"Address"* everywhere else.
- **Green "Private & Offline" banner removed** as cargo. Three places saying "no network calls" (banner, offline badge, footer) was bloat. Offline badge stays; the HTML comment `<!-- No network calls. Verify: View Source. -->` is the actual proof for anyone who cares to verify.
- **Footer trimmed** to a small monospace stamp `Recovery file · <pathType> · saved <date>` + bsvibes.com link. Stamp helps support tickets ("user sent me a screenshot — what variant?") without taking up real estate.
- **Universal `copyText(id, btn)` JS helper** hoisted out of the variant-conditional `jsSection` into the always-loaded script block, so both the metadata Address row and the previous-address row use one implementation.
- **CSS additions:** `.context-block`, `.meta-row.with-copy`, `.meta-copy-btn` + states, `.wif-warning strong`, `.footer-stamp`. **CSS removed:** `.privacy-banner` family (banner gone), `.address-note` (no longer rendered).

**No call-site changes needed** — all 4 callers (MoveAddressModal, ChangePassphraseModal, RestoreModal, IdentityBar) keep the same `BackupData` shape they already pass. Schema is unchanged.

**Verification:** `tsc --noEmit` clean (0 errors), `biome check` clean (after fixing 2 single-vs-double-quote nits the linter caught on the new Copy-button HTML literals).

**Docs updated in same commit:** DECISIONS.md gains "Recovery file copy & layout polish" entry above the existing 2026-05-03 backup overhaul entry; CLAUDE.md `backup-template.ts` paragraph rewritten to reflect the new layout structure + don't-do list.

**Ruled out / deferred:** sr-only h2 headings for screen reader navigation (low priority, can ship later as a standalone a11y pass).

## 2026-05-03 (cont. 3) — Backup file audit & overhaul

Category: Security, UX, recovery-flow hardening

User asked for an end-to-end audit of every download/display surface that exposes a WIF key — was every file encrypted with the user's current/new passphrase, what did the file contain, was the filename useful? Spent the session walking through 9 surfaces (You-modal Save plaintext + encrypted, MoveAddressModal stage-1 + stage-3, ChangePassphraseModal completion, RestoreModal pre-overwrite × 2, Show recovery key, post-decrypt result section in the HTML template) and resolving 7 decision topics one at a time with the user.

**Decisions made (paraphrased, see DECISIONS.md "Backup file audit & overhaul" for canonical version):**
1. **On-demand "Save" downloads stay single-key by design** — the combined-file pattern is rotation-only. Refines the 2026-04-30 "combined recovery file" decision (which was implicitly all paths but practically only ever used at rotation time).
2. **Public address shown above every WIF in the HTML template**, with a Copy button on the address only.
3. **Copy buttons removed from every WIF surface in downloaded files** — the address-only Copy + `user-select: all` on the WIF text means a user who really wants the raw key can still triple-click+copy via OS shortcut, but the "one keystroke from clipboard" threat model no longer applies. Show recovery key (in-app) keeps its Copy button — the manage gate + acknowledgement is sufficient defense for in-session reveal.
4. **Red warning beneath every WIF**: "Anyone who has this key controls your account and any funds in it. Never share it — not with support, not with friends, not with anyone." Previous-key blocks gain an extra "may still hold funds if the transfer was skipped" line above the share warning.
5. **Plaintext-WIF files get a red banner above the card** ("This file is not encrypted. Anyone who can open it can take your account.") and the privacy-banner is hidden (the red signal would otherwise compete).
6. **Done-state for ChangePassphraseModal** now matches MoveAddressModal — a `'done'` step with "Download again" + "Got it" buttons and copy explaining the file contains both keys. Replaces the prior auto-close so the user sees completion before dismissing.
7. **Filename pattern** `bsvibes-<pathType>-<anon_name>-<addr6>[-to-<newAddr6>]-<YYYY-MM-DD-HHmm>.html`. `addr6 = address.slice(1, 7)` (skip leading `1` of P2PKH, take next 6 chars). `-to-` (not `>`) between addresses because Windows reserves `>`. anon_name kept verbatim (sanitised to `[a-zA-Z0-9_]` with `-` fallback) so users can correlate files to identities.

**Shipped diff (5 files, 1 commit):**
- `src/services/bsv/backup-template.ts` — `BackupData` adds required `pathType` and optional `oldAddress`. `downloadBackup` signature changed to `(data)` only — filename auto-built via new `buildFilename` helper. HTML template gains `addressSectionHtml` + `wifWarningHtml` helpers, `plaintext-banner` / `address-section` / `address-note` / `wif-warning` styles, plaintext-file privacy-banner suppression, and the post-decrypt result section now displays current/previous addresses above each WIF block.
- `src/components/MoveAddressModal.tsx` — stage-1 backup `pathType: "pre-rotation"`; stage-3 `pathType: "rotation"` with `oldAddress: identity.address`. `combinedBackupRef` captures the rotation `BackupData` for "Download again".
- `src/components/ChangePassphraseModal.tsx` — added `'done'` step, `doneBackup` state, replaced auto-close with `setStep('done')`. `pathType: "rotation"` with `oldAddress: undefined` (address unchanged) — single-`addr6` filename, dual-key body.
- `src/components/RestoreModal.tsx` — both pre-overwrite backups use `pathType: "restore-pre"`.
- `src/app/IdentityBar.tsx` — both Save paths (`doDownloadPlaintext`, `handleSaveEncrypted`) use `pathType: "save"`. No `oldAddress` — single-key files by design.

**Verification:** `tsc --noEmit` clean (0 errors), `biome check` clean on all 5 changed files, all `downloadBackup` call sites grepped — every caller passes `pathType` and no caller passes a filename.

**Docs updated in same commit:** DECISIONS.md (new "Backup file audit & overhaul" entry), CLAUDE.md (refreshed `backup-template.ts`, MoveAddressModal, ChangePassphraseModal, IdentityBar paragraphs).

**Ruled out / deferred:** Re-prompt at Show recovery key reveal (the Reveal acknowledgement gate is sufficient), Copy buttons inside downloaded recovery files (security regression vs. negligible UX loss), `>` separator in filename (Windows-reserved character).

## 2026-05-03 (cont. 2) — Sign-in trigger rewrite: centered modal, no global catcher

Category: UX, architecture (supersedes the same-day ambient-pill + universal-contract decisions)

User refined the spec across multiple iterations: site should look 100% signed-in even when locked, read-only actions (AI chat, scrolling, reading) must NEVER trigger sign-in, and the trigger must be co-located with the action that needs the wallet. After three rounds of architect + designer + code-auditor review, the answer was Design 1: per-handler `requireIdentity()` guard + centered `<SignInModal>` triggered only by transaction handlers.

**The decisive realisation:** the global `LockedClickCatcher` was firing on every interactive pointerdown — including chip clicks, menu opens, and any future read-only interaction — which violates the "reading is silent" principle the user articulated. No "is this interactive" heuristic can distinguish read from write reliably; the catcher had to go.

**Rejected paths (all considered with agent review):**
- `requestIdentity(): Promise<Identity>` with auto-replay — user explicitly ruled out auto-replay ("just let them sign in and attempt again"), which collapses the promise to dead code.
- `Wallet` capability abstraction wrapping `clientSideBoot`/`signPost` — wrong altitude, would refactor the most security-sensitive code in the repo to save one line per future feature; a thin façade is a one-afternoon migration if scale ever demands it.
- Marker attribute (`data-needs-wallet`) + narrowed catcher — keeps the global listener tax and requires rewiring every button's disabled state.

**Shipped diff (~7 files modified, 1 new, 1 deleted, mostly deletion):**
- `src/services/bsv/identity.ts` — added `getStoredAnonName()` reading `bfn_keypair_enc.name` plaintext (no decryption).
- `src/contexts/IdentityContext.tsx` — full rewrite: deleted `IdentityShakeSignalContext` + `IdentityShakeKeyContext` + `useIdentityShake` + `useIdentityShakeKey` + `signalLockedAttempt` + sibling-Provider wrappers. Added `signInOpen`, `openSignIn()`, `closeSignIn()`, `requireIdentity(): boolean`, plus `useRequiresIdentity()` ergonomic hook.
- `src/components/SignInModal.tsx` (new) — centered modal, passphrase input + Enter + "Need a hint?" two-step reveal. Wrong-passphrase shake is LOCAL state. Closes on backdrop / Escape / tab blur (password-manager parity, clears input).
- `src/app/IdentityBar.tsx` — deleted ambient pill, popover, all unlock-related state (`unlockPassphrase`, `unlockShaking`, `unlockExpanded`, `unlockCollapseTimerRef`, etc.), the shake-from-context subscription, the 8s auto-collapse timer, the `data-unlock-ui` markers. Chip now always renders the cached anon name (`getStoredAnonName()`) when no `identity`. Click on locked chip routes to `openSignIn()`.
- `src/app/PostForm.tsx`, `src/app/PostList.tsx`, `src/app/Bootboard.tsx` — replaced `signalLockedAttempt()` calls with `requireIdentity()`. Pattern: `if (!requireIdentity() || !identity) return;` (the `|| !identity` is a TypeScript narrowing guard).
- `src/app/Feed.tsx` — replaced `<LockedClickCatcher />` with `<SignInModal />`.
- `src/components/LockedClickCatcher.tsx` — deleted entirely.

**Verification:** `tsc --noEmit` clean, `biome check src/` clean, grep for orphan references (`signalLockedAttempt`, `useIdentityShake`, `useIdentityShakeKey`, `LockedClickCatcher`, `data-bypass-lock-shake`, `data-unlock-ui`) returns zero matches in `src/`.

**User journey shipped:**
1. Locked user lands on site → sees `anon_xxxx` chip, reads feed, opens AI chat, scrolls — completely silent
2. Types a post, hits Enter → centered modal pops up: "Sign in to continue"
3. Enters passphrase → `unlockIdentity` + `updateIdentity` fire, modal closes
4. Retaps Enter → post sends normally

Files changed: `src/services/bsv/identity.ts`, `src/contexts/IdentityContext.tsx`, `src/components/SignInModal.tsx` (new), `src/app/IdentityBar.tsx`, `src/app/PostForm.tsx`, `src/app/PostList.tsx`, `src/app/Bootboard.tsx`, `src/app/Feed.tsx`, `src/components/LockedClickCatcher.tsx` (deleted), CLAUDE.md, DECISIONS.md.

## 2026-05-03 (cont.) — Universal "transaction action requires sign-in" pattern

Category: UX, architecture

User wanted a universal pattern that scales to any future transaction action across any site built on the toolkit. After two rounds of agent brainstorming, the answer was much simpler than the first attempt at it.

**First attempt (rejected mid-flight).** Started a wholesale refactor adding `requestUnlock(): Promise<Identity>` on IdentityContext + a `useGuardedAction(fn)` hook + a centered `UnlockModal` + cached-chip pattern + BootContext synchronous-claim rewrite. Touched ~7 files. User stopped it: "we're doing unnecessary work here." Reverted via `git checkout -- <files>` + `rm UnlockModal.tsx`. Working tree cleanly back at `48264b3`.

**Second attempt (shipped).** User reframed: drop the auto-replay machinery entirely. Telegram/X/Slack convention is tap-twice — none auto-replay after auth. Both architect and code-auditor agreed: without auto-replay, the whole `useGuardedAction` / `requestUnlock` abstraction collapses to dead code (a promise nobody awaits is a function call). The minimal universal pattern is one line: `if (!identity) { signalLockedAttempt(); return; }` at the top of every transaction-action handler. `LockedClickCatcher` stays mounted as the safety net for any future surface that forgets the explicit guard.

**Pre-implementation audit confirmed nothing to revert.** Auditor verified the four recent commits (`295e6fa` `4f4230a` `8e1d534` `48264b3`) are sound — `LockedClickCatcher`, sibling shake contexts, ambient pill, 8s-timer fix all stay. Only the auto-replay block in PostForm needed removal. Confirmed via grep that nothing from the first-attempt refactor leaked into committed code (no `requestUnlock`, `useGuardedAction`, `UnlockModal`, `bootingPostIdRef`, or cached-chip references anywhere in `src/`).

**Diff** — three files, subtractive:
- `src/app/PostForm.tsx`: deleted `pendingSubmitRef` + auto-submit `useEffect`. Locked-submit branch is now just `signalLockedAttempt(); return;`. Dropped `disabled={!identity}` from send and mic buttons. Kept `disabled={!identity && !needsUnlock}` on textarea (gates "still loading" state, not lock state).
- `src/app/PostList.tsx`: BootButton's `canBoot` no longer requires identity. `handleBoot()` early-returns + signals shake when locked. Imported `useIdentityShake`.
- `src/app/Bootboard.tsx`: Same pattern in HistoryRow's `handleReboot()`. Dropped `!identity` from disabled clause.

`tsc --noEmit` clean, `biome check` clean. `LockedClickCatcher` and IdentityBar untouched.

Files changed: `src/app/PostForm.tsx`, `src/app/PostList.tsx`, `src/app/Bootboard.tsx`, CLAUDE.md, DECISIONS.md.

## 2026-05-03 — Locked state: ambient pill + idea preservation

Category: UX, architecture

User pushback on the locked card from yesterday: "the main unlock on locked site looks huge ... the passphrase section could almost be unnoticible until the user wants to take an actual action ... maybe we should allow the user to type their thought before entering the passphrase, by time they type their passphrase their idea could be gone."

Designer + architect agents brainstormed alternatives. Converged on an ambient pill that matches the identity-chip bounding box. Single commit (`4f4230a`).

**IdentityChip locked branch.** Replaced the 280px passphrase card with a `🔒 Sign in` pill (rounded-full, amber border, same padding as identity chip). Click expands a small popover anchored below: input + "Enter" button + "Need a hint?" text link. Hint reveal is two-step (click "Need a hint?" → hint shows inline in amber). Dropped the 💡 lightbulb entirely. Shake (from `LockedClickCatcher`) auto-expands the popover for 8s — a 28px element shaking alone would be invisible; the expand makes it unmissable. Autofocus only on user-clicked expand, never on shake-triggered expand (mobile focus-trap concern: would steal focus from a textarea the user is mid-typing).

**PostForm idea preservation.** Textarea is now ENABLED when `needsUnlock && !identity`. Placeholder stays `"Share an idea..."` — the lock doesn't pre-announce itself. `submitForm` when locked: sets `pendingSubmitRef`, calls `signalLockedAttempt()` (chip shakes + expands), early-returns WITHOUT calling `onPostCreated` (no phantom post in feed). New `useEffect`: when identity arrives AND `pendingSubmitRef` is set, auto-submits the buffered draft via `performSubmit`. Pure instant submit — no "Sending..." beat (designer call). `performSubmit` extracted + wrapped in `useCallback` so the auto-submit effect can depend on it cleanly without stale-closure risk.

**Verbiage:** "Sign in" (chip) + "Enter" (button), per designer. Both "Login" (implies server account) and "Unlock" (carceral framing) rejected for the BSV builder mental model. Password manager precedent: 1Password, Bitwarden.

**References that validated the pattern:** 1Password locked vault (closest analogue — ambient lock, browsable content, single-line auth row on first action), macOS screen saver, Notion offline mode, Slack offline typing.

Pre-commit code-auditor pass verified all critical paths: textarea content survives the unlock flow (uncontrolled ref, PostForm doesn't unmount), no phantom post (early-return BEFORE `onPostCreated`), no green-flash on locked attempt (`setJustPosted` only inside `performSubmit`), single-fire on auto-submit (`pendingSubmitRef` cleared before call), no auto-collapse timer leaks, mobile focus trap avoided.

Files changed: `src/app/IdentityBar.tsx`, `src/app/PostForm.tsx`, CLAUDE.md, DECISIONS.md.

## 2026-05-02 (cont.) — Unlock UI rebrand + global shake catcher

Category: UX, architecture

Two-part change.

**Cold-load unlock UI restyled to match the You modal locked-state.** The `needsUnlock && !identity` branch in `IdentityChip` was missed in the Stage 6 amber rebrand — still used emerald lock icon, zinc-800 borders, and a white-on-black button. Now: `border-amber-400/20`, gold top stripe, `#0f0f0f` bg, lock icon `text-amber-400/70`, header `text-sm font-semibold text-zinc-100` (was `text-xs text-zinc-300 font-medium`), input `border-amber-400/15` with amber focus, primary button amber. "Need a reminder?" toggle removed entirely — the hint shows immediately as the You-modal `💡` amber-left-border treatment (designer call: cold-load is more stressful, not less). PostForm placeholder also gains "Locked — enter passphrase to post" copy when `needsUnlock && !identity`.

**Global shake-on-locked-action.** New `LockedClickCatcher` component (mounted inside `IdentityProvider` in `Feed.tsx`) registers a `document.addEventListener("pointerdown", ..., {capture: true})` whenever `needsUnlock && !identity`. On a pointerdown landing on an interactive element (`button, a[href], input, textarea, select, label, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])`) outside the unlock card (excluded via `data-unlock-ui="true"` on the unlock card root) it calls `signalLockedAttempt()` from the new sibling `IdentityShakeContext`. IdentityChip subscribes to the resulting `shakeKey` counter and applies `animate-[shake_0.5s_ease-in-out]` for 550ms. Wrong-passphrase entry on the unlock UI also fires the same shake — free reuse of the physical signal, error text differentiates the semantic. Animation reuses the existing `@keyframes shake` from `globals.css` (already used by `Bootboard` for holder-change).

**Architecture rationale (recorded in DECISIONS.md):** chose global pointerdown-capture over per-site wiring after both architect and code-auditor reviewed alternatives. Per-site approach was prototyped, audited, then rejected because it (a) leaks lock-state coupling into every identity-required feature, (b) forces "looks-disabled-but-clickable" hacks that contradict `disabled={!identity}` honesty, (c) requires every new feature to remember the wiring forever. Auditor caught a critical bug in the global-capture spec — using `click` capture would silently fail because disabled form controls suppress click events per HTML5 spec; switched to `pointerdown` (W3C Pointer Events DO fire on disabled elements). Sibling `IdentityShakeContext` split into `useIdentityShake` (stable callback) + `useIdentityShakeKey` (counter) prevents counter mutation from re-rendering unrelated consumers. Opt-out via `data-bypass-lock-shake` for future features needing a different signal.

Files changed: `src/components/LockedClickCatcher.tsx` (new), `src/contexts/IdentityContext.tsx` (sibling shake context), `src/app/IdentityBar.tsx` (unlock UI restyle + `data-unlock-ui` + shake subscription + wrong-passphrase signal), `src/app/Feed.tsx` (mount), `src/app/PostForm.tsx` (placeholder copy only), CLAUDE.md, DECISIONS.md.

## 2026-05-02 — You modal polish: icon color, activity reset, goat-default

Category: UX, behavior

Three bundled changes to the identity card after live brand-discussion + designer + architect + code-auditor passes. Single commit (`e5a1573`).

**Passphrase icon neutralized when protected.** Previously stayed amber after upgrade — kept drawing attention to a settled state. Now `text-zinc-400` when protected, `text-red-400` when unprotected. Color is reserved for active warnings (red unprotected, amber unsaved-backup). User design call after agent debate; settled middle path between full-amber and current.

**closeDropdown also resets activityExpanded.** "View all N" sub-disclosure was the only one that persisted across reopen, inconsistent with `showAdvanced`/`keyRevealed`/`copied`. Two stray `setOpen(false)` paths (Not protected banner click, Add funds link) routed through `closeDropdown` for consistent reset semantics. Architect-reviewer audited all 30 useState entries in `IdentityChip` to confirm no other state needed touching — `chartExpanded` (default-true) deliberately excluded; `addressCopied`/`transferStatus` are minor sister-inconsistencies left for a future pass.

**Currency display defaults to Goat on protected accounts.** `useCurrencyMode` gained protection-aware default (reads `bfn_keypair_enc` synchronously in lazy initializer to avoid `$ → sats` first-paint flash), `hasUserChosen` flag (derived from localStorage presence of `bsvibes_currency_mode`), and `setModeProgrammatically` (in-session switch that does NOT mark as chosen, so reload still re-applies the protection-aware default). New `GoatModeToast` (positive amber styling, auto-dismiss 6s) fires once ever — gated by `bsvibes_goat_welcome_shown` — when a user transitions from unprotected to protected without having toggled. User's explicit toggle (in either direction) is honored forever once set. Code-auditor pre-commit pass verified: no infinite loop, state coherence holds across reload, hydration-safe in client boundary, multi-tab race is cosmetic and acceptable.

Brand discussion sidebar (no code): explored renaming BSVibes → OpenCook for builder-targeted positioning. User owns `opencook.fun`; .ai is taken by a Solana token launchpad but considered low-traffic and not blocking. Rebrand mechanics deferred until launch. No DECISIONS.md entry yet — name not yet ratified, deferred.

Files changed: `src/app/IdentityBar.tsx`, `src/hooks/useCurrencyMode.ts`, `src/components/GoatModeToast.tsx` (new), CLAUDE.md, DECISIONS.md.

## 2026-05-01 (cont.) — Documentation audit pass (5 batches)

Category: documentation

Cross-checked all 9 MDs against the current codebase after Stage 8 + Path B deferral. Three parallel auditor passes surfaced 14 inaccuracies grouped into 5 batches; each shipped as its own commit.

**Batch 1 (69220d8) — UpgradeModal scrub.** Removed live references to the deleted `src/components/UpgradeModal.tsx` from CLAUDE.md (UX Principles "Exception" line) + DECISIONS.md ("5-minute window" / "Security upgrade model" / "Memory clue mandatory" all rerouted to MoveAddressModal). Stage notes that historically describe UpgradeModal kept verbatim — they document past state.

**Batch 2 (9cb51a6) — Missing inventory + Stage 8 decisions.** CLAUDE.md gained `BootContext` (single-flight + 3s throttle), `verifyMigrationChain` server action, and `preVerifiedPassphrase` on ChangePassphraseModal. DECISIONS.md "Asymmetric re-prompt" and "Wizard auto-close split" entries refined for the Stage 8 reveal-acknowledge gate + `moveCompletedRef` pattern; new "Locked-state You modal pattern (settled 2026-05-01)" decision added.

**Batch 3 (b6e3fc8) — ROADMAP Stage 8 rewrite.** Stage 8 entry converted from planning-doc format to DONE summary with `Shipped` / `Explicitly rejected` / `Considered, deferred` sections — eight commit references (645aec2 through 9785332, plus 4e37f3c bug fix). Stages reordered chronologically (5 → 6 → 7 → 8). Phase 6.5 status header `PLANNED` → `IN PROGRESS` (8 sub-stages now done; remaining items are server-side resilience + SSE work).

**Batch 4 (8e18474) — SECURITY_AUDIT status updates.** C4 (auto-download backup missing old key) marked **FIXED** — Stage 7 combined-recovery-file pattern (`oldWif_encrypted` alongside `wif_encrypted` under one passphrase) closes the original risk; Stage 6 removed plaintext rotation from primary UI; sweep failures block rotation rather than silently committing. M6 (WIF reveal no auto-hide) gets a partial-mitigation note pointing at Stage 8 C6 ack-gated reveal.

**Batch 5 (1a8e942) — Cosmetic + FAIRNESS migration-chain section.** CLAUDE.md actions.ts inventory split into reads (no signature) vs sig-verified mutations; surfaces previously-missing getNewPosts/getUpdatedPosts/getOlderPosts. DIRECTION.md `BS Vibes` typo → `BSVibes`. New `Migration Chain Resolution` subsection in FAIRNESS.md documenting how `weights.ts` walks `from_pubkey → to_pubkey` to keep contribution history across rotations, references C7 fork repair logic, `verifyMigrationChain` pre-rotation check, and the 30s weight cache. README placeholder URL (`your-org/bsvibes`) left as-is pending GitHub org choice for public release.

Files changed: `CLAUDE.md`, `DECISIONS.md`, `ROADMAP.md`, `SECURITY_AUDIT.md`, `DIRECTION.md`, `FAIRNESS.md`. No code changes.

## 2026-05-01 (cont.) — Identity-modal consistency refactor (CONSIDERED, DEFERRED FOR NOW)

Category: planning

User noticed the three actionable rows in the You modal behave inconsistently: Passphrase opens MoveAddressModal as a `max-w-md` overlay with side-by-side buttons; Restore opens RestoreModal as a `max-w-sm` overlay with stacked buttons; Show recovery key expands inline.

Designer recommended **Path B** — convert all three to inline body-swaps inside the You modal (the locked-state pattern just shipped in Stage 8 as precedent). Code-wise this would delete ~60 lines of duplicate modal chrome and centralize identity-management UI in one container.

Architect produced a detailed 7-step plan. **Code-auditor adversarial review of the plan flagged 4 real bugs and 1 missed concern** — most seriously, tab-blur during the wizard's `creating`/`recording` stages could leak in-flight broadcast transactions without committing the new key locally, creating a fund-loss scenario. Other findings: stale `keyRevealed` on mode swap, stale `pendingRestoreWif` on back-chevron, `_rotationInProgress` lock leak on body unmount, identity-prop capture race with `commitUpgrade`.

**Decision: defer the refactor for now.** The settings flow is rarely visited; each modal individually works correctly today. The inconsistency only manifests on rapid cycling between all three rows, which users don't do. The risk of breaking blockchain-state-mutating code paths to fix a low-traffic visual inconsistency is not worth it on a "ship it without breaking anything" requirement.

**Revisit when:** user feedback specifically flags the inconsistency, OR the team has bandwidth for a careful Path B implementation with explicit mitigations for all 5 findings + manual end-to-end testing of every wizard stage. Not as proactive polish.

No code changes this session. Architect's plan and skeptic's bug list are preserved in agent transcripts; can be re-loaded if the work resumes.

## 2026-05-01 (cont.) — Stage 8 Implementation (DONE)

Category: UX, copy, architecture

Implemented all locked-in Stage 8 decisions across seven batches, each gated by a code-auditor pre-commit pass.

**Batch 1 (645aec2):** A3 + Bonus — deleted dead `backupConfirmed` state + render block (~30 lines), deleted orphaned `src/components/UpgradeModal.tsx`. Auditor surfaced unused `PassphrasePrompt` import in IdentityBar — also removed.

**Batch 2 (bbe8244):** R4 + R5 partial + R7 + R8 + R10 — copy refinements. Show recovery key row subtitle "Secret key — handle with care". Two validation errors trimmed. MoveAddressModal subtitle to "Choose a passphrase". Empty activity state turned into a CTA. Memory clue red helper rewritten without "plain text" jargon.

**Batch 3 (028658d):** R2 — Restore row subtitle reframed to action-led "Imports posts and earnings from a saved key" (resolves the "stay on this one" pronoun ambiguity flagged by both designer and marketer agents).

**Batch 4 (080596e):** C1 + C3 + C4 — UI cuts. Dropped pulse from "Not protected" banner. Done-state amber block 6 sentences → 3. RestoreModal red body drops duplicate. Bonus: removed unused `isIdentityEncrypted` import from RestoreModal.

**Batch 5 (db4beba):** C6 — Show recovery key panel rework. Added red warning ("Anyone with this key owns your account and any funds in it. Never share it."). Replaced two-step Show→Copy with acknowledgement-gated Reveal that splits into side-by-side Hide/Copy on click.

**Batch 6 (05c6624):** A2 — RestoreModal `onSuccess` now atomically marks `backedUp = true` (the file just restored IS the backup). Dropdown banner click handler collapsed to single `handleSaveFile` path; removed the 3-click protected-user detour.

**Batch 7 (9785332):** A1 — biggest structural change. Two stacked modals (manage gate + You modal) → single You modal with locked/unlocked internal states. Body fades on transition. Auto-focus input on locked-state mount. Deleted ~63 lines of gate JSX.

**Rejected (validated by second-opinion agents, do not relitigate):** C2, C5, R1, R3, Passphrase row label.

**Deferred:** R6/R9 manage gate copy — finalized inline as part of A1 (the new locked body shows just the passphrase input + hint + buttons, no header/subtitle).

Files changed: `src/app/IdentityBar.tsx`, `src/components/MoveAddressModal.tsx`, `src/components/ChangePassphraseModal.tsx`, `src/components/RestoreModal.tsx`, `CLAUDE.md`, `ROADMAP.md`, `SESSION_LOG.md`. Deleted: `src/components/UpgradeModal.tsx`.

Verified: tsc clean, biome clean across every batch. Each batch had its own auditor pre-commit pass before committing.

## 2026-05-01 — Stage 8 Planning Session (no code changes)

Category: planning, multi-agent UX review

Deep review of every word, button, click path, and stage in the identity card + You modal + sub-modals. No code modified — full session was reviewing copy + architecture + flow with parallel agent feedback (designer, marketer, architect, code-auditor) and locking decisions for Stage 8.

**What was reviewed:** identity chip, dropdown (header / backup banner / not-protected banner / earnings hero / activity / balance / Manage button), manage gate, You modal (Save row / Passphrase row / Restore row / Show recovery key row), MoveAddressModal (every stage), RestoreModal, error/validation states.

**Key findings driving Stage 8:**
- Manage gate as a stacked modal is heavy — user proposed treating it as the locked state of the You modal itself (one container, two states). Designer endorsed enthusiastically.
- `backupConfirmed` state is dead code from Stage 6 cleanup miss. Auditor confirmed safe to delete.
- `UpgradeModal.tsx` is orphaned since Stage 6 — not imported anywhere.
- `RestoreModal.onSuccess` doesn't set `BACKED_UP_KEY` — the only legitimate path to `isProtected && !backedUp` state. Architect-flagged.
- Dropdown backup-banner click handler has a 3+ click detour for protected users that's largely unreachable post-Stage 7. Collapse the branch.
- Show recovery key row needs a forcing-function warning before the Show/Copy controls, not as decoration.
- Several copy items (Restore subtitle pronoun ambiguity, plain-text jargon in memory clue helper, validation error length, MoveAddressModal subtitle redundancy) need precision.

**Decisions explicitly rejected after agent re-validation:**
- Three "Move it somewhere safe..." repetitions stay identical (temporal distance argument validated)
- Currency toggle keeps "Goat/Noob" emotional framing (load-bearing)
- Passphrase row subtitle stays — pre-empts wizard surprise
- ALL-CAPS section labels stay (Stripe/Linear/Vercel pattern)
- Passphrase row label stays "Passphrase" (user chose noun over marketer's verb-led pattern)

**No code changes this session.** Full implementation plan with batched order documented in ROADMAP.md under "Stage 8 — Identity card deep polish (PLANNED, decisions locked 2026-05-01)". User to resume implementation in next session starting with batch 1 (A3 + UpgradeModal deletion).

Files changed: `ROADMAP.md`, `SESSION_LOG.md` (this entry).

## 2026-04-30 — Manage Gate + Combined Backup + Done-State Polish (Stage 7)

Category: UX, security, copy

Follow-up to Stage 6 closing the loose ends in the You modal + key-rotation flow.

**Single-passphrase manage gate.** The You modal now verifies the passphrase once on entry, then unlocks all eligible actions (Passphrase, Move) while the modal is open. Session is destroyed on modal close OR tab blur — same pattern password managers use. Removes the prior friction of re-entering the passphrase per action. Show recovery key + Restore still re-prompt (asymmetric theatre vs real security debated with architect agent — accepted that consistent re-prompts on truly destructive actions are worth the friction).

**Move + Passphrase merged into one row.** Both flows called identical primitives (`upgradeIdentity` + migration + backup). Collapsed into a single "Passphrase" row that opens `MoveAddressModal`. Restore row mirrored with parallel "Move to a saved key" subtitle so the two are visually paired.

**Combined recovery file.** Stage-3 download now contains both `wif_encrypted` (new key) and `oldWif_encrypted` (old key under new passphrase). One file, one passphrase, both keys recoverable. Supersedes the temporary stage-1 file. Note copy reframed.

**Auto-close timing bug fixed.** Previously `onComplete` in `IdentityBar` closed the wizard immediately when stage hit `done`, so the user never saw the completed steps, sats-moved confirmation, or safeguard copy. Split into two phases: `onComplete` updates identity state only (parent stays mounted); `onClose` (Continue button / X / backdrop on done) is the single dismissal path.

**Done-state safeguard copy.** Extended the amber block above the Continue button with the file-and-passphrase mutual-dependency reminder: *"Keep this file somewhere safe — a cloud drive, a USB stick, away from this device. Your passphrase is the only thing that opens it. **Without both, you cannot recover your account.**"* Marketer agent recommended extending the existing amber block over adding a separate one (avoids fragmentation, single attention container). Designer agent recommended amber over red: red after green checkmarks reads as contradiction. Critical sentence bolded in `text-amber-300` for typographic weight.

**Memory clue autocomplete off.** Hint inputs on all three passphrase modals (Move/Change/Upgrade) now have `autoComplete="off"` + `autoCorrect/Capitalize="off"` + `spellCheck={false}` — browsers no longer surface previously-entered memory clues from saved form history.

**Em-dash entity fix.** Three JSX text nodes were still using literal `—` escape sequences which JSX text content doesn't decode. Replaced with `&mdash;` HTML entities (matching the `&apos;` precedent already in those same lines). Other `—` usages inside JS string expressions (props, ternaries) work correctly and were left alone.

**Address → key.** User-facing copy refined throughout the wizard. "Address" is BSV jargon; "key" is what the user actually controls and what the recovery file contains.

Files changed: `src/app/IdentityBar.tsx`, `src/components/MoveAddressModal.tsx`, `src/components/ChangePassphraseModal.tsx`, `src/components/UpgradeModal.tsx`, `src/components/RestoreModal.tsx`, ROADMAP.md.

## 2026-04-17 (cont.) — Amber Rebrand + Sweep Hardening + Modal Restructure (Stage 6)

Category: security, UX, architecture, bug fixes

Large session covering amber brand rollout, critical sweep bug investigation and fix, modal architecture restructure, and migration chain safety.

**Amber brand rebrand.** Single accent color (#f59e0b / amber-400) across identity card dropdown, You modal, UpgradeModal, ChangePassphraseModal, MoveAddressModal. `#0f0f0f` backgrounds, gold top stripe, amber borders/buttons. Emerald removed entirely from identity flows. AnimatedBalance chip flash updated to amber.

**Sweep bug investigation.** User lost 17,306 sats at `1GqXaU66...` when Move + Upgrade in quick succession silently failed to transfer funds. Three-agent parallel investigation found: (1) `sweepFunds` and `autoTransferFunds` hit WoC directly with no retry — a 429 or empty response = silent fund loss; (2) "no UTXOs" treated as clean success (no error flag) — user saw a clean "done" screen while funds were stranded; (3) sweep failure didn't block rotation — commit proceeded regardless. On-chain investigation confirmed no outbound tx was ever broadcast from the address.

**Sweep hardening.** Both sweep functions switched to `/api/unspent` proxy (retry + cache + stale fallback). "No UTXOs" now returns `noFunds: true` flag. Sweep failure enters `sweep-failed` stage in MoveAddressModal with "Retry transfer" / "Proceed without" buttons. `sweepFunds` exported for independent retry. Rotation lock (`_rotationInProgress`) prevents concurrent Move + Upgrade.

**Modal restructure.** You modal converted from mixed inline/popup to clean launcher. Restore flow extracted to standalone `RestoreModal.tsx`. Move row goes straight to MoveAddressModal (no inline expansion). Only recovery key stays inline (read-only). Architect agent confirmed: mixed patterns are the worst option — no learnable rule for users.

**Merged Move + Passphrase.** MoveAddressModal now collects passphrase as first stage, calls `upgradeIdentity` instead of `resetIdentity`. Every rotation produces an encrypted key. "Not protected" banner opens MoveAddressModal directly. Downloads encrypted backup automatically on completion. Plaintext key rotation removed from primary UI.

**Pre-rotation chain verification.** New `verifyMigrationChain` server action checks all posting pubkeys resolve to current key before any rotation. Warns user if chain is broken with "proceed anyway" escape hatch. Added to UpgradeModal, ChangePassphraseModal, and MoveAddressModal.

**Migration chain repair.** Investigated user's earnings drop (590 → 11 sats per split). Found 7 orphaned posting pubkeys (91 posts) disconnected from current key due to broken migration chain from earlier testing. Inserted 3 bridge migrations to reconnect. Chain verified healthy.

**Mandatory memory clue.** Passphrase hint field now required (not optional) in UpgradeModal and ChangePassphraseModal. Submit button disabled until filled. Label changed from "recommended" to mandatory.

**Activity key fix.** Added array index to React key in activity list to prevent duplicate-key console errors when multiple payouts share the same timestamp.

Files changed: `src/app/IdentityBar.tsx`, `src/app/actions.ts`, `src/services/bsv/identity.ts`, `src/components/MoveAddressModal.tsx`, `src/components/UpgradeModal.tsx`, `src/components/ChangePassphraseModal.tsx`, `src/components/RestoreModal.tsx` (new), CLAUDE.md, ROADMAP.md.

Verified: tsc clean, 27/27 tests pass, biome clean.

## 2026-04-17 — Identity Dropdown Polish (Stage 5) — Earnings-First Hierarchy

Category: UX, design polish

Full dropdown restructure driven by parallel designer + researcher agent audits of Apple, Google, Coinbase, Cash App, Phantom, Stripe, and Revolut account panel patterns.

**Earnings-first hierarchy.** Reordered dropdown: all-time earnings (hero) → activity → balance. The user's insight: "This is not a wallet, this is an idea earning platform." Earnings total is now the hero number (`text-lg font-semibold`), with a collapsible sparkline chart (default open). Balance demoted to a single quiet row with inline "Add funds" text link (replaced full-width green button). Designer agent confirmed: the first number frames the mental model.

**Activity redesign.** Activity feed shows 2 items collapsed by default with "View all N" toggle right-aligned in the header (Stripe pattern). Replaced scroll container (anti-pattern on mobile). API limits bumped from 10 to 50 per type (incoming + outgoing). Static activity text toned down to zinc-500, interactive links promoted to zinc-100 with underline decoration.

**Inline verified checkmark.** Protected security status replaced with a subtle emerald checkmark next to the identity name (X-verified pattern, `text-emerald-500/70`, `title="Identity protected"`). Full-width green "Identity protected" banner removed — calm states don't need space. Unprotected red banner kept (urgency deserves prominence).

**Font hierarchy audit.** Two-tier system established with designer agent: static data recedes (zinc-500), interactive elements pop (zinc-100 + underline + decoration-zinc-600). Section labels standardized to zinc-400 font-medium. All ✕ close characters replaced with SVG icons for cross-platform consistency.

**Other changes.** "Your identity" button → "Manage" (bordered, better contrast). EarningsSparkline header removed (parent handles via toggle). Noob/Goat emoji toggle kept per user preference.

Files changed: `src/app/IdentityBar.tsx`, `src/components/EarningsSparkline.tsx`, `src/app/api/earnings/route.ts`, CLAUDE.md, ROADMAP.md.

Verified: tsc clean, 27/27 tests pass, biome clean.

## 2026-04-15/16 — Manage Identity Redesign (Stages 1–3 + 1b) + resilience planning

Category: UX, bug fixes, planning

Large session spanning the identity card redesign + adjacent resilience work.

**MD synchronization pass.** Two parallel audit agents cross-checked CLAUDE.md, DECISIONS.md, ROADMAP.md, FAIRNESS.md, SECURITY_AUDIT.md against code. Promoted C6 and H5 from implied-partial to FIXED (deferred-commit landed 2026-04-12 covers C6; `actions.ts:36-37` covers H5). Amended C3 with the 2026-04-14 rawTx + local parsing upgrade. Extended H6 to cover `/api/balance` + `/api/unspent` proxies. CLAUDE.md key-files, IdentityBar description, and boot-payment flow updated.

**Identity pill — two-dots fix.** Static protection dot now hidden while the pulsing backup warning is visible (they were both amber and fought for attention). Backup warning takes precedence as the urgent, time-sensitive signal.

**Manage Identity redesign — three parallel specialists.** Designer (bopen-tools:designer), researcher (bopen-tools:researcher), architect (bopen-tools:architecture-reviewer) audited the card in parallel. Unanimous cuts: "Paste recovery key" textarea (redundant with file import), "Hide" toggle (dead micro-state), unify "Secure identity" + "Change passphrase" labels. Disagreement resolved on the AI-help button: researcher surveyed 10 products (Apple/Google/GitHub/Phantom/HandCash/MetaMask/Revolut/Cash App/…) — every one keeps AI outside the account menu; architect red-teamed WIF-exfiltration risk, bad-advice-on-irreversible-actions risk, third-party LLM privacy leak. User decided: skip the AI button. Adopt Coinbase/Phantom one-time backup nag pattern. Rename "Manage identity" → "You".

**Stage 1 — Bug fixes.** `MoveAddressModal` retry-from-creating now reuses `resetResultRef.current` instead of regenerating the key — previously a retry generated a fresh key while the prior sweep tx still pointed at the now-abandoned address, stranding funds across retries. Removed 8 seconds of cosmetic `delay()` padding. Unified backup-warning color to amber across chip + modal (was amber/red split).

**Stage 1b — Remaining fixes.** `/api/tx-hex` retries 404s up to 3× with 2s backoff (~6s budget) to ride out WoC's 2–10s mempool indexing lag on 0-conf chain ancestors. Backup download now requires explicit "Got it" acknowledgement before `backedUp` flips — new green confirmation banner in the dropdown for the main flow, new `saved-confirm` stage in `MoveAddressModal` that gates the auto-advance to the irreversible sweep. Silent download failures no longer masquerade as success.

**Stage 2 — Dead-code cuts.** Removed Paste-recovery-key textarea (~60 lines) and Hide toggle + all orphaned state/handlers. Sparkline temporarily removed but restored per user preference.

**Stage 3 — Merge + reframe.** Passphrase row unified to single "Passphrase" label with dynamic secondary text. `+ Add funds` button added to the balance zone (deposit now one click from chip). Modal header renamed "Manage identity" → "You". Coinbase/Phantom amber backup banner added to the top of the dropdown with pulsing dot + single CTA — disappears forever once saved and acknowledged.

**Stage 4 — Questions layout ATTEMPTED + REVERTED (2026-04-16).** Built the 3-question intent-led IA ("Is my account backed up?", "I'm on a new device", "I think my keys were exposed") replacing the flat You-modal section list. User rejected the approach during live review — the flat list reads faster and feels less like a support FAQ. Reverted via `git restore` before commit; no artifacts in git history. Flat section list is the settled state. Pending-payment badge (originally bundled into Stage 4) is still wanted and carried forward as a standalone ROADMAP item.

**Resilience planning (no code this session).**
- `/api/broadcast` proxy + TAAL failover — extended to include server-wallet reuse, shared WoC read cache module, broadcast timeout, queue-depth metric, low-balance alert. Architect flagged that the server wallet currently hits ARC/WoC directly — none of the client-side mitigations apply; browser is now better-armored than the backend it talks to.
- Split mutexes (posts vs boots), backpressure on `logPostOnChain`, WoC retry/backoff in double-spend recovery — all captured in ROADMAP Phase 6.5.
- Near-instant payment UI via SSE + optimistic updates — full build-spec captured. Architect's verdict: ~300ms incoming, <50ms own (vs 15–60s polling today). Deferred to after `/api/broadcast` so error codes stabilize first.
- DECISIONS.md locks in "SSE is enhancement, polling is ground truth" and "Server wallet shares the client's resilience stack" to prevent future drift.

**Live activity feed.** Extended the 30s earnings poll: `summary=1` fast path when dropdown closed, full feed (activity + sparkline) when open. Recent boots appear live instead of waiting for close→reopen.

**GorillaPool ARC outage (2026-04-14).** Browser broadcasts hit a CORS-looking error that was actually an nginx 502 upstream. Confirmed with agents: not blocked, not a CORS policy change — genuine outage (second within a week). TAAL ARC was healthy the whole time. Locked in `/api/broadcast` proxy as the architectural fix in ROADMAP.

Files changed: `src/app/IdentityBar.tsx`, `src/components/MoveAddressModal.tsx`, `src/app/api/tx-hex/route.ts`, CLAUDE.md, DECISIONS.md, ROADMAP.md, SECURITY_AUDIT.md.

Verified: tsc clean, 27/27 tests pass, biome clean at each commit.

## 2026-04-14 — WoC Proxy Fleet + Local TX Parsing in boot-confirm

Category: reliability, rate-limit mitigation, architecture

Extended server-side proxy pattern to eliminate remaining direct browser→WhatsOnChain read paths, and removed the WoC dependency from the boot-confirm critical path.

**New cached proxies.** `/api/balance/route.ts` (10s TTL, 120/min per IP) and `/api/unspent/route.ts` (3s TTL, 180/min per IP) join `/api/tx-hex` as server-cached WoC reads. Both retry 429/5xx with stale-cache fallback. With these in place, no client code path calls WoC directly anymore. N clients within the TTL window produce 1 upstream request, and WoC's ~3 req/s per-IP limit no longer gates the app.

**IdentityBar balance polling** switched from direct WoC to `/api/balance` with graceful fallback — on transient errors it preserves last-known balance instead of flashing 0.

**`clientSideBoot.fetchUtxos`** switched from direct WoC to `/api/unspent?fresh=1`.

**boot-confirm refactor.** Client now sends `rawTx` alongside `txid`. Server validates `hash(rawTx) === txid` (self-authenticating — can't be spoofed), parses P2PKH outputs locally from the raw bytes to check the split, and re-broadcasts via ARC as a safety net. Removes the 5–30s WoC indexing lag that previously produced false TX_NOT_FOUND errors on fresh boots. Returns explicit `TX_CONFLICT` (fatal) vs `ARC_UNAVAILABLE` (retriable) so the client can react correctly.

**Structured error-code matching.** Broadcast error classification in `client-boot.ts` now matches against the structured `code` field on ARC responses rather than substring search. Prior substring matching against e.g. "257" produced false positives inside unrelated txids/timestamps and mislabelled successful broadcasts as conflicts.

**Session continuity note.** PC crashed mid-session; a large chunk of conversation history was lost but all code changes were preserved on disk. This entry was reconstructed from the diff against `eef5856` plus user confirmation that boots were working again the following morning.

Files changed: `src/app/api/balance/route.ts` (new), `src/app/api/unspent/route.ts` (new), `src/app/api/boot-confirm/route.ts`, `src/app/IdentityBar.tsx`, `src/hooks/useBoot.ts`, `src/services/bsv/client-boot.ts`.

Verified: TypeScript clean, 27/27 tests pass, Biome 0 errors.

## 2026-04-13 — Broadcaster Unification + Source TX Cache + Filter Cleanup

Category: architecture consolidation, bug fixes, simplification

Cleaned up the accumulated defensive layers once the root causes were understood. Several decisions from the 2026-04-11/12 sessions were reversed after deeper investigation revealed they addressed symptoms of the 10 sat/kb fee rate (below GorillaPool's 100 sat/kb mining minimum), not fundamental design issues.

**Broadcaster unification — all paths back to ARC.** `clientSideBoot`, `consolidateUtxos`, `sweepFunds` (renamed from `sweepConfirmedFunds`), `autoTransferFunds`, and server `buildAndBroadcast` all now use the @bsv/sdk default `tx.broadcast()` (which is ARC). The WoC broadcaster switch from 2026-04-12 was based on a misdiagnosed ARC outage — it was actually a local DNS cache issue on the user's PC, resolved by rebooting. ARC sends txs directly to GorillaPool (the miner), provides structured error responses, and supports 0-conf chaining via BEEF. WoC is now used only for read operations (UTXO fetches, source tx hex, balance display, exchange rate).

**Server-side source tx cache in /api/tx-hex.** Added in-memory Map (~2000 entries, LRU) of fetched source tx hex. Source tx hex is immutable — cache-forever is correct. Eliminates repeated WoC calls for the same txid across boots, sweeps, and consolidations. Before this fix, a boot with 15 inputs fired 15 parallel WoC calls through the proxy from a single server IP, exceeding WoC's ~3 req/s per-IP limit and causing 429 errors on the 16th+ boot.

**Batched source tx fetches in clientSideBoot.** Replaced bare `Promise.all` with batches of 5, 1s inter-batch delay (matching the `consolidateUtxos` pattern). Prevents WoC rate limiting even on cache misses. Combined with the cache above, boots now handle wallets with many UTXOs reliably.

**Confirmed-only filters REMOVED** from `fetchUtxos` and `consolidateUtxos`. These filters were built to quarantine stuck UTXOs from 10 sat/kb txs that were below GorillaPool's mining minimum. At the current 100 sat/kb rate, all txs confirm in the next block — unconfirmed UTXOs are just "waiting," not "permanently stuck." The filters were actively harmful: they locked users out when their entire balance was recently-received unconfirmed funds ("0 sats" display despite having value at the address).

**`sweepFunds` renamed from `sweepConfirmedFunds`.** Removed the `height > 0` filter — now sweeps ALL UTXOs (confirmed + unconfirmed). Matches `autoTransferFunds` behavior. Move to new address now transfers the user's complete balance, not just the confirmed portion.

**Optimistic UTXO blacklist REMOVED.** Was marked as tech debt by the 2026-04-11 architecture review. Caused permanent wallet lockout when broadcasts failed (inputs stayed blacklisted in localStorage with no auto-recovery). Double-spend prevention is fully covered by mutex + 0-conf chaining + 3s UI throttle.

**Deferred session cache in upgradeIdentity.** `upgradeIdentity()` no longer sets `_sessionIdentity`/`_cachedWif`/`_cachedPrivateKey` eagerly. `commitUpgrade(encStore, identity)` now accepts an optional identity and commits the session caches atomically with the localStorage write — only after `migrateIdentity()` succeeds. Matches the `resetIdentity` deferred commit pattern.

**Balance poll interval: 15s → 30s.** Reduces WoC background request rate, lowers 429 pressure from normal page-sitting.

**Root cause retrospective.** Architecture review determined ~50% of the recent debugging was downstream of the 10 sat/kb fee rate being below GorillaPool's mining minimum. Those txs literally could never confirm. Every defense built on top (optimistic blacklist, confirmed-only filters, WoC broadcaster swap, quarantine proposals) was compensating for permanently-stuck transactions that shouldn't have been permanently stuck in the first place. Fixing the fee rate eliminated the root cause; the defensive layers were then unnecessary.

Files changed this session: `src/services/bsv/client-boot.ts`, `src/services/bsv/identity.ts`, `src/components/UpgradeModal.tsx`, `src/components/ChangePassphraseModal.tsx`, `src/app/IdentityBar.tsx`, `src/app/api/tx-hex/route.ts`.

Verified: TypeScript clean, 27/27 tests pass, Biome 0 errors.

## 2026-04-11 — Architecture Retrospective + Reset Wallet + Boot Throttle

Category: bug fix, UX, retrospective

Stopped digging. After 9 commits cascading through ORPHAN retries, dust threshold tuning, optimistic blacklisting, asymmetric reverts, confirmed-only filters, idempotent-broadcast handling, and a proposed 50-line DOUBLE_SPEND_ATTEMPTED handler, dispatched architecture-reviewer for an honest retrospective. Verdict was blunt: the necessary fixes were #1 (ORPHAN retry), #2 (dust 10→2), and #8 (already-known) — the rest was defense-in-paranoia patching damage created by earlier defensive layers. Each individual fix passed code review in isolation but the cumulative complexity grew into a frankenstein. The proposed DOUBLE_SPEND handler would have extended the pattern.

Key insight: a single user wallet (1KPix...) ended up multi-hop poisoned by orphan-mempool ghosts from before any fixes existed. Code-level recovery is unreliable for that depth of contamination. The right fix isn't more error handling — it's an operational escape hatch.

Shipped instead:
1. **Reset Wallet button** — uses existing migration.ts pipeline to rotate to a fresh key, sweep confirmed UTXOs to the new address, abandon the poisoned old address. One click, fixes any user wallet that gets stuck.
2. **3-second boot button throttle** — disables the boot button for 3s after each click in BootContext. Eliminates the entire "user clicks faster than network propagates" class of bugs (orphan races, mempool conflicts, double-spends) at zero code complexity.

Rejected:
- DOUBLE_SPEND_ATTEMPTED handler (50 lines, doesn't help current poisoned state, prevents bugs that upstream fixes already prevent)
- Reverting #5 and #7 from prior commits — git history is already pushed, commits are intermingled with necessary fixes, reverts would add churn without fixing active bugs
- Stepping back to a pre-saga commit and re-applying selectively — same intermingling problem, plus forces force-push which violates Hard Rule #1 on git

Marked as tech debt in DECISIONS.md and ROADMAP.md (not removed, not bugs, just unnecessarily defensive):
- #5 Optimistic UTXO blacklisting on boots — covers a 50ms window already serialized by the mutex
- #7 Confirmed-only filter for consolidation — symptom patch for ghost UTXOs from prior crashes

Future refactor (added to ROADMAP Tech Debt section):
- IndexedDB source-tx cache (infinite TTL since source txs are immutable). Would eliminate WoC rate-limit batching workarounds AND let us remove #5 and #7 cleanly. Estimated: ~780 lines of client-boot.ts → ~250 lines.

User's poisoned 1KPix wallet recovery path: click Reset Wallet button → key rotation → fresh address → working state restored. Old address abandoned with its phantom UTXOs (they'll drop from WoC's index in 24-48h naturally).

Continued work (2026-04-11/12):

**MoveAddressModal wizard** — replaced the inline dropdown reset flow with a proper full-screen centered modal (src/components/MoveAddressModal.tsx). 4-stage auto-advancing wizard: (1) Save old key backup, (2) Create new address + sweep confirmed funds, (3) Record on-chain migration, (4) Done summary. Progressive checklist — completed steps stay visible. Amber spinner on active stage. Error handling per-stage with retry/cancel. Backdrop not closeable during active operation. Designer-reviewed at every step: label changed from "Reset Wallet" to "Move to a new address", red→zinc color, amber confirmation button, inline re-auth for encrypted users.

**Deferred localStorage commit** — found and fixed the bug that stranded 45,558 sats during testing: `resetIdentity()` was writing the new key to localStorage immediately inside the function, before the caller could verify sweep/migration succeeded. Funds were recovered because the auto-download backup (Stage 1) preserved the old key — validating the backup-before-rotation design as a critical safety net. Added `{ deferCommit: true }` option that returns a `commit()` closure. MoveAddressModal calls `commit()` only in Stage 4 after all stages pass. Auditor-reviewed.

**ARC → WhatsOnChain broadcaster switch** — investigated why sweeps kept failing (ARC connection timeouts from browser). Root cause: `sweepConfirmedFunds` and `autoTransferFunds` used the SDK default broadcaster (ARC) which has browser-specific reliability issues (CORS, timeouts). Server-side ARC is fine. Switched both to WhatsOnChainBroadcaster at 10 sat/kb — same as consolidateUtxos. clientSideBoot stays on ARC (benefits from structured errors for orphan retry). Architecture-reviewed.

**Sweep warning UI** — when fund sweep fails (e.g., network issue), Stage 2 shows warning triangle icon + "New address ready — transfer pending" instead of false success. Stage 4 Done summary also shows amber block: "Funds weren't transferred — still on your old address. Use your backup file to recover them." Designer-reviewed.

**Click-outside guard** — fixed bug where browser download dialog stealing focus triggered the dropdown's click-outside handler, silently closing the modal mid-operation. Added `resetLoading` (then `showMoveModal`) to the guard.

**Inline re-auth** — fixed confusion where encrypted users clicking "Move to new address" saw a passphrase prompt at the TOP of the modal while looking at the BOTTOM. Replaced global `requireReAuth` with inline `PassphrasePrompt` rendered inside the confirmation block. Designer-diagnosed.

Files changed: src/components/MoveAddressModal.tsx (new), src/app/IdentityBar.tsx (major rewrite of reset flow), src/services/bsv/identity.ts (deferCommit + WoC broadcaster), src/contexts/BootContext.tsx (throttle), src/app/PostList.tsx (throttle), src/app/Bootboard.tsx (throttle), DECISIONS.md, ROADMAP.md, CLAUDE.md, SESSION_LOG.md.

Verified: TypeScript clean, 27/27 tests pass, Biome 0 errors. Move to new address tested manually — wizard flow works, sweep via WoC succeeds, old key backup downloads, migration records on-chain.

**Fee rate normalization (2026-04-13):** Normalized all tx paths to 100 sat/kb. Previously consolidation/sweeps used 10 sat/kb to save ~120 sats; this contributed to slow confirmations (user's sweep sat unconfirmed 1+ hour). DUST_THRESHOLD updated from 2 to 16 to match (at 100 sat/kb, inputs below 16 sats cost more to include than they're worth). Boot-time opportunistic consolidation is effectively free (extra inputs ride on the boot tx — marginal cost ~15 sats per UTXO).

**Rejected proposals (2026-04-13):** Multiple rounds of agent review evaluated and rejected: (1) server UTXO coordinator (regresses 0-conf chaining from 800ms to 60s, introduces trust/censorship vector), (2) 1 sat/kb consolidation fee (lower than the 10 sat/kb that already sat unconfirmed for hours — wrong direction), (3) quarantine of consolidation outputs (turns a 10-second consolidate+boot flow into 10-minute wait, solves a problem the ORPHAN retry already handles), (4) hard-block on identity operations (false positives from incoming payouts, trivial page-refresh bypass), (5) minimum payout threshold in split.ts (violates "everyone gets paid, even 1 sat" philosophy). Each was evaluated with the code-auditor and/or architecture-reviewer agents before rejection.

**Confirmed-only filters removed (2026-04-13):** Both height>0 filters (in fetchUtxos and consolidateUtxos) were removed after deep investigation revealed they were only needed because the original 10 sat/kb fee rate was below GorillaPool's mining minimum (100 sat/kb). Those txs were NEVER going to be mined — they weren't "slow", they were rejected. At 100 sat/kb, all txs meet the miner minimum and confirm in the next block. The filters were actively harmful: hiding valid unconfirmed funds and causing "0 sats" lockout when the user's entire balance was recently-received unconfirmed UTXOs. The optimistic UTXO blacklist was also removed earlier — it caused permanent wallet lockout on failed broadcasts with no recovery path. Root cause analysis confirmed ~50% of the session's debugging was downstream of ARC infrastructure issues (DNS timeout, endpoint unreachable) combined with the below-minimum 10 sat/kb fee rate.

**Final state:** Seven layers of defense in place (mutex, spent-set, 0-conf chaining, ORPHAN retry, WoC broadcaster, 100 sat/kb, boot throttle) plus MoveAddressModal with deferred commit for identity operations. The confirmed-only filters and optimistic blacklist were identified as unnecessary defensive layers that caused more problems than they solved at the correct fee rate.

## 2026-04-09 — Boot Button Loading States

Category: UX, feature

Implemented full boot button loading state system so users get feedback during 1–30s boot operations.

Files changed:
- `src/contexts/BootContext.tsx` — new; global boot state (bootingPostId, bootStatus, bootError, claim/release/fail), consolidation warning dismissed flag
- `src/hooks/useBoot.ts` — refactored to consume BootContext; added "pending" → "sending" (2s) → "preparing" (8s) timer cascade; proper deps array replacing eslint-disable comment
- `src/services/bsv/client-boot.ts` — added optional `onStatus` callback to `clientSideBoot` and `consolidateUtxos`; fires "sending" before UTXO fetch, "retrying" in orphan retry loop, "preparing" in consolidation
- `src/app/PostList.tsx` — BootButton reads BootContext; inline amber spinner (16px SVG + animate-spin); status text ("Sending...", "Retrying...", "Preparing...") appears at 2s+; other buttons dim to opacity-50 while one is active; first-time consolidation hint below active button
- `src/app/Bootboard.tsx` — HistoryRow reads BootContext; spinner on active boot, dims on any other boot in progress
- `src/app/Feed.tsx` — wrapped Feed in BootProvider; added BootToast render; merged duplicate BootContext imports
- `src/components/BootToast.tsx` — new; fixed-bottom slide-up toast for failures; 5s auto-dismiss; tap to retry

All 27 tests pass, tsc clean, biome clean.

## 2026-04-10 — Forensic Cross-Reference Audit: Docs vs Code Reality

Category: documentation accuracy, security audit verification

Dispatched 4 parallel agents (architecture-reviewer, code-auditor, 2× Explore) to cross-reference every MD file against code reality. Motivated by discovering the fee-rate drift (500 vs 100 sat/kb) in the prior session — wanted to find all similar inconsistencies before contributors arrive.

Critical fixes (docs actively lying about platform behavior):
- FAIRNESS.md Gaming Analysis claimed "5-post daily cap" as current — code has zero daily limit enforcement (only 10/min rate limit). Rewritten to reflect reality and reference ROADMAP Phase 5 where daily limits are planned.
- FAIRNESS.md OP_RETURN spec showed phantom fields (`distributed`, `deferred`, `agent_version`) that code doesn't emit. Corrected to match actual `boot-payment.ts:64-72` output: `app, action, post_id, total, recipients, formula_version, ts`.
- CLAUDE.md Security Notes claimed "rate limiting on all API routes" — false, `/api/posts` (read-only polling) has none. Rewritten to accurately describe which routes are rate-limited and which are intentionally not (read-only feed polling hit every 5s by every client).

Major fixes:
- CLAUDE.md UX Principles banned-word rule ("never say key/wallet/WIF") violated in 4 files (backup-template.ts, IdentityBar.tsx, UpgradeModal.tsx, ChangePassphraseModal.tsx). Rule softened with explicit exception for technical recovery contexts where precision matters.
- CLAUDE.md Architecture section missing React 19.2, Turbopack, React Compiler, Biome config — all added.
- CLAUDE.md Key Files missing `layout.tsx`, `utils.ts` (load-bearing, used by actions.ts and identity.ts) — added.
- CLAUDE.md Identity System only documented `bfn_keypair` localStorage key — added `bfn_keypair_enc` (encrypted) and legacy `bfn_identity` (auto-migrated).
- SECURITY_AUDIT.md C9 (backup warning dot) promoted to FIXED — `markBackedUp()` now only fires from download/copy handlers.
- SECURITY_AUDIT.md H2 (boot-shares) updated to PARTIAL — rate limit added (30/min/IP), signed request still TODO.
- SECURITY_AUDIT.md C3 (boot-confirm index) description corrected — composite `UNIQUE(txid, recipient_address)`, not single-column.
- SECURITY_AUDIT.md M2 (backup file) corrected from FIXED to PARTIAL — plaintext path still exists for unprotected users.

Files changed: FAIRNESS.md, CLAUDE.md, SECURITY_AUDIT.md, SESSION_LOG.md (no code changes this pass — all docs).

Deferred to Wave 3 (housekeeping, not urgent):
- DECISIONS.md: document WEIGHTS_CACHE_TTL_MS (30s), boot event atomicity guarantee, free boot grant consumption gate, migration bridging behavior
- CLAUDE.md: fix IdentityContext wording (SDK cache lives in identity.ts not context), fix "IP-keyed" to "IP or pubkey-keyed", align agent/route.ts x-forwarded-for parsing with other routes
- SECURITY_AUDIT.md: add 4 new low-severity findings (innerHTML in backup template, 2-sat tolerance batching, cleanupMigrations CPU burn, posts route DoS)

Audit wins: zero dead file references in CLAUDE.md, zero security regressions, zero DECISIONS.md contradictions, all ROADMAP done items verified as actually done, all fairness parameters verified against code.

Additional work in same session:
- Fixed SEEN_IN_ORPHAN_MEMPOOL error on rapid consecutive boots: added retry loop (3 × 1.5s) for ARC parent-tx propagation delay
- Fixed wallet dust fragmentation: lowered DUST_THRESHOLD from 10 to 2 sats (matches 10 sat/kb consolidation fee rate where cost per input = ~1.5 sats). Users with many tiny UTXOs (e.g., 139 × ~4.5 sats) can now consolidate in one sweep. Added MAX_CONSOLIDATION_SWEEP = 200 safety cap. Reduced BATCH_SIZE to 5 with 1s inter-batch delay for WoC rate limiting.
- Fixed UTXO state poisoning (txn-mempool-conflict): switched to optimistic blacklisting — inputs marked spent BEFORE broadcast, only un-blacklisted on network exception (tx never left browser). Previously, failed broadcasts (ORPHAN/conflict) left UTXOs in "spent by network, available to client" state causing cascading mempool conflicts. Pattern applied to both clientSideBoot and consolidateUtxos. Auditor-reviewed and approved.
- Added boot button loading states (designer-reviewed UX): spinner replaces boot icon during operation, status text after 2s ("Sending..." / "Retrying..." / "Preparing..."), other buttons dim 50% while one active, failure toast from bottom. First-time consolidation shows inline "Setting up wallet — ~30s" hint. New BootContext + BootToast components.
- Full Biome lint + format pass: 203 errors + 18 warnings → 0 errors across 69 files (42 files reformatted)
- Semantic lint fixes: added `type="button"` to ~30 buttons, `aria-hidden="true"` to decorative SVGs, keyboard handlers on interactive divs, stable React keys replacing array indices, renamed `Error` → `ErrorPage` in error.tsx, removed unused biome-ignore suppressions
- Auto-formatting: standardized double quotes, semicolons, import ordering per biome.json config
- Verified: TypeScript clean, 27/27 tests pass, `npx biome check .` reports 0 errors, production build clean

## 2026-04-09 — Free Boot Cost Model: Floor-Only Fix + Fee Rate Drift Correction

Category: fairness economics + docs drift

Built a full cost model for onboarding a new user who burns their entire 15-free-boot quota. Original brainstorm assumed ~1 sat/tx; actual cost was dominated by the server paying the full dynamic boot price on free boots (`boot-orchestrator.ts:48`), scaling linearly with contributor count. A 100-contributor platform would have cost ~234,000 sats per new user under the old behavior.

Modeled three alternatives with CFO (Milton) + architecture-reviewer (Kayle) agent reviews:
- **Tapering free-boot count with contributor growth** — rejected. Violated the settled "15 free boots, never reset" decision (DECISIONS.md:134), had a Sybil attack surface via contributor-count inflation, created race conditions at tier boundaries, caused UX unfairness between launch-day and later users, and broke Phase 2 agent governance by making `freeBootsPerUser` non-constant.
- **Top-K concentration** — rejected. Unnecessary because the sqrt × decay curve already concentrates naturally.
- **Batched sub-dust payouts** — rejected. Breaks the trustless no-custody model.

**Chosen fix:** free boots always pay the floor price (1,000 sats) regardless of dynamic price. One-line change in `boot-orchestrator.ts:48` — `getBootPrice(db)` → `FAIRNESS_CONFIG.bootPriceFloor`. Bounds per-user server subsidy at ~15,690 sats forever, independent of platform scale. At BSV $25 that is ~$0.004/user; at BSV $100, ~$0.016/user — within the $50/month operator budget across all realistic BSV price ranges.

Discovered a fee-rate drift during drafting: DECISIONS.md:169 claimed `SatoshisPerKilobyte(500)` with rationale, but all code (`wallet.ts:260`, `client-boot.ts:439`) has always used 100 sat/kb. Line 173's arithmetic (1,480 sats at 500 sat/kb) was also internally inconsistent with the stated "stays under 1,000 sats minimum" claim. Code was authoritative per user call; docs corrected to match.

Files changed:
- `DECISIONS.md` — edited line 127 (free boots pay floor), line 169 (fee rate 100 sat/kb not 500), line 173 (arithmetic fix: 296 sats at 100 sat/kb), added new dated entry "Free boots pay floor only (settled 2026-04-09)" with full rationale + rejected alternatives
- `FAIRNESS.md` — fixed minimum payout row (line 38: 1 sat not 100 sats, no accumulation — matched split.ts:49 reality), added new "Free vs Paid Boots" subsection after "Payout Split", replaced Scaling table with 100 sat/kb fee math and removed aspirational "above threshold" numbers
- `src/services/fairness/boot-orchestrator.ts` — removed unused `getBootPrice` import, added `FAIRNESS_CONFIG` import, changed free-boot price from dynamic to floor with DECISIONS.md reference comment

Verification: `npx tsc --noEmit` clean, all 27 vitest tests pass.

Explicitly ruled out this session:
- Kill-switch for monthly subsidy budget (Milton's recommendation) — user called it unnecessary given the ~12,700 user/month budget headroom with floor pricing; revisit when real traction data exists
- BSV reserve pre-funding — operational task, not code
- Fixing the FAIRNESS.md scaling table output counts to show the fee wall more dramatically — existing numbers are now accurate at the real fee rate
- GorillaPool miner fee deal — pursued separately as optional optimization, not a dependency of this fix

Still broken or incomplete: none. Fix is complete and tested.

## 2026-04-03 — Full Repo Audit + Fixes (21 of 26 findings resolved)

5-agent parallel audit (architecture, security, performance, tidiness, correctness):

Critical fixes (5/5):
- boot-confirm hardened: replay protection (txid dedup + UNIQUE index), rate limiting, on-chain output verification
- Fixed NaN cascade in weights.ts: SQLite datetime parsing now uses valid ISO 8601
- Server wallet double-spend retry capped at 3 attempts (was unbounded recursion)
- SQL injection prevention: parameterized activeWindowDays in pricing query
- Added missing payouts.recipient_address index for earnings query performance

Important fixes (6/10):
- Rate limiting added to /api/boot-shares, /api/boot-status, /api/earnings
- calculateWeights() cached with 30s TTL (avoids full table scan per boot)
- Balance + earnings polls skip when tab is hidden
- @bsv/sdk converted to dynamic import in actions.ts (lighter server action bundle)
- Migration message structural validation (from_pubkey/to_pubkey must match params)
- lockingScript typed properly (removed only `any` in codebase)

Tidiness cleanup (11/11):
- Deleted dead agent-knowledge.ts + removed dead AGENT_SYSTEM_PROMPT export
- Removed unused splitData, unused BootIcon filled prop
- Updated biome.json schema, cleaned globals.css, fixed apple-touch-icon to PNG
- Fixed operator precedence bug in useBsvPrice.ts, added missing semicolons
- Cleaned CLAUDE.md (duplicate entry, dead file reference)

Refactors (completed):
- Extracted shared useBoot hook — deduplicates boot flow, adds consolidation to Bootboard reboots
- Decomposed IdentityBar.tsx: 1,632→1,150 lines (PassphrasePrompt, UpgradeModal, ChangePassphraseModal → src/components/)
- Bootboard break-all → break-words consistency

Test suite added:
- Vitest configured with path aliases, 27 tests across 4 files
- calculateSplit: 8 tests (money math, rounding, creator dedup, edge cases)
- calculateBootPrice: 5 tests (floor/ceiling, scaling)
- rateLimit: 4 tests (allow/block, isolation)
- calculateWeights: 10 tests (real BSV pubkeys, migration chains, engagement, time decay, NaN prevention)

Second re-audit (post-fix):
- All fixes verified correct by 5 agents
- Deduplicated downloadBackup/getStoredHint into shared module
- Removed dead state vars, unused imports/destructures from extraction leftovers
- Rewrote weights tests with real BSV pubkeys (6 were false positives)
- Updated SECURITY_AUDIT.md: 6 additional fixes marked as FIXED

Process improvements:
- Added Hard Rules to CLAUDE.md (DECISIONS-first, no silent deletes, security regression flags, mandatory commits, no personal info in repo)
- Added Context Management protocol (70/80/85% graduated save)
- Added Request Flows to CLAUDE.md (post creation + boot payment paths)
- Grouped Key Files section by category (API, Components, BSV, Fairness, Hooks)
- Cleaned 12 stale memory files (duplicated content now in repo MDs)
- Agent chat: max_tokens 300→800, added rule against price hallucination

Remaining: x-forwarded-for (deploy concern)

## 2026-04-02/03 — GitHub Launch Preparation

Pre-launch cleanup and documentation:
- Deleted Untitled file (contained API key in plaintext)
- Removed 7 stale HTML docs from Build From Nothing era + public/recover.html
- Removed 5 Next.js boilerplate SVGs from public/
- Generated missing PWA icons (192px + 512px) from icon.svg
- Wrote full README.md — vision, features, quick start, AI-native repo explanation
- Added MIT license (BSVibes contributors)
- Created FUTURE.md — handle system, boot signals, AFP protocol, patterns noticed, gaming detection
- Added prior art section to FAIRNESS.md — "blocked patents, gave it to everyone"
- Expanded DIRECTION.md — "Who This Is For", recursive model examples, "Yeah we pump real value", Phase 1 framing, governance softened
- Rewrote agent concepts as "Patterns We've Noticed" (casual observations, not pitch deck)
- Renamed package.json from bopen.ai to bsvibes
- License decision: MIT (revised from Apache 2.0 after deeper analysis — on-chain prior art makes patent clause redundant)
- Full memory-to-repo transfer: shareable vision moved into project docs, sensitive content stayed private

## 2026-04-01 — Agent Chat Dynamic Context + Vision Updates

- Agent chat now reads project MDs dynamically instead of stale hardcoded prompt
- Question classifier routes to relevant MDs (FAIRNESS.md for money questions, ROADMAP.md for "what's next", etc.)
- CLAUDE.md always included as base context, up to 2 topic-specific MDs added per request
- agent-knowledge.ts keyword Q&A system no longer used (superseded by dynamic MDs)
- Added North Star vision to DIRECTION.md (universal contribution tracking across forks)
- DB query tools (live oracle) planned for next iteration
- Explored: boot signals as AI-readable economic data, AFP royalty protocol, handle system, miner deals
- "just now" for timestamps under 60s, timeAgo auto-refresh every 60s

## 2026-03-31 — Server Double-Spend Self-Healing + TimeAgo Fix

Two fixes:
- Server wallet now self-heals on DOUBLE_SPEND_ATTEMPTED: fetches competing tx
  from WoC, blacklists its inputs in _spent, retries automatically. No more
  stuck server wallet after dev server restart.
- TimeAgo timestamps refresh every 60s without page reload (tick counter in PostList)

## 2026-03-31 — Spent Persistence + Earnings Notifications

Fixed two bugs and added earnings flash:
- Persisted `_spent` Set to localStorage — survives page refresh, prevents double-spend
  errors from stale WoC UTXO data (was causing DOUBLE_SPEND_ATTEMPTED after refresh)
- Fixed false 24k earnings notification: AnimatedBalance was firing on any balance change
  (consolidation, deposits). Now uses `flashTrigger` prop driven by real earnings only.
- Added `/api/earnings?summary=1` fast path (returns just totalEarned, no joins)
- Background 30s poll for earnedSats — chip flashes "+X sats · Agentic fairness" only
  when real boot payouts arrive, not for balance changes
- Skips flash on initial page load to avoid false notification

## 2026-03-31 — Auto-Consolidation for Fragmented Wallets

Built and shipped auto-consolidation:
- clientSideBoot returns 'needs_consolidation' when wallet has funds but is too fragmented
- consolidateUtxos() sweeps all UTXOs into one via WhatsOnChainBroadcaster at 10 sat/kb
- Boot button shows "Preparing..." during consolidation, "Booting..." during boot
- Batched source tx fetches (20 at a time) to avoid rate limits
- Bumped /api/tx-hex rate limit from 60 to 500/min for consolidation support
- Filters dust below 10 sats (not worth spending)
- Consolidated output 0-conf chained — boot fires immediately after consolidation
- Tested: Cursor browser (300 tiny UTXOs) consolidated and booted successfully

## 2026-03-31 — Fee Rate Tuning + Broadcast Strategy

Investigated ARC "fee too low" errors after UTXO consolidation changes:
- 500 sat/kb was 5x the real rate but 50 sat/kb produced 57 sats — ARC wanted 112
- ARC's actual minimum is ~100 sat/kb, settled on SatoshisPerKilobyte(100) across all 3 tx builders
- Researched WoC vs ARC broadcasting: ARC is better for user-facing txs (direct to miner, 0-conf reliable)
- WoC at 1-10 sat/kb is ideal for consolidation-only (Phase 2) — 100x cheaper for large inputs
- Ran full scenario analysis: healthy wallets, moderate/heavy/extreme fragmentation, dust hell, mixed
- Posts and boots confirmed working: all latest posts ON-CHAIN, paid boots broadcasting successfully
- Cursor browser (304 tiny UTXOs) still needs auto-consolidation — queued for Phase 2

## 2026-03-30 — UTXO Fragmentation Fix

Resolved the "fee too low" failure hitting users with many tiny payout UTXOs:
- Replaced simple largest-first UTXO selection with smallest-first opportunistic consolidation
- Each boot now consumes up to 20 tiny UTXOs at once; user with 290 UTXOs consolidates fully in ~15 boots
- Added `estimateFee()` helper (0.1 sat/byte, 100 sat floor) so fee budget is accurate before UTXO selection
- Replaced `tx.fee()` default (LivePolicy, requires GorillaPool round-trip) with explicit SatoshisPerKilobyte
- Also applied the explicit fee model to server wallet and identity.ts for consistency

## 2026-03-30 — Identity Card Redesign + Error Logging

Major UX overhaul of identity card:
- Split card into informational dropdown + "Manage identity" modal with labeled rows
- Added change passphrase flow (verify current → enter new → key rotation + recovery file)
- Copyable receive address on own row with copy icon and feedback
- "Not protected" bar is now clickable → opens upgrade modal directly
- Memory clue always visible, single passphrase entry for save (no double prompt)
- Cancel buttons red for visibility, modal resets on close, uniform expand/cancel behavior
- Advanced badge on "Show recovery key" row
- Simplified FundAddress: removed boot cost when opened from card, z-index fix
- Added error logging to on-chain post logging and wallet broadcast (6 log points)
- Investigated post 339 on-chain failure: transient WoC issue, wallet healthy (199M sats)

## 2026-03-30 — Migration Chain Repair + Return Value Fix

Critical bug found and fixed:
- `migrateIdentity()` return value was never checked — silent failures orphaned posts
- 280 posts were disconnected across 2 broken chain links (manual DB repair applied)
- Upgrade now aborts if migration registration fails (prevents future orphans)
- Root cause predated the redesign — existed since Phase 4
- Updated ROADMAP, SECURITY_AUDIT, SESSION_LOG

## 2026-03-30 — Identity Dropdown Full Redesign

Major simplification of identity dropdown:
- State reduced from 43 to ~24 variables
- UpgradeModal extracted as separate component (no more inline form push-down)
- PassphrasePrompt shared component (replaces 4 duplicate passphrase forms)
- Masked WIF display removed (meaningless to users)
- Advanced disclosure hides Show/Copy/Paste key
- Restore simplified to one-button file picker
- All 6 bugs fixed (B1-B6): plaintext fallback, double encrypt, fragile regex,
  state persistence, mutual exclusion, download throttle
- Unified recovery files: always both keys, no more "backup" terminology
- Self-contained HTML recovery files with embedded BSVibes icon
- Private & Offline banner in recovery files
- Passphrase hint in all download paths
- File naming: bsvibes-{name}-{date}.html

## 2026-03-30 — Encrypted Backups, Re-Auth, Hints, Recovery Tool

Security hardening (8 changes):
- Passphrase re-prompt with 60s grace window for Copy/Show/Save/Restore
- Upgrade backup encrypted with passphrase (wif_encrypted, not plaintext wif)
- Old WIF encrypted on failed fund transfer
- Protected restore: encrypted auto-download + confirmation gate
- Unprotected restore: keeps plaintext auto-download (no passphrase to encrypt with)
- Save file encrypts when protected (re-prompts for passphrase)
- Import handles encrypted backup files (detects wif_encrypted, prompts for passphrase)
- Optional passphrase hint (stored in localStorage + backup file, shown on unlock prompt)
- Standalone HTML recovery tool at /recover.html (offline, no dependencies, dark theme)
- File naming: bsvibes-{name}-{date}.json with -backup suffix for auto-saves

## 2026-03-29 — Earnings History Survives Upgrades + Goat Mode on Upgrade

- Fixed /api/earnings: now resolves full migration chain (BFS over migrations table, both directions) so earnings chart and activity feed survive security upgrades and cross-device restores
- All three queries (total, activity, sparkline) now use IN (all chain addresses) instead of single address
- IdentityBar: after successful security upgrade, auto-switches to Goat mode (sats) if user was in Noob mode

## 2026-03-29 — Identity Dropdown UX Overhaul

- Full copy audit by designer + marketer: 44 findings, every string reviewed
- Relaxed language rule: "key" and "recovery key" now permitted (Google/Apple normalised)
- 17 string replacements: recovery key, restore, featured, agentic split
- File names include dates and descriptive suffixes
- Recovery key section collapsible (collapsed when protected)
- Protected banner compact single-line
- Mobile overflow fix (max-h-[85vh])
- Currency toggle shows destination mode
- Activity labels: "Agentic split" + "Boot featured"
- Notification system added to roadmap (Phase 6.5)

## 2026-03-28 — Post-Audit Fixes: Ghost Posts, UTXO Contention, Migration Bridges

- Fixed ghost posts: createPost returns { ok, reason } — rejected posts removed from optimistic UI
- Fixed client-side double-spend on rapid boots: mutex + spent tracking + 0-conf chaining
- Fixed chain link overwrite: single atomic setPosts for tx_id updates + new posts
- Fixed boot-confirm 400: retry WoC verification after 2s for fresh txs
- Fixed WoC rate limit: balance polling slowed to 15s
- Fixed cleanupMigrations: now bridges orphaned intermediate keys before deleting
- Fixed test user migration data: manual 1EJk → 1H2p insertion
- Auto-download current identity backup before import (safety net)

## 2026-03-28 — isIdentityEncrypted Root Cause Fix

- Root cause found: isIdentityEncrypted() always returned false — checked raw JSON string for "enc:" prefix but the stored value is a JSON wrapper starting with "{"
- Every encrypted identity guard was broken: unlock prompt never appeared, stale plaintext key generated after upgrade, "Not protected" shown despite valid encrypted key
- Fixed: now JSON-parses stored value and checks .encrypted field (matches unlockIdentity pattern)
- Added secondary guard before key generation (after async gap)
- Upgrade → refresh → passphrase unlock → identity restored: fully working end-to-end

## 2026-03-28 — Tester Audit + Final Critical Fixes

- Full end-to-end tester audit by Jason: 8 bugs found in identity/upgrade flow
- BUG-1 FIXED: Passphrase unlock UI added (was dead code, users locked out after refresh)
- BUG-2 FIXED: Migration registered before key stored (atomic ordering, no crash window)
- needsUnlock state flows through useIdentity → context → IdentityBar
- commitUpgrade() separates key storage from key generation
- All previous critical fixes verified as working by tester

## 2026-03-28 — Security Audit: 9 Criticals + 3 Highs Fixed

- Full deep audit by code auditor (Jerry) + security ops (Paul): 53 findings total
- Created SECURITY_AUDIT.md tracking all findings with severity and fixes
- C1: Removed unsafe-eval from CSP
- C3: boot-confirm now verifies txid on-chain before recording
- C4: Backup includes old WIF when fund transfer fails
- C5: Free boot grant preserved when broadcast fails
- C6: Interrupted upgrade recovery (prefer plaintext key when both exist)
- C7: Double-upgrade preserves intermediate posts via bridge migration
- C8: cleanupMigrations requires signed challenge
- C9: Backup warning dot only clears on actual copy/download
- H1: Rate limiting keyed on pubkey not client-supplied name
- H5: Unsigned posts rejected (pubkey + signature required)
- H6: /api/tx-hex rate limited (60 req/min per IP)

## 2026-03-28 — Identity Safety, Currency Toggle, Earnings Chart, Activity Feed

Identity safety:
- Force backup auto-download before security upgrade completes (prevents key loss)
- Auto-transfer funds from old address to new on upgrade (batched UTXO fetch, no cap)
- Auto-cleanup stale migration records when importing old identity
- Fixed CORS: proxy WoC /tx/hex through /api/tx-hex endpoint
- Fixed migration chain routing contributions to lost addresses
- Identity import from backup file or WIF paste

Currency & earnings:
- Noob Mode (dollars) / Goat Mode (sats) toggle in dropdown, persisted
- BSV price feed from WhatsOnChain (cached 5 min)
- AnimatedBalance works in both modes (count-up + "Agentic fairness" label)
- Earnings sparkline chart (step-function area, pure SVG, always rising)
- Activity feed: shows free/paid boots correctly (is_free column)
- Live balance polling every 5s from WhatsOnChain
- Boot event tracking fixed (bootboard.id not post_id for payouts)

UI:
- Identity dropdown redesigned (security top, Noob/Goat toggle, balance, activity, backup)
- Pagination order fixed (older posts at top, recent at bottom)
- FREE badge disappears immediately when free boots exhausted

## 2026-03-27 — Balance Display + Free Boot Policy

- Identity chip now shows spendable balance (WhatsOnChain UTXOs) instead of total earned
- Identity dropdown shows both: Balance (spendable) + Total earned (all-time)
- Settled: free boots are one-time only (15 per identity, never reset)
- System is live: posts on-chain, boots splitting payments, earnings accumulating, balance visible

## 2026-03-27 — Boot Reliability: UTXO Management + Paid Boot Flow

- Fixed boot splits failing silently: spent-UTXO blacklist prevents double-spend from stale WhatsOnChain data
- Added retry logic to boot split transactions (matches post OP_RETURN pattern)
- Added error logging to boot orchestrator (was silently swallowing broadcast failures)
- Sorted UTXOs largest-first so server wallet picks the big UTXO over tiny platform-cut UTXOs
- Fixed disabled boot button after free boots: freeBootsRemaining now synced from server via /api/boot-status
- Fixed fund modal not showing: onFundNeeded now passes user address + balance
- Fund modal shows balance breakdown (your balance / boot cost / top up needed)
- Added diagnostic logging to client-side boot for debugging
- CSP updated: added arc.gorillapool.io (BSV SDK default broadcaster)
- Confirmed: posts going on-chain consistently, green chain icons appearing, earnings accumulating

## 2026-03-27 — Boot Flow Fixes: 7 Bugs Fixed by BSV Agent

- Fixed split calculation double-count (creator overpaid when no pool contributors)
- CSP updated: WhatsOnChain + ARC added to connect-src for client-side boots
- Name vs address separation: bootboard shows anon names, grants tracked by address
- HistoryRow reboot now handles paid boots (was silently failing)
- Payout recording added for free boots (was only recording paid)
- Placeholder address removed from boot-shares (proper 503 when no wallet)
- boot-confirm accepts booterName for display
- Server wallet funded with BSV for live testing

## 2026-03-26 — Phase 6 Complete: Earnings Display

- Earnings API endpoint (/api/earnings) — sums payouts by recipient address
- Identity chip shows "X sats" earned next to anon name when earnings > 0
- Identity dropdown shows "Total earned" section with emerald accent
- Phase 6 marked COMPLETE in ROADMAP.md

## 2026-03-26 — Phase 6 UI Wiring: Boot Payments Live

- Boot button now handles full flow: free (server pays) → paid (client trustless) → no funds (QR modal)
- BootButton shows price in tooltip, "FREE" badge when free boots remain
- Bootboard shows boot cost in empty state
- FundAddress modal appears when user has no BSV balance
- Feed.tsx manages boot price, free boots remaining, fund modal state
- PostList passes boot info through to every BootButton

## 2026-03-26 — Phase 6 Backend: Fairness Engine + Revenue Splitting

- Built complete fairness engine: config.ts, pricing.ts, weights.ts, split.ts
- Dynamic boot pricing: contributors × 156 sats with floor/ceiling
- Contribution weights: sqrt(engagement) × time-decay, resolves migration chain
- True no-custody split: every sat out in same BSV transaction, no DB balances
- Rewrote wallet.ts: UTXO reservation, 0-conf chaining, multi-input aggregation
- Boot orchestrator: full workflow from validation through broadcast and audit recording
- Boot payment builder: multi-output P2PKH + OP_RETURN audit trail
- New DB tables: boot_grants (free boot tracking), payouts (audit trail)
- FundAddress.tsx component for users who exhaust free boots
- Settled decisions documented: no custody, boots require pubkey, only signed posts boostable

## 2026-03-26 — Security Upgrade System (Phase 4)

- AES-256-GCM passphrase encryption via Web Crypto API (crypto.ts)
- Key rotation on upgrade: new keypair generated, old key signs on-chain migration
- Migration service posts OP_RETURN linking old pubkey → new pubkey
- Server action verifies migration signature + stores in migrations table with indexes
- IdentityBar: "Upgrade Security" button, passphrase form, Protected/Unprotected shield
- identity.ts handles both plaintext and encrypted storage, session-cached decryption
- Phase 4 marked COMPLETE (passkey wrapping + deferred activation deferred to future)

## 2026-03-26 — On-Chain Posting (Phase 3)

- Server wallet service: loads BSV_SERVER_WIF, fetches UTXOs from WhatsOnChain, broadcasts via ARC
- OP_RETURN post logging: OP_FALSE OP_RETURN with JSON payload (app, type, content, author, sig, pubkey, ts)
- Fire-and-forget after DB insert — posts save instantly, on-chain logging is async/best-effort
- tx_id updated on post row after successful broadcast
- Green chain-link icon on posts with tx_id, links to WhatsOnChain transaction viewer
- Wallet generation script (scripts/generate-wallet.mjs) for easy setup
- Graceful degradation: no BSV_SERVER_WIF = DB-only mode, no errors
- Phase 3 marked COMPLETE in ROADMAP.md

## 2026-03-26 — Manifesto, Vision Copy & Concept-to-UI Gap

- Created Manifesto.tsx with V2 "The Signal" vision copy (amber left-border accent, bold heading)
- Genesis.tsx now renders Manifesto above founding conversation with bridge divider
- "Agentic Fairness" subtitle in header is now clickable (scrolls to manifesto)
- "Chat with the agent to learn more" link scrolls to bottom and pulses the Ask AI button amber for 2s
- Phase 2 fully complete: UI labels item marked done (identity dropdown copy already updated)

## 2026-03-25 — Performance: Instant Posts & Boots

- Root-caused 3s perceived delay: optimistic posts showed "sending" spinner until next poll (up to 5s)
- Removed revalidatePath from createPost/bootPost — was adding 50-200ms blocking server work, redundant with polling
- BSV SDK now cached as singleton promise on client, PrivateKey parsed once per session (was re-importing on every post)
- Optimistic posts render at full opacity with no spinner (server confirms in ~50ms)
- Early poll at 500ms after post/boot via exposed refresh() function
- Optimistic boot count increments instantly, resets when server confirms
- Textarea no longer disabled during background signing/server work
- Validated by architecture reviewer: all changes safe, no regressions

## 2026-03-25 — Bug Fixes, Code Hygiene & Efficient Polling

- Fixed PostList stale state bug: lifted pagination state to Feed.tsx so polled updates flow through
- Fixed timeAgo logic error (hours branch was broken): extracted to shared src/lib/utils.ts
- Fixed AgentChat stale closure: messagesRef pattern prevents lost conversation history on rapid messages
- Added click-outside handler to identity dropdown
- Extracted system prompt to src/data/agent-prompt.ts, removed dead agent-action.ts
- Added DB indexes on bootboard.post_id and bootboard.held_until
- Added .dockerignore, fixed break-all to break-words on post content
- Incremental polling via ?since_id=N — only fetches new posts instead of all 100 every 5s

## 2026-03-25 — Real-Time Feed, Optimistic Posts & Identity Warning

- Added `/api/posts` GET endpoint (returns posts + bootboard as JSON, dynamic/no-cache)
- Created `useFeedPolling` hook: polls every 5s, pauses when tab is hidden, resumes on visibilitychange
- Feed.tsx wired to polling hook — server-rendered initial data stays fresh without any page reload
- Optimistic UI: post appears immediately after submit with spinner + 50% opacity; auto-pruned when polling confirms it
- Identity chip now shows an amber pulsing dot (like a notification badge) until user opens the dropdown for the first time; stored in localStorage as `bsvibes_identity_backed_up`

## 2026-03-25 — Security, Error Handling, UX & Streaming Sprint

- Server-side ECDSA signature verification added (rejects invalid/malformed sigs, unsigned posts still allowed)
- In-memory sliding window rate limiting on createPost (10/min), bootPost (5/min), askAgent (10/min global)
- localStorage write failure handling (graceful degradation in private browsing/Safari)
- BSV SDK import failure handling (catch sets error state instead of infinite loading spinner)
- Multi-tab identity race condition fixed (re-checks storage after async key generation)
- DB init wrapped in try/catch with descriptive error messages
- Post success feedback (green border flash + "Posted" text with auto-fade)
- "Ask AI" pill button replaces near-invisible text link for agent chat
- Identity loading state (dynamic placeholder + pulse animation while generating)
- Streaming agent responses via /api/agent SSE route (text appears progressively)
- LiveTimer negative time guard, identity dropdown language fix ("key" removed)

## 2026-03-25 — Agent Team Review & 18-Item Fix Sprint

- Dispatched 5 specialist agents (Architecture, Design, Next.js, Agent/AI, Security) to review the entire codebase
- Applied 18 fixes across 4 waves: critical fixes, security hardening, structural cleanup, Next.js optimization
- Wave 1: bootPost transaction + validation, FK pragma, JSON.parse try/catch, metadata fix, error boundary
- Wave 2: CSP/HSTS/Permissions-Policy headers, agent input rate-limiting, WIF hidden from DOM with reveal toggle
- Wave 3: Types consolidated to src/types/, generateAnonName shared, IdentityProvider context (replaces 4 independent hooks), Feed.tsx broken into Header + PostList + useScrollTracker
- Wave 4: 10s ISR revalidation, React Compiler enabled, ESM empty-module, Biome replacing ESLint
- Removed unused src/components/ui/ (Button, Card, Input — dead code)
- All changes verified with clean production build

## 2026-03-25 — Boot Button UX & Bootboard History

- Boot button redesigned: oval pill with border, vertically centered right of each post, count below
- Bootboard history now scrollable (up to 50 entries) in compact 120px area
- Reboot button added to history rows — boot icon left of author name, click to reboot any past post
- History query returns post_id for reboot functionality

## 2026-03-25 — Agent Chat AI & Mobile Polish

- Upgraded agent chat from keyword matching to Claude Haiku 4.5 API (~$0.001/question)
- Telegram-style post button: mic when empty, amber send arrow when typing
- Unified boot button: single component, fixed width, number left of icon
- Mobile fixes: responsive padding, visible post button, boot button always shown, sheet-style agent modal
- Fixed identity dropdown opacity (solid header bg)
- Bootboard visual refinement: gradient bg, fade edge, more breathing room
- Removed debug logging from agent action

## 2026-03-24 — BSVibes UI Overhaul & Bootboard

- Renamed project from "Build From Nothing" to BSVibes across all source files
- Built Telegram-style feed layout with scroll-to-bottom, unread count badge (IntersectionObserver), hidden scrollbars
- Created Bootboard feature: pay-to-spotlight any post, boot counter, live timer, shake/glow/slide animations, expandable history
- Added Genesis section preserving the founding conversation (Feb 2026), with localStorage-persisted visited state and header-centered navigation
- Built agent chat with keyword-matched Q&A (11 knowledge entries, modal overlay, zero API cost)
- Added voice-to-text mic button (Web Speech API), enter-to-post with auto-refocus
- Identity bar refactored to compact header chip with dropdown
- Established "Agentic Fairness" as the subtitle/philosophy — progressive autonomy from human-set parameters to fully agentic
- Added "created with bopen.ai" attribution
- Updated all context files (CLAUDE.md, ROADMAP.md, DECISIONS.md)

## 2026-03-19 — Memory System & AI-Native Docs

- Reviewed and expanded memory system (was 2 files, now 6)
- Clarified: bOpen.ai is the toolkit, project is BS Vibes (not "Build From Nothing")
- Extracted context from 6 HTML discussion docs into structured files
- Created DIRECTION.md, DECISIONS.md, ROADMAP.md
- Upgraded CLAUDE.md with full project context and AI Contribution Protocol
- Established AI-native open source strategy: repos that self-onboard any AI agent
- Adopted phased enforcement: instructions now, hooks when contributors arrive, CI when patterns break
