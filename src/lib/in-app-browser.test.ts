import { describe, expect, it } from "vitest";
import { classifyInAppBrowser, detectMobileOS, isInAppBrowser } from "./in-app-browser";

describe("in-app-browser detection", () => {
  // Representative real-world UA fragments for each in-app WebView.
  const inAppCases: Array<[string, string, string]> = [
    [
      "Instagram",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0",
      "Instagram",
    ],
    [
      "Facebook (FBAN/FBAV)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/450.0.0]",
      "Facebook",
    ],
    [
      "X / Twitter app",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) AppleWebKit/605.1.15 Twitter for iPhone",
      "X",
    ],
    [
      "Telegram (human webview)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) AppleWebKit/605.1.15 Mobile/15E148 Telegram",
      "Telegram",
    ],
    [
      "TikTok (musical_ly)",
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 musical_ly_2023 BytedanceWebview",
      "TikTok",
    ],
    [
      "Discord",
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Discord/200 Chrome/120",
      "Discord",
    ],
    [
      "WeChat (MicroMessenger)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) AppleWebKit/605.1.15 MicroMessenger/8.0",
      "WeChat",
    ],
  ];

  for (const [label, ua, app] of inAppCases) {
    it(`detects ${label} as in-app (${app})`, () => {
      const r = classifyInAppBrowser(ua);
      expect(r.inApp).toBe(true);
      expect(r.app).toBe(app);
      expect(isInAppBrowser(ua)).toBe(true);
    });
  }

  // Crawlers / link-preview bots MUST fall through (false) so OG previews work,
  // even when their UA contains an in-app token (Twitterbot ⊃ "twitter", etc.).
  const crawlers = [
    "Twitterbot/1.0",
    "TelegramBot (like TwitterBot)",
    "facebookexternalhit/1.1",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Slackbot-LinkExpanding 1.0",
    "Discordbot/2.0",
    "WhatsApp/2.23",
    "LinkedInBot/1.0",
  ];

  for (const ua of crawlers) {
    it(`treats crawler "${ua.slice(0, 20)}…" as NOT in-app`, () => {
      expect(isInAppBrowser(ua)).toBe(false);
    });
  }

  // Real browsers must never be flagged.
  const realBrowsers = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
  ];

  for (const ua of realBrowsers) {
    it(`treats real browser as NOT in-app`, () => {
      expect(isInAppBrowser(ua)).toBe(false);
    });
  }

  it("returns false for an empty UA", () => {
    expect(isInAppBrowser("")).toBe(false);
    expect(classifyInAppBrowser("").app).toBeNull();
  });

  it("detects OS for the CTA", () => {
    expect(detectMobileOS("iPhone; CPU iPhone OS 17_5")).toBe("ios");
    expect(detectMobileOS("Linux; Android 14; Pixel 8")).toBe("android");
    expect(detectMobileOS("Windows NT 10.0; Win64")).toBe("other");
  });
});
