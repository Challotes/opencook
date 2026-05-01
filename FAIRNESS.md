# Fairness Model

> How contributions are measured and revenue is distributed. This is a **starting point** — a working demo of agentic fairness, not a final system. As the platform evolves and real value contributions emerge (code, design, community building), this model will likely be replaced with something far more sophisticated. The point is to prove the concept works, learn from real usage, and iterate.
>
> Last updated: 2026-04-10

## The Core Idea

When someone pays to boot a post, that payment goes directly to every contributor — not to a company, not to a treasury. A single BSV transaction splits the fee across all contributors based on their measured contribution. No middleman. No delay.

## Current Model: Hybrid (Post Count + Engagement + Recency)

This is a demo model. It's simple enough to understand, fair enough to not be gameable, and transparent enough to build trust. It will be replaced as better contribution signals emerge.

### The Formula

```
For each post by a user:
  age_days = (now - post.created_at) / 86400
  decay = 0.5 ^ (age_days / half_life)
  engagement = 1 + (post.boot_count * engagement_multiplier)
  post_weight = sqrt(engagement) * decay

User's total weight = sum of all their post weights
User's share = their weight / total weight of all contributors
```

### Parameters (Tunable Knobs)

| Parameter | Starting Value | What it does | Range |
|-----------|---------------|--------------|-------|
| Platform cut | 5% | Funds server costs, on-chain fees, development | 0-10% |
| Boosted creator bonus | 15% | Extra reward for the post being spotlighted | 0-25% |
| Contributor pool | 80% | Remainder split across all contributors | Derived |
| Time decay half-life | 30 days | How fast old posts lose weight | 7-90 days |
| Engagement multiplier | 1.5x per boot | How much boots amplify a post's weight | 1-3x |
| Scaling function | sqrt | Diminishing returns on quantity | sqrt or cbrt |
| Minimum payout | 1 sat | Every non-zero share is paid in the same tx — no accumulation, no IOUs | N/A |

All parameters are exposed for the fairness agent to adjust in later phases. They are the governance surface — the agent tunes knobs, it doesn't rewrite the formula.

### Payout Split (on a 10,000 sat boot)

| Bucket | % | Sats | Goes to |
|--------|---|------|---------|
| Platform | 5% | 500 | Server wallet (infrastructure costs) |
| Boosted creator bonus | 15% | 1,500 | The person whose post is being spotlighted |
| Contributor pool | 80% | 8,000 | All contributors by weight |

The boosted creator also gets their normal pool share on top of the bonus.

### Free vs Paid Boots

Free boots and paid boots run through the same split mechanism, but at different price points.

**Paid boot:** user pays the current dynamic price (`max(1000, min(250000, contributors × 156))`). The 156-sats-per-contributor formula ensures each contributor's pool share lands around ~125 sats regardless of how many contributors are active. Real money, real payouts.

**Free boot:** server wallet pays the floor price (1,000 sats), regardless of the current dynamic price. This keeps the platform's per-user subsidy cost bounded at ~15,690 sats (15 free boots × ~1,046) forever, independent of contributor count or platform scale.

On a 1,000 sat free boot:

| Bucket | % | Sats | Goes to |
|--------|---|------|---------|
| Platform | 5% | 50 | Server wallet |
| Boosted creator bonus | 15% | 150 | Post author |
| Contributor pool | 80% | 800 | All contributors by weight |

Because the pool is 800 sats instead of ~8,000+, pool shares on free boots are proportionally smaller. The sqrt × decay weight curve naturally concentrates these smaller amounts on top contributors — tail contributors may receive 1-sat shares, which is intentional. Free boots are a symbolic acknowledgment of participation, not a full economic event. Real value flows on paid boots.

**Why floor-only?** Cost predictability. If free boots paid the dynamic price, the platform's subsidy cost would grow linearly with contributor count — a 100-contributor platform would cost 10x more to onboard a user than a 10-contributor platform. Flat floor means the onboarding gift has the same cost to the platform forever. Decided 2026-04-09 — see DECISIONS.md.

## Payout Flow

1. User clicks boot on a post
2. User pays X satoshis (boot fee)
3. Server calculates contribution weights for all contributors
4. Server builds a single BSV transaction with multiple outputs:
   - One output per qualifying contributor (at their share)
   - One output for the platform (5%)
   - One OP_RETURN output with audit metadata
   - Change output back to server if needed
