"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BootboardData, Post } from "@/types";

interface FeedPollingResult {
  posts: Post[];
  bootboard: BootboardData;
  updated?: Post[];
}

interface UseFeedPollingOptions {
  initialPosts: Post[];
  initialBootboard: BootboardData;
  intervalMs?: number;
}

export function useFeedPolling({
  initialPosts,
  initialBootboard,
  intervalMs = 5000,
}: UseFeedPollingOptions) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [bootboard, setBootboard] = useState<BootboardData>(initialBootboard);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);
  // Tracks the highest post id we have seen — null means first poll hasn't run yet
  const latestIdRef = useRef<number | null>(initialPosts.length > 0 ? initialPosts[0].id : null);
  // Keep a ref to current posts so we can read them in the async poll callback
  const postsRef = useRef<Post[]>(initialPosts);
  postsRef.current = posts;

  const fetchFeed = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const latestId = latestIdRef.current;

      // Build the poll URL with pending_tx param for posts missing chain confirmation
      let url = latestId !== null ? `/api/posts?since_id=${latestId}` : "/api/posts";

      // Find posts the client has that are missing tx_id (no chain icon yet)
      // We ask the server if any of them have been confirmed since we last polled
      const pendingIds = postsRef.current
        .filter((p) => !p.tx_id)
        .map((p) => p.id)
        .slice(0, 50); // Cap to avoid huge URLs
      if (pendingIds.length > 0) {
        const separator = url.includes("?") ? "&" : "?";
        url += `${separator}pending_tx=${pendingIds.join(",")}`;
      }

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data: FeedPollingResult = await res.json();

      setBootboard(data.bootboard);

      // Build the tx_id update map (posts that now have chain confirmation)
      const updatedMap =
        data.updated && data.updated.length > 0
          ? new Map(data.updated.map((p: Post) => [p.id, p.tx_id]))
          : null;

      if (data.posts.length === 0 && !updatedMap) {
        // Nothing new, nothing updated — skip
        return;
      }

      if (data.posts.length === 0 && updatedMap) {
        // Only tx_id updates, no new posts — single atomic setPosts
        setPosts((prev) =>
          prev.map((p) => {
            const newTxId = updatedMap.get(p.id);
            return newTxId ? { ...p, tx_id: newTxId } : p;
          })
        );
        return;
      }

      // New posts (and possibly tx_id updates) — combine into one setPosts
      if (latestId === null) {
        setPosts(data.posts);
      } else {
        setPosts((prev) => {
          // First apply tx_id updates to existing posts
          const updated = updatedMap
            ? prev.map((p) => {
                const newTxId = updatedMap.get(p.id);
                return newTxId ? { ...p, tx_id: newTxId } : p;
              })
            : prev;
          // Then prepend new posts
          return [...data.posts, ...updated];
        });
      }

      // data.posts is ordered DESC, so index 0 is the newest
      const newMax = data.posts[0].id;
      if (latestIdRef.current === null || newMax > latestIdRef.current) {
        latestIdRef.current = newMax;
      }
    } catch {
      // Silently ignore network errors — stale data is fine
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    function schedule() {
      timerRef.current = setTimeout(async () => {
        // Only poll when the tab is visible
        if (document.visibilityState === "visible") {
          await fetchFeed();
        }
        schedule();
      }, intervalMs);
    }

    // Resume polling immediately when tab becomes visible again
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        fetchFeed();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchFeed, intervalMs]);

  return { posts, setPosts, bootboard, setBootboard, refresh: fetchFeed };
}
