"use client";

import { useEffect } from "react";

/**
 * Rescues installed PWAs from a false in-app splash.
 *
 * An installed iOS home-screen PWA sends a UA that's IDENTICAL to a bare in-app
 * WebView (both drop the `Safari/` suffix), so the server-side iOS fail-safe in
 * `classifyInAppBrowser` can't tell them apart and would splash an installed-PWA
 * user by mistake. `navigator.standalone === true` (iOS) and
 * `display-mode: standalone` (everywhere) are true ONLY in an installed PWA, not
 * in any in-app WebView — so if we're standalone, this isn't an in-app browser:
 * bypass the splash straight into the app via the `?continue=1` escape.
 *
 * Renders nothing. Touches no identity/spend surfaces.
 */
export function InAppStandaloneGuard() {
  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
    if (standalone) {
      // Full navigation that re-hits the gate with continue=1 → renders <Feed>.
      window.location.replace("/?continue=1");
    }
  }, []);
  return null;
}
