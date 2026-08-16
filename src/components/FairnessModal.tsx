"use client";

import { useCallback, useEffect, useState } from "react";
import { useIdentityContext } from "@/contexts/IdentityContext";
import type { FairnessContributor, FairnessResponse } from "@/types";

interface FairnessModalProps {
  onClose: () => void;
}

type LoadState = "loading" | "ready" | "error";

const TOP_COUNT = 10;

/** Format a share percentage as e.g. "47.2%". Sub-0.1% shares (that aren't a
 * true zero) render as "<0.1%" so a tiny contributor never reads as "0.0%". */
function formatPct(pct: number): string {
  if (pct <= 0) return "0%";
  if (pct < 0.1) return "<0.1%";
  return `${pct.toFixed(1)}%`;
}

/** Human-readable "when this snapshot was taken" from the ISO timestamp. */
function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Live "Contributors" panel. Reads GET /api/fairness and shows the
 * current user's share plus a ranked top list, with the long tail behind an
 * expander and a public CSV download pinned at the bottom.
 *
 * COPY IS METHODOLOGY-SILENT: only percentages are shown. The share basis
 * (post counts / any formula) is never stated or implied in visible strings,
 * and no crypto jargon appears in the UI (DECISIONS.md jargon rule). The
 * current user is labelled only as "You".
 */
export function FairnessModal({ onClose }: FairnessModalProps): React.JSX.Element {
  const { identity } = useIdentityContext();

  const [state, setState] = useState<LoadState>("loading");
  const [contributors, setContributors] = useState<FairnessContributor[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/fairness");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as FairnessResponse;
      // Defensive client-side sort — never trust the response ordering.
      const sorted = [...(data.contributors ?? [])].sort((a, b) => b.sharePct - a.sharePct);
      setContributors(sorted);
      setGeneratedAt(data.generatedAt ?? null);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const you = identity ? contributors.find((c) => c.pubkey === identity.pubkey) : undefined;
  const topContributors = contributors.slice(0, TOP_COUNT);
  const tail = contributors.slice(TOP_COUNT);
  const updatedLabel = formatUpdated(generatedAt);

  return (
    <>
      {/* Backdrop click closes */}
      <button
        type="button"
        className="fixed inset-0 z-[70] w-full bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] cursor-default"
        aria-label="Close"
        onClick={onClose}
      />

      {/* Modal — pinned to top of viewport (shared modal pattern) */}
      <div className="fixed inset-0 z-[70] flex items-start justify-center px-6 pt-[6svh] pointer-events-none">
        <div
          className="w-full max-w-md rounded-2xl border border-amber-400/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden pointer-events-auto animate-[slideUp_0.3s_ease-out_backwards] flex flex-col max-h-[86svh]"
          style={{ backgroundColor: "#0f0f0f" }}
        >
          {/* Gold top stripe */}
          <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-400/10 shrink-0">
            <p className="text-sm font-semibold text-zinc-100">Contributors</p>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-200 transition-colors ml-3"
              aria-label="Close"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {state === "loading" && (
            <div className="px-5 py-5 space-y-3">
              <div className="h-16 rounded-lg bg-zinc-800/50 animate-pulse" />
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 rounded-md bg-zinc-800/40 animate-pulse" />
              ))}
            </div>
          )}

          {state === "error" && (
            <div className="px-5 py-8 flex flex-col items-center gap-3">
              <p className="text-sm text-zinc-400">Couldn&apos;t load right now.</p>
              <button
                type="button"
                onClick={load}
                className="bg-zinc-900 text-zinc-300 border border-amber-400/15 rounded-lg px-4 py-2 text-xs font-medium hover:bg-zinc-800 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {state === "ready" && contributors.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-zinc-400">No contributions yet.</p>
            </div>
          )}

          {state === "ready" && contributors.length > 0 && (
            <>
              {/* Hero — your share (pinned) */}
              <div className="px-5 pt-4 pb-3 shrink-0">
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-amber-400/80">
                    Your share
                  </p>
                  {you ? (
                    <p className="mt-0.5 text-2xl font-semibold text-amber-300 tabular-nums">
                      {formatPct(you.sharePct)}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-zinc-400">
                      You&apos;re not in yet — start contributing.
                    </p>
                  )}
                </div>
              </div>

              {/* Scrollable list region */}
              <div className="px-5 pb-2 overflow-y-auto max-h-[70svh]">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">
                  Top contributors
                </p>
                <ul className="space-y-1">
                  {topContributors.map((c, i) => {
                    const isYou = identity ? c.pubkey === identity.pubkey : false;
                    return (
                      <li
                        key={c.pubkey}
                        className={`flex items-center justify-between rounded-md px-2.5 py-2 text-sm ${
                          isYou
                            ? "border-l-2 border-amber-500/60 bg-amber-400/5 text-amber-300"
                            : "text-zinc-300"
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] text-zinc-600 tabular-nums w-4 shrink-0 text-right">
                            {i + 1}
                          </span>
                          <span className="truncate">{c.name}</span>
                          {isYou && (
                            <span className="shrink-0 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-medium px-1.5 py-0.5">
                              You
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums shrink-0 ml-3">{formatPct(c.sharePct)}</span>
                      </li>
                    );
                  })}
                </ul>

                {tail.length > 0 && (
                  <div className="mt-1">
                    {expanded ? (
                      <ul className="space-y-1">
                        {tail.map((c, i) => {
                          const isYou = identity ? c.pubkey === identity.pubkey : false;
                          return (
                            <li
                              key={c.pubkey}
                              className={`flex items-center justify-between rounded-md px-2.5 py-2 text-sm ${
                                isYou
                                  ? "border-l-2 border-amber-500/60 bg-amber-400/5 text-amber-300"
                                  : "text-zinc-300"
                              }`}
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="text-[11px] text-zinc-600 tabular-nums w-6 shrink-0 text-right">
                                  {TOP_COUNT + i + 1}
                                </span>
                                <span className="truncate">{c.name}</span>
                                {isYou && (
                                  <span className="shrink-0 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-medium px-1.5 py-0.5">
                                    You
                                  </span>
                                )}
                              </span>
                              <span className="tabular-nums shrink-0 ml-3">
                                {formatPct(c.sharePct)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        className="w-full text-center text-xs text-zinc-500 hover:text-amber-400/90 transition-colors py-2"
                      >
                        and {tail.length} more ▾
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Download — pinned at bottom (public, no auth gate). The server
                  sets a timestamped Content-Disposition filename (date+time); the
                  empty `download` attribute lets that server name win. */}
              <div className="px-5 py-4 border-t border-amber-400/10 shrink-0 space-y-2">
                {updatedLabel && (
                  <p className="text-[11px] text-zinc-500 text-center">Updated {updatedLabel}</p>
                )}
                <a
                  href="/api/fairness?format=csv"
                  download=""
                  className="block w-full text-center bg-amber-400 text-black rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-amber-300 transition-colors"
                >
                  Download data
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
