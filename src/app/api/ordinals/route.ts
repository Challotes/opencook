import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Single const so the indexer host can be swapped later; env-override optional.
const INDEXER_BASE = process.env.ORDINALS_INDEXER_BASE ?? "https://ordinals.gorillapool.io/api";
// Collectible holdings are near-static and the client fetches once on panel-open
// (not a poll), so a longer TTL than the balance route's 10s is safe.
const CACHE_TTL_MS = 45_000;
const CACHE_MAX = 1000;
const MAX_RETRIES = 4;
const RETRY_DELAYS_MS = [500, 1000, 2000, 3000];

type CacheEntry = { body: string; expires: number };
const _ordinalsCache = new Map<string, CacheEntry>();

// Fetch a single upstream endpoint with the shared retry/backoff policy.
// Returns:
//   { ok: true, data }              — parsed body (404 degrades to `empty`)
//   { ok: false, kind: "upstream", status } — non-retryable upstream status
//   { ok: false, kind: "failed" }   — retries exhausted / network error
type EndpointResult =
  | { ok: true; data: unknown }
  | { ok: false; kind: "upstream"; status: number }
  | { ok: false; kind: "failed" };

async function fetchEndpoint(url: string, empty: unknown): Promise<EndpointResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);

      if (res.ok) {
        try {
          return { ok: true, data: await res.json() };
        } catch {
          // Malformed/empty JSON body — treat as "holds nothing" for this endpoint.
          return { ok: true, data: empty };
        }
      }

      // A fresh address legitimately 404s on the indexer — that is NOT a failure,
      // it means "you have nothing here". Degrade this endpoint to an empty result.
      if (res.status === 404) {
        return { ok: true, data: empty };
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 3000));
          continue;
        }
        return { ok: false, kind: "failed" };
      }

      // Other upstream statuses — pass through so the caller can surface them.
      return { ok: false, kind: "upstream", status: res.status };
    } catch {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 3000));
      }
    }
  }

  return { ok: false, kind: "failed" };
}

export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`ordinals:${ip}`, { limit: 120, windowMs: 60_000 });
  if (!rl.success) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const fresh = searchParams.get("fresh") === "1";

  if (!address || !/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
    return new Response(JSON.stringify({ error: "invalid_address" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const cached = _ordinalsCache.get(address);
  if (!fresh && cached && cached.expires > now) {
    return new Response(cached.body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch both endpoints in parallel: (1) the 1Sat inscription/ordinal UTXOs,
  // (2) the BSV20/BSV21 fungible token balances. Each endpoint is resilient on
  // its own — a per-endpoint 404 degrades to [] rather than failing the response,
  // so "you have nothing" is distinguishable from "the indexer is down".
  const [ordinalsRes, tokensRes] = await Promise.all([
    fetchEndpoint(`${INDEXER_BASE}/txos/address/${address}/unspent`, []),
    fetchEndpoint(`${INDEXER_BASE}/bsv20/${address}/balance`, []),
  ]);

  // A non-retryable upstream status on either endpoint — pass it through.
  const upstream =
    (!ordinalsRes.ok && ordinalsRes.kind === "upstream" && ordinalsRes) ||
    (!tokensRes.ok && tokensRes.kind === "upstream" && tokensRes);
  if (upstream) {
    return new Response(JSON.stringify({ error: "upstream_error" }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // A genuine failure (retries exhausted / network error) on either endpoint —
  // serve stale cache if we have it, else signal the indexer is busy/unreachable.
  if (!ordinalsRes.ok || !tokensRes.ok) {
    if (cached) {
      return new Response(cached.body, {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Stale": "1" },
      });
    }
    return new Response(JSON.stringify({ error: "upstream_busy" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Success — an empty result ({ ordinals: [], tokens: [] }) is a valid 200, not
  // an error: it just means the address holds nothing. Keep item shapes as the
  // upstream returns them; the client normalizes.
  const body = JSON.stringify({
    ordinals: ordinalsRes.data,
    tokens: tokensRes.data,
  });

  if (_ordinalsCache.size >= CACHE_MAX) {
    const oldest = _ordinalsCache.keys().next().value;
    if (oldest) _ordinalsCache.delete(oldest);
  }
  _ordinalsCache.set(address, { body, expires: now + CACHE_TTL_MS });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
