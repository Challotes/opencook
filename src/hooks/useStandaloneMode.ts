"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the app is running as an installed PWA.
 *
 * Detection signals (any match → standalone):
 * - `display-mode: standalone` — Android Chrome PWA, iOS Safari PWA, desktop Chrome installed
 * - `display-mode: fullscreen` — PWAs that hide all browser UI
 * - `display-mode: window-controls-overlay` — desktop PWAs with custom title bar
 * - `navigator.standalone === true` — iOS Safari-specific (legacy, pre-display-mode)
 *
 * Deliberately excluded:
 * - `display-mode: minimal-ui` — Chrome fallback when manifest requests standalone
 *   but the browser can't honor it; still shows browser chrome, so the user IS
 *   in a regular tab. Treating it as installed would create false positives.
 *
 * Reactive to mid-session display-mode changes (iPad Stage Manager / Split View
 * transitions a session between standalone and browser modes).
 *
 * SSR-safe: returns false during server render, updates on client mount.
 */
export function useStandaloneMode(): boolean {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const queries = [
      window.matchMedia("(display-mode: standalone)"),
      window.matchMedia("(display-mode: fullscreen)"),
      window.matchMedia("(display-mode: window-controls-overlay)"),
    ];

    function check(): void {
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const iosStandalone = nav.standalone === true;
      const displayModeMatches = queries.some((q) => q.matches);
      setIsStandalone(displayModeMatches || iosStandalone);
    }

    check();

    for (const q of queries) {
      q.addEventListener("change", check);
    }
    return () => {
      for (const q of queries) {
        q.removeEventListener("change", check);
      }
    };
  }, []);

  return isStandalone;
}
