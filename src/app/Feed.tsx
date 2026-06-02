"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { BootToast } from "@/components/BootToast";
import { HomeScreenWelcomeGate } from "@/components/HomeScreenWelcomeGate";
import { InstallBookmark } from "@/components/InstallBookmark";
import { InstallPitch } from "@/components/InstallPitch";
import { IosStorageToast } from "@/components/IosStorageToast";
import { SignInModal } from "@/components/SignInModal";
import { StaleKeyModal } from "@/components/StaleKeyModal";
import { BootProvider, useBootContext } from "@/contexts/BootContext";
import { IdentityProvider, useIdentityContext } from "@/contexts/IdentityContext";
import { InstallProvider } from "@/contexts/InstallContext";
import { useFeedPolling } from "@/hooks/useFeedPolling";
import { useScrollTracker } from "@/hooks/useScrollTracker";
import { timeAgo } from "@/lib/utils";
import type { BootboardData, Post } from "@/types";
import { getOlderPosts } from "./actions";
import { Bootboard } from "./Bootboard";
import { FundAddress } from "./FundAddress";
import { Header } from "./Header";
import { PostForm } from "./PostForm";
import { PostList } from "./PostList";

// A post that was added optimistically before the server confirms it.
interface OptimisticPost {
  id: number; // temporary timestamp ID
  content: string;
  author_name: string;
  created_at: string;
  failed?: boolean;
  failReason?: string;
}

// Remove an optimistic post if a confirmed server post with matching content +
// author already exists.
function pruneOptimistic(optimisticPosts: OptimisticPost[], serverPosts: Post[]): OptimisticPost[] {
  return optimisticPosts.filter(
    (op) =>
      !serverPosts.some((sp) => sp.content === op.content && sp.author_name === op.author_name)
  );
}

