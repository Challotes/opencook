"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseScrollTrackerOptions {
  postCount: number;
  postIds: number[];
}

interface UseScrollTrackerReturn {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  genesisRef: React.RefObject<HTMLDivElement | null>;
  observerRef: React.RefObject<IntersectionObserver | null>;
  isAtBottom: boolean;
  isAtTop: boolean;
  unreadCount: number;
  genesisVisited: boolean;
  genesisHydrated: boolean;
  scrollToBottom: () => void;
  scrollToGenesis: () => void;
}

export function useScrollTracker({
  postCount,
  postIds,
}: UseScrollTrackerOptions): UseScrollTrackerReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const genesisRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAtTop, setIsAtTop] = useState(false);
  const [genesisVisited, setGenesisVisited] = useState(false);
  const [genesisHydrated, setGenesisHydrated] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const prevCountRef = useRef(postCount);
  const unreadIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (localStorage.getItem("opencook_genesis_visited") === "1") {
      setGenesisVisited(true);
    }
    setGenesisHydrated(true);
  }, []);

  const scrollToGenesis = useCallback(() => {
    genesisRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onScroll() {
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setIsAtBottom(atBottom);
      const atTop = el.scrollTop < 80;
      setIsAtTop(atTop);
      if (atTop && !genesisVisited) {
        setGenesisVisited(true);
        localStorage.setItem("opencook_genesis_visited", "1");
      }
      if (atBottom) setUnreadCount(0);
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [genesisVisited]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = Number(entry.target.getAttribute("data-post-id"));
            if (unreadIdsRef.current.has(id)) {
              unreadIdsRef.current.delete(id);
              changed = true;
            }
          }
        }
        if (changed) setUnreadCount(unreadIdsRef.current.size);
      },
      { root: container, threshold: 0.5 }
    );

    return () => observerRef.current?.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const newPosts = postCount - prevCountRef.current;
    prevCountRef.current = postCount;

    if (newPosts > 0) {
      if (isAtBottom) {
        requestAnimationFrame(() => scrollToBottom());
      } else {
        for (let i = 0; i < newPosts; i++) {
          unreadIdsRef.current.add(postIds[i]);
        }
        setUnreadCount(unreadIdsRef.current.size);
      }
    }
  }, [postCount, postIds, isAtBottom, scrollToBottom]);

  return {
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
  };
}