5. Transaction broadcasts to BSV network
6. Every contributor gets paid directly in that single transaction
7. Every sat goes out in the same transaction — true no-custody, no database balances, no IOUs

### OP_RETURN Audit Trail

Every split transaction includes an OP_RETURN with metadata:

```json
{
  "app": "bsvibes",
  "action": "boot_split",
  "post_id": 42,
  "total": 10000,
  "recipients": 28,
  "formula_version": "0.1.0",
  "ts": 1711461600000
}
```

This makes every split publicly verifiable on-chain. Anyone can look up the transaction and confirm the percentages match the stated contribution table.

## Gaming Analysis

| Attack | Effective? | Why |
|--------|-----------|-----|
| **Spam posts** | No | sqrt scaling + 10/min rate limit + 30-day decay = diminishing returns. 1000 spam posts barely moves the needle. Per-day limits are planned (see ROADMAP Phase 5) but not yet enforced |
| **Self-boot** | No | Pay 10,000, get back ~3,500 max (your share + bonus). Net loss every time unless you believe in massive future volume |
| **Sybil (fake identities)** | Weak | Each identity has its own rate limit (10/min), sqrt scaling per identity. Expensive to maintain, low reward |
| **Collusion ring** | Neutral | Two users booting each other's posts spend real money. The rest of the community benefits from their boot payments via the pool |
| **One great post** | Intended | A single viral post that gets booted 50 times builds significant weight through the engagement multiplier. This is the behavior we WANT |

## Scaling

Paid boot at 10,000 sats, actual fee rate 100 sat/kb, no minimum-payout threshold (split.ts:49 pays any share > 0):

| Contributors | Per-user share (if equal) | Outputs per tx | Tx fee @ 100 sat/kb |
|---|---|---|---|
| 5 | ~1,600 sats | 8 | ~62 sats |
| 50 | ~160 sats | 53 | ~214 sats |
| 500 | ~16 sats | ~503 | ~1,741 sats |
| 5,000 | ~1.6 sats | ~5,003 | ~17,211 sats |

Formula: `fee ≈ (10 + 148 + 34 × outputs + 50) × 0.1` sats. Outputs = N pool recipients + platform + creator + OP_RETURN.

True no-custody: every contributor gets their share in the same transaction, even if it's 1 sat. No database balances, no accumulation, no IOUs. At high contributor counts, pool shares become very small — that is the cost of everyone being paid in the same atomic transaction. At extreme N (5,000+), tx fee can exceed a 10,000-sat paid boot — the platform hits a natural fee wall that a future miner fee partnership (reducing the sat/kb rate) or a design change in a later phase would be needed to address. For current scale (tens to low hundreds of contributors) the math works.

## Phase Progression

This model maps to the Agentic Fairness phases from DECISIONS.md:

| Phase | Who controls the knobs | How |
|-------|----------------------|-----|
| **Phase 1 (now)** | Humans set all parameters | Hardcoded in config, changed by developers |
| **Phase 2** | AI suggests parameter changes | Agent analyzes patterns, proposes "reduce decay to 21 days — here's why", humans approve/reject |
| **Phase 3** | AI adjusts within bounds | Agent can change half-life between 14-45 days, platform cut between 3-7%, without human approval |
| **Phase 4** | Fully agentic | Agent controls all parameters, humans only intervene on disputes |

## Technical Implementation

### Database Schema

