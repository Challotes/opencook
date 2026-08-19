# The OpenCook Account — Consolidated Plan

> **Purpose of this file:** ONE place that holds the whole account/security/funding direction, so it stops living scattered across FUTURE.md, DECISIONS.md, ROADMAP.md, and memory. This is the map we work from. Design-stage — most of it is not built. Nothing here overrides DECISIONS.md; where they touch, DECISIONS wins.
>
> Created 2026-08-19 after a long exploration arc (distribution tool → funding model → account spectrum → security/recovery → multisig → journey map). This file is the convergence of all of it.

## North Star

OpenCook: a platform that builds itself and lets anyone do the same. Anonymous, on-chain (BSV), **2-tap onboarding**, contributors share in the value. The account work exists to serve four concrete goals without breaking the frictionless wedge:

1. **Launch** (quiet launch already live on Railway).
2. **Reward contributors** (a partner airdrop is imminent; a distribute-to-contributors tool follows).
3. **Make the account safe enough for real money to flow to it** (security & recovery).
4. **Keep onboarding frictionless** — the 2-tap, no-wallet auto-key is non-negotiable.

## The spine — the account is a dial

Everything below is a point on one dial the user turns as they grow, or a capability behind **one wallet interface**. Nothing is loose.

> **Frictionless** (auto-key, 2 taps, no wallet) → **Secured** (money auto-moves somewhere safe) → **Sovereign** (your own wallet *is* your identity)

## Where we are — resume point (2026-08-19)

Walked the layers as **discussion**, not building — validating the structure first. Current read:

- **Layer 1 — parked, not dropped.** Current save/deposit flows judged acceptable for now; no changes made. Revisit at real-money time.
- **Layer 2 — folded into Layer 3.** No standalone user value; it's just step one of the send engine, not its own layer.
- **Layer 3 — parked; two open questions before it's "next":** (a) how soon airdrop recipients actually need to *move* tokens (display-only already covers *seeing* them), and (b) is "send" a user-facing feature (a Send button per collectible) or just plumbing under Layers 4–5? First genuinely-new crypto build — needs `@1sat/actions` + an auditor pass.
- **Layer 4 — the crux may be dissolved.** Reframe: auto-secure isn't a day-one default, it's the **graduation moment** — money piling up IS the reason a no-crypto user finally sets up a real wallet, so "auto-secure" and "get your first wallet" become the same step, framed as *"protect your earnings."* Broke users need nothing; by the time they do, they're motivated. *(Owner reaction still pending.)*
- **Layers 5 (reward everyone) & 6 (guardian key) — not yet walked.**

**Next session:** pick up at the Layer 4 reaction → walk Layers 5 & 6 → then decide the first thing actually worth building.

## Build order — each layer depends on the one before

**Layer 0 — Done / live.** The board, on-chain posts, fairness/Contributors panel, display-only collectibles, quiet launch on Railway.

**Layer 1 — Make the *current* account safe & smooth, before real money flows. (reviewed 2026-08-19 — parked, no changes now)**
Cheap, high-value, no new surface — just tightening what exists:
- Security hardening: "your passphrase (not the recovery file) is the master key" messaging; raise the encryption strength (PBKDF2 100k→600k) — *note: existing-file migration must be handled, not assumed trivial.*
- Journey simplifications (all preserve the security model — no gate removed, passphrase stays mandatory):
  1. Collapse the ~5-screen deposit ladder → streamlined protect → straight to the deposit QR.
  2. Make the memory-hint **optional**, not a mandatory third field at the highest-intent moment.
  3. One-save-prompt-at-a-time mutex (dedupe the 6+ "save your file" surfaces).
  4. Unify the two look-alike passphrase walls (sign-in vs the You-modal manage gate).
  5. Rename "Save" → "Protect & save" (fix the label→action mismatch for unprotected users).
  6. Pre-warn the ~30s wallet-consolidation on the *first* paid boost.

**Layer 2 — One wallet interface (invisible plumbing).** Refactor today's auto-key behind a single `OpenCookWallet` seam (BRC-100-shaped). Users see nothing; everything below now speaks one language and free-upgrades to real wallets later.

**Layer 3 — Send things out (tokens/ordinals).** So people can *use* what they receive (the airdrop needs this), and it's the engine that powers auto-secure item-forwarding and the reward tool. Needs `@1sat/actions` + an auditor pass.

**Layer 4 — Auto-secure.** Earnings above a small float auto-move to a place the user controls. The real answer to "what if my key leaks." **Holds the open crux (below).**

**Layer 5 — Reward everyone.** Pay all contributors in one action, split by contribution share, funded & signed by the initiator's own wallet (non-custodial), with a verifiable on-chain stamp. Built on Layers 2 + 3.

**Layer 6 — Guardian key.** Reclaim your *identity* (not your money) if your key is compromised — an opt-in, pre-committed second key published on-chain. This is the "opt-in rare reclaim" door DECISIONS already left open, NOT a reopening of the removed key-rotation. Post-launch.

**Cross-cutting — Settings home.** Formalize the gear→Manage modal as "Account & security"; it grows alongside Layers 4–6. (Groups: *Money & wallet* + *Security & recovery*.)

**Later / maybe-never.** BRC-100 ambient-wallet adapter (stay compatible, don't design *for* — the browsers are early). In-app multisig vault — BSV removed the clean multisig address in 2020, and auto-secure (Layer 4) gets ~90% of the same money-safety for ~10% of the complexity, so multisig is a distant power-user option, probably never.

## The one genuinely-unsolved thing (in Layer 4)

**Auto-secure moves money to "a wallet you control" — but the users it helps most have never held crypto and don't own a second wallet.** That's the single real unknown; everything else is sequencing. Crack this before building Layer 4.

## Why multisig isn't the answer (settled in brainstorm 2026-08-19)

The single key does three jobs: **login**, **authorship** (one pubkey, on-chain attribution), **spend**. A co-signature only guards *spend* (money) — a leaked key still lets a thief post as you and read your history. BSV also makes literal multisig ugly (no clean address since 2020, keys exposed on-chain, not in the SDK) and it would fork the load-bearing "key = address = identity" money model. **Auto-secure (money) + guardian key (identity)** covers both halves the single key exposes, simpler than multisig.

## How we work it

1. This map is the anchor — we don't re-derive it.
2. **One layer at a time:** explain the layer's goal + approach → chat it ("does this seem right?") → an agent pressure-tests the scoped layer → build → verify → commit → next.
3. Agents are **challengers on a bounded question**, not another round of open brainstorming.

## Kept private (NOT in this file, by decision)

The first-drop distribution **method** (raw per-post) and specific allocation percentages stay off-repo (anti-gaming) — see memory. This file documents the *tool/architecture*, never the drop method.

## Related

- `FUTURE.md` → "The OpenCook Account" (fuller prose on the spectrum + security/recovery)
- `DECISIONS.md` → identity/security (key-never-changes / encrypt-in-place — the invariants this plan respects)
- `ROADMAP.md` → "Reward Everyone" + "The OpenCook Account" pointers
- Journey visual (private artifact) — every user event mapped, friction hotspots flagged
