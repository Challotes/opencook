"use client";

import { useEffect } from "react";

/**
 * Pins the app shell to `window.visualViewport` so the Header + Bootboard (top of
 * the shell) and the compose box (bottom) all stay inside the VISIBLE band when
 * the iOS/Android soft keyboard is open.
 *
 * Writes two custom properties on `<html>`:
 *   --app-height : the visible viewport height in px (replaces 100dvh)
 *   --app-vv-top : visualViewport.offsetTop in px (keyboard-shift offset)
 *
 * Why this instead of relying on `interactiveWidget: "resizes-content"`:
 * resizes-content shrinks the LAYOUT viewport (so 100dvh shrinks to the space
 * above the keyboard) but, because the shell is top-anchored and its bottom child
 * is the input, iOS then TRANSLATES the whole shell up to surface the input —
 * dragging the Header/Bootboard off the top. Sizing the shell to
 * visualViewport.height and translating the outer wrapper DOWN by offsetTop keeps
 * the top of the shell pinned to the top of the visible band, so nothing is
 * pushed out of view. See DECISIONS.md "App shell tracks visualViewport".
 *
 * SSR-safe: the CSS falls back to 100dvh until this effect runs on mount, so the
 * server render and first paint are correct with no hydration mismatch (we only
 * ever set a CSS variable, never rendered markup).
 */
export function useViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;

    // No visualViewport (very old browsers): leave the 100dvh fallback in place —
    // behaviour is exactly today's, so this is a safe no-op.
    if (!vv) return;

    let rafId = 0;

    const apply = () => {
      rafId = 0;
      root.style.setProperty("--app-height", `${vv.height}px`);
      root.style.setProperty("--app-vv-top", `${vv.offsetTop}px`);
    };

    const schedule = () => {
      // Coalesce the burst of resize+scroll events iOS fires during the keyboard
      // slide into one write per frame — avoids layout thrash.
      if (rafId) return;
      rafId = requestAnimationFrame(apply);
    };

    apply(); // set immediately on mount (takes over from the 100dvh fallback)
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      // Clear so a remount falls back to 100dvh cleanly.
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-vv-top");
    };
  }, []);
}
