# Roadmap

> What's done, what's next, what's planned. AI agents: update this file when you complete or start a task.
>
> Last updated: 2026-05-01

## Phase 1: Foundation — COMPLETE

- [x] Project setup (Next.js + TypeScript + Tailwind)
- [x] SQLite database with posts table (WAL mode, auto-migration)
- [x] BSV identity system (auto-generated keypairs, anon names, WIF in localStorage)
- [x] Post creation with cryptographic signing (ECDSA via @bsv/sdk)
- [x] Minimal GPT-style dark UI (centered layout, post box + feed)
- [x] Key backup system (copy to clipboard + download JSON)
- [x] Documentation (Vision, Identity, Security discussions)

## Phase 1.5: UI Overhaul & Bootboard — COMPLETE

- [x] Renamed project to BSVibes (from "Build From Nothing")
- [x] Telegram-style feed layout (newest at bottom, scroll-to-bottom with unread count)
- [x] Bootboard feature (pay-to-spotlight, boot counter per post, live timer)
- [x] Bootboard animations (shake, glow, slide-in on holder change)
- [x] Compact bootboard with expandable history
- [x] Genesis section (founding conversation, collapsible, persisted visited state)
- [x] Identity chip in header (replaces full identity bar)
- [x] Enter-to-post with auto-refocus after posting
- [x] Voice-to-text microphone button (Web Speech API)
- [x] Agent chat (Claude Haiku API, full project context, modal overlay)
- [x] Telegram-style post button (mic when empty, send arrow when typing)
- [x] Hidden scrollbars, word-break for long content
- [x] "Agentic Fairness" subtitle in header
- [x] "created with bopen.ai" attribution
- [x] Boot button UX: oval pill, vertically centered right of post, count below
- [x] Scrollable bootboard history with reboot buttons (up to 50 entries)

## Phase 1.6: Real-Time, UX & Deployment — COMPLETE

- [x] Real-time feed polling (GET /api/posts every 5s, pauses when tab hidden, resumes on visibility)
- [x] Optimistic UI on posting (post appears immediately with spinner + reduced opacity, auto-removed when server confirms)
- [x] Identity loss warning dot (amber pulsing dot on identity chip until user opens dropdown for first time)
- [x] Cursor-based pagination ("Load earlier posts" button, getOlderPosts server action)
- [x] PWA manifest + icons (Add to Home Screen on iOS/Android/Desktop)
- [x] Deployment prep (Railway config, Dockerfile, env var DB path, .env.example)
- [x] Incremental polling via ?since_id (only fetches new posts, not full 100 every 5s)
- [x] DB indexes on bootboard (post_id, held_until)
- [x] Bug fixes: PostList stale state, timeAgo logic error, AgentChat stale closure, dropdown click-outside
- [x] Code hygiene: shared system prompt, dead code removed, .dockerignore, break-words

## Phase 2: Security Hardening — COMPLETE

- [x] Server-side signature verification (ECDSA verify via @bsv/sdk, rejects invalid sigs)
- [x] Rate limiting (in-memory sliding window: 10 posts/min, 5 boots/min, 10 agent calls/min)
- [x] Hide WIF from DOM (masked by default, reveal toggle, copy/download still work)
- [x] JSON.parse try/catch in identity.ts (corrupted storage returns null instead of crash)
- [x] CSP headers (Content-Security-Policy, HSTS, Permissions-Policy added)
- [x] bootPost input validation + transaction wrapper (prevents race conditions)
- [x] Foreign key enforcement enabled in SQLite
- [x] Agent chat input capped (20 messages, 2000 chars each)
- [x] Error boundary added (error.tsx)
- [x] Identity dropdown language fixed (removed "key" from UI copy)
- [x] localStorage error handling (try/catch on setItem, graceful degradation in private browsing)
- [x] BSV SDK import failure handling (catch in useIdentity, sets error state instead of infinite loading)
- [x] Multi-tab identity race condition (re-check storage after async key generation)
- [x] DB init error handling (try/catch with descriptive error messages)
- [x] LiveTimer negative time guard (clock skew protection)
- [x] Post success feedback (green flash + "Posted" indicator)
- [x] Agent chat discoverable ("Ask AI" pill button replaces hidden text)
- [x] Identity loading state (dynamic placeholder + pulse animation)
- [x] Streaming agent responses (SSE via /api/agent route, progressive text display)
- [x] UI labels updated (identity dropdown copy rewritten, no longer says "key")
- [x] Manifesto / vision TLDR above Genesis section (V2 "The Signal" copy)
- [x] "Agentic Fairness" subtitle clickable (scrolls to manifesto)
- [x] "Chat with the agent" link in manifesto scrolls to bottom + highlights Ask AI button