// Inner component — lives inside IdentityProvider so it can access identity context.
function FeedContent({
  initialPosts,
  initialBootboard,
}: {
  initialPosts: Post[];
  initialBootboard: BootboardData;
}) {
  const { identity } = useIdentityContext();
  const { bootError } = useBootContext();
  const {
    posts: serverPosts,
    bootboard,
    refresh,
  } = useFeedPolling({
    initialPosts,
    initialBootboard,
    intervalMs: 5000,
  });

  const [optimisticPosts, setOptimisticPosts] = useState<OptimisticPost[]>([]);
  const [olderPosts, setOlderPosts] = useState<Post[]>([]);
  const [hasMore, setHasMore] = useState(initialPosts.length === 100);
  const [isLoadingMore, startLoadingMore] = useTransition();
  const [agentHighlight, setAgentHighlight] = useState(false);
  // Default to floor price and 0 free boots — will be corrected from server once identity loads.
  const [bootPrice, setBootPrice] = useState(1000);
  const [freeBootsRemaining, setFreeBootsRemaining] = useState(0);
  const [showFundModal, setShowFundModal] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const [userBalance, setUserBalance] = useState<number | undefined>(undefined);

  // Fetch the real boot status for this identity from the server once on load.
  useEffect(() => {
    if (!identity?.address) return;
    fetch(`/api/boot-status?pubkey=${encodeURIComponent(identity.address)}`)
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.freeBootsRemaining === "number") {
          setFreeBootsRemaining(data.freeBootsRemaining);
        }
        if (typeof data.bootPrice === "number" && data.bootPrice > 0) {
          setBootPrice(data.bootPrice);
        }
      })
      .catch(() => {
        // Fall back to default values — free boots will just be 0 (conservative)
      });
  }, [identity?.address]);

  // Prune confirmed posts on every render — no extra effect needed.
  const pendingOptimistic = useMemo(
    () => pruneOptimistic(optimisticPosts, serverPosts),
    [optimisticPosts, serverPosts]
  );

  const handlePostRejected = useCallback((tempId: number, reason?: string) => {
    // Mark as failed, then auto-remove after 3 seconds
    setOptimisticPosts((prev) =>
      prev.map((op) => (op.id === tempId ? { ...op, failed: true, failReason: reason } : op))
    );
    setTimeout(() => {
      setOptimisticPosts((prev) => prev.filter((op) => op.id !== tempId));
    }, 3000);
  }, []);

  const handlePostCreated = useCallback(
    (content: string, author: string, tempId: number) => {
      setOptimisticPosts((prev) => [
        {
          id: tempId,
          content,
          author_name: author,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      // Poll 500ms after posting to confirm quickly
      setTimeout(refresh, 500);
    },
    [refresh]
  );

  const handleLoadEarlier = useCallback(() => {
    // Oldest post is either the last in olderPosts, or the last in chronological.
    const allSoFar = [...serverPosts, ...olderPosts];
    const oldestId = allSoFar[allSoFar.length - 1]?.id;
    if (!oldestId) return;
    startLoadingMore(async () => {
      const older = await getOlderPosts(oldestId);
      setOlderPosts((prev) => [...prev, ...older]);
      setHasMore(older.length === 100);
    });
  }, [serverPosts, olderPosts]);

  // Decrement local free boots count after a free boot is used.
  // Server is the source of truth — the next bootPost call will return requiresPayment
  // when the quota is truly exhausted.
  const handleFreeBootUsed = useCallback(() => {
    setFreeBootsRemaining((prev) => Math.max(0, prev - 1));
  }, []);

  // chronological = older pages first (oldest at top), then recent posts (newest at bottom).
  const chronological = useMemo(
    () => [...olderPosts, ...[...serverPosts].reverse()],
    [serverPosts, olderPosts]
  );
  const postIds = useMemo(() => serverPosts.map((p) => p.id), [serverPosts]);

  const {
    scrollRef,
    bottomRef,
    genesisRef,
    observerRef,
    isAtBottom,
    isAtTop,
    unreadCount,
    genesisVisited,
    genesisHydrated,
    scrollToBottom,
    scrollToGenesis,
  } = useScrollTracker({ postCount: serverPosts.length, postIds });

  // iOS Safari scroll-compositor warmup. iOS's auto-scroll-into-view (which
  // brings the focused textarea above the soft keyboard) skips its
  // scroll-target search if the page has never had a real scroll event.
  // Without this, tapping the share-idea textarea WITHOUT first scrolling
  // the feed leaves the textarea hidden behind the keyboard — the
  // "scroll-first works, tap-only fails" reproducer. Performing a
  // 1px scroll-and-revert on mount wakes the compositor invisibly so
  // every textarea tap from then on triggers iOS's keyboard adjustment.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy(0, 1);
    el.scrollBy(0, -1);
  }, [scrollRef]);

  const handleAskAgent = useCallback(() => {
    scrollToBottom();
    setAgentHighlight(true);
    setTimeout(() => setAgentHighlight(false), 2000);
  }, [scrollToBottom]);

  return (
    <div className="flex flex-col h-[100dvh]">
      <Header
        isAtTop={isAtTop}
        genesisHydrated={genesisHydrated}
        genesisVisited={genesisVisited}
        onScrollToGenesis={scrollToGenesis}
      />

      {/* Pinned bootboard */}
      <div className="shrink-0 relative">
        <div className="mx-auto max-w-2xl px-4 pt-2 pb-3">
          <Bootboard
            data={bootboard}
            onBooted={refresh}
            bootPrice={bootPrice}
            onFundNeeded={(address, balance) => {
              setUserAddress(address);
              setUserBalance(balance);
              setShowFundModal(true);
            }}
          />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-b from-transparent to-black pointer-events-none" />
      </div>

      {/* Scrollable posts area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-y-contain relative scrollbar-hide"
        style={{ scrollbarWidth: "none" }}
      >
        <PostList
          posts={chronological}
          genesisRef={genesisRef}
          bottomRef={bottomRef}
          observerRef={observerRef}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadEarlier={handleLoadEarlier}
          onBooted={refresh}
          onAskAgent={handleAskAgent}
          onFundNeeded={(address, balance) => {
            setUserAddress(address);
            setUserBalance(balance);
            setShowFundModal(true);
          }}
          onFreeBootUsed={handleFreeBootUsed}
          bootPrice={bootPrice}
          freeBootsRemaining={freeBootsRemaining}
        />

        {/* Optimistic posts — appear at the bottom (newest), full opacity since server confirms in ~50ms */}
        {pendingOptimistic.length > 0 && (
          <div className="mx-auto max-w-2xl px-4 pb-2 divide-y divide-zinc-800/60">
            {pendingOptimistic.map((op) => (
              <article key={op.id} className={`py-3.5 ${op.failed ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-300">{op.author_name}</span>
                      <span>·</span>
                      <time>{timeAgo(op.created_at)}</time>
                      {op.failed && (
                        <span className="text-red-400 text-[10px]">
                          {op.failReason === "rate_limited"
                            ? "Too fast — try again"
                            : "Failed to post"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-words">
                      {op.content}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {!isAtBottom && (
        <div className="shrink-0 flex justify-end mx-auto max-w-2xl px-4">
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
            className="relative -mb-5 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 shadow-lg hover:bg-zinc-700 transition-colors mr-2"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="text-zinc-300"
            >
              <path
                d="M8 3v10m0 0l-4-4m4 4l4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-2 -right-1 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-amber-500 text-black text-[11px] font-bold px-1.5">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Pinned bottom — compose area */}
      <div className="shrink-0">
        {/* Install pitch banner — full-width strip above the compose. The
            component self-gates: only shows when recovery file saved, not
            already standalone, supported platform, not suppressed. X-tap
            triggers 30d suppression via InstallContext (banner unmounts on
            next render because isSuppressed flips true). */}
        <InstallPitch variant="banner" />

        <div className="mx-auto max-w-2xl px-4 pb-4 pt-2">
          <PostForm
            onPostCreated={handlePostCreated}
            onPostRejected={handlePostRejected}
            agentHighlight={agentHighlight}
          />
          {/* Three-column row at the footer: left third holds the install
              bookmark (only visible when the sheet has been minimised), middle
              third holds the bopen.ai attribution link, right third is empty
              for symmetry. The bookmark is positioned far from bopen.ai so
              taps don't accidentally hit the link. */}
          <div className="grid grid-cols-3 items-center mt-1">
            <div className="flex justify-center">
              <InstallBookmark />
            </div>
            <div className="flex justify-center">
              <a
                href="https://bopen.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-zinc-700 hover:text-zinc-500 transition-colors"
              >
                created with bopen.ai
              </a>
            </div>
            <div />
          </div>
        </div>
      </div>

      {/* Fund address modal */}
      {showFundModal && userAddress && (
        <FundAddress
          address={userAddress}
          bootPrice={bootPrice}
          balance={userBalance}
          onClose={() => {
            setShowFundModal(false);
            setUserBalance(undefined);
          }}
        />
      )}

      {/* Boot failure toast */}
      <BootToast message={bootError} />

      {/* iOS post-install ITP heads-up — fires once on first standalone launch
          (navigator.standalone === true). Mount point inside FeedContent
          guarantees post-welcome-gate sequencing per LAUNCH_PLAN #12. */}
      <IosStorageToast />
    </div>
  );
}

/**
 * Inner wrapper that reads identity context and renders either the welcome gate
 * (when standalone + no identity) or the full feed UI. The gate renders BEFORE
 * any feed UI mounts, so the IdentityBar / Header / PostForm never see a null
 * identity in the awaiting-gate state.
 */
function FeedOrWelcomeGate({
  initialPosts,
  initialBootboard,
}: {
  initialPosts: Post[];
  initialBootboard: BootboardData;
}) {
  const { awaitingWelcomeGate, acceptRestoredIdentity } = useIdentityContext();

  if (awaitingWelcomeGate) {
    return <HomeScreenWelcomeGate onRestore={acceptRestoredIdentity} />;
  }

  return <FeedContent initialPosts={initialPosts} initialBootboard={initialBootboard} />;
}

export function Feed({
  posts: initialPosts,
  bootboard: initialBootboard,
}: {
  posts: Post[];
  bootboard: BootboardData;
}) {
  return (
    <BootProvider>
      <IdentityProvider>
        <InstallProvider>
          <SignInModal />
          <StaleKeyModal />
          <FeedOrWelcomeGate initialPosts={initialPosts} initialBootboard={initialBootboard} />
        </InstallProvider>
      </IdentityProvider>
    </BootProvider>
  );
}
