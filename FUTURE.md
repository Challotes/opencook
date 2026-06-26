# Future

> Ideas and explorations. Nothing here is decided — these are starting points for community discussion and future development. Everything is flexible and open to change.

## Handle System

Current anonymous names (`anon_XXXX` with 4 random chars) hit 1% collision at just 184 users. Before launch, this needs solving.

**Proposed design:** Server-assigned sequential handles.
- First 36 users: `anon_a` through `anon_9` (1 char)
- Next 1,296: `anon_aa` through `anon_99` (2 chars)
- Next 46,656: 3 chars, and so on
- Short handle = early adopter status
- Graceful fallback to random 4-char if server unreachable
- Same pubkey always gets the same name back (idempotent)

**Open questions:**
- Custom handles later? Users upgrade from `anon_a` to a chosen name. Same database table could store both.
- Should custom handles be free or cost sats (anti-squatting)?
- Do we call them "handles" in the UI?

## Boot Signals as AI-Readable Economic Data

Boots are the first permissionless, Sybil-resistant, AI-readable economic preference data. They cost real money (can't fake), they're on-chain forever (can't revoke), and anyone can read them (no API key needed).

**What an AI agent could detect from boot patterns:**
- Boot velocity — rate of change signals urgency
- Unique booter ratio — consensus vs one person's conviction
- Cross-post theme emergence — "mobile app" posts getting 3x the boot rate
- Contrarian convergence — people who normally disagree converging on one idea

**What AI agents could DO with signals:**
- Priority queue for development — backlog sorted by economic commitment, not opinions
- AI coding agents pulling tasks from the bootboard autonomously
- Auto-spawning project shells when boot clusters cross thresholds
- Dynamic resource allocation — boot signals determine which tasks get agent time

**The Fairness Oracle governance model:**
- Auto-adjust (safe): operational parameters like cache TTL, polling frequency
- Propose with evidence (needs human approval): economic parameters like creator bonus, decay rate
- Never auto-adjust: platform cut, gaming penalties
- Boot signals are one input into governance, alongside project owners and human oversight

## Agentic Fairness Protocol (AFP) — Cross-Project Royalties

Early thinking on how revenue could flow between parent and child projects.

**The cascade pattern (don't flatten into one transaction):**
- Within a project: real-time split in one tx (trustless, no custody) — already works
- Between projects: daily batch to parent treasury address, parent distributes to its own contributors
- A song purchase on a Music Store spawned from OpenCook: Customer → Artist + Music Store contributors (split inline) + OpenCook treasury (one output)

**On-chain record types (conceptual):**
- `agfair.genesis` — project registration
- `agfair.spawn` — parent-child link with royalty rate
- `agfair.manifest` — hash of contributor list, published periodically
- `agfair.royalty` — audit record of cross-project payments

**Enforcement:**
- No license can enforce royalties — it's a protocol problem, not legal
- On-chain spawn records prove lineage permanently
- Protocol membership (access to contributor registry, reputation) is the incentive
- Transparency as deterrent — stripping royalties is publicly visible on-chain

**Chain depth limits (at $0.50 per tx, 10% royalty per level):**
- Level 1: ~1,400 sats (viable)
- Level 2: ~140 sats (viable)
- Level 3: ~14 sats (barely)
- Level 4: dust — practical limit is 2-3 levels for micro-transactions

## Patterns We've Noticed

The codebase has started doing things we didn't fully plan. Most of these are already built INSIDE OpenCook — what's still future is extracting them as standalone primitives anyone could reuse without adopting the whole platform.

**Revenue distribution that governs itself** *(surface shipped, watcher future)*. The fairness logic has tunable parameters, scoring weights, and decay curves. The obvious next step is letting an AI watch the numbers and adjust those knobs — tighten the gaming resistance when someone's exploiting it, widen the grants when the platform's healthy. We built the surface. We haven't built the watcher yet.

**Trustless split payments** *(shipped in-app — Phase 6 / `client-boot.ts`; standalone primitive future)*. The boot payment flow is browser-native and zero-custody. The browser builds the transaction, the browser broadcasts it, the server never touches the money. As an in-app feature it's live; the future work is packaging this as a standalone library or pattern so any app can split a payment across contributors without a middleman holding funds.

**Crypto identity without the crypto part** *(shipped in-app — Phase 1+ / `useIdentity` + encrypted store; standalone primitive future)*. Sign-in here requires no wallet, no app install, no seed phrase. A key is generated on arrival. Most people never know it happened. That pattern is reusable anywhere you want signed, attributable actions without asking people to "get into crypto" first.

**Wallet health as a background concern** *(act-half shipped, explain-half future)*. UTXOs fragment. Fees creep up. The wallet quietly monitors and consolidates. That kind of low-level maintenance could report upward — cost trends, fragmentation alerts, fee anomalies. Right now it just acts. It could also explain.

**Scoring without a committee** *(shipped in-app — Phase 6 / `src/services/fairness/weights.ts`; standalone primitive future)*. Contribution weight is calculated from behavior: post frequency, engagement, and recency. No one votes. No one decides. It just runs. That model applies anywhere you're trying to fairly compensate a group without central control — open source projects, co-ops, DAOs.

**The chain as the audit log** *(data substrate shipped — posts + payouts all have on-chain fingerprints; verifier future)*. Every post has an on-chain fingerprint. In theory you can cross-reference the database against the chain and find discrepancies. Nobody's built that check yet. It's just waiting there.

The in-app versions are running. The future is the extracted, reusable form of each.

## Security Upgrades (Deferred)

Features noted for when real money flows at scale:

- **Session timeout** — auto-lock after 30 min tab hidden. *Stage 7 (2026-04-30) shipped tab-blur destroy on the manage gate (`manageAuthed` cleared on `visibilitychange === "hidden"`); the underlying decrypted-key cache (`_cachedWif` / `_sessionIdentity`) still stays unlocked until tab close.* Full app-wide auto-lock with a configurable timer (e.g. 30 min idle) remains deferred. Not needed at current stakes.
- **Device sync via QR** — full design lives in `LAUNCH_PLAN.md` Bucket 6 (post-launch). Encrypted envelope on a short-lived server record, decryption key in the QR, plaintext WIF never leaves the source device. Don't duplicate the spec here — single source of truth.
- **Passkey wrapping (WebAuthn)** — biometric unlock instead of passphrase. Firefox fallback needed.
- **PBKDF2 increase to 600k iterations** — currently 100k. Increase when real funds flow.

## Gaming Detection (Concepts)

Boot signals can be gamed. These are detection approaches to explore:

- **Self-booting** — detectable via address graph / UTXO history tracing
- **Wash booting** — temporal clustering analysis (burst patterns vs natural distribution)
- **Collusion rings** — graph community detection on boot patterns
- **Economic irrationality** — spending more on booting than possible fairness return
- **Best approach:** make gaming data public. Transparency as deterrent.
