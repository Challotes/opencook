/**
 * In-app (embedded WebView) browser detection.
 *
 * Social apps (Telegram, X, Instagram, Facebook, TikTok, …) open links in an
 * embedded WebView with isolated, often-wiped storage that can't install the
 * PWA or reliably save files. A BSV keypair auto-minted there is a phantom the
 * user will lose. So `page.tsx` detects these UAs and renders the content-first
 * splash (`InAppBrowserSplash`) INSTEAD of `<Feed>` — before the identity
 * provider mounts, so no key is ever created in an in-app session. See
 * DECISIONS.md "In-app browsers blocked at the door" (revised 2026-06-29 to the
 * "splash with a window").
 *
 * Pure + SSR-safe: operates on a UA string only (no `window`), so `page.tsx`
 * can call it server-side against the request `user-agent` header, and it's
 * unit-testable.
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
];

export interface InAppBrowserInfo {
  /** True when the UA is a known social in-app WebView (and not a crawler). */
  inApp: boolean;
  /** Friendly app name (e.g. "Telegram") for the splash copy, or null. */
  app: string | null;
}

export function classifyInAppBrowser(ua: string): InAppBrowserInfo {
  if (!ua) return { inApp: false, app: null };
  const s = ua.toLowerCase();
  // Crawlers bypass first — so "twitterbot"/"telegrambot"/"discordbot" don't
  // trip the "twitter"/"telegram"/"discord" in-app tokens below.
  for (const c of CRAWLER_UA) {
    if (s.includes(c)) return { inApp: false, app: null };
  }
  for (const [token, name] of IN_APP_UA) {
    if (s.includes(token)) return { inApp: true, app: name };
  }
  return { inApp: false, app: null };
}

export function isInAppBrowser(ua: string): boolean {
  return classifyInAppBrowser(ua).inApp;
}

export type MobileOS = "ios" | "android" | "other";

/** Coarse OS detection for choosing the CTA (Android intent button vs iOS tip). */
export function detectMobileOS(ua: string): MobileOS {
  const s = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return "ios";
  if (s.includes("android")) return "android";
  return "other";
}
