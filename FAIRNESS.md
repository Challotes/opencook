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
| Boot price cache TTL | 1 hour | How often the dynamic-price recompute runs | tunable |
| Weights cache TTL | 30 seconds | How often the contributor-weight recompute runs | tunable |
| Active window | 30 days | "Active contributor" = distinct pubkey with a post in the last 30 days (used by dynamic pricing) | tunable |
| Free boots per user | 15 | Each new account gets 15 floor-priced boots before self-funding kicks in | tunable |

All parameters are exposed for the fairness agent to adjust in later phases. They are the governance surface — the agent tunes knobs, it doesn't rewrite the formula.

**Implementation note:** the contributor pool 80% is currently DERIVED in `split.ts` as `bootFeeSats - platformSats - bonusSats` — the `poolShare: 0.8` field in `FAIRNESS_CONFIG` is documented for clarity but not actually read by code. Treat the table value as the documented intent; the source of truth is the platformCut + creatorBonus subtraction. Rounding dust from the pool floor() is added to the creator's bonus payout so every sat of the boot is accounted for in the same tx.

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

Every split transaction includes an OP_RETURN with metadata. Both boot paths
(server-funded and client-funded) emit the SAME shape via the shared builder
`src/lib/boot-audit.ts` (`bootAuditPayload`):

```json
{
  "v": 1,
  "app": "opencook",
  "type": "boot_split",
  "post_id": 42,
  "booter": "1BooterAddress…",
  "funded": "booter",
  "total": 10000,
  "recipients": 28,
  "formula_version": "0.1.0",
  "ts": 1711461600000
}
```

`booter` is the address that performed the boot (audit provenance — the
server-funded path pays from the server wallet, so without this the booter would
not appear on-chain). `funded` is `"server"` (free boot, server-subsidised) or
`"booter"` (paid boot). `recipients` / `formula_version` are present only on the
server-funded path (the client doesn't compute them). `v` is the record-envelope
version (see DECISIONS.md "On-chain records carry a top-level version field").

This makes every split publicly verifiable on-chain. Anyone can look up the transaction and confirm the percentages match the stated contribution table.

## Gaming Analysis

| Attack | Effective? | Why |
|--------|-----------|-----|
| **Spam posts** | No | sqrt scaling + 10/min rate limit + 30-day decay = diminishing returns. 1000 spam posts barely moves the needle. **Per-day cap now enforced (Phase 4):** 200 server-funded on-chain posts/IP/day (`ONCHAIN_POST_IP_LIMIT`) + a global ~$0.20/day server-spend ceiling; over the cap a post is refused (never stored off-chain) |
| **Self-boot** | No | Pay 10,000, get back ~3,500 max (your share + bonus). Net loss every time unless you believe in massive future volume |
| **Sybil (fake identities)** | Weak | Each identity has its own rate limit (10/min), sqrt scaling per identity. Expensive to maintain, low reward. **Phase 4:** fresh identities no longer inflate the dynamic boot price — only pubkeys with ≥3 posts in the window count (`pricing.ts`) — nor drain the server wallet (per-IP 200/day post cap + daily spend ceiling) |
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
- `src/services/fairness/weights.ts` — Weight calculation (sqrt × decay × engagement)
- `src/services/fairness/split.ts` — Payout split (no custody, all sats out in same tx)
- `src/services/fairness/pricing.ts` — Dynamic boot price with floor/ceiling
- `src/services/fairness/boot-orchestrator.ts` — Full boot workflow coordinator
- `src/services/fairness/boot-payment.ts` — Multi-output BSV transaction builder

### BSV Transaction

- **Free boots: server-side.** `boot-orchestrator.ts` + `wallet.ts` build the multi-output split tx using the server wallet's funds, then consume a `boot_grant` row.
- **Paid boots: client-side, zero custody.** `client-boot.ts` (browser) fetches contributor shares from `/api/boot-shares`, builds the multi-output P2PKH tx, signs and broadcasts via ARC, then notifies `/api/boot-confirm` with the raw tx for server verification + recording. The server never holds the funds.
- Uses `@bsv/sdk` Transaction with N P2PKH outputs.
- OP_FALSE OP_RETURN for audit trail (BSV standard, provably unspendable).

### Key Attribution

Key rotation was removed from OpenCook at launch (2026-06-14) in favour of encrypt-in-place: adding or changing a passphrase wraps the existing WIF without changing the key or address. The `migrations` DB table and the `buildMigrationMap` / chain-resolver code in `weights.ts` have been deleted.

Posts attribute directly to the signing pubkey and its derived address. A user's weight is the sum of all posts signed by that single, permanent pubkey. No chain-walk is needed.

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

By publishing on-chain, we didn't just open source the code — we created prior art that blocks future patents on these ideas. Nobody can lock this up now. Not big tech, not patent trolls, not competitors. The Agentic Fairness Protocol, the contribution scoring, the trustless split payments, the zero-friction identity with on-chain key migration (the migration mechanism was later removed in favour of encrypt-in-place — retained as prior art, see below) — it's all public, timestamped, and permanently verifiable on BSV.

Independent prior art research (2026-04-02) confirmed:
- **The Agentic Fairness Protocol (AFP) is genuinely novel.** No prior art exists for on-chain project lineage + cascading royalties to weighted contributor pools + fork-triggered obligation.
- **The Agentic Fairness system is partially novel.** Nobody combines AI-governed parameter tuning + sqrt×decay scoring + automatic real-money atomic multi-output splits from live revenue.
- **Zero-friction identity with on-chain key migration and contribution-history chain resolution** is partially novel — contribution history following key rotations via OP_RETURN chain resolution was built, shipped, and operated on BSV mainnet. *This mechanism was subsequently removed at launch (2026-06-14) in favour of encrypt-in-place (simpler UX, no key rotation, no on-chain migration records needed).* The on-chain migration records and the chain-resolver code remain recoverable in git history. This entry is retained as a timestamped prior-art record: the design was publicly implemented and verifiable on-chain before removal, which is sufficient for defensive publication purposes regardless of the current code state.

When we build this out together — faster, forked, iterated — the community stays in control. Ideas that are built upon openly stay so far in front that patents become irrelevant. We are the innovation. It is YOUR data, and you can prove it.

Do you get it, anon?

## Open Questions

### Settled in code (resolved 2026-06-03 audit)

- **Boot price**: **Dynamic.** `pricing.ts` recomputes from `max(1000, min(250000, active_contributors × 156))` with a 1-hour cache. Floor 1,000 sats, ceiling 250,000 sats. Active = distinct pubkey with a post in the last 30 days.
- **Multiple boots in quick succession**: **Separate tx per boot, no batching.** The trustless split model requires per-boot finality on-chain — batching would require the server (or another party) to hold sats between events, which contradicts the no-custody rule. The 3-second UI throttle (`BootContext`) prevents accidental rapid-fire double-clicks; deliberate concurrent boots from different users each get their own split tx.
- **Unsigned posts**: **No weight, no boot eligibility.** `weights.ts:125` filters `WHERE p.pubkey IS NOT NULL`; `boot-orchestrator.ts:43-50` rejects boots on unsigned posts. An unsigned post is visible in the feed but contributes nothing to its author's weight and cannot be spotlighted via boot.
- **When to start**: **Day one.** Phase 6 shipped with payments live — real BSV moving, fairness payments accruing on every boot.

### Still open

- **Genesis contributors**: Should the founding conversation participants get a permanent base weight, or do they enter the decay curve like everyone else? Currently they enter the decay curve.
