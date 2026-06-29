/**
 * In-app (embedded WebView) browser detection.
 *
 * Social apps (Telegram, X, Instagram, Facebook, TikTok, …) open links in an
 * embedded WebView with isolated, often-wiped storage. `classifyInAppBrowser`
 * is the pure UA classifier (self-tagging apps + crawler bypass + an iOS/Android
 * fail-safe); `isInAppBrowserClient` (below) is the browser-only variant that
 * ALSO catches Telegram-iOS via `window.TelegramWebviewProxy` (its UA is
 * byte-identical to Safari, so the UA path alone can't). `IdentityContext`
 * consumes `isInAppBrowserClient()` (paired with `!detectStandalone()`) to put
 * the feed into read-only mode in-app. See DECISIONS.md "In-app browsers ...
 * read-only live feed".
 *
 * `classifyInAppBrowser` is pure + SSR-safe (UA string only, no `window`) and
 * unit-testable; `isInAppBrowserClient` reads `window` (client-only).
 */

// Crawlers / link-preview fetchers — MUST fall through to the normal app so
// OG/SEO previews still render. Checked FIRST so e.g. "Twitterbot",
// "TelegramBot", "Discordbot" are never mistaken for the human in-app webviews
// ("Twitter" / "Telegram" / "Discord").
const CRAWLER_UA = [
  "googlebot",
  "bingbot",
  "twitterbot",
  "facebookexternalhit",
  "linkedinbot",
  "slackbot",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "applebot",
  "pinterestbot",
  "redditbot",
];

// Known in-app WebView UA tokens → friendly app name. Matched case-insensitively.
const IN_APP_UA: Array<[string, string]> = [
  ["fban", "Facebook"],
  ["fbav", "Facebook"],
  ["instagram", "Instagram"],
  ["twitter", "X"],
  ["tiktok", "TikTok"],
  ["musical_ly", "TikTok"],
  ["linkedinapp", "LinkedIn"],
  ["micromessenger", "WeChat"],
  ["line/", "Line"],
  ["snapchat", "Snapchat"],
  ["pinterest", "Pinterest"],
  ["redditapp", "Reddit"],
  ["slack", "Slack"],
  ["kakaotalk", "KakaoTalk"],
  ["discord", "Discord"],
  ["telegram", "Telegram"],
  // Generic Electron desktop apps not already named above (Teams, etc.). Slack
  // and Discord match their own tokens first, so this only catches the rest.
  ["electron", "Unknown"],
];

export interface InAppBrowserInfo {
  /** True when the UA is a known social in-app WebView (and not a crawler). */
  inApp: boolean;
  /** Friendly app name (e.g. "Telegram") for the splash copy, or null. */
  app: string | null;
}

// Real-browser tokens — if an iOS UA carries any of these it's a legitimate
// browser, not a bare WebView. NOTE: an installed iOS home-screen PWA ALSO drops
// `Safari/` (its UA is identical to a bare in-app WebView), so `IdentityContext`
// pairs this classifier with `!detectStandalone()` to let installed PWAs
// through. (Telegram's iOS WebView actually KEEPS `Safari/`, so it's caught by
// `isInAppBrowserClient`'s `window.TelegramWebviewProxy` check, not by (C).)
const IOS_REAL_BROWSER_TOKENS = [
  "safari/", // native Safari + most third-party iOS browsers keep this suffix
  "crios/", // Chrome iOS
  "fxios/", // Firefox iOS
  "edgios/", // Edge iOS
  "opios/", // Opera Mini iOS
  "opt/", // Opera Touch iOS — the one real iOS browser WITHOUT Safari/
  "duckduckgo/", // DuckDuckGo iOS
  "brave", // Brave iOS (bare token, no slash)
  "yabrowser/", // Yandex iOS
];

export function classifyInAppBrowser(ua: string): InAppBrowserInfo {
  // Empty/missing UA never comes from a real browser → fail SAFE to the splash.
  if (!ua) return { inApp: true, app: "Unknown" };
  const s = ua.toLowerCase();

  // (A) Crawlers / link-preview bots bypass FIRST — they must see the real app
  // for OG previews, and they legitimately lack a real-browser token (so the
  // fail-safe rules below must not catch them).
  for (const c of CRAWLER_UA) {
    if (s.includes(c)) return { inApp: false, app: null };
  }

  // (B) Apps that self-identify in the UA (Instagram/X/Facebook/Telegram-newer/…).
  for (const [token, name] of IN_APP_UA) {
    if (s.includes(token)) return { inApp: true, app: name };
  }

  // (C) iOS fail-safe — a bare-WKWebView backstop. An iPhone/iPod UA with NO
  // recognizable real-browser token is a bare WebView. (Not iPad: iPadOS
  // desktop-mode reports as "Macintosh", so an `ipad` rule would misfire on
  // real iPad Safari.) Installed PWAs share this bare UA but are excluded by the
  // `!detectStandalone()` pairing in IdentityContext. (Telegram-iOS keeps
  // `Safari/`, so it's caught by the proxy check in isInAppBrowserClient, not here.)
  if (s.includes("iphone") || s.includes("ipod")) {
    for (const token of IOS_REAL_BROWSER_TOKENS) {
      if (s.includes(token)) return { inApp: false, app: null };
    }
    return { inApp: true, app: "Unknown" };
  }

  // (D) Android fail-safe — the `; wv)` WebView marker (or the legacy
  // `Version/4.0 Chrome/` pattern) flags an in-app WebView not named in (B).
  if (s.includes("android") && (s.includes("; wv)") || s.includes("version/4.0 chrome/"))) {
    return { inApp: true, app: "Unknown" };
  }

  // (E) Default: real browser / desktop → allow.
  return { inApp: false, app: null };
}

export function isInAppBrowser(ua: string): boolean {
  return classifyInAppBrowser(ua).inApp;
}

/**
 * Browser-only in-app detection (reads `window`, so NOT SSR-safe — call on the
 * client only). This is the signal the UA string can't provide: **Telegram on
 * iOS injects `window.TelegramWebviewProxy` and its UA is byte-identical to
 * Safari**, so the UA classifier alone misses it (confirmed on-device). For the
 * apps that self-tag (Instagram/Facebook/X/TikTok/…) it falls back to the UA
 * classifier above.
 *
 * ⚠️ Installed iOS home-screen PWAs ALSO drop `Safari/`, so the UA classifier's
 * (C) branch flags them as in-app. Callers MUST combine this with
 * `!detectStandalone()` so installed-PWA users are never put into read-only
 * mode — see `IdentityContext` `isReadOnly`.
 */
export function isInAppBrowserClient(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    TelegramWebviewProxy?: unknown;
    TelegramWebviewProxyProto?: unknown;
    Telegram?: unknown;
  };
  // Telegram's injected native bridge — present in its in-app WebView even
  // though the UA says Safari. (inapp-spy keys on these; confirmed on-device.)
  if (w.TelegramWebviewProxy || w.TelegramWebviewProxyProto || w.Telegram) return true;
  if (typeof navigator === "undefined") return false;
  return classifyInAppBrowser(navigator.userAgent ?? "").inApp;
}

export type MobileOS = "ios" | "android" | "other";

/** Coarse OS detection for choosing the CTA (Android intent button vs iOS tip). */
export function detectMobileOS(ua: string): MobileOS {
  const s = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return "ios";
  if (s.includes("android")) return "android";
  return "other";
}
