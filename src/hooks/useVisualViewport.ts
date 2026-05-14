"use client";

import { useEffect, useState } from "react";

/**
 * Returns the iOS soft-keyboard height in pixels (0 when closed). Reads
 * `window.visualViewport` — the only reliable signal on iOS Safari, since
 * `100dvh` does NOT respond to keyboard open/close, only to browser chrome.
 *
 * The recommended usage is wrapper `padding-bottom` inflation (NOT wrapper
 * resize). The wrapper stays `fixed inset-0` and only its padding-bottom
 * grows when the keyboard opens — `items-center` then re-centers the
 * content smoothly via a CSS transition, matching iOS's ~250ms keyboard
 * slide. Resizing the wrapper directly causes a visible snap.
 *
 *   const kbd = useKeyboardOffset();
 *   <div
 *     className="fixed inset-0 ... p-6 transition-[padding] duration-200 ease-out"
 *     style={{ paddingBottom: `calc(1.5rem + ${kbd}px)` }}
 *   >
 *
 * Reading details:
 *
 * - Baseline is `document.documentElement.clientHeight`, not
 *   `window.innerHeight`. The latter fluctuates with Safari's URL bar;
 *   the former is stable across browser-chrome transitions in both
 *   Safari (URL bar at bottom) and PWA (no URL bar).
 *
 * - Initial spurious values during page-load reflow are filtered: any
 *   reading where the implied keyboard exceeds 60% of the screen is
 *   ignored (no real keyboard ever occupies that much).
 *
 * - Throttled: only re-renders when the height changes by more than 50px.
 *   Visual-viewport fires `scroll` events on micro-scrolls; without this
 *   gate every page-pixel-scroll would trigger a re-render across every
 *   open modal.
 */
export function useKeyboardOffset(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vvp = window.visualViewport;

    function update() {
      const screenHeight = document.documentElement.clientHeight;
      const next = Math.max(0, screenHeight - vvp.height);

      // Ignore obvious garbage values from page-load reflow.
      if (next > screenHeight * 0.6) return;

      setKeyboardHeight((prev) => (Math.abs(prev - next) < 50 ? prev : next));
    }

    update();
    vvp.addEventListener("resize", update);
    vvp.addEventListener("scroll", update);
    return () => {
      vvp.removeEventListener("resize", update);
      vvp.removeEventListener("scroll", update);
    };
  }, []);

  return keyboardHeight;
}