```sql
-- Free boot grants per user (tracked by pubkey)
CREATE TABLE IF NOT EXISTS boot_grants (
  pubkey TEXT PRIMARY KEY,
  free_boots_used INTEGER DEFAULT 0,
  total_boots INTEGER DEFAULT 0
);

-- Payout records (audit trail — no balances held)
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  boot_event_id INTEGER NOT NULL,
  recipient_pubkey TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  amount_sats INTEGER NOT NULL,
  payout_type TEXT NOT NULL, -- 'pool_share' | 'boost_bonus' | 'platform'
  txid TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

No `contributor_balances` table — true no-custody means no stored balances.

### Key Files

- `src/services/fairness/config.ts` — Tunable parameters (governance surface)
- `src/services/fairness/weights.ts` — Weight calculation with migration chain resolution
- `src/services/fairness/split.ts` — Payout split (no custody, all sats out in same tx)
- `src/services/fairness/pricing.ts` — Dynamic boot price with floor/ceiling
- `src/services/fairness/boot-orchestrator.ts` — Full boot workflow coordinator
- `src/services/fairness/boot-payment.ts` — Multi-output BSV transaction builder

### BSV Transaction

- Server-side for Phase 1 (server builds the multi-output split transaction)
- Migrate to client-side when self-funded posting is live
- Uses `@bsv/sdk` Transaction with N P2PKH outputs
- OP_FALSE OP_RETURN for audit trail (BSV standard, provably unspendable)

### Migration Chain Resolution

Posts are signed by the pubkey active *at the time of posting*. When a user rotates their key (security upgrade, recovery on a new device, or "Move to a new key"), an OP_RETURN migration record links `from_pubkey → to_pubkey` and is mirrored into the `migrations` table.

`weights.ts` walks the chain forward when calculating contribution weights — every post under a historical pubkey contributes to the *current* terminal pubkey's weight. The terminal pubkey is also the address that receives the payout split. Result: rotating keys does not lose contribution history, and a single user with five historical addresses still receives one combined share.

Resolution rules:
- A pubkey with no outgoing migration is its own terminal (active key).
- Forks (`A → B` and `A → C` recorded for the same `from_pubkey`) are bridged via `C7`'s repair logic — the older `from_pubkey → to_pubkey` is preserved and a `B → C` bridging migration is inserted so neither branch's posts orphan. See SECURITY_AUDIT.md C7.
- `verifyMigrationChain` (server action, called pre-rotation by MoveAddressModal) walks the chain to confirm all of the user's posting pubkeys still resolve to the current key — warns the user if the chain is broken before any new rotation cements the state.

The migration table is small (one row per rotation, signed by the old key with replay protection) so the walk is cheap. Resolution is computed on demand and cached for 30s alongside the rest of the weight calculation.

## What This Model Does NOT Measure (Yet)

This is a simple post-count + engagement model. It's a starting demo. Real value contributions that future versions should consider:

- **Code commits** — someone who builds a feature contributes more than someone who posts an idea
- **Quality scoring** — semantic analysis of post content, not just count
- **Community building** — bringing in new contributors, answering questions
- **Design work** — visual contributions, UX improvements
- **Knowledge sharing** — technical expertise, documentation
- **Cross-project value** — contributions that benefit multiple spawned projects

The current model is deliberately simple so we can prove the mechanism works (payments split correctly, on-chain, verifiable) before adding complexity to the scoring.

## Prior Art & Novelty

We could have submitted patents for some or all of these innovations. We didn't. We put them on-chain and gave them to everyone.

By publishing on-chain, we didn't just open source the code — we created prior art that blocks future patents on these ideas. Nobody can lock this up now. Not big tech, not patent trolls, not competitors. The Agentic Fairness Protocol, the contribution scoring, the trustless split payments, the zero-friction identity with on-chain key migration — it's all public, timestamped, and permanently verifiable on BSV.

Independent prior art research (2026-04-02) confirmed:
- **The Agentic Fairness Protocol (AFP) is genuinely novel.** No prior art exists for on-chain project lineage + cascading royalties to weighted contributor pools + fork-triggered obligation.
- **The Agentic Fairness system is partially novel.** Nobody combines AI-governed parameter tuning + sqrt×decay scoring + automatic real-money atomic multi-output splits from live revenue.
- **The zero-friction identity with on-chain key migration** is partially novel. Contribution history following key rotations via OP_RETURN chain resolution is new.

When we build this out together — faster, forked, iterated — the community stays in control. Ideas that are built upon openly stay so far in front that patents become irrelevant. We are the innovation. It is YOUR data, and you can prove it.

Do you get it, anon?

## Open Questions

- **Boot price**: Fixed (e.g., 10,000 sats) or dynamic (increases the longer someone holds the spot)?
- **Multiple boots in quick succession**: Does each boot trigger a separate split transaction, or batch them?
- **Unsigned posts**: Should posts without a valid signature earn contribution weight? Currently they would — but the contributor can't receive payment without an address.
- **Genesis contributors**: Should the founding conversation participants get a permanent base weight, or do they enter the decay curve like everyone else?
- **When to start**: Do we enable payments from day one, or run the weight calculation visibly (show users their share) before real money flows?
