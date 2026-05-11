import { describe, expect, it } from "vitest";
import { classifyUA } from "./useInstallPlatform";

describe("classifyUA", () => {
  it("Android Chrome → android / one-tap", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    expect(classifyUA(ua, 5)).toEqual({ platform: "android", installType: "one-tap" });
  });

  it("Samsung Internet on Android → android / one-tap", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";
    expect(classifyUA(ua, 5)).toEqual({ platform: "android", installType: "one-tap" });
  });

  it("Firefox on Android → unsupported / manual-instructions (no beforeinstallprompt)", () => {
    const ua = "Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0";
    expect(classifyUA(ua, 5)).toEqual({
      platform: "unsupported",
      installType: "manual-instructions",
    });
  });

  it("iOS Safari → ios-safari / manual-instructions", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(classifyUA(ua, 5)).toEqual({
      platform: "ios-safari",
      installType: "manual-instructions",
    });
  });

  it("iOS Chrome (CriOS) → ios-other / open-in-safari", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
    expect(classifyUA(ua, 5)).toEqual({
      platform: "ios-other",
      installType: "open-in-safari",
    });
  });

  it("iPadOS 13+ pretending to be macOS (Macintosh UA + maxTouchPoints > 1) → ios-safari", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(classifyUA(ua, 5)).toEqual({
      platform: "ios-safari",
      installType: "manual-instructions",
    });
  });

  it("Genuine macOS Safari (Macintosh UA + maxTouchPoints === 0) → desktop-safari", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(classifyUA(ua, 0)).toEqual({
      platform: "desktop-safari",
      installType: "manual-instructions",
    });
  });

  it("Desktop Chrome → desktop-chrome / one-tap", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(classifyUA(ua, 0)).toEqual({
      platform: "desktop-chrome",
      installType: "one-tap",
    });
  });

  it("Desktop Edge → desktop-chrome / one-tap (uses same Chromium engine)", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
    expect(classifyUA(ua, 0)).toEqual({
      platform: "desktop-chrome",
      installType: "one-tap",
    });
  });

  it("Desktop Firefox → desktop-firefox / unsupported", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0";
    expect(classifyUA(ua, 0)).toEqual({
      platform: "desktop-firefox",
      installType: "unsupported",
    });
  });

  it("Unknown / weird UA → unsupported / unsupported", () => {
    expect(classifyUA("SomeRandomBot/1.0", 0)).toEqual({
      platform: "unsupported",
      installType: "unsupported",
    });
  });
});
