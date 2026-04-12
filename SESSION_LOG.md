# Session Log

> Short summaries of each working session. AI agents: add an entry before ending any significant session.

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
