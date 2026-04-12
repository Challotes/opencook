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
- **Implemented:** "Upgrade Security" in identity dropdown generates NEW key, old key signs migration, new key encrypted with AES-256
- Migration posted on-chain via OP_RETURN — permanent verifiable link from old pubkey to new pubkey
- All contribution history and future payments follow the migration chain
- Old key becomes useless after migration — someone stealing it gains nothing

### Security upgrade model (settled)
- **Self-service:** "Upgrade Security" button always visible in identity dropdown
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

- **Fee model:** Always pass `new SatoshisPerKilobyte(100)` explicitly to `tx.fee()` in both client-boot and server wallet. Never rely on the default `LivePolicy` (requires a GorillaPool network round-trip). 100 sat/kb matches BSV network policy and is accepted by ARC. User consolidation runs at 10 sat/kb (`client-boot.ts:591`) because consolidation txs are not time-sensitive. Rate was previously documented as 500 sat/kb but code has always used 100 — this line was corrected to match reality on 2026-04-09.
- **Consolidation strategy (Option F — "sweep on boot"):** `selectUtxos()` uses smallest-first ordering and includes up to 20 inputs per boot transaction. Users with many tiny UTXOs consolidate ~20 per boot for free via the change output. 290 UTXOs → fully consolidated in ~15 boots. Cost per consolidation: marginal extra tx bytes, no separate consolidation transaction needed.
- **No server custody:** Options A/C/D (server consolidation, held payouts, threshold batching) were all rejected — they require server custody or break the trustless model.
- **Dust threshold:** During UTXO selection, once boot + fee is covered, additional inputs are only included if their value exceeds the marginal fee cost of adding one more input (~74 sats). Absolute dust is never swept.
- **MAX_CONSOLIDATION_INPUTS = 20:** 20 P2PKH inputs ≈ 2,960 bytes ≈ 296 sats at 100 sat/kb. Stays well under the boot price floor (1,000 sats minimum), leaving room for the payout in the same transaction. Tunable constant in `client-boot.ts`.
- **DUST_THRESHOLD = 2 sats (settled 2026-04-10).** Minimum UTXO value worth sweeping during consolidation. At 10 sat/kb consolidation fee rate, each P2PKH input costs ~1.5 sats. Was previously 10, which trapped UTXOs of 3–9 sats permanently. MAX_CONSOLIDATION_SWEEP = 200 caps pathological inputs.
- **Optimistic UTXO blacklisting (settled 2026-04-10).** Client marks inputs as spent BEFORE calling broadcast(). Only un-blacklists on network exception (tx bytes never left browser). All miner responses (ORPHAN, conflict, success) keep inputs blacklisted. Prevents the "state poisoning" bug where failed broadcasts left UTXOs in a "spent by network, available to client" state causing cascading mempool conflicts on subsequent boots/consolidations. **NOTE 2026-04-11:** marked as tech debt by architecture review — defensive pattern covers a 50ms window already serialized by the mutex. Candidate for removal when IndexedDB source-tx cache lands.
- **3-second UI boot throttle (settled 2026-04-11).** Boot button is disabled for 3 seconds after each click. Eliminates the entire class of "user clicks faster than the network propagates" edge cases (orphan races, mempool conflicts, double-spend attempts) at zero code complexity. Architecture review recommendation — chosen over a 50-line DOUBLE_SPEND_ATTEMPTED handler that would have solved the same problem with much more complexity.
- **Reset Wallet via key rotation (settled 2026-04-11).** When a user's wallet enters a poisoned state (orphan-mempool ghosts, multi-hop UTXO contamination), code-level cleanup is unreliable. Recovery is operational: rotate to a fresh BSV keypair, register the migration on-chain via the existing migration.ts pipeline, sweep all confirmed UTXOs from the old address to the new one. Fixes broken wallets in one click. Replaces the rejected DOUBLE_SPEND_ATTEMPTED handler approach. Implemented as `MoveAddressModal` — a 4-stage wizard that auto-advances with visible status at each step. Label is "Move to a new address" (not "Reset Wallet") per UX review.
- **Deferred localStorage commit for key rotation (settled 2026-04-12).** `resetIdentity()` accepts `{ deferCommit: true }`. The new key is NOT written to localStorage until the caller (MoveAddressModal) confirms all stages succeeded — sweep broadcast + migration recording. Without this, a failed sweep would strand funds: localStorage updates to the new (empty) key while the old key's funds are unreachable. This bug caused a real loss of 45,558 sats during testing.
- **Client-side broadcaster routing (settled 2026-04-12).** ARC (GorillaPool, the @bsv/sdk default) is kept for `clientSideBoot` — benefits from structured error responses (ORPHAN status, competingTxs) and 0-conf chaining via BEEF. WhatsOnChainBroadcaster is used for `sweepConfirmedFunds`, `autoTransferFunds`, and `consolidateUtxos` — simple self-transfers that need reliability over diagnostics, and accept 10 sat/kb. ARC was unreliable from the browser (connection timeouts, CORS overhead) while working fine server-side. Server wallet (`buildAndBroadcast`) stays on ARC.

## Wallet Integration (future)

- Yours Wallet integration via `@1sat/connect` for power users
- Coexists with in-app wallet — not a replacement
- Not needed until later phases
