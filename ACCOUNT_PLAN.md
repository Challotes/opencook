# The OpenCook Account — Consolidated Plan

> **Purpose of this file:** ONE place that holds the whole account/security/funding direction, so it stops living scattered across FUTURE.md, DECISIONS.md, ROADMAP.md, and memory. This is the map we work from. Design-stage — most of it is not built. Nothing here overrides DECISIONS.md; where they touch, DECISIONS wins.
>
> Created 2026-08-19 after a long exploration arc (distribution tool → funding model → account spectrum → security/recovery → multisig → journey map). This file is the convergence of all of it.
>
> **⚠ Evolved since (2026-09):** the account-*security* direction below (Layer 4 auto-secure / Layer 6 guardian key) has since **converged into a single opt-in "Safety Key" model** — one backup file serving two roles (where earnings forward + the authority that recovers the account), with the default earnings destination reshaped toward a wallet the user already owns. The detailed evolved design is held privately (design-stage, pending sign-off), so treat the security layers here as the earlier framing — directionally right, since superseded.

## North Star

OpenCook: a platform that builds itself and lets anyone do the same. Anonymous, on-chain (BSV), **2-tap onboarding**, contributors share in the value. The account work exists to serve four concrete goals without breaking the frictionless wedge:

1. **Launch** (quiet launch already live on Railway).
2. **Reward contributors** (an airdrop off the existing contributor list, then a distribute-to-contributors tool).
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
- **Layer 4 — direction settled (2026-08-20).** Auto-secure isn't a day-one default, it's the **graduation moment** — money piling up IS the reason a no-crypto user finally sets up a real wallet, so "auto-secure" and "get your first wallet" become the same step, framed as *"protect your earnings."* Broke users need nothing; by the time they do, they're motivated. **Adopt the owner's stronger pitch:** *"Secure your account — set the address your money goes to, do it now before there's anything to lose."* Same reassuring moment, pointed at the simple sweep.
  - **Destination-locked covenant — evaluated & parked (2026-08-20).** The owner asked whether the "lock" could be protocol-real (migrate funds into a construction that enforces spend-only-to-Y). Agent verdict: the correct primitive is a **covenant (OP_PUSH_TX), not a multisig**, and BSV genuinely can enforce it — but it **doesn't solve the no-second-wallet crux, it relocates it to a worse moment** (Y must be external to be safe = the wallet users lack, and it must be named at setup, not deferred to the graduation moment). "A lock on an empty door." Plus: custom Script with irreversible black-hole failure, mandatory audit, breaks key==address and the address-keyed balance/fairness paths. Dominated by auto-secure. Real mechanism, same conclusion as multisig → far-future power-user option, probably never.
- **Layer 5 — walked 2026-08-20 (agent-reconciled). Design holds & is slightly simplified by the newer decisions.** It's "the send engine fanned out to the contributor list," and top-up-then-spend deletes the old "connect a wallet per reward" step. **Key finding: the CASH version is decoupled from Layer 3** — it rides today's boost multi-output engine (`client-boot.ts`); only token/collectible rewards need Layer 3. `calculateSplit` is NOT reusable (bakes in platform cut / creator bonus / remainder-to-creator) → need a new `splitAmount(total, weights[])` with an explicit remainder + dust policy (forced by the exact-sum `validateShares`). **The airdrop does NOT need Layer 5** — the CSV (Phase 0) covers the drop; Layer 5 adds in-app + any-user + repeatable + a self-proving stamp. Sequence: **Phase 0 (download button) buildable now, no money-path** → cash split + stamp = next money build (auditor-gated) → tokens/collectibles ride Layer 3. Must-nail before any real send: remainder/dust policy · one canonical recipient-list hash · a durable off-chain home for the full list · a max-recipients/batching guard.
- **Layer 6 (guardian key) — walked 2026-08-20. Correct mechanism, but gated on "when identity is worth stealing."** A pre-committed offline guardian key that alone can supersede the identity is the only honest identity-reclaim (rotation-alone loses the race to a key-holder). BUT it protects **reputation, not money** (money = Layer 4), and it **reopens migration-chain resolution** — the exact complexity E29/E30/E31 deliberately removed as a bug-farm — so it's a real reversal to weigh, not a freebie. It also can't silence the impersonator on the old key (no revocation on Bitcoin) and adds a second key to safeguard. **Value scales with how much identity-continuity is worth**; today (anonymous board, light reputation) that's low → build it when contribution-weight becomes recurring income, likely with **BAP** as the substrate rather than a bespoke scheme. Keep the door open (DECISIONS already does), don't build now.

**All six layers now walked.** First buildable + valuable + low-risk step = **Phase 0 (Reward-Everyone download button, no money-path)**. First real money build = **cash Reward-Everyone** (new split fn + stamp → auditor + owner sign-off). Everything else is later or gated. **Next:** decide what (if anything) to actually build first.

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

The same reasoning sinks the **destination-locked covenant** (evaluated 2026-08-20, Layer 4 note above): it's the correct primitive for a real on-chain "spend only to Y" lock and BSV can do it, but the lock is worthless unless Y is an external wallet the thief can't reach — the exact wallet the target user doesn't have. **No on-chain trick makes a same-device key safe from itself** ("same key/device = fake security"); money-safety fundamentally requires funds reaching a key the thief doesn't hold, which is what auto-secure's sweep does.

## How we work it

1. This map is the anchor — we don't re-derive it.
2. **One layer at a time:** explain the layer's goal + approach → chat it ("does this seem right?") → an agent pressure-tests the scoped layer → build → verify → commit → next.
3. Agents are **challengers on a bounded question**, not another round of open brainstorming.

## Kept private (NOT in this file, by decision)

The first-drop distribution **method** and specific allocation percentages stay off-repo (anti-gaming) — see memory. This file documents the *tool/architecture*, never the drop method.

## Related

- `FUTURE.md` → "The OpenCook Account" (fuller prose on the spectrum + security/recovery)
- `DECISIONS.md` → identity/security (key-never-changes / encrypt-in-place — the invariants this plan respects)
- `ROADMAP.md` → "Reward Everyone" + "The OpenCook Account" pointers
- Journey visual (private artifact) — every user event mapped, friction hotspots flagged
