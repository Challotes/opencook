"use client";

import { useEffect, useState } from "react";

export type InstallPlatform =
  | "android" // Chrome / Brave / Edge / Samsung Internet — beforeinstallprompt available
  | "ios-safari" // Real Safari on iOS — manual share-menu instructions
  | "ios-other" // Brave / Chrome / Firefox iOS — open in Safari first
  | "desktop-chrome" // Chrome / Brave / Edge / Opera desktop — beforeinstallprompt available
  | "desktop-safari" // macOS Safari — limited PWA, manual Add to Dock
  | "desktop-firefox" // No real PWA install on Firefox desktop
  | "unsupported"; // Anything we can't classify

export type InstallType =
  | "one-tap" // Fire beforeinstallprompt (Android / desktop Chrome)
  | "manual-instructions" // Show platform-specific menu/share instructions (iOS Safari, desktop Safari, Firefox Android)
  | "open-in-safari" // iOS non-Safari — needs to open in Safari first
  | "unsupported"; // No real install path

export interface UseInstallPlatformResult {
  platform: InstallPlatform | null;
  installType: InstallType | null;
}

/**
 * Pure classifier for testing. Given a UA string + maxTouchPoints, returns
 * the platform + install path. SSR-safe (no `window` access).
 *
 * Notable branches:
 * - Firefox on Android does NOT fire `beforeinstallprompt`; treat as manual
 *   even though `Android` is in the UA. Check Firefox-Android before generic Android.
 * - iPadOS 13+ pretends to be macOS Safari; disambiguate via `maxTouchPoints > 1`
 *   (more reliable than `ontouchend in document`, which is true on touch laptops).
 * - iOS WebKit-wrapped browsers (Brave/Chrome/Firefox/Edge iOS) cannot install
 *   PWAs to home screen on iOS — only Safari can. Surface "open in Safari".
 */
export function classifyUA(ua: string, maxTouchPoints: number): UseInstallPlatformResult {
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && maxTouchPoints > 1);

  const isAndroid = /Android/.test(ua);

  // Firefox Android needs manual instructions — does not fire beforeinstallprompt.
  // Check before generic Android branch.
  if (isAndroid && /Firefox\//.test(ua)) {
    return { platform: "unsupported", installType: "manual-instructions" };
  }

  if (isAndroid) {
    return { platform: "android", installType: "one-tap" };
  }

  if (isIOS) {
    const isIOSChromiumOrFirefox = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    if (isIOSChromiumOrFirefox) {
      return { platform: "ios-other", installType: "open-in-safari" };
    }
    return { platform: "ios-safari", installType: "manual-instructions" };
  }

  // Desktop classification — Firefox first (otherwise the Safari regex below
  // would match because Firefox UA also contains "Mozilla" etc.).
  if (/Firefox\//.test(ua)) {
    return { platform: "desktop-firefox", installType: "unsupported" };
  }

  if (/Chrome|Chromium|Edg/.test(ua)) {
    return { platform: "desktop-chrome", installType: "one-tap" };
  }

  if (/Safari\//.test(ua)) {
    return { platform: "desktop-safari", installType: "manual-instructions" };
  }

  return { platform: "unsupported", installType: "unsupported" };
}

/**
 * Returns the install platform classification for the current session.
 *
 * SSR-safe: returns `{ platform: null, installType: null }` during server render,
 * populates on client mount. UA is stable per session so the effect runs once.
 *
 * `platform === null` is the "pre-hydration / SSR" state — consumers should
 * render nothing until populated, to avoid hydration mismatches and the flash
 * of "unsupported" before the classification lands.
 */
export function useInstallPlatform(): UseInstallPlatformResult {
  const [result, setResult] = useState<UseInstallPlatformResult>({
    platform: null,
    installType: null,
  });

  useEffect(() => {
    setResult(classifyUA(window.navigator.userAgent, window.navigator.maxTouchPoints));
  }, []);

  return result;
}
