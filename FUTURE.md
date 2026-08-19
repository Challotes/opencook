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

## Reward Everyone — Distribute to Contributors

Scoped design (2026-08-17/18) for turning the Contributors board from a read-out into an action: any user can reward **every contributor at once**, split by contribution share, funded and signed by **their own wallet** — non-custodial, the server never holds funds. Named **"Reward everyone"** in the UI (not "distribute"/"airdrop" — jargon-free). Reuses the existing boost transaction engine, the OP_RETURN audit envelope, the Collectibles derived-address, and the Contributors panel. A boost is already a split-payment to contributors, so a cash split is ~70–80% reuse.

**Three send types, one modal flow** (entry in the Contributors panel → choose → amount + live split → review → send → receipt):
- **Cash** → each contributor's spending address.
- **Token** → each contributor's separate collectibles address.
- **Collectible** → collectibles address, assigned to the top of the list (unique items can't be split).
- **Address routing is automatic and safety-critical:** cash to the spending address, tokens/collectibles to the collectibles address — sending a token to the spending address would burn it (the same separation the Collectibles feature relies on; guarded by the `value>1` floor already shipped).

**Verifiable on-chain stamp (the keystone).** Each distribution stamps itself on-chain in the *sender's own* transaction (so the sender pays — one extra 0-sat OP_RETURN, like every boost today), reusing `onchainRecord` with a new `type:"distribution"`. The transaction **outputs are the receipt** (each output = exactly what an address received); the stamp carries metadata (asset, total, count, the weighting **basis + version**, an optional snapshot height) plus a **single hash commitment** over the full recipient list / fairness report. Anyone can verify: read the outputs, re-hash the published list, match the commitment, trust the block's timestamp — no server trust. This turns a distribution into a contestable, auditable artifact: the chain settles the numbers, so a dispute is only ever about whether the *formula* is fair — "Agentic Fairness" made literally checkable.

**Pluggable weighting.** The split reads one interface — `getContributorWeights()` — so the contribution basis can evolve behind it without touching the distribution or transaction code. A **past-block snapshot** basis is the anti-gaming path for any real-value, self-serve distribution (freeze the inputs so a drop can't be chased after it's announced).

**Phased build (smallest first; money-path phases gate on auditor + owner sign-off):**
1. **Download the contributor list** — a button on the existing CSV (zero transaction code; a partner distributes externally). Build-ready today.
2. **In-app cash split + the stamp** — a new `splitAmount()` (100%-to-contributors, distinct from the boost split's platform/creator logic) feeding a generalized transaction builder; the live preview uses the same split so shown = sent.
3. **Connect a wallet** — a signer façade (BRC-100 / Yours / 1Sat) so an external wallet can sign asset sends; cash still signs with the in-app account.
4. **Token split** — token-aware transactions (new dependency).
5. **Collectible hand-out** — assign unique items to top contributors.

**Open questions:**
- Platform cut — currently 0% (100% to contributors); a cut is a possible later decision.
- Which connect wallet ships first (Yours vs 1Sat)?
- When does a self-serve, real-value tool require a snapshot basis rather than a live one?
- The receipt's exact hash recipe + where the full recipient list is durably published (so the on-chain commitment stays verifiable in detail).
- Remainder + dust policy for a split (where the rounding leftover goes; whether to skip sub-dust recipients).

## The OpenCook Account — one wallet interface, secured by default

Direction (2026-08-19) for how the account itself should work — the spine that unifies funding, receiving, sending, and custody. Nothing fixed; exploration.

**One wallet interface (the spine).** OpenCook talks to a single internal wallet interface (BRC-100-shaped: *who am I* / *sign this* / *build a payment*) for everything — posts, boosts, rewards, sends. Today's auto-generated in-app key is just ONE implementation of it. A second implementation lights up automatically when the user has a real BSV wallet (a browser extension like Yours, or a wallet-native browser) via `@bsv/sdk`'s `WalletClient` — same code, capability-detected. This is a low-regret refactor that keeps the app portable across a plain browser, a wallet-native browser, and a connected wallet, and it should land *before* the token-send / distribute work (writing those against one "build a payment" call keeps them clean and free-upgrades to real wallets later).

**The account as a spectrum** — the user slides along it as their needs grow, all behind that one interface:
- **Frictionless (default):** the auto-generated account — 2 taps, no wallet, no download. Non-negotiable; this is the onboarding wedge.
- **Auto-secured (opt-in, when value arrives):** the account becomes a *working float*, not a vault. You set a secure address you control (a hardware/main wallet) and a threshold; anything above the float auto-forwards there. "Money on a browser key" becomes "money passing through on its way to your cold storage." Custody becomes a *setting*, not a warning — and the backup blast-radius shrinks from *everything* to *a small float*. Cash sweeps reuse the existing spend path; item (token/collectible) auto-forwarding uses the in-app send engine.
- **Power (opt-in):** the user's own wallet IS the identity — OpenCook holds nothing, custody-free. Never forced (it needs a wallet install); always available.

**Stay compatible, don't design *for*.** The wallet-native BSV browsers this points at are early and low-adoption today, so OpenCook builds the interface *seam* (cheap, useful regardless) but keeps the auto-key default and never puts up a "connect a wallet" wall that would break onboarding.

**The in-app send engine is the enabler.** Sending tokens/ordinals from the account lets a user *use* what they receive (airdrops, gifts) without exporting their key — the missing half of the already-shipped receive feature — AND it powers item auto-forwarding. Justified three ways: use received items · auto-secure them · distribute them.

**Phased spine:** (1) the wallet-interface seam → (2) the token/ordinal send engine (airdrop-relevant; secures receivers) → (3) auto-secure (cash sweep + item forward) → (4) distribute-to-contributors → (5) the wallet/browser adapter as a silent enhancement.

**Security & recovery (explored 2026-08-19).** The key = identity + money + attached work, so compromise has no "reset password". The honest model:
- **Money:** *auto-secure* caps the loss — only the small float is ever exposed; swept earnings sit on the user's own cold address.
- **Identity:** the only honest way to reclaim a *compromised* identity is a **pre-committed, opt-in guardian key** — a second key set up while healthy and published on-chain as the sole thing that can supersede the identity. Rotation *alone* fails (the attacker holds the same key and wins the supersession race). This is the "opt-in rare reclaim" door DECISIONS already left open — NOT reopening the removed key-rotation. Post-launch, opt-in, no third party.
- **Phone/email 2FA is rejected:** theatre against the real threat, re-introduces a trusted party + PII/de-anonymization, and can't stop a key-holder anyway (paid boosts broadcast client-side, bypassing any server gate).
- **Cheap, high-value, near-term:** make blunt that the **passphrase — not the recovery file — is the master secret** (forgetting it locks a user out of *both* the device store *and* the file, since the file is encrypted with it — the highest-probability real-world stranding); and **raise PBKDF2 100k→600k** now that real funds (airdropped tokens) flow.

**Settings home & editing.** OpenCook already has the two-tier structure: the **"You" panel** (money hub — earnings/balance/collectibles, read-mostly) + the **gear→"Manage" modal** (already behind the passphrase manage-gate). Formalize the Manage modal as **"Account & security"** and give the gear a visible label (undiscoverable today); group into *Money & wallet* (auto-save, your wallet, currency) + *Security & recovery* (backup, passphrase, restore, guardian/recovery slot). Rule: *look at it → You panel; change it → Account & security.* Send/gift a collectible hangs off the Collectibles grid (a "do"), not settings. **Auto-secure reads as a "spending jar + safe"** ("keep $5 here to boot posts; the rest goes to your own wallet automatically") with a friendly *verify-it's-yours test-send* (hard-blocked until confirmed) and collectibles default-to-keep. **Progressive disclosure:** a new broke user sees only "back up"; auto-save is *offered* only after backup + a balance; settings rows exist quietly, only prompts are earn-in-gated. (Full detail in memory `project_distribution_and_reward_model`.)
