# BSVibes — AI Context File

> **If you're an AI reading this:** This file is your onboarding. Read it fully before writing any code.
> After completing significant work, update the relevant context files (DIRECTION.md, DECISIONS.md, ROADMAP.md) with what you changed and why.

## What This Is

A platform that builds itself. It started as a post board and evolves based on user contributions. Every post is logged on-chain (BSV). An Agentic Fairness system tracks contributions and distributes value. Eventually, any idea can spawn into its own project with the same model.

**Tagline:** "A platform that builds itself, then lets anyone do the same."
**Subtitle:** Agentic Fairness

## Toolkit

This project is built using the **bOpen.ai toolkit** (agents, skills, plugins). bOpen is the tooling, not the product. The product is BSVibes.

## Architecture

- **Framework:** Next.js 16 (App Router) + React 19.2 + TypeScript + Tailwind CSS v4
- **Build:** Turbopack (dev + prod), React Compiler enabled (`reactCompiler: true` in `next.config.ts`)
- **Linter/Formatter:** Biome (`biome.json`) — replaced ESLint 2026-03-25. Full auto-format pass applied 2026-04-10 (0 lint errors across 69 files).
- **Database:** SQLite (better-sqlite3) for local dev, file: `local.db`
- **Blockchain:** BSV via `@bsv/sdk` — keypair generation, signing, on-chain logging
- **Identity:** Auto-generated BSV keypair stored in browser localStorage
- **Styling:** Dark theme (zinc/black palette), Telegram/X/GPT hybrid UI

## Key Files

### API Routes

- `src/app/api/posts/route.ts` — Feed polling (GET, ?since_id for incremental updates)
- `src/app/api/boot-shares/route.ts` — Contributor shares + boot price for client-side tx building
- `src/app/api/boot-confirm/route.ts` — Records boot after client broadcasts (rawTx + local P2PKH parsing, self-authenticating hash(rawTx)===txid check, ARC re-broadcast safety net, replay protection, rate limiting)
- `src/app/api/boot-status/route.ts` — Free boots remaining + boot price for a user
- `src/app/api/earnings/route.ts` — Total earned, activity feed, earnings history for chart
- `src/app/api/agent/route.ts` — Streaming agent chat (SSE, rate-limited)
- `src/app/api/tx-hex/route.ts` — WhatsOnChain raw-tx proxy (cached, retries, stale fallback)
- `src/app/api/balance/route.ts` — WhatsOnChain balance proxy (10s cache, 120/min, graceful fallback on 429)
- `src/app/api/unspent/route.ts` — WhatsOnChain UTXO proxy (3s cache, 180/min, retries with stale fallback)

### Server Actions & Data

- `src/app/actions.ts` — Server actions. Reads (no signature): getPosts, getNewPosts, getUpdatedPosts, getOlderPosts, getBootboard, verifyMigrationChain (pre-rotation orphan check). Mutations (signature-verified): createPost, bootPost, migrateIdentity, cleanupMigrations.
- `src/lib/db.ts` — SQLite setup (WAL, foreign keys, auto-migration, indexes, boot_grants + payouts tables)
- `src/lib/rate-limit.ts` — In-memory sliding window rate limiter
- `src/lib/utils.ts` — Shared utilities (generateAnonName, cn helper)
- `src/data/agent-prompt.ts` — Dynamic agent prompt builder (loads MDs at request time)
- `src/data/genesis.ts` — Genesis conversation data

### Pages & Components

