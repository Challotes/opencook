/**
 * Type augmentation for PWA install events. The `beforeinstallprompt` event is
 * a Chromium extension to the DOM spec — TypeScript's lib.dom doesn't include
 * it. Declare it once globally so `window.addEventListener("beforeinstallprompt", ...)`
 * types correctly without `as` casts at every read site.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
  appinstalled: Event;
}
