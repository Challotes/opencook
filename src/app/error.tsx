"use client";

import { useEffect, useState } from "react";

// Error-message/name fragments that indicate a STALE-DEPLOY skew (an old client
// bundle calling assets/server-actions a newer deploy no longer serves) or a
// failed dynamic import — all of which a fresh page load fixes. We only ever
// auto-reload for THESE; every other error falls through to the manual screen.
const SKEW_PATTERNS = [
  "ChunkLoadError",
  "Loading chunk",
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
  "Failed to find Server Action",
];

// One-shot guard: if we reloaded for a skew error within this window and still
// land back here, we're looping on a genuine error — stop reloading and show the
// manual screen instead. Time-based (not a permanent flag) so an unrelated skew
// later in the same session can still self-heal.
const RELOAD_GUARD_KEY = "oc_skew_reload_at";
const RELOAD_GUARD_MS = 10_000;

function isLikelySkewError(error: Error): boolean {
  const haystack = `${error.name} ${error.message}`;
  return SKEW_PATTERNS.some((p) => haystack.includes(p));
}

export default function ErrorPage({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!isLikelySkewError(error)) return;
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY)) || 0;
    } catch {
      // sessionStorage unavailable (private mode / blocked) — fall through to a
      // single reload attempt; without the guard we simply can't loop-protect.
    }
    // Reloaded very recently for this and we're still here → it's looping, not
    // skew. Leave the manual screen up.
    if (Date.now() - last < RELOAD_GUARD_MS) return;
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch {
      // ignore — see note above
    }
    setReloading(true);
    window.location.reload();
  }, [error]);

  if (reloading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-zinc-400 text-sm">Updating to the latest version…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center space-y-4 px-4">
        <p className="text-zinc-200 text-sm">Something went wrong</p>
        <p className="text-zinc-500 text-xs leading-relaxed max-w-xs mx-auto">
          Refreshing the page usually fixes it. If it keeps happening, close this tab and open
          OpenCook again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