## Phase 3: On-Chain Integration — COMPLETE

- [x] Server wallet service (BSV_SERVER_WIF env var, UTXO fetching via WhatsOnChain, ARC broadcast)
- [x] OP_RETURN posting (OP_FALSE OP_RETURN with JSON payload, fire-and-forget after DB insert)
- [x] Transaction ID storage (tx_id updated on post row after successful broadcast)
- [x] On-chain verification link (green chain icon on posts, links to WhatsOnChain)
- [x] Wallet generation script (scripts/generate-wallet.mjs)
- [x] Graceful degradation (no BSV_SERVER_WIF = DB-only, no errors)

## Phase 4: Security Upgrades — COMPLETE

- [x] AES-256-GCM passphrase encryption (Web Crypto API, PBKDF2 100k iterations)
- [x] "Upgrade Security" button in identity dropdown (optional, user-initiated)
- [x] Key rotation on upgrade (new keypair, old key signs migration)
- [x] On-chain migration record (OP_RETURN linking old pubkey → new pubkey)
- [x] Server-side migration verification + DB storage (migrations table)
- [x] Protected/Unprotected shield indicator in identity dropdown
- [x] Session-cached decrypted identity (plaintext never written back to localStorage)
- [ ] Passkey wrapping (WebAuthn PRF, biometric unlock) — future
- [ ] Firefox passphrase fallback — future
- [ ] Deferred activation prompt (nudge at earnings threshold) — future
- [ ] Session timeout for encrypted identities (auto-lock after inactivity) — future
- [ ] Device sync via QR code (faster identity import between devices) — future
- [ ] PBKDF2 increase to 600k iterations — future (when real funds flow)

## Phase 5: Self-Funded Posting — PARTIAL

- [x] UTXO check via WhatsOnChain API (built in client-boot.ts)
- [x] Client-side transaction building with change output (built in client-boot.ts)
- [x] Silent switch between server-funded and self-funded (free → paid auto-switch)
- [ ] Daily posting limits (5 free/day) — deferred. Current spam defense is 10/min rate limit only. See FAIRNESS.md Gaming Analysis.
- [ ] QR code funding when limit reached — depends on daily limits above

## Phase 6: Fairness & Revenue — COMPLETE

