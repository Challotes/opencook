"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BootboardData, Post } from "@/types";

interface FeedPollingResult {
  posts: Post[];
  bootboard: BootboardData;
  updated?: Post[];
  // Authoritative boot counts for already-confirmed visible posts, so counts
  // update live from ANY boot source (Bootboard re-boot, other users, server
  // wallet) — not just this client's own optimistic +1.
  counts?: { id: number; boot_count: number }[];
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

      // Ask the server for authoritative boot counts on confirmed visible posts,
      // so the displayed count tracks boots from any source (not just our own).
      const countIds = postsRef.current
        .filter((p) => !!p.tx_id)
        .map((p) => p.id)
        .slice(0, 100);
      if (countIds.length > 0) {
        const separator = url.includes("?") ? "&" : "?";
        url += `${separator}counts=${countIds.join(",")}`;
      }

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data: FeedPollingResult = await res.json();

      setBootboard(data.bootboard);

      // tx_id confirmations (posts that just gained a chain icon)
      const updatedMap =
        data.updated && data.updated.length > 0
          ? new Map(data.updated.map((p: Post) => [p.id, p.tx_id]))
          : null;
      // Authoritative boot counts for confirmed visible posts
      const countsMap =
        data.counts && data.counts.length > 0
          ? new Map(data.counts.map((c) => [c.id, c.boot_count]))
          : null;

      // Patch an existing post with any tx_id confirmation and/or count change.
      const patch = (p: Post): Post => {
        let next = p;
        if (updatedMap) {
          const tx = updatedMap.get(p.id);
          if (tx && !p.tx_id) next = { ...next, tx_id: tx };
        }
        if (countsMap) {
          const c = countsMap.get(p.id);
          if (c !== undefined && c !== p.boot_count) next = { ...next, boot_count: c };
        }
        return next;
      };

      if (data.posts.length === 0) {
        if (!updatedMap && !countsMap) return; // nothing new, nothing to patch
        setPosts((prev) => prev.map(patch));
        return;
      }

      // New posts (+ possible tx_id / count patches) — one atomic setPosts
      if (latestId === null) {
        setPosts(data.posts);
      } else {
        setPosts((prev) => [...data.posts, ...prev.map(patch)]);
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
