import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyInAppBrowser,
  detectMobileOS,
  isInAppBrowser,
  isInAppBrowserClient,
} from "./in-app-browser";

// Derived from the fail-safe detector spec (2026-06-29): real browsers MUST pass
// through, in-app WebViews (incl. Telegram's bare iOS WKWebView) MUST splash,
// crawlers MUST pass through for OG previews.

describe("in-app-browser detection", () => {
  // ── Real browsers — MUST return { inApp: false } ──────────────────────────
  const realBrowsers: Array<[string, string]> = [
    [
      "iOS Safari 26",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
    ],
    [
      "iPad Safari desktop-mode (reports as Macintosh)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    ],
    [
      "Chrome iOS (CriOS)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1",
    ],
    [
      "Firefox iOS (FxiOS)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.1 Mobile/15E148 Safari/605.1.15",
    ],
    [
      "Edge iOS (EdgiOS)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/114.0.5735.198 Mobile/15E148 EdgiOS/114.0.1823.58 Safari/604.1",
    ],
    [
      "Opera Touch iOS (OPT/, NO Safari/ suffix)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OPT/3.3.3 Mobile/15E148",
    ],
    [
      "DuckDuckGo iOS",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 DuckDuckGo/7 Safari/605.1.15",
    ],
    [
      "Brave iOS",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1 Brave",
    ],
    [
      "Chrome Android",
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
    ],
    ["Firefox Android", "Mozilla/5.0 (Android 15; Mobile; rv:138.0) Gecko/138.0 Firefox/138.0"],
    [
      "Samsung Internet",
      "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A556B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    ],
    [
      "Brave Android (UA identical to Chrome)",
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
    ],
    [
      "Chrome desktop",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    ],
    [
      "Firefox desktop",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0",
    ],
    [
      "Edge desktop",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0",
    ],
  ];

  for (const [label, ua] of realBrowsers) {
    it(`allows real browser: ${label}`, () => {
      expect(classifyInAppBrowser(ua).inApp).toBe(false);
      expect(isInAppBrowser(ua)).toBe(false);
    });
  }

  // ── In-app WebViews — MUST return { inApp: true } ─────────────────────────
  const inAppCases: Array<[string, string, string]> = [
    [
      "Telegram iOS — bare WKWebView (THE critical gap)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      "Unknown",
    ],
    [
      "Telegram iOS — versioned (self-identifies)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.3 Mobile/15E148 Safari/604.1 Telegram 3.6.1123",
      "Telegram",
    ],
    [
      "Instagram iOS",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 93.0.0.14.101",
      "Instagram",
    ],
    [
      "Facebook iOS (FBAN/FBAV)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/449.0.0.41.119]",
      "Facebook",
    ],
    [
      "X / Twitter iOS",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone",
      "X",
    ],
    [
      "TikTok iOS (musical_ly)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_31.2.0 TikTok",
      "TikTok",
    ],
    [
      "WeChat iOS (MicroMessenger)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44",
      "WeChat",
    ],
    [
      "Generic bare WKWebView (any unidentified iOS app)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      "Unknown",
    ],
    [
      "Android WebView (; wv marker)",
      "Mozilla/5.0 (Linux; Android 9; Pixel 3 Build/PQ3A.190801.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/136.0.0.0 Mobile Safari/537.36",
      "Unknown",
    ],
    [
      "Android WebView reduced (Android 17)",
      "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.000 Mobile Safari/537.36",
      "Unknown",
    ],
  ];

  for (const [label, ua, app] of inAppCases) {
    it(`splashes in-app: ${label}`, () => {
      const r = classifyInAppBrowser(ua);
      expect(r.inApp).toBe(true);
      expect(r.app).toBe(app);
      expect(isInAppBrowser(ua)).toBe(true);
    });
  }

  // ── Crawlers — MUST return { inApp: false } so OG previews render ──────────
  const crawlers = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Twitterbot/1.0",
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)",
    "WhatsApp/2.23",
    "LinkedInBot/1.0",
  ];

  for (const ua of crawlers) {
    it(`passes crawler through: "${ua.slice(0, 24)}…"`, () => {
      expect(isInAppBrowser(ua)).toBe(false);
    });
  }

  // ── Edge cases ────────────────────────────────────────────────────────────
  it("fails SAFE on an empty UA (→ splash)", () => {
    expect(classifyInAppBrowser("").inApp).toBe(true);
    expect(classifyInAppBrowser("").app).toBe("Unknown");
  });

  it("detects OS for the CTA", () => {
    expect(detectMobileOS("iPhone; CPU iPhone OS 17_5")).toBe("ios");
    expect(detectMobileOS("Linux; Android 14; Pixel 8")).toBe("android");
    expect(detectMobileOS("Windows NT 10.0; Win64")).toBe("other");
  });
});

describe("isInAppBrowserClient (client-side, reads window)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function setEnv(win: unknown, ua: string): void {
    vi.stubGlobal("window", win);
    vi.stubGlobal("navigator", { userAgent: ua });
  }

  // The real device fact: Telegram-iOS sends a UA byte-identical to Safari.
  const SAFARI_IOS_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

  it("detects Telegram-iOS via window.TelegramWebviewProxy even with a Safari UA", () => {
    setEnv({ TelegramWebviewProxy: {} }, SAFARI_IOS_UA);
    expect(isInAppBrowserClient()).toBe(true);
  });

  it("falls back to the UA classifier for self-tagging apps (Instagram)", () => {
    setEnv(
      {},
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0.0"
    );
    expect(isInAppBrowserClient()).toBe(true);
  });

  it("returns false for real iOS Safari (no proxy, Safari UA)", () => {
    setEnv({}, SAFARI_IOS_UA);
    expect(isInAppBrowserClient()).toBe(false);
  });

  it("returns false when window is undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(isInAppBrowserClient()).toBe(false);
  });
});