- [x] Fairness config (tunable parameters, governance surface)
- [x] Dynamic boot pricing (contributors × 156, floor 1000, ceiling 250000, cached 1h)
- [x] Contribution weight calculation (sqrt × decay × engagement, migration chain resolution)
- [x] No-custody payout split (every sat out in same tx, no DB balances)
- [x] UTXO manager (reservation, 0-conf chaining, multi-input aggregation)
- [x] Multi-output split transaction builder (P2PKH outputs + OP_RETURN audit)
- [x] Boot orchestrator (full workflow: validate → price → score → split → broadcast → record)
- [x] Boot grants table (15 free boots per pubkey)
- [x] Payouts audit table (records every split for transparency)
- [x] FundAddress component (deposit address panel for users who exhaust free boots)
- [x] Wire bootPost action to orchestrator (free boots → server, paid → client trustless)
- [x] Client-side trustless boot tx builder (browser builds split tx directly to contributors)
- [x] Boot shares API endpoint (/api/boot-shares — contributor list for client tx building)
- [x] Boot confirmation API endpoint (/api/boot-confirm — audit trail after client broadcast)
- [x] Auto-switch: free → server pays, has BSV → client pays trustlessly, no balance → fund QR
- [x] UI: boot price display on buttons (tooltip) and bootboard (empty state)
- [x] UI: free boot counter ("FREE" badge + remaining count in tooltip)
- [x] UI: fund address modal (shows deposit address when user has no BSV balance)
- [x] Boot button handles full flow: free → server, paid → client trustless, no funds → QR modal
- [x] UI: earnings display on identity chip (sats earned) + dropdown (total earned section)
- [x] Earnings API endpoint (/api/earnings — sum payouts by address)
- [x] Boot status API endpoint (/api/boot-status — free boots remaining for client sync)
- [x] UTXO reliability: spent-blacklist, retry logic, largest-first selection, error logging
- [x] Fund modal with balance breakdown (shows actual balance vs boot cost)
- [x] LIVE AND WORKING: posts on-chain, boots splitting payments, earnings accumulating
- [x] Security audit: 9 critical + 3 high findings fixed (SECURITY_AUDIT.md)
- [x] CSP hardened, boot-confirm verifies on-chain, unsigned posts rejected
- [x] Identity import with automatic migration cleanup
- [x] Earnings sparkline chart, Noob/Goat currency toggle, live balance polling
- [x] Forced backup download on security upgrade, interrupted upgrade recovery
- [x] Passphrase unlock UI (users no longer locked out after refresh with encrypted identity)
- [x] Atomic migration ordering (server confirms before key stored locally)
- [x] Identity import with automatic migration cleanup (signed challenge required)
- [x] Full tester audit: all identity/upgrade paths verified
- [x] Migration return value checked — upgrade aborts if migration fails (prevents orphaned posts)
- [x] Full identity dropdown redesign: radical simplification (43→24 state vars, extracted UpgradeModal, shared PassphrasePrompt). *UpgradeModal subsequently deleted in Stage 8 batch 1 (2026-05-01) — orphaned after Stage 6 modal restructure consolidated everything into MoveAddressModal.*
- [x] Self-contained HTML recovery files with embedded decryption (replaces JSON backups)
- [x] Private & Offline banner in recovery files
- [x] Re-auth grace window (60s) for sensitive actions (Copy/Show/Save/Restore)
- [x] Passphrase hints on upgrade + recovery files
- [x] Identity card split: informational card + "Manage identity" modal with labeled action rows
- [x] Change passphrase flow (2-step: verify current, enter new, key rotation + recovery file)
- [x] Copyable receive address on card header (own row, copy icon, "Copied!" feedback)
- [x] "Not protected" bar clickable — opens upgrade modal directly with chevron affordance
- [x] Memory clue always visible (no toggle), shown immediately on import + re-auth
- [x] Single passphrase entry for save (re-auth → save, no double prompt)
- [x] Error logging for on-chain post failures and wallet broadcast failures
- [x] UTXO consolidation: smallest-first selection, up to 20 inputs per boot, gradual defrag
- [x] Explicit fee model: SatoshisPerKilobyte(100) — no GorillaPool round-trip, ARC-compatible
- [x] Auto-consolidation for heavily fragmented wallets (WoC broadcaster at 10 sat/kb)
- [x] Spent UTXO persistence (localStorage) — prevents double-spend after page refresh
- [x] Earnings-only notification: chip flashes for real payouts, not balance changes (30s poll)
- [x] Server wallet self-healing: DOUBLE_SPEND_ATTEMPTED → blacklist competing inputs → auto-retry
- [x] TimeAgo timestamps refresh every 60s without page reload

## Phase 6.1: Second Audit (2026-04-03) — COMPLETE

- [x] 5-agent parallel audit (architecture, security, performance, tidiness, correctness)
- [x] boot-confirm: replay protection, rate limiting, on-chain output verification
- [x] NaN weight cascade fix (SQLite datetime parsing)
- [x] Server wallet retry limit (was unbounded recursion)
- [x] SQL parameterization in pricing query
- [x] Rate limiting on all API routes (boot-shares, boot-status, earnings, posts 120/min)
- [x] calculateWeights() 30s TTL cache
- [x] Tab visibility checks on balance/earnings polling
- [x] Dynamic @bsv/sdk import in server actions
- [x] Migration message structural validation
- [x] Dead code removal + tidiness cleanup (11 items)
- [x] IdentityBar.tsx decomposition (1,632→1,150 lines — PassphrasePrompt, UpgradeModal, ChangePassphraseModal extracted)
- [x] Extract shared useBoot hook (deduplicates boot flow, adds consolidation to Bootboard reboots)
- [x] Unit test suite (Vitest: 27 tests — split, pricing, weights, rate-limit)
- [x] Deduplicated shared utilities (downloadBackup, getStoredHint)
- [x] Post-fix re-audit: all fixes verified, dead code cleaned, false-positive tests rewritten

## Phase 6.2: Cost Model & Documentation Audit (2026-04-09/10) — COMPLETE