- `src/app/page.tsx` — Main entry (server component, 10s ISR)
- `src/app/Feed.tsx` — Client orchestrator: polling, optimistic posts, pagination
- `src/app/Header.tsx` — Top bar with logo, genesis nav, identity chip
- `src/app/PostList.tsx` — Post rendering, BootButton, Genesis anchor
- `src/app/PostForm.tsx` — Compose box (enter-to-post, voice-to-text, agent chat trigger)
- `src/app/IdentityBar.tsx` — Identity chip + You modal. Amber brand theme (#f59e0b). Earnings-first hierarchy: all-time earnings (hero) → activity (2 visible, "View all" toggle) → balance (demoted, inline "Add funds" link). Protected state = inline checkmark (X-verified pattern); unprotected = red banner (static dot, no pulse) → opens MoveAddressModal (combined passphrase + move flow). **Locked-state You modal:** the You modal opens locked for protected users (`manageAuthed === false`) showing a passphrase prompt as the body. On unlock, the body cross-fades to the rows (Save / Passphrase / Restore / Show recovery key). One container, two states; same modal, body swap with `animate-[fadeIn_0.2s_ease-out]`. Session destroyed on modal close OR tab blur (password-manager pattern). Show recovery key + Restore still re-prompt (defense-in-depth on highest-stakes paths — see DECISIONS.md). Move + Change Passphrase rows merged into a single "Passphrase" row. Show recovery key panel: red warning (*"Anyone with this key owns your account and any funds in it. Never share it."*) + acknowledgement-gated Reveal → side-by-side Hide/Copy. Earnings poll 30s — full feed when dropdown open, summary only when closed.
- `src/components/RestoreModal.tsx` — Standalone restore-from-device modal (extracted from IdentityBar). Handles plain WIF, encrypted WIF, pending restore confirmation, auto-backup of current identity.
- `src/app/Bootboard.tsx` — Pay-to-feature spotlight (live timer, shake/glow animations)
- `src/app/Manifesto.tsx` — Vision TLDR block above Genesis
- `src/app/Genesis.tsx` — Founding conversation (always visible, NOT collapsible)
- `src/app/AgentChat.tsx` — AI Q&A modal (streaming via /api/agent)
- `src/app/FundAddress.tsx` — Deposit address panel (QR/copy)
- `src/app/layout.tsx` — Root layout (metadata, fonts, IdentityProvider wrapper)
- `src/app/error.tsx` — Error boundary
- `src/components/PassphrasePrompt.tsx` — Reusable passphrase input with hint display
- `src/components/ChangePassphraseModal.tsx` — Change passphrase flow (verify → new → backup, or new → backup when `preVerifiedPassphrase` is passed in from the manage gate). Includes pre-rotation chain verification warning.
- `src/components/MoveAddressModal.tsx` — Combined "move + protect" wizard. Collects passphrase first → backup old key → upgradeIdentity (encrypted new key + sweep) → migrateIdentity → download **combined recovery file** containing both `wif_encrypted` (new key) and `oldWif_encrypted` (old key under new passphrase) — one file, one passphrase, supersedes the temporary stage-1 file. Sweep failure blocks rotation with retry/proceed options. Pre-rotation chain verification warns if posts would be orphaned. `onComplete` updates identity state only (parent stays mounted); `onClose` (Continue button / X / backdrop on done) is the single dismissal path so the user sees all status updates + safeguard copy before exiting. Also serves as the "Not protected" flow (every rotation produces an encrypted key).
- `src/components/AnimatedBalance.tsx` — Animated balance counter (count-up, green flash)
- `src/components/EarningsSparkline.tsx` — Step-function area chart (pure SVG)
- `src/components/icons/BootIcon.tsx` — Boot emoji icon
- `src/components/BootToast.tsx` — Transient boot error toast (retry action, auto-dismiss)

### BSV Services

- `src/services/bsv/identity.ts` — Keypair generation, signing, encrypted storage, upgrade + unlock
- `src/services/bsv/crypto.ts` — AES-256-GCM encrypt/decrypt for WIF keys (Web Crypto API)
- `src/services/bsv/backup-template.ts` — Self-contained HTML recovery file generator + downloadBackup/getStoredHint utilities
- `src/services/bsv/migration.ts` — Key rotation with on-chain migration via OP_RETURN
- `src/services/bsv/client-boot.ts` — Client-side trustless boot tx builder (browser → contributors, zero custody)
- `src/services/bsv/wallet.ts` — Server wallet with UTXO manager (mutex, spent-blacklist, 0-conf chaining)
- `src/services/bsv/onchain.ts` — OP_RETURN post logging (fire-and-forget)

### OP_RETURN Formats (On-Chain Audit Trail)

All on-chain payloads are JSON inside OP_FALSE OP_RETURN outputs:

**Post logging** (`onchain.ts` — every new post):
`{ app, type: "post", content, author, sig, pubkey, ts }` — sig/pubkey are null for unsigned posts.

**Boot split** (`boot-payment.ts` — every boot payout):
`{ app, action: "boot_split", post_id, total, recipients, formula_version, ts }` — see FAIRNESS.md for details.

**Key migration** (`migration.ts` — on security upgrade):
`{ app, type: "migration", from_pubkey, to_pubkey, signature, message, ts }`

### Fairness Pipeline

- `src/services/fairness/config.ts` — Tunable parameters (governance surface)
- `src/services/fairness/pricing.ts` — Dynamic boot price (contributors × 156, floor/ceiling, cached)
- `src/services/fairness/weights.ts` — Contribution scoring (sqrt × decay × engagement, migration chain resolution)
- `src/services/fairness/split.ts` — No-custody payout split (every sat out in same tx)
- `src/services/fairness/boot-payment.ts` — Multi-output BSV split transaction builder
- `src/services/fairness/boot-orchestrator.ts` — Full boot workflow (validate → price → score → split → broadcast → record)

### Hooks & Context

- `src/contexts/IdentityContext.tsx` — Shared identity provider (single BSV SDK load)
- `src/contexts/BootContext.tsx` — Global boot coordinator: single-flight lock (only one boot in flight at a time across the whole app), 3s UI throttle, status state machine, consolidation-warning dismissal state. Consumed by Bootboard, Feed, PostList, useBoot.
- `src/hooks/useIdentity.ts` — React hook for identity management
- `src/hooks/useBoot.ts` — Shared boot logic (free → server, paid → client trustless, consolidation); coordinates with BootContext for global single-flight + 3s throttle
- `src/hooks/useFeedPolling.ts` — Polls /api/posts every 5s (pauses on hidden tab)
- `src/hooks/useScrollTracker.ts` — Scroll position, unread tracking
- `src/hooks/useBsvPrice.ts` — BSV/USD price (cached 5 min)
- `src/hooks/useCurrencyMode.ts` — Noob Mode ($) / Goat Mode (sats) toggle
- `src/types/index.ts` — Shared types (Post, BootboardData, Identity, etc.)

## Request Flows

**Post creation:**
PostForm → signPost (ECDSA) → createPost server action → verify signature → insert DB → logPostOnChain (fire-and-forget OP_RETURN) → return post ID → optimistic UI update → Feed polls for confirmation

**Boot payment (paid):**
BootButton/useBoot → bootPost server action (checks free quota) → requiresPayment response → fetch /api/boot-shares (split calculation) → clientSideBoot (browser builds multi-output BSV tx) → broadcast via ARC → POST /api/boot-confirm with rawTx (server verifies hash(rawTx)===txid, parses P2PKH outputs locally to check split, re-broadcasts via ARC as safety net, records payouts, emits TX_CONFLICT vs ARC_UNAVAILABLE codes) → Feed polls for bootboard update

**Boot payment (free):**
BootButton/useBoot → bootPost server action → server wallet builds split tx via boot-orchestrator → broadcast → consume free boot grant → return success

## Coding Standards

- Use TypeScript strict mode
- Server components by default, `'use client'` only when needed
- Server actions for data mutations
- Tailwind for styling — no CSS modules
- Dark theme: bg-black, bg-zinc-900, text-white, border-zinc-800
- Mobile-first responsive design

## Identity System

- BSV keypair auto-generated on first visit via `@bsv/sdk` `PrivateKey.fromRandom()`
- Stored as WIF in localStorage under key `bfn_keypair` (plaintext) or `bfn_keypair_enc` (passphrase-encrypted). Legacy key `bfn_identity` is auto-migrated on load.
- Anonymous names: `anon_XXXX` format (4 random alphanumeric chars)
- Posts are cryptographically signed (ECDSA via BSV SDK)
- Users can copy/download their key for backup
- **Combined recovery file pattern:** every passphrase-protected backup contains both the current encrypted key (`wif_encrypted`) and the most-recent prior encrypted key (`oldWif_encrypted`), encrypted under the same passphrase. One file, one passphrase, both keys recoverable — reduces file-management burden across rotations.
- **Manage gate:** the You modal verifies the passphrase once on entry (`manageAuthed` state); session destroyed on modal close or tab blur. Show recovery key + Restore still re-prompt (asymmetric by design — see DECISIONS.md).
- Dynamic imports for `@bsv/sdk` to avoid bundling issues
- Upgrade path: raw localStorage → passphrase encryption → passkey wrapping → server HSM
- See DECISIONS.md for the full security upgrade plan

## UX Principles

- **User-facing language matters.** Avoid crypto jargon in normal UI copy. Use friendly equivalents:
  - "save your key" → "keep your name"
  - "fund your address" → "deposit slot"
  - "key rotation" → "stronger lock"
  - "PIN" → "passphrase" (minimum 8 chars, not a 4-digit PIN)
  - **Exception:** Technical recovery artifacts (backup files, passphrase change flows, the Show recovery key panel) may use precise terms like "key" and "WIF" where clarity for recovery outweighs friendliness. The user is already in a technical context at that point.
- 2-click onboarding: visit site → type idea → click Post. Done.
- No wallet downloads, no seed phrases, no "buy crypto first"

## Security Notes

- Private keys stored in localStorage (acceptable for idea board phase, no real money yet)
- Server-side ECDSA signature verification on all posts and migrations
- Rate limiting on all mutation API routes and agent chat (sliding window). Keyed on IP via `x-forwarded-for` for API routes, on pubkey for server actions (createPost, bootPost). Read-only feed polling (`/api/posts`) is unrate-limited by design (hit every 5s by every client).
- boot-confirm hardened: replay protection, on-chain output verification, rate limiting
- CSP headers configured in next.config.ts (Content-Security-Policy, HSTS, Permissions-Policy)
- Node polyfills shimmed via next.config.ts for browser compatibility (empty-module.mjs)
- See SECURITY_AUDIT.md for full audit findings and fix status

## Deployment Notes

- **Rate limiting uses `x-forwarded-for` header** for IP identification. This header is client-supplied — behind a reverse proxy (Railway, Vercel, Cloudflare), the proxy sets it from the real client IP and it's trustworthy. If self-hosting without a proxy, attackers can spoof this header to bypass rate limits. Check your platform's docs for the correct trusted IP header (e.g. Vercel uses `x-real-ip`). All rate limit IP extraction is in the individual API route files (`src/app/api/*/route.ts`).

## Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run start    # Start production server
npm run test     # Run tests (vitest)
npm run lint     # Biome linting
npm run format   # Biome formatting
```

## Context Files

Read these to understand the full picture:

- **DIRECTION.md** — Where this project is going and why
- **DECISIONS.md** — Key decisions already made (don't relitigate these)
- **FAIRNESS.md** — Revenue distribution model, fairness formula, gaming analysis, phase progression
- **SECURITY_AUDIT.md** — Full security audit (2026-03-28): 9 criticals fixed, 3 highs fixed, mediums/lows tracked
- **ROADMAP.md** — What's done, what's next, what's planned
- **FUTURE.md** — Ideas and explorations not yet built (handles, AFP protocol, agents, boot signals)
- **SESSION_LOG.md** — What happened in each working session

## Hard Rules

These are non-negotiable. Do not bend them without explicit approval from the user.

1. **Read DECISIONS.md before proposing changes to identity, security, or fairness.** If a relevant decision exists, acknowledge it before proceeding. Do not relitigate settled decisions — if you want to challenge one, quote the original rationale, state what has changed, and ask first.
2. **No file deletes without confirmation.** Before deleting any file (not in node_modules/.next/build), state what will be deleted and why, and wait for explicit confirmation.
3. **Flag security regressions explicitly.** If a change weakens a control marked FIXED in SECURITY_AUDIT.md (removing rate limiting, relaxing signature verification, etc.), flag it as a security regression and require confirmation.
4. **Every session that modifies code must end with a git commit.** SESSION_LOG entry written, then commit. No leaving modified files uncommitted at session end.
5. **Update DECISIONS.md immediately when a decision is made**, not at session end. Decisions made mid-session affect subsequent work.
6. **No personal information in repo files.** Never write names, emails, usernames, or other identifying information into any committed file. Repo files are public — personal details belong only in memory files (which are local and not committed).

## Context Management

When you estimate you are above 70% of context capacity during a working session:

1. **At 70%**: Write a checkpoint — update SESSION_LOG.md with current state, what's done, what's next, what was ruled out. Continue working.
2. **At 80%**: Finish the current atomic unit of work (don't stop mid-edit). Commit all changes. Update ROADMAP.md and DECISIONS.md if anything changed.
3. **At 85%**: Stop new work. Tell the user: "Context is getting full — I've saved state. Start a new session to continue."

**SESSION_LOG entries must include:**
- What category of work was done (feature, security, refactor, etc.)
- Specific files changed and why
- What was explicitly ruled out or deferred
- What is still broken or incomplete
- The next step if the session ended mid-task

**Restart read order for new sessions:** CLAUDE.md → ROADMAP.md → DECISIONS.md → SESSION_LOG.md (last entry)

## AI Contribution Protocol

When you finish significant work on this project:

1. Update ROADMAP.md if you completed or started a task
2. Update DECISIONS.md if you made a non-obvious technical choice
3. Update FAIRNESS.md if you changed the revenue model, fairness parameters, or contribution scoring
4. Update DIRECTION.md only if the project direction changed
5. Update this file (CLAUDE.md) if you added new key files or changed architecture
6. Add a session summary to SESSION_LOG.md (date, 3-5 bullet points of what was done)
