# Decisions

> Key decisions already made. Don't relitigate these unless the reasoning no longer applies. If you're an AI, respect these — they came from deliberate discussion, not defaults.

## Naming

- **Project name:** BSVibes (formerly "Build From Nothing" — renamed 2026-03-23)
- **Subtitle:** Agentic Fairness — fairness enforced by autonomous AI agents, not committees
- **bOpen.ai** is the toolkit, not the product. "created with bopen.ai" shown in UI
- **User-facing language:** Use crypto terms only when they're the clearest option, always in a friendly context. No jargon for jargon's sake, but don't avoid words users already understand.
  - "key" and "recovery key" are fine — Google/Apple have normalised these
  - "WIF", "private key", "ECDSA", "pubkey" — too technical for UI, avoid
  - "wallet" — avoid (BSVibes isn't a wallet app)
  - "address" — use sparingly, prefer "deposit" or "add funds" where possible
  - "passphrase" over "PIN" (minimum 8 chars, not a 4-digit PIN)
  - When in doubt: would a non-crypto person understand this without Googling? If not, rewrite it

## Identity & Security

### Current state (Phase 1 — acceptable for now)
- BSV keypair generated in-browser via `PrivateKey.fromRandom()`
- Stored as plaintext WIF in localStorage
- No encryption, no password, no PIN
- Acceptable only because no real money is at stake yet

### The hardware problem (settled)
- BSV uses secp256k1 elliptic curve
- No hardware chip supports secp256k1 directly (not Apple Secure Enclave, not TPMs, not passkeys, not YubiKeys)
- Hardware can't **be** the BSV key, but hardware can **guard** it via encryption wrapping

### Planned upgrade path (6 stages, settled)
1. **Fix Now:** Server-side signature verification, rate limiting, try/catch on JSON.parse, hide WIF from DOM, CSP headers
2. **Stage 1 (current):** Raw localStorage with renamed labels
3. **Stage 2:** Passphrase encryption — download backup first, then set passphrase, AES-256 encrypt localStorage. Fresh key at upgrade time
4. **Stage 3:** Passkey wrapping — WebAuthn PRF replaces passphrase. Firefox falls back to passphrase. HKDF domain separation
5. **Stage 4:** Self-funded posting — UTXO check, client-side tx building, server fallback
6. **Stage 5:** Revenue + daily limits — 5 free posts/day, QR to fund, fairness agent routes revenue
7. **Stage 6:** Server HSM / threshold signing — required before significant funds flow

### The 5-minute window problem (settled + implemented)
- Any key that existed as plaintext in localStorage must be assumed potentially compromised
- **Implemented:** Protection happens via `MoveAddressModal` (the "Passphrase" row of the You modal, also the entry point from the "Not protected" red banner). The wizard generates a NEW key, the old key signs a migration, and the new key is stored AES-256-encrypted.
- Migration posted on-chain via OP_RETURN — permanent verifiable link from old pubkey to new pubkey
- All contribution history and future payments follow the migration chain
- Old key becomes useless after migration — someone stealing it gains nothing

### Security upgrade model (settled)
- **Self-service:** Unprotected users see a red "Not protected" banner at the top of the identity dropdown that opens `MoveAddressModal` directly. Protected users use the same wizard via the "Passphrase" row in the You modal.
- **Deferred activation (future):** System nudges users when earnings reach a threshold (e.g., $5) but haven't upgraded yet
- **Zero friction for new users:** No passphrase required on first visit. Upgrade is optional and user-initiated
- **Key rotation on upgrade:** Fresh keypair born encrypted, never existed as plaintext

### Passkey-wrapped keys (chosen approach)
- BSV key encrypted with AES-256
- Decryption key derived from WebAuthn PRF extension tied to biometrics
- Stolen localStorage = useless ciphertext
- Works on Chrome, Safari, Edge; Firefox needs passphrase fallback
- Medium implementation effort, best security/UX tradeoff

## Self-Funded Posting (settled)

- Server pays for posts by default (~0.00001 BSV per post)
- When user has BSV balance, app silently switches to user-funded
- Same button, same UX — funding source switches invisibly
- Must create change output or user loses remaining balance
- Cost: ~1 satoshi per post; 10,000 satoshis covers thousands of posts

## Anti-Spam (settled direction)

- Free posts capped per day (5/day suggested)
- Under limit: server pays, no friction
- Over limit with balance: self-funded, no friction
- Over limit without balance: "You've got more to say" + QR code
- Server-side enforcement (pubkey + IP + session token), not chain-only
- Optional: proof-of-work for free posts

## Bootboard (settled)

- **Mechanic:** Any post can be "booted" to a spotlight slot by paying a fee. Someone else pays, you get booted off
- **Boot count:** Tracked per post — shows how many times a post has been featured
- **Revenue model:** Built into the UX, not bolted on. Creates natural urgency and competition
- **Animations:** Shake + glow + slide-in on holder change. Expandable history
- **Boot icon:** Uses 🥾 emoji (custom SVG attempted, reverted to emoji for clarity at small sizes)

## Agent Chat (settled)

- **AI-powered:** Uses Claude Haiku 4.5 via Anthropic API with streaming SSE responses
- **System prompt:** Single source of truth in `src/data/agent-prompt.ts`
- **Endpoint:** `/api/agent` route handler (POST, streams text chunks)
- **Cost:** ~$0.001 per question (~25,000 questions per $25 credits)
- **Rate limiting:** 30 requests/min per IP + max 3 concurrent requests (prevents Anthropic API overload)
- **Input limits:** Max 20 messages, 2000 chars each per request
- **Location:** "Ask AI" pill button below compose box, opens as centered modal (bottom sheet on mobile)
- **Post button:** Telegram-style — mic icon when empty, amber send arrow when text is present

## Genesis Section (settled)

- **Founding conversation** preserved at top of feed as immutable record
- **Visited state** persisted in localStorage — shows full "Genesis" pill first visit, discreet chevron after
- **Fairness agent tie-in:** This is the starting point for contribution tracking
- **NOT collapsible — by design.** Genesis is feed content, not a UI widget. It lives at the top of the scroll area. Users discover it by scrolling up (via the Genesis button), not by toggling a panel. Do not add a collapse/expand toggle.

## Feed UX Model (settled)

- **Telegram-style:** User enters at the most recent post (bottom of feed). Feed grows upward.
- **Unread tracking:** When user leaves and returns, new posts accumulate. Unread counter badge shows on the scroll-to-bottom button. IntersectionObserver marks posts as read when they scroll into view.
- **Navigation:** Scroll-to-bottom button (with unread count) and genesis chevron (scroll to top) are the two navigation anchors. Users explore the full history by scrolling between them.
- **Mobile enter-to-post:** The Telegram-style mic→arrow toggle on the compose button is the primary affordance. The "Enter to post" text hint is desktop-only — this is intentional, not a bug. Mobile users tap the amber arrow.
- **No collapse, no accordion, no "read more" gates** on any feed content. The feed is a continuous scroll.

## Agentic Fairness (settled direction)

- **Phase 1:** Human-defined parameters, AI executes (current target)
- **Phase 2:** AI suggests parameter changes, humans approve
- **Phase 3:** AI adjusts within bounds, humans can override
- **Phase 4:** Fully agentic, humans only intervene on disputes
- The name describes the vision, not just today's implementation
- **Revenue model:** Boot fees split directly to contributors via multi-output BSV transaction. See **FAIRNESS.md** for the full model, formula, parameters, and gaming analysis
- **This is a demo model** — simple post-count + engagement + recency. Will evolve as real value contributions emerge (code, design, community). The point is proving the mechanism works first

### Revenue Distribution Rules (settled)
- **True no-custody:** Every sat in = every sat out in the same transaction. No database balances, no pending payouts, no IOUs. Even 1-sat shares get a UTXO output.
- **Boots require signed identity:** Booter must have a pubkey. Prevents free boot abuse (can't fake a new identity to get more free boots). Unsigned users can post but not boot.
- **Only signed posts are boostable:** The creator bonus (15%) needs an address to pay. Unsigned posts can't be booted. Encourages identity adoption.
- **Zero pool recipients → creator gets 95%:** If nobody qualifies for the pool (e.g., only 1 contributor who is the creator), the 80% pool goes to the creator. 5% still goes to platform.
- **Dynamic pricing formula:** `boot_fee = max(1000, min(250000, active_contributors × 156))`. Active = posted in last 30 days, counted by pubkey only. Price cached 1 hour. Rationale: 156 ensures bottom-25% contributors clear meaningful payouts under Pareto distribution.
- **Free boots:** First 15 per pubkey, tracked in SQLite `boot_grants` table. Server wallet pays at the **floor price** (1,000 sats), not the dynamic price. After 15, user funds their address via QR code. See "Free boots pay floor only" decision below for rationale.
- **$50/month operator budget:** Covers subsidised boots, on-chain posting, hosting, API. Sustainable through ~200 users, then user-paid boots and 5% platform cut take over.
- **Trustless P2P payments:** Paid boots are built client-side — user's browser constructs the multi-output BSV transaction directly to every contributor. Server never touches user funds. Server only provides the contributor list. The transaction itself is the verifiable proof. Free boots use the server wallet (server is the payer, not custodian).
- **Auto-switch:** Free boots → server pays. User has BSV balance → client builds trustless tx. No balance → show fund address QR. One click, ~800ms, zero custody.
- **Currency display:** Default is dollars ("Noob Mode"), toggle to sats ("Goat Mode"). Persisted in localStorage. Applies to chip balance, activity feed, and boot prices. BSV price from WhatsOnChain API, cached.
- **Identity import cleans up migrations (settled).** When importing an old key, any migration records pointing away from that key are automatically deleted. Prevents payouts routing to lost addresses.
- **Security upgrade forces backup download (settled).** Auto-downloads the new key backup BEFORE the upgrade is considered complete. User cannot lose access to upgraded key.
- **Free boots are one-time only (settled).** 15 free boots per identity, never reset. Once used, user pays from their earnings or funded balance. No monthly reset, no balance-based gating. The 15 boots are an onboarding gift — "try before you buy." After that, the economy takes over.
- **Free boots pay floor only (settled 2026-04-09).** The server wallet pays the boot price floor (1,000 sats) on free boots, regardless of the current dynamic price. Supersedes the prior "dynamic price" rule. **Rationale:** per-user subsidy cost is now bounded at ~15,690 sats (15 × ~1,046) forever, independent of platform scale or contributor count. At BSV $25 that is ~$0.004/user; at BSV $100, ~$0.016/user — safely within the $50/month operator budget across all realistic price ranges. Dust concerns are handled by the existing split model (`split.ts:49` — every non-zero share is paid, down to 1 sat), by the sqrt × decay weight curve which naturally concentrates value on top contributors, and by the fact that free boots are a symbolic onboarding gift, not a full economic event. The real economy happens on paid boots where dynamic pricing (`contributors × 156`) keeps pool shares at ~125 sats each. **Trade-off:** contributors earn less per free boot than per paid boot. This is intentional — it preserves the onboarding gift framing without scaling the server subsidy cost with platform success. **Alternatives rejected:** tapering free-boot count (violates the "one-time only" decision above, has Sybil attack surface via contributor count inflation, creates UX unfairness between launch-day and later users, and breaks Phase 2 agent governance by making `freeBootsPerUser` non-constant), batching sub-dust payouts (breaks the trustless no-custody model), and top-K concentration (unnecessary — the sqrt curve already concentrates naturally). A GorillaPool miner fee deal is pursued separately as an optional optimization, not a dependency.

## Tech Stack (settled)

- Next.js 16 + TypeScript + Tailwind v4 + SQLite + BSV
- Telegram/X/GPT hybrid UI — feed-first, dark theme, pinned compose
- Server components by default, client only when needed
- Dynamic imports for @bsv/sdk
- **Linter:** Biome (replaced ESLint 2026-03-25 — ESLint script was broken, Biome is faster and simpler)
- **React Compiler:** Enabled (auto-memoization, free perf wins with React 19)
- **Identity:** Shared via IdentityProvider context (replaces 4 independent useIdentity() calls that each loaded BSV SDK)
- **ISR:** 10-second background revalidation on page.tsx (other users see new posts without manual refresh)
- **bootPost:** Wrapped in SQLite transaction with input validation (prevents race conditions on concurrent boots)
- **Foreign keys:** PRAGMA foreign_keys = ON (was decorative before)
- **Real-time:** Client polls /api/posts every 5s with since_id (pauses when tab hidden). Exposes `refresh()` for on-demand polling after post/boot
- **Optimistic UI:** Posts appear instantly at full opacity (no spinner — server confirms in ~50ms). Pruned on next poll (500ms early poll after post). Boot count increments optimistically
- **revalidatePath removed:** ISR `revalidate = 10` handles cold loads for new visitors. Polling handles active users. revalidatePath was adding 50-200ms of blocking server work per action with zero user benefit
- **BSV SDK caching:** Client-side SDK loaded once via singleton promise (`getBsvSdk()`), kicked off on page load. PrivateKey parsed from WIF once per session. Eliminated ~280ms cold import + repeated BigNumber work on every post
- **Pagination:** Cursor-based by post ID (not timestamp — IDs are monotonic, no collision risk)
- **Deployment:** Railway with persistent /data volume for SQLite. Dockerfile as alternative. DB path via DATABASE_PATH env var
- **PWA:** manifest.json + SVG icon. No service worker / offline support yet — just home screen install

## Critical Bugs Known

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Server never verifies signatures | Critical | FIXED (2026-03-25) — ECDSA verification via @bsv/sdk |
| 2 | No rate limiting | Critical | FIXED (2026-03-25) — in-memory sliding window per-author |
| 3 | WIF displayed raw in DOM | High | FIXED (2026-03-25) — masked by default, reveal toggle |
| 4 | Backup file contains raw WIF | High | TODO |
| 5 | JSON.parse without try/catch | Medium | FIXED (2026-03-25) — returns null on parse failure |
| 6 | Database file in project root | Low | TODO |

## UTXO Management (settled)

- **Fee model: 100 sat/kb everywhere (settled 2026-04-13).** Always pass `new SatoshisPerKilobyte(100)` explicitly to `tx.fee()` across ALL tx paths — boots, consolidation, sweeps, transfers. No more split fee tiers. Previously consolidation/sweeps used 10 sat/kb to save ~120 sats per tx; this contributed to slow confirmations that cascaded into ORPHAN_MEMPOOL, mempool-conflict, and multi-day unconfirmed chains. The savings were $0.00003 per tx. Not worth the complexity or risk.
- **Consolidation strategy (Option F — "sweep on boot"):** `selectUtxos()` uses smallest-first ordering and includes up to 20 inputs per boot transaction. Users with many tiny UTXOs consolidate ~20 per boot for free via the change output. 290 UTXOs → fully consolidated in ~15 boots. Cost per consolidation: marginal extra tx bytes, no separate consolidation transaction needed.
- **No server custody:** Options A/C/D (server consolidation, held payouts, threshold batching) were all rejected — they require server custody or break the trustless model.
- **Dust threshold:** During UTXO selection, once boot + fee is covered, additional inputs are only included if their value exceeds the marginal fee cost of adding one more input (~15 sats at 100 sat/kb). Absolute dust is never swept.
- **MAX_CONSOLIDATION_INPUTS = 20:** 20 P2PKH inputs ≈ 2,960 bytes ≈ 296 sats at 100 sat/kb. Stays well under the boot price floor (1,000 sats minimum), leaving room for the payout in the same transaction. Tunable constant in `client-boot.ts`.
- **DUST_THRESHOLD = 16 sats (updated 2026-04-13).** Minimum UTXO value worth sweeping during consolidation. At 100 sat/kb, each P2PKH input costs ~15 sats. Was 2 sats when consolidation ran at 10 sat/kb; was 10 before that (which trapped 3–9 sat UTXOs). MAX_CONSOLIDATION_SWEEP = 200 caps pathological inputs. **Linked to fee rate:** if the fee model changes (miner partnership, rate reduction, or increase), recalculate DUST_THRESHOLD as `ceil(148 × rate_per_byte) + 1`. At 50 sat/kb → 8 sats, at 10 sat/kb → 2 sats, at 1 sat/kb → 1 sat. Also update the boot-time dust threshold in UTXO selection (~15 sats at current 100 sat/kb). Both thresholds are in `client-boot.ts`.
- **Optimistic UTXO blacklisting — REMOVED (2026-04-13).** Originally added 2026-04-10 to prevent state poisoning from failed broadcasts. Removed because it caused permanent wallet lockout: failed broadcasts left inputs blacklisted in localStorage with no automatic recovery. Double-spend prevention is now handled by: (1) mutex serializing boot calls, (2) 0-conf chaining via `_pendingChange` (own change outputs with sourceTransaction attached), (3) 3s UI boot throttle. Inputs are now blacklisted ONLY on successful broadcast.
- **3-second UI boot throttle (settled 2026-04-11).** Boot button is disabled for 3 seconds after each click. Eliminates the entire class of "user clicks faster than the network propagates" edge cases (orphan races, mempool conflicts, double-spend attempts) at zero code complexity. Architecture review recommendation — chosen over a 50-line DOUBLE_SPEND_ATTEMPTED handler that would have solved the same problem with much more complexity.
- **Reset Wallet via key rotation (settled 2026-04-11, updated 2026-04-13).** When a user wants to rotate to a fresh address, `sweepFunds` (formerly `sweepConfirmedFunds`) transfers ALL UTXOs (confirmed + unconfirmed) from the old address to the new one. At 100 sat/kb all txs confirm in next block, so unconfirmed UTXOs are safe to include. Migration is registered on-chain via existing migration.ts pipeline. Implemented as `MoveAddressModal` — a 4-stage wizard that auto-advances with visible status at each step. Label is "Move to a new address" (not "Reset Wallet") per UX review.
- **Deferred localStorage commit for key rotation (settled 2026-04-12).** `resetIdentity()` accepts `{ deferCommit: true }`. The new key is NOT written to localStorage until the caller (MoveAddressModal) confirms all stages succeeded — sweep broadcast + migration recording. Without this, a failed sweep would strand funds: localStorage updates to the new (empty) key while the old key's funds are unreachable. This bug caused 45,558 sats to be stranded during testing — recovered only because the auto-download backup of the old key (Stage 1) preserved access to the old address. This validates the design of downloading the old key BEFORE rotation as a critical safety net, not just a convenience.
- **Broadcaster: ARC everywhere (settled 2026-04-13).** All broadcast paths use ARC (@bsv/sdk default `tx.broadcast()`) — `clientSideBoot`, `consolidateUtxos`, `sweepFunds`, `autoTransferFunds`, and server wallet's `buildAndBroadcast`. Previously a mix of ARC and WhatsOnChainBroadcaster — the WoC switch was based on a misdiagnosed ARC outage (actually a local DNS cache issue, resolved by rebooting the PC). ARC sends txs directly to GorillaPool (the miner), provides structured error responses (ORPHAN status, competingTxs for double-spend), and supports 0-conf chaining via BEEF. WoC is used only for read operations (UTXO fetching, source tx hex, balance, exchange rate) — not broadcasting.
- **Server-side source tx cache (settled 2026-04-13).** `/api/tx-hex/route.ts` maintains an in-memory Map (~2000 entries, LRU eviction) of fetched source tx hex. Source tx hex is immutable, so cache-forever is correct. Eliminates repeated WoC calls for the same txid across boots, sweeps, and consolidations. Without this, a boot with 15+ inputs fires 15+ parallel WoC calls, exceeding WoC's ~3 req/s limit and causing 429 errors.
- **Explicit backup acknowledgement (settled 2026-04-16).** `backedUp` no longer flips on download trigger alone — the user must click a "Got it" confirmation after the file is offered. Applies to both paths: the You dropdown (green confirmation banner replaces the orange save-CTA) and `MoveAddressModal` (new `saved-confirm` stage gates the auto-advance to the irreversible sweep). Rationale: silent download failures (popup blocker, disk full, CSP deny, user cancels save dialog) previously masqueraded as success and cleared the warning dot — leaving users with no backup and no visible prompt. Commit `e7ecf9f`.
- **Unconfirmed-parent 404 retry in `/api/tx-hex` (settled 2026-04-16).** When WoC returns 404 on a `/tx/{txid}/hex` lookup, the parent may be a just-broadcast 0-conf chain ancestor that WoC hasn't indexed yet (typical lag: 2–10s). The proxy now retries 404s up to 3 times with 2s backoff (~6s total budget) before giving up. Kept as a separate counter from the 429/5xx retry budget so a genuinely missing tx still fails fast after the 6s window. Motivated by `fetchSourceTxsBatched` sweeps that 404'd on their own just-broadcast change parents during `MoveAddressModal` / `clientSideBoot`. Future optimization (deferred): cache own broadcast `rawTx` client-side and pass through so sweep paths never need to round-trip through WoC for their own parents.
- **Batched source tx fetches in clientSideBoot (settled 2026-04-13).** `clientSideBoot` fetches source transactions in batches of 5 with 1s inter-batch delay (matching `consolidateUtxos` pattern). Previously used bare `Promise.all` which fired all fetches simultaneously, triggering WoC rate limits on users with many UTXOs.
- **Deferred session cache in upgradeIdentity (settled 2026-04-12).** `upgradeIdentity()` no longer sets `_sessionIdentity`/`_cachedWif`/`_cachedPrivateKey` eagerly. `commitUpgrade(encStore, identity)` now accepts an optional identity and commits the session caches atomically with the localStorage write — only after `migrateIdentity()` server action succeeds. Matches the deferred commit pattern in `resetIdentity()`. Prevents in-memory signing key from diverging from server's identity record on migration failure.
- **Balance poll interval: 30s (updated 2026-04-13).** `IdentityBar.fetchLiveBalance` polls every 30 seconds (was 15s). Halves the background WoC request rate to reduce 429 pressure from normal page sitting. As of 2026-04-14 it polls `/api/balance` (server-proxied), not WoC directly.
- **Server-side WoC read proxies (settled 2026-04-14).** `/api/balance` (10s TTL, 120 req/min per IP) and `/api/unspent` (3s TTL, 180 req/min per IP) join `/api/tx-hex` as cached server proxies for all WhatsOnChain read traffic. Direct browser→WoC reads are gone. Rationale: WoC rate limits at ~3 req/s per IP; a paid boot with 15 UTXOs + background balance polls + other tabs easily exceeded this, producing 429 cascades that broke boots and froze balances. Server-side caching collapses N client requests to 1 upstream request within the TTL window and isolates the browser from WoC's rate policy. Both proxies retry 429/5xx with stale-cache fallback. IdentityBar falls back to last-known balance (not 0) on transient errors so the UI doesn't flash empty.
- **Boot confirmation via local tx parsing (settled 2026-04-14).** `/api/boot-confirm` no longer fetches the tx from WoC to verify outputs. Client sends `rawTx` alongside `txid`; server verifies `hash(rawTx) === txid` (self-authenticating) and parses P2PKH outputs locally from the raw bytes to check the split matches. Server also re-broadcasts via ARC as a safety net. Eliminates the 5–30s WoC indexing lag that previously produced false TX_NOT_FOUND errors on freshly broadcast boots, and removes another WoC rate-limit chokepoint from the critical boot path. Returns explicit `TX_CONFLICT` vs `ARC_UNAVAILABLE` error codes so the client can distinguish fatal conflicts from retriable upstream issues.
- **Structured error codes in broadcast detection (settled 2026-04-14).** Broadcast error classification matches against a structured `code` field on ARC responses, not substring search on the message. Prior substring matching against e.g. "257" produced false positives inside unrelated txids/timestamps, mislabelling successful broadcasts as conflicts. See `client-boot.ts`.
- **Server wallet shares the client's resilience stack (settled 2026-04-15, build deferred).** Server-side tx paths (`wallet.ts`, `onchain.ts`, `boot-orchestrator.ts`) must go through the same `/api/broadcast` proxy and shared WoC read cache as the browser — not direct `tx.broadcast()` or raw `fetch` to WoC. Rationale: the mutex in `wallet.ts` serializes ALL server-side on-chain activity (posts + free boots) through one broadcast call. An ARC hang without timeout freezes the entire platform for the hang duration. A dropped 0-conf chain fan-outs into uncached WoC reads that can trigger 429s and stall recovery. The browser was hardened against both during the 2026-04-13/14 work; the server path was not. Rule: if a resilience mitigation exists for a client path, it must also cover the server path that does the equivalent external call. See ROADMAP Phase 6.5 for build-spec (proxy, shared cache module, broadcast timeout, queue-depth metric, low-balance alert).
- **Real-time updates: SSE is enhancement, polling is ground truth (settled 2026-04-15, build deferred).** When implemented, the planned `/api/events` SSE channel and optimistic own-action updates are a UX accelerator on top of the existing 30s polling, NOT a replacement for it. Polling (`/api/balance`, `/api/earnings`, `/api/earnings?summary=1`) stays as the authoritative source. SSE events trigger an early refetch; they do not directly mutate canonical state. Rationale: SSE can drop silently (connection, edge cold-start, in-process emitter on a non-subscribed instance); optimistic balance can diverge from chain reality if a tx is orphaned or replaced. Polling self-heals both within one tick. Corollary: **do not remove the polling loops when SSE lands** — they are the fallback that makes SSE safe to fail. Also: emit-site must be wrapped in a `publishPayout()` helper so the in-process EventEmitter can be swapped for Redis pub/sub or Postgres LISTEN/NOTIFY when the app goes horizontally scaled, without touching any caller. See ROADMAP Phase 6.5 for the build-spec.

- **Every key rotation produces an encrypted key (settled 2026-04-17).** `resetIdentity()` (plaintext key rotation) removed from primary UI. Both "Not protected" and "Move to new address" now route through `upgradeIdentity()` via MoveAddressModal, which collects a passphrase first. Users are always protected after rotation. Plaintext `resetIdentity` remains in the codebase as an emergency recovery escape hatch only. Rationale: each rotation risks chain breaks — fewer rotations (one instead of two for move-then-protect) = fewer opportunities for orphaned posts. The combined flow also downloads an encrypted backup automatically, reducing the number of recovery files a user must manage.
- **Identity sweep functions use the /api/unspent proxy (settled 2026-04-17).** `sweepFunds()` and `autoTransferFunds()` in `identity.ts` no longer hit WoC directly. They use `/api/unspent?fresh=1` which provides retry, stale-cache fallback, and rate-limit protection. Rationale: a single WoC 429 or empty response during a sweep previously caused silent fund loss — the function returned "no funds, not an error" and the rotation committed, stranding sats on the old address with the key deleted from localStorage.
- **Pre-rotation chain verification (settled 2026-04-17).** `verifyMigrationChain(pubkey)` server action checks that all posting pubkeys resolve to the current key via the migrations table before any key rotation. If orphaned pubkeys are detected, the user is warned with a "proceed anyway" escape hatch. Rationale: migration chain breaks silently orphan posts from the fairness system, dropping earnings from ~590 to ~11 sats per split with no visible error.
- **Memory clue is mandatory (settled 2026-04-17).** The passphrase hint field is required in MoveAddressModal (passphrase stage) and ChangePassphraseModal. Submit button disabled until filled. No minimum length — a user who types "x" has made a conscious choice, but skipping entirely is blocked. Rationale: BSVibes has no email/phone recovery channel; the hint is the only lifeline if a user forgets their passphrase.
- **Single-passphrase manage gate (settled 2026-04-30).** The You modal verifies the passphrase once on entry (`manageAuthed` state); session destroyed on modal close OR tab blur (password-manager pattern). Move + Passphrase actions unlocked while open without re-prompting. Rationale: passphrase fatigue across the merged Passphrase / Move flows — both call the same primitives, both require re-auth at the action level was redundant. Tab-blur destroy is the lightweight session-timeout primitive (full app-wide auto-lock with timer remains in FUTURE.md). **Do not re-add per-action prompts to Passphrase/Move** without superseding this decision.
- **Combined recovery file (settled 2026-04-30).** Stage-3 download in MoveAddressModal contains both `wif_encrypted` (new key) AND `oldWif_encrypted` (old key under new passphrase). One file, one passphrase, both keys recoverable. Supersedes the temporary stage-1 file (which the done-state copy explicitly tells the user to delete). Rationale: the prior pattern produced two files per rotation, increasing the chance the user kept the wrong one or none. The combined file also keeps the old key available for any unconfirmed UTXOs that miss the sweep, without leaving plaintext exposure.
- **Asymmetric re-prompt on Show recovery key + Restore is intentional (settled 2026-04-30).** Despite the manage-gate session being valid, "Show recovery key" and "Restore" still re-prompt for the passphrase. This is **theatre asymmetry by design** — the gate already unlocked the session, but these flows touch the highest-stakes paths (irreversible reveal of the raw WIF / overwrite of the local identity) and re-verify defensively. Architect agent reversed position on a unification proposal after weighing the cost of a mistaken click vs the friction of an extra prompt. **Do not "fix" this for consistency in a future refactor.** Rationale: defense-in-depth on reveal/overwrite is worth the small UX inconsistency; cheaper actions (Passphrase, Move) inherit the gate.
- **Wizard auto-close split (settled 2026-04-30).** `MoveAddressModal.onComplete` updates identity state only (parent does not unmount the wizard); `onClose` (Continue button / X / backdrop on done) is the single dismissal path. Rationale: the prior `onComplete = close everything` pattern dismissed the wizard the instant `setStage("done")` fired, so the user never saw the completed steps, the sats-moved confirmation, or the safeguard copy. The user must explicitly acknowledge the done state before exit.

## Wallet Integration (future)

- Yours Wallet integration via `@1sat/connect` for power users
- Coexists with in-app wallet — not a replacement
- Not needed until later phases