- [x] Free boots pay floor price only (1,000 sats) — bounds per-user subsidy at ~15,690 sats regardless of scale
- [x] Fee rate documentation corrected (100 sat/kb, not 500 — code was always 100, docs were wrong)
- [x] FAIRNESS.md corrected: Gaming Analysis (no 5-post daily cap — was aspirational), OP_RETURN spec (removed phantom fields), scaling table (actual fee math), minimum payout (1 sat not 100)
- [x] 4-agent forensic audit: cross-referenced CLAUDE.md, DECISIONS.md, FAIRNESS.md, SECURITY_AUDIT.md against code
- [x] CLAUDE.md updated: Architecture (React 19.2, Turbopack, React Compiler, Biome), Key Files (layout.tsx, utils.ts), Identity (all localStorage keys), UX rule softened, Security Notes corrected
- [x] SECURITY_AUDIT.md: C9 promoted to FIXED, H2 to PARTIAL, C3 index description corrected, M2 corrected to PARTIAL
- [x] Rate limit added to /api/posts (120/min/IP — was the only unprotected route)
- [x] ROADMAP.md, FAIRNESS.md, DECISIONS.md dates updated
- [x] Boot button 3-second throttle (BootContext) — prevents rapid-click cascade
- [x] "Move to a new address" wizard (MoveAddressModal) — 4-stage auto-advancing modal replacing inline dropdown flow. Downloads old key backup, sweeps ALL UTXOs (confirmed + unconfirmed) via ARC at 100 sat/kb, records on-chain migration, deferred localStorage commit.
- [x] Deferred commit in resetIdentity AND upgradeIdentity — prevents stranding funds if sweep/migration fails partway
- [x] Broadcaster unified to ARC (2026-04-13): all tx paths (clientSideBoot, consolidateUtxos, sweepFunds, autoTransferFunds, server wallet) use ARC via @bsv/sdk default. Previous WoC broadcaster switch was based on a misdiagnosed ARC outage (local DNS issue).
- [x] Server-side source tx cache in /api/tx-hex (~2000-entry in-memory LRU). Eliminates WoC rate-limit failures on boots with many inputs.
- [x] Batched source tx fetches in clientSideBoot (BATCH_SIZE=5, 1s delay).
- [x] Sweep warning UI when fund transfer fails (non-blocking, shows in Stage 2 + Stage 4 summary)
- [x] Optimistic UTXO blacklist removed (2026-04-13) — caused permanent wallet lockout with no recovery. Double-spend prevention now via mutex + 0-conf chaining + 3s UI throttle.
- [x] Confirmed-only filter removed (2026-04-13) — redundant at 100 sat/kb (all txs confirm next block). Was built for 10 sat/kb era when unconfirmed meant "permanently stuck."
- [x] WoC rate-limit mitigation via cached server proxies (2026-04-14) — `/api/balance` (10s TTL) and `/api/unspent` (3s TTL) join `/api/tx-hex`. All direct browser→WoC reads removed. Fixes 429 cascades that broke paid boots and froze balance polling.
- [x] Boot confirmation via local tx parsing (2026-04-14) — client sends `rawTx`, server verifies `hash === txid` and parses P2PKH outputs locally. Eliminates 5–30s WoC indexing lag from the boot-confirm path. Server re-broadcasts via ARC as safety net. Explicit TX_CONFLICT vs ARC_UNAVAILABLE codes.
- [x] Structured error-code matching for broadcast failures (2026-04-14) — replaces substring search that produced false positives on numbers appearing inside txids.
- [x] Live activity + earnings-history refresh when dropdown open (2026-04-15) — IdentityBar 30s poll now uses `summary=1` fast path when closed and the full earnings payload (activity + sparkline) when open. Recent boots/payouts appear within 30s of the DB insert instead of waiting for a close→reopen cycle. Tab-visibility gated.

## Phase 6.5: UX Polish — IN PROGRESS

