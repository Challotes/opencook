// Shared domain types for OpenCook.

export interface Identity {
  name: string;
  address: string;
  wif: string;
  // Compressed-hex secp256k1 public key derived from `wif`. Cached on the
  // identity so consumers (post signing, boot orchestration, fairness
  // weighting, on-chain logging) don't re-derive it. Identity-creating sites
  // in `services/bsv/identity.ts` derive this in one place; consumers MUST
  // NOT compute it ad-hoc.
  pubkey: string;
}

// ── Posts ──────────────────────────────────────────────────────────────────

export interface PostRow {
  id: number;
  content: string;
  author_name: string;
  signature: string | null;
  pubkey: string | null;
  tx_id: string | null;
  created_at: string;
}

export type Post = PostRow & { boot_count: number };

// ── Bootboard ──────────────────────────────────────────────────────────────

export interface BootboardRow {
  id: number;
  post_id: number;
  boosted_by: string;
  boosted_by_name: string | null;
  booted_at: string;
  held_until: string | null;
  content: string;
  author_name: string;
  signature: string | null;
}

export interface BootboardHistoryRow {
  post_id: number;
  boosted_by: string;
  boosted_by_name: string | null;
  booted_at: string;
  held_until: string;
  duration_seconds: number;
  content: string;
  author_name: string;
}

export interface BootboardData {
  current: BootboardRow | null;
  history: BootboardHistoryRow[];
  totalBoots: number;
}

// ── Collectibles (display-only holdings at the derived receive address) ──────
//
// The user's identity key derives a receive address (see `lib/ord-derivation.ts`);
// `GET /api/ordinals?address=…` returns the raw GorillaPool holdings held there.
// These types describe the RAW upstream shapes (only the fields the grid reads)
// and the NORMALIZED display items the `<Collectibles>` grid consumes. Display-
// only — no signing, no spending. Field names verified against the live
// GorillaPool API (2026-08).

/** Raw 1Sat txo from GorillaPool `/txos/address/{addr}/unspent` (read subset). */
export interface RawCollectibleTxo {
  outpoint?: string;
  satoshis?: number;
  origin?: {
    // Stable inscription id — preferred key + thumbnail path.
    outpoint?: string;
    // Inscription number, e.g. "0942736:5367:0".
    num?: string;
    data?: {
      map?: { name?: string; subType?: string } & Record<string, unknown>;
      insc?: { file?: { type?: string; size?: number } };
    };
  } | null;
}

/** Raw fungible-token balance row from GorillaPool `/bsv20/{addr}/balance`. */
export interface RawTokenBalanceRow {
  // BSV-20 (ticker-based) rows carry `tick`; BSV-21 rows carry `id` + `sym`.
  tick?: string;
  id?: string;
  sym?: string;
  dec?: number;
  icon?: string;
  all?: { confirmed?: string; pending?: string };
}

/** Shape of the `/api/ordinals` JSON response. */
export interface OrdinalsResponse {
  ordinals: RawCollectibleTxo[];
  tokens: RawTokenBalanceRow[];
}

/** Normalized display item for the Collectibles grid. */
export interface CollectibleItem {
  // Stable unique key (origin outpoint preferred, else current outpoint).
  outpoint: string;
  // MIME content type, e.g. "image/png"; "" when unknown.
  contentType: string;
  name?: string;
  num?: string;
  // Thumbnail gateway URL — set only for image content types.
  imageUrl?: string;
}

/** Normalized display item for a fungible token balance row. */
export interface TokenBalance {
  // Unique key: token id (BSV-21) or ticker (BSV-20).
  id: string;
  tick?: string;
  sym?: string;
  // Human-readable amount with decimals already applied.
  amount: string;
  dec?: number;
}

// ── Agentic Fairness (live contribution shares) ─────────────────────────────
//
// `GET /api/fairness` returns each contributor's share of total attributed
// posts. Consumed by <FairnessModal>. The share basis is intentionally NOT
// surfaced in UI copy (methodology-silent); these are just the numbers.

/** One contributor row in the fairness panel (PUBLIC — no raw counts). */
export interface FairnessContributor {
  // Latest display name (anon_XXXX) seen for this pubkey.
  name: string;
  // Signing pubkey (hex) — the stable contributor identity.
  pubkey: string;
  // Share as a percentage (e.g. 47.2). Raw post counts are deliberately NOT
  // exposed publicly: postCount + totalPosts would reveal share = count ÷ total
  // (the drop method) and the exact "posts to overtake". See DECISIONS "Agentic Fairness".
  sharePct: number;
}

/** Shape of the `/api/fairness` JSON response (contributors sorted desc). */
export interface FairnessResponse {
  // ISO-8601 UTC timestamp of when this snapshot was computed (cache-build time).
  generatedAt: string;
  contributors: FairnessContributor[];
}
