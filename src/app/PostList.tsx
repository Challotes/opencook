"use client";

import { useEffect, useState } from "react";
import { BootIcon } from "@/components/icons/BootIcon";
import { useBootContext } from "@/contexts/BootContext";
import { useIdentityContext } from "@/contexts/IdentityContext";
import { useBoot } from "@/hooks/useBoot";
import { timeAgo } from "@/lib/utils";
import type { Post } from "@/types";
import { Genesis } from "./Genesis";

// ── Inline amber spinner (16px, Tailwind animate-spin) ───────────────────────

function BootSpinner() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="animate-spin text-amber-400"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Status label map ─────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: "",
  sending: "Sending...",
  retrying: "Retrying...",
  preparing: "Preparing...",
};

// ── Boot button ──────────────────────────────────────────────────────────────

interface BootButtonProps {
  postId: number;
  bootCount: number;
  postPubkey: string | null;
  bootPrice: number;
  freeBootsRemaining: number;
  onBooted?: () => void;
  onFundNeeded?: (address: string, balance?: number, fee?: number) => void;
  onFreeBootUsed?: () => void;
}

function BootButton({
  postId,
  bootCount,
  postPubkey,
  bootPrice,
  freeBootsRemaining,
  onBooted,
  onFundNeeded,
  onFreeBootUsed,
}: BootButtonProps) {
  const { identity, requireIdentity } = useIdentityContext();
  const { bootingPostId, bootStatus, throttled, consolidationWarningDismissed } = useBootContext();
  const { boot } = useBoot({ onBooted, onFundNeeded, onFreeBootUsed });
  const [optimisticBoots, setOptimisticBoots] = useState(0);

  useEffect(() => {
    setOptimisticBoots(0);
  }, []);

  const isFree = freeBootsRemaining > 0;
  const canBoot = !!postPubkey;

  // Is this specific button currently booting?
  const isThisBooting = bootingPostId === postId;
  // Is any boot in progress (including this one)?
  const anyBooting = bootingPostId !== null;
  // Should this button be dimmed (another post is booting OR throttled)?
  const isDimmed = (anyBooting && !isThisBooting) || throttled;

  const showExtended =
    isThisBooting &&
    (bootStatus === "sending" || bootStatus === "retrying" || bootStatus === "preparing");

  const showConsolidationHint =
    isThisBooting && bootStatus === "preparing" && !consolidationWarningDismissed;

  async function handleBoot() {
    if (!postPubkey || anyBooting || throttled) return;
    // Opens SignInModal if locked; caller retaps after signing in.
    if (!requireIdentity() || !identity) return;
    setOptimisticBoots((prev) => prev + 1);
    const result = await boot(postId, identity);
    if (!result.success) {
      setOptimisticBoots((prev) => Math.max(0, prev - 1));
    }
  }

  const displayCount = bootCount + optimisticBoots;
  const title = !postPubkey
    ? "Unsigned post — cannot be booted"
    : !identity
      ? "Sign in to boot"
      : isFree
        ? `Boot to the board (FREE — ${freeBootsRemaining} remaining)`
        : `Boot to the board (~${bootPrice.toLocaleString()} sats + network fee)`;

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={handleBoot}
        disabled={anyBooting || throttled || !canBoot}
        className={`relative -m-2 p-2 flex items-center gap-1 rounded-full transition-all border disabled:cursor-not-allowed ${
          isDimmed
            ? "opacity-50 text-zinc-600 border-zinc-800"
            : isThisBooting
              ? "text-amber-400 border-amber-500/40 bg-amber-500/5"
              : displayCount > 0
                ? "text-amber-500 border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/10"
                : "text-zinc-600 border-zinc-800 hover:border-zinc-700 hover:text-amber-400 hover:bg-zinc-800/50"
        } ${!canBoot && !anyBooting ? "disabled:opacity-30" : ""}`}
        title={title}
      >
        {isThisBooting ? (
          <>
            <BootSpinner />
            {showExtended && (
              <span className="text-[9px] text-amber-400 pr-0.5">
                {STATUS_LABEL[bootStatus] ?? ""}
              </span>
            )}
          </>
        ) : (
          <BootIcon size={13} className={displayCount > 0 ? "text-amber-500" : ""} />
        )}
      </button>

      {/* Boot count — hide while actively booting this post */}
      {!isThisBooting && displayCount > 0 && (
        <span className="text-[9px] text-zinc-600 mt-0.5">{displayCount}</span>
      )}

      {/* Free label */}
      {!isThisBooting && isFree && canBoot && (
        <span className="text-[8px] text-emerald-600 mt-0.5">FREE</span>
      )}

      {/* First-time consolidation hint */}
      {showConsolidationHint && (
        <span className="text-[8px] text-amber-600 mt-1 text-center leading-tight max-w-[80px]">
          Setting up wallet... ~30s
        </span>
      )}
    </div>
  );
}

// ── PostList ─────────────────────────────────────────────────────────────────

interface PostListProps {
  posts: Post[];
  genesisRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  observerRef: React.RefObject<IntersectionObserver | null>;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadEarlier: () => void;
  onBooted?: () => void;
  onAskAgent?: () => void;
  onFundNeeded?: (address: string, balance?: number, fee?: number) => void;
  onFreeBootUsed?: () => void;
  bootPrice: number;
  freeBootsRemaining: number;
}

export function PostList({
  posts,
  genesisRef,
  bottomRef,
  observerRef,
  hasMore,
  isLoadingMore,
  onLoadEarlier,
  onBooted,
  onAskAgent,
  onFundNeeded,
  onFreeBootUsed,
  bootPrice,
  freeBootsRemaining,
}: PostListProps) {
  // Re-render every 60s to keep timeAgo labels fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3">
      <div ref={genesisRef} />
      <Genesis onAskAgent={onAskAgent} />

      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            onClick={onLoadEarlier}
            disabled={isLoadingMore}
            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-3 py-2.5 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
          >
            {isLoadingMore ? "Loading..." : "Load earlier posts"}
          </button>
        </div>
      )}

      {posts.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-600">
          No posts yet. Be the first to share an idea.
        </p>
      )}

      <div className="divide-y divide-zinc-800/60">
        {posts.map((post) => (
          <article
            key={post.id}
            data-post-id={post.id}
            ref={(el) => {
              if (el && observerRef.current) {
                observerRef.current.observe(el);
              }
            }}
            className="py-3.5 group"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-300">{post.author_name}</span>
                  {post.signature && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0"
                      title="Signed"
                    />
                  )}
                  <span>·</span>
                  <time suppressHydrationWarning>{timeAgo(post.created_at)}</time>
                  {post.tx_id && (
                    <a
                      href={`https://whatsonchain.com/tx/${post.tx_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View on chain"
                      className="relative -m-3 p-3 inline-flex items-center text-emerald-500 hover:text-emerald-400 transition-colors"
                    >
                      <span className="sr-only">View on chain</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </a>
                  )}
                </div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-words">
                  {post.content}
                </p>
              </div>
              <div className="shrink-0 self-center">
                <BootButton
                  postId={post.id}
                  bootCount={post.boot_count}
                  postPubkey={post.pubkey}
                  bootPrice={bootPrice}
                  freeBootsRemaining={freeBootsRemaining}
                  onBooted={onBooted}
                  onFundNeeded={onFundNeeded}
                  onFreeBootUsed={onFreeBootUsed}
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