- [ ] **Server-side resilience: unified broadcast + read path (`/api/broadcast` proxy + server wallet reuse).** The server wallet (`wallet.ts`, `onchain.ts`, `boot-orchestrator.ts`) currently hits ARC and WoC directly — none of the client-side mitigations apply. An ARC hang freezes the mutex and blocks ALL posts + free boots platform-wide; a dropped 0-conf chain fan-outs into uncached WoC reads. Build-spec:
  - **`/api/broadcast` proxy** with GorillaPool primary → TAAL ARC fallback on 5xx. All client broadcasters wired via `new ARC('/api/broadcast')`. 10s timeout, structured ARC error passthrough (client's 257/258 classification depends on it), rate limit keyed on pubkey not IP. Motivated by GorillaPool outages 2026-04-08 and 2026-04-14.
  - **Server wallet reuses the same proxy** (shared broadcaster module, not duplicate SDK default). `wallet.ts:267` and all server tx paths go through the same failover + timeout discipline as the browser.
  - **Server wallet reuses `/api/tx-hex` and `/api/unspent` caches** — via a shared internal cache module, not re-fetching through the HTTP route. `wallet.ts:89,167,323` currently bypass the cache completely; a chain break fan-outs N raw WoC calls per recovery.
  - **Broadcast timeout + queue-depth metric** — log/alert when mutex wait > 5s or queue depth > 5. Early signal of ARC degradation. Today a 30s ARC hang silently freezes the platform with zero visibility.
  - **Low-balance alert on server wallet** — log + optional webhook when balance < 10k sats or `_pendingChange` is repeatedly empty. At $10 float → ~3,700 free boots before exhaustion, no auto-refill and no current visibility.
  - Sequence: proxy first, then server-side reuse, then metric/alert. ~4–6h total work.
- [ ] **Split mutexes: posts vs boots.** Currently posts (OP_RETURN, 1-in 1-out, ~20ms signing) share the same mutex as boot splits (10–15 outputs, ~50ms signing + longer ARC round-trip). Under burst load, a boot queue starves posts. Two separate mutexes (or a priority queue) roughly doubles practical throughput. `wallet.ts:14`. ~1h work.
- [ ] **Backpressure on `logPostOnChain`.** If server wallet mutex queue depth exceeds N, skip the OP_RETURN log (SQLite post still stands, `onchain.ts:48` already tolerates null return). Prevents unbounded queue growth during ARC flaps. ~30min work.
- [ ] **WoC retry/backoff in double-spend recovery.** `wallet.ts:323` currently swallows errors with `/* best effort */` and leaves competing UTXOs un-blacklisted, potentially re-entering retry within the 3-attempt cap. Add retry + backoff matching the client proxy pattern. ~1h work.
- [ ] **Near-instant payment UI via SSE + optimistic updates** — when a boot happens, recipient sees earnings/activity/balance update in ~300ms instead of 15–60s polling. Sender sees own-action effects in <50ms. Showcases BSV speed + agentic fairness as a visible product moment, not a status poll.
  - **SSE endpoint `/api/events?address=...`** using a module-singleton Node `EventEmitter`. Wrap the emit site in a `publishPayout(recipientAddress, payload)` helper so swapping to Redis / Postgres LISTEN-NOTIFY later is one file. Node runtime only (edge kills the singleton).
  - **Emit from `/api/boot-confirm`** right after the `payouts` INSERT succeeds. Payload: `{ boot_event_id, post_id, total, your_share, recipients, ts }`. Dedup on the client by `boot_event_id` so retried confirmations don't fire fireworks twice.
  - **Client**: `EventSource` per open tab, auto-reconnect is free. On event: refetch `/api/earnings` + `/api/balance`, trigger confetti/pulse on balance chip, animate split diagram from post → recipient.
  - **Optimistic own-boot path**: after successful broadcast we already have `rawTx` + txid. Parse own outputs locally, update balance chip and activity immediately. WoC poll reconciles silently on next tick.
  - **Keep the 30s polling** as SSE fallback. SSE is enhancement; polling is ground truth. See DECISIONS.md "Real-time updates".
  - **Ops**: 15s heartbeat comment to survive serverless idle timeouts; in-process emitter works only on single-instance deploys (fine at current scale, revisit on horizontal scale); Railway long-lived Node preferred over Vercel edge for SSE.
  - **Failure handling**: broadcast fail → no optimistic update (we already branch on success); tx replaced/orphaned → WoC poll corrects the optimistic balance; SSE drop → poll fills the gap; boot-confirm fail after broadcast → same issue as today, unchanged.
  - ~3–4h work (endpoint, event bus, client wire-up, fireworks animation). Do after `/api/broadcast` so the broadcast proxy's error codes are stable before SSE consumes them.
- [ ] **Manage Identity card redesign (4-stage roll-out)** — parallel audit from designer + researcher + architect agents (2026-04-15) surfaced 13 interactive controls at primary tier (target 5), semantic duplicates, and real flow bugs. User decisions locked in: adopt Coinbase/Phantom "orange row until backup saved, then gone forever" pattern; skip the in-card AI button (researcher + architect both red-teamed it — every major product keeps AI outside the account menu; key-exfiltration and bad-advice-on-irreversible-actions risks outweigh benefit); rename header to "You". Stages:
  - **Stage 1 — Bug fixes (DONE 2026-04-15):** `MoveAddressModal` retry-from-creating now reuses `resetResultRef` instead of regenerating the key (previously stranded funds across retries); 8s of cosmetic `delay()` padding removed; backup-warning color unified to amber across chip + modal (was amber/red split).
  - **Stage 1b — Remaining bug fixes (DONE 2026-04-16):** `/api/tx-hex` now retries 404s with 2s backoff up to 3 times (~6s budget) to ride out WoC's 2–10s mempool indexing lag on 0-conf chain ancestors. Backup download now requires an explicit "Got it" acknowledgement before `backedUp` flips — both in the You modal flow (green confirmation banner replaces the orange save-CTA in the dropdown) and in `MoveAddressModal` stage 1 (new `saved-confirm` stage gates the auto-advance to the irreversible sweep). Silent download failures (popup blocker, disk full, CSP deny) no longer masquerade as success.
  - **Stage 2 — Dead-code cuts (DONE 2026-04-15):** removed Paste-recovery-key textarea (redundant with file import), removed Hide toggle inside Show-recovery-key (dead micro-state once revealed in a session). Sparkline kept in dropdown per user preference.
  - **Stage 3 — Merge + reframe (DONE 2026-04-15):** passphrase row unified to single "Passphrase" label with dynamic secondary text; Deposit moved into balance zone as `+ Add funds` button (one click from the chip); modal header renamed "Manage identity" → "You"; Coinbase/Phantom one-time backup banner added to the dropdown — amber "Save your recovery file" pulse until saved + acknowledged, then gone forever.
  - **Stage 4 — ATTEMPTED + REVERTED (2026-04-16):** built the 3-question intent-led layout ("Is my account backed up?", "I'm on a new device", "I think my keys were exposed") replacing the flat You-modal section list. User rejected the approach during live review — the flat list reads faster and feels less like a support FAQ. Reverted via `git restore` before commit; no artifacts in git history. Flat section list is the settled state. **Do not re-queue.**
  - **Pending-payment badge (still wanted, split out from Stage 4):** on-chip/in-balance "$0.12 · 1 pending" badge with honest tooltip about sub-minute confirmation. Track broadcasts from `useBoot` and client-side transfer paths; clear on next balance-poll delta or 90s timeout. ~30–60min. Natural fit once SSE/optimistic work lands — defer until after `/api/events`.
  - **Stage 5 — Earnings-first hierarchy + polish (DONE 2026-04-17):** Full dropdown restructure informed by parallel designer + researcher agent audits studying Apple, Google, Coinbase, Cash App, Phantom, Stripe, and Revolut patterns. Earnings-first hierarchy: all-time earnings (hero number `text-lg font-semibold`, collapsible chart default-open) → activity (2 visible, "View all N" toggle right-aligned in header, Stripe pattern) → balance (demoted to single row with inline "Add funds" link). Protected security status replaced with inline checkmark next to name (X-verified pattern); unprotected keeps full red banner. Font hierarchy two-tier system: static data zinc-500, interactive elements zinc-100 + underline. Section labels standardized to zinc-400 font-medium. Close buttons unified to SVG icons. "Your identity" → "Manage" button. Activity API limit bumped from 10 to 50. EarningsSparkline header removed (parent handles via toggle).
  - **Stage 6 — Amber brand + modal restructure + sweep hardening (DONE 2026-04-17):** Full amber rebrand (#f59e0b) across identity card, You modal, UpgradeModal, ChangePassphraseModal, MoveAddressModal — single accent color, gold top stripe, `#0f0f0f` backgrounds. You modal restructured as a clean launcher: Restore extracted to standalone RestoreModal; Move goes straight to MoveAddressModal (no inline expansion); only recovery key stays inline (read-only). **Sweep hardening:** both `sweepFunds` and `autoTransferFunds` switched from direct WoC to `/api/unspent` proxy (retry + cache + stale fallback); "no UTXOs" now returns `noFunds: true` flag instead of silent empty return; sweep failure blocks rotation with retry/proceed UI in MoveAddressModal; `sweepFunds` exported for independent retry. **Rotation lock:** `_rotationInProgress` flag in `identity.ts` prevents concurrent Move + Upgrade race condition. **Pre-rotation chain verification:** new `verifyMigrationChain` server action walks migration table before any rotation, warns if posts would be orphaned. **Merged Move + Passphrase:** MoveAddressModal now collects passphrase first, calls `upgradeIdentity` instead of `resetIdentity` — every rotation produces an encrypted key. "Not protected" banner opens MoveAddressModal directly. Plaintext key rotation (`resetIdentity`) removed from primary UI. **Mandatory memory clue** on all passphrase flows. **Activity key fix:** added index to React key to prevent duplicate-key errors when multiple payouts share the same timestamp.
  - **Stage 7 — Manage gate + combined backup + done-state polish (DONE 2026-04-30):** Single-passphrase gate on the You modal: verify once on entry, all eligible actions (Passphrase, Move) unlocked while modal is open; session destroyed on close OR tab blur (password-manager pattern). You modal collapsed Change Passphrase + Move rows into a single "Passphrase" row that opens MoveAddressModal — eliminates the two-flow ambiguity (both called the same primitives anyway). Restore row gets a parallel "Move to a saved key" subtitle. **Combined recovery file:** stage-3 download now contains BOTH `wif_encrypted` (new key) and `oldWif_encrypted` (old key under new passphrase) — one file, one passphrase, supersedes the temporary stage-1 file. **Auto-close timing fix:** wizard `onComplete` now updates identity state only (parent doesn't unmount the wizard); `onClose` (Continue button / X / backdrop on done) is the single dismissal path — user sees all status updates, sats-moved confirmation, and the safeguard reminder before exiting. **Memory clue input** gets `autoComplete="off"` + `autoCorrect/Capitalize="off"` + `spellCheck={false}` on all three modals (Move/Change/Upgrade) — browsers no longer surface previously-entered clues. **Done-state safeguard copy** (extended amber block with the critical sentence bolded in `text-amber-300`): file-and-passphrase mutual dependency made explicit — *"Without both, you cannot recover your account."* **Address → key** copy refinements throughout the wizard. **Em-dash entity fix:** three JSX text nodes still using `—` literal escape replaced with `&mdash;` (matches the `&apos;` precedent already in those lines).
  - **Stage 8 — Identity card deep polish (DONE 2026-05-01):** Full multi-agent review (designer + marketer + architect + code-auditor) of every word, button, click path, and stage. Shipped in eight commits across seven batches, each gated by code-auditor pre-commit verification.

    **Shipped:**
    - **A3 + Bonus (645aec2):** Deleted dead `backupConfirmed` state + render block (~30 lines, orphaned in Stage 6 cleanup). Deleted `src/components/UpgradeModal.tsx` (orphaned since Stage 6, not imported anywhere). Auditor caught and removed an unused `PassphrasePrompt` import in IdentityBar as a bonus.
    - **R4 + R5 partial + R7 + R8 + R10 (bbe8244):** Show recovery key row subtitle → *"Secret key — handle with care"*. Two MoveAddressModal validation errors trimmed (*"Same as your current passphrase"*, *"Add a memory clue — it's your only reminder if you forget."*). Passphrase-stage subtitle → *"Choose a passphrase"*. Empty activity state → *"Your earnings show here — share an idea, or boot posts you like."* Memory clue red helper → *"Only you should know what this means — it's stored unprotected in your recovery file."*
    - **R2 (028658d):** Restore row subtitle → *"Imports posts and earnings from a saved key"* — resolves the "stay on this one" pronoun ambiguity flagged by both designer and marketer.
    - **C1 + C3 + C4 (080596e):** Dropped pulse from "Not protected" banner. Done-state amber block 6 sentences → 3: *"Recovery file downloaded — it has both keys. Keep it safe (cloud, USB) and remember your passphrase. **Without both, you can't get back in.**"* RestoreModal red body drops duplicate sentence. Bonus: removed unused `isIdentityEncrypted` import from RestoreModal.
    - **C6 (db4beba):** Show recovery key panel reworked. Red warning *"Anyone with this key owns your account and any funds in it. Never share it."* above masked key. Replaced two-step Show→Copy with acknowledgement-gated `[Reveal key]` that splits into side-by-side `[Hide key]` `[Copy key]` after click.
    - **A2 (05c6624):** `RestoreModal.onSuccess` now sets `BACKED_UP_KEY` atomically (the file just restored IS the backup). Dropdown banner click handler collapsed to single `handleSaveFile` path — removed the 3-click protected-user detour.
    - **A1 (9785332):** Biggest structural change. Two stacked modals (gate + You modal) → single You modal with locked/unlocked internal states. Body cross-fades on unlock via `animate-[fadeIn_0.2s_ease-out]`. Auto-focus input on locked-state mount. Deleted ~63 lines of separate gate JSX.
    - **Bug fix (4e37f3c):** Move Cancel returns to You modal (matches RestoreModal pattern). `moveCompletedRef` distinguishes Cancel mid-wizard from Continue after success — Cancel just dismisses the wizard; Continue dismisses + re-locks the You modal because the new passphrase invalidates the cached gate session.

    **Explicitly rejected (do not relitigate):**
    - **C2** — Three "Move it somewhere safe (phone, cloud, USB)..." instances stay identical. Designer-validated: temporally distant, consistency = recognisable safety mantra.
    - **C5** — Currency toggle keeps "🐐 Goat / 💵 Noob" labels. Designer-validated: emotional framing is load-bearing.
    - **R1** — Passphrase row subtitle stays "Move to a fresh key — earnings and posts stay synced" — teaches the rotation consequence pre-emptively.
    - **R3** — ALL-CAPS section labels stay (Stripe/Linear/Vercel pattern; doesn't shout at 10–11px label size).
    - **Passphrase row label** — stays "Passphrase" (not "Upgrade", "Secure", "Protect").

    **Considered, deferred:**
    - **Path B identity-modal consistency refactor (deferred 2026-05-01, commit bd5e5bc):** convert MoveAddressModal + RestoreModal + Show recovery key into inline body-swaps inside the You modal (matching the locked-state pattern). Designer recommended; architect produced a 7-step plan; code-auditor adversarial review found 4 real bugs + 1 missed concern, including a tab-blur fund-loss scenario where interrupting the wizard mid-broadcast would leave localStorage with the OLD key while funds are already on the new address. Deferred because settings is low-traffic, the inconsistency only manifests on rapid cycling, and the risk-of-breaking-blockchain-state-mutating-code-paths outweighs the polish benefit. **Revisit when:** user feedback flags the inconsistency, OR there's bandwidth for a careful Path B implementation with all 5 mitigations + manual end-to-end testing of every wizard stage.
  - **What to preserve (architect red-team):** C9 backup-warning dot semantics, deferred-commit pattern in `commitUpgrade`, `getIdentity()` plaintext-preferred fallback ordering (subtle H5 regression surface), migration signature chain.
- [ ] Notification system (bell icon — "anon_x7f2 featured your post", daily earnings summary)
- [ ] Content moderation (report mechanism, basic filtering)
- [ ] Deploy to Railway + custom domain
- [x] Agent chat: dynamic MD loading (reads project MDs at request time, always current)
- [ ] Agent chat: DB query tools (live oracle — real post counts, contributor stats, boot prices)

## Tech Debt — TRACKED

- [x] ~~Optimistic blacklist on boots~~ — **REMOVED 2026-04-13** (replaced by mutex + throttle + 0-conf chaining).
- [x] ~~Confirmed-only filter on consolidation~~ — **REMOVED 2026-04-13** (redundant at 100 sat/kb).
- [x] ~~Server-side source tx cache~~ — **DONE 2026-04-13** (in-memory Map in `/api/tx-hex`, 2000-entry LRU). IndexedDB not needed — the server-side cache solves the WoC rate-limit problem for all clients.
- [ ] **Client-side IndexedDB source-tx cache** — nice-to-have future optimization. Current server-side cache handles the main problem. Client-side cache would eliminate the server round-trip entirely. Low priority.
- [ ] **Refactor `clientSideBoot` + `consolidateUtxos`** — current state still has some duplication across broadcast-result classification blocks. Architecture review (2026-04-11) flagged as frankenstein. Several tech debt items from that review are now resolved — refactor is lower priority. Revisit if/when the file grows further.

## Phase 7: The Recursive Model — PLANNED

- [ ] Post-to-project spawning
- [ ] Template system for new instances
- [ ] Yours Wallet integration via @1sat/connect for power users

## Open Source — IN PROGRESS

- [x] Clean up repo for public release
- [x] Ensure AI context files are comprehensive
- [x] Choose license — MIT
- [ ] GitHub public release
