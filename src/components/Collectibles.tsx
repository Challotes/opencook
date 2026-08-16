"use client";

import { useEffect, useState } from "react";
import { useIdentityContext } from "@/contexts/IdentityContext";
import { ordAddressFromPubkey } from "@/lib/ord-derivation";
import type {
  CollectibleItem,
  OrdinalsResponse,
  RawCollectibleTxo,
  RawTokenBalanceRow,
  TokenBalance,
} from "@/types";

// Thumbnail gateway for on-chain image content. The origin outpoint is a stable
// id, so this URL is durable. Mirrored in next.config.ts img-src.
const THUMB_GATEWAY = "https://ordfs.network";

type LoadState = "loading" | "ready" | "error";

// ── Normalizers ────────────────────────────────────────────────────────────
// Verified against the live GorillaPool API (2026-08). Defensive optional-
// chaining throughout so an upstream shape drift degrades gracefully rather
// than throwing.

function normalizeCollectibles(raw: RawCollectibleTxo[] | undefined): CollectibleItem[] {
  if (!Array.isArray(raw)) return [];
  const items: CollectibleItem[] = [];
  for (const txo of raw) {
    // Only inscribed outputs are collectibles — a bare 1-sat output with no
    // origin is a funding/dust UTXO and shouldn't show in the grid.
    const origin = txo?.origin;
    if (!origin) continue;
    const key = origin.outpoint ?? txo.outpoint;
    if (!key) continue;
    const contentType = origin.data?.insc?.file?.type ?? "";
    const name = origin.data?.map?.name;
    const isImage = contentType.startsWith("image/");
    items.push({
      outpoint: key,
      contentType,
      name: typeof name === "string" && name.trim() ? name.trim() : undefined,
      num: typeof origin.num === "string" ? origin.num : undefined,
      imageUrl: isImage && origin.outpoint ? `${THUMB_GATEWAY}/${origin.outpoint}` : undefined,
    });
  }
  return items;
}

// Format a raw integer-string amount by its decimal places, trimming trailing
// zeros. e.g. ("2136000000000", 8) → "21360". Falls back to the raw string.
function formatAmount(rawAmount: string | undefined, dec: number | undefined): string {
  const raw = (rawAmount ?? "0").trim();
  if (!/^\d+$/.test(raw)) return raw || "0";
  const d = typeof dec === "number" && dec > 0 ? dec : 0;
  if (d === 0) {
    try {
      return BigInt(raw).toLocaleString("en-US");
    } catch {
      return raw;
    }
  }
  const padded = raw.padStart(d + 1, "0");
  const whole = padded.slice(0, padded.length - d);
  const frac = padded.slice(padded.length - d).replace(/0+$/, "");
  let wholeFmt = whole;
  try {
    wholeFmt = BigInt(whole).toLocaleString("en-US");
  } catch {
    /* keep raw whole */
  }
  return frac ? `${wholeFmt}.${frac}` : wholeFmt;
}

function normalizeTokens(raw: RawTokenBalanceRow[] | undefined): TokenBalance[] {
  if (!Array.isArray(raw)) return [];
  const items: TokenBalance[] = [];
  for (const row of raw) {
    const id = row?.id ?? row?.tick;
    if (!id) continue;
    const confirmed = row.all?.confirmed;
    // Skip zero balances — nothing to show.
    if (!confirmed || /^0*$/.test(confirmed.trim())) continue;
    items.push({
      id,
      tick: row.tick,
      sym: row.sym,
      amount: formatAmount(confirmed, row.dec),
      dec: row.dec,
    });
  }
  return items;
}

// ── Component ──────────────────────────────────────────────────────────────

export function Collectibles(): React.JSX.Element | null {
  const { identity } = useIdentityContext();
  const [state, setState] = useState<LoadState>("loading");
  const [collectibles, setCollectibles] = useState<CollectibleItem[]>([]);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const pubkey = identity?.pubkey;

  useEffect(() => {
    // Fetch lazily when the section mounts (the parent only mounts this on
    // expand). No polling, no interval. NB: no "already-fetched" ref-guard here
    // on purpose — under React StrictMode the dev double-mount cancels the first
    // fetch, and such a guard would then skip the second, leaving the UI stuck
    // on the loading skeleton. The `cancelled` cleanup flag is the sole guard;
    // dev re-fetches once (harmless, the route is cached), prod fetches once.
    if (!pubkey) return;

    let cancelled = false;
    // Derive the receive address inside the effect — never at module scope or
    // during render (SSR safety). Pure + SSR-safe, but kept client-only here.
    let ordAddr: string;
    try {
      ordAddr = ordAddressFromPubkey(pubkey);
    } catch {
      if (!cancelled) setState("error");
      return;
    }

    fetch(`/api/ordinals?address=${encodeURIComponent(ordAddr)}`)
      .then((res) => (res.ok ? (res.json() as Promise<OrdinalsResponse>) : null))
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setState("error");
          return;
        }
        setCollectibles(normalizeCollectibles(data.ordinals));
        setTokens(normalizeTokens(data.tokens));
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  // Parent only mounts when identity is present; belt-and-suspenders guard.
  if (!identity || !pubkey) return null;

  if (state === "loading") {
    return (
      <div className="grid grid-cols-4 gap-1.5" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static skeleton
            key={i}
            className="aspect-square rounded-md bg-zinc-800/60 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const isEmpty = collectibles.length === 0 && tokens.length === 0;

  // Load failure with nothing cached to show — quiet, non-alarming.
  if (state === "error" && isEmpty) {
    return (
      <p className="text-[11px] text-zinc-600 leading-relaxed">Couldn&rsquo;t load right now.</p>
    );
  }

  if (isEmpty) {
    return (
      <p className="text-[11px] text-zinc-600 leading-relaxed">
        Nothing here yet &mdash; anything sent to you shows up here.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {collectibles.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {collectibles.map((item) => (
            <CollectibleCell key={item.outpoint} item={item} />
          ))}
        </div>
      )}

      {tokens.length > 0 && (
        <div className="space-y-1">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 truncate mr-2">{t.sym ?? t.tick ?? "—"}</span>
              <span className="font-mono text-zinc-200 shrink-0 tabular-nums">{t.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Single grid cell: image thumbnail, or a compact type-badge placeholder for
// non-image content (or a failed image load).
function CollectibleCell({ item }: { item: CollectibleItem }): React.JSX.Element {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = item.imageUrl && !imgFailed;
  const label = item.name ?? item.num ?? "";

  return (
    <div
      className="aspect-square rounded-md overflow-hidden bg-zinc-800/60 border border-zinc-700/40 relative"
      title={label || undefined}
    >
      {showImage ? (
        // biome-ignore lint/performance/noImgElement: on-chain gateway thumbnail, not a bundled asset
        <img
          src={item.imageUrl}
          alt={label || "Collectible"}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1">
          <span className="text-[9px] uppercase tracking-wide text-zinc-500 text-center leading-tight break-all">
            {shortType(item.contentType)}
          </span>
        </div>
      )}
    </div>
  );
}

// "image/png" → "PNG", "text/html" → "HTML", "" → "FILE".
function shortType(contentType: string): string {
  if (!contentType) return "FILE";
  const sub = contentType.split("/")[1] ?? contentType;
  return (sub.split(";")[0] || "FILE").toUpperCase();
}
