"use client";

import { useState } from "react";
import type { MobileOS } from "@/lib/in-app-browser";

/**
 * The one interactive piece of the in-app-browser splash. Kept as a tiny client
 * child so the splash shell itself stays a server component.
 *
 * - Android: an "Open in Chrome" button that navigates to a Chrome `intent://`
 *   URL — routing the user OUT of the in-app WebView into Chrome. If they've
 *   installed the PWA, Android's WebAPK intent filter may then open the
 *   installed app directly (the closest thing to "open their installed app";
 *   iOS has no equivalent — platform limit).
 * - iOS / other: no programmatic redirect exists, so a Copy-link button +
 *   paste-into-Safari instructions.
 *
 * Touches no identity/spend surfaces.
 */
export function InAppBrowserCta({ os }: { os: MobileOS }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  if (os === "android") {
    const openInChrome = () => {
      const { host, pathname, search } = window.location;
      // Chrome intent: the in-app WebView hands this to Android's intent
      // resolver → Chrome (or the installed PWA via its WebAPK intent filter).
      window.location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
    };
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={openInChrome}
          className="block w-full rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-semibold text-black transition-colors hover:bg-amber-300"
        >
          Open in Chrome
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="block w-full text-center text-xs text-zinc-400 hover:text-zinc-200"
        >
          {copied ? "Link copied" : "or copy link"}
        </button>
      </div>
    );
  }

  // iOS + desktop-other: copy link, then paste into the real browser.
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={copyLink}
        className="block w-full rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-semibold text-black transition-colors hover:bg-amber-300"
      >
        {copied ? "✓ Link copied — now paste into Safari" : "Copy link"}
      </button>
      <p className="text-center text-xs text-zinc-500">
        Tap the button, then open Safari and paste into the address bar.
      </p>
      <p className="text-center text-[11px] text-zinc-600">
        Or tap <span className="text-zinc-400">···</span> below and choose &quot;Open in
        Browser&quot;.
      </p>
    </div>
  );
}
