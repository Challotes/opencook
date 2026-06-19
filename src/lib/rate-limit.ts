/**
 * Simple in-memory rate limiter using a sliding window approach.
 * Not suitable for multi-process deployments — use Redis for that.
 * Fine for a single Next.js server process as a first line of defense.
 */

interface RateLimitEntry {
  timestamps: number[];
  /** The window this key is limited on — stored so cleanup prunes each key
   *  against ITS OWN window (see scheduleCleanup). */
  windowMs: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60 seconds to prevent unbounded memory growth.
let cleanupScheduled = false;

// Prune each entry against ITS OWN window. The old behaviour captured the
// FIRST caller's windowMs and applied it to every key — so with a 60s-window
// caller registering first (the feed/agent/post routes, hit constantly), the
// 24h free-boot cap's timestamps were pruned after ~60s, silently resetting
// that cap and defeating it (server-wallet drain). Per-entry windows fix this
// regardless of caller order.
function pruneStore(now: number): void {
  for (const [key, entry] of store) {
    const cutoff = now - entry.windowMs;
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  const interval = setInterval(() => pruneStore(Date.now()), 60_000);
  // Don't keep the event loop alive just for cleanup (clean test/process exit).
  interval.unref?.();
}

/** Exposed for tests only — drives the cleanup loop deterministically. */
export const __test = { pruneStore };

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window. */
  limit: number;
  /** Sliding window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  success: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Milliseconds until the oldest request in the window expires. */
  resetMs: number;
}

/**
 * Check and record a rate-limited action.
 *
 * @param key     Unique identifier for the caller (e.g. author name, action label).
 * @param config  Limit and window configuration.
 */
export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const { limit, windowMs } = config;

  scheduleCleanup();

  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [], windowMs };
    store.set(key, entry);
  } else {
    // Keep the stored window current (config is stable per key, but be safe).
    entry.windowMs = windowMs;
  }

  // Drop timestamps outside the current window.
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

  const count = entry.timestamps.length;

  if (count >= limit) {
    // Oldest timestamp tells us when the window next frees a slot.
    const oldest = entry.timestamps[0];
    return {
      success: false,
      remaining: 0,
      resetMs: oldest + windowMs - now,
    };
  }

  entry.timestamps.push(now);

  return {
    success: true,
    remaining: limit - entry.timestamps.length,
    resetMs: 0,
  };
}
