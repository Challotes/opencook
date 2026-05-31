// Shared domain types for BSVibes.

export interface Identity {
  name: string;
  address: string;
  wif: string;
  // E30: compressed-hex secp256k1 public key derived from `wif`. Required
  // so the feed-polling client can send it to the server in the
  // `x-bsvibes-pubkey` header for stale-key detection without re-deriving
  // on every poll. Identity-creating sites in `services/bsv/identity.ts`
  // derive this in one place; consumers MUST NOT compute it ad-hoc.
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
