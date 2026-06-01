"use client";

import { useEffect, useRef, useState } from "react";
import { useInstallContext } from "@/contexts/InstallContext";
import { type InstallPlatform, useInstallPlatform } from "@/hooks/useInstallPlatform";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import { shouldShowInstallPitch } from "@/lib/install-pitch";

interface InstallPitchProps {
  /**
   * `"inline"` — embeds inside the You modal done-state (no X, no dismissal —
   * the user already actively triggered this view by saving their key).
   *
   * `"banner"` — fixed strip rendered inside Feed's pinned-bottom container,
   * above the compose area. Has an X for 30-day suppression. On the FIRST
   * session per tab the banner promotes itself to a slide-up sheet for higher
   * conversion impact; subsequent sessions fall back to the compact strip
   * until the 30-day suppression expires or the user installs.
   */
  variant: "inline" | "banner";
  /**
   * Banner-only. Fires when the user taps the X or backdrop. Parent unmounts
   * the banner for this session; the 30-day suppression flag persists across
   * sessions.
   */
  onDismiss?: () => void;
}

/**
 * Per-tab-session flag — first appearance of the banner in this tab shows the
 * slide-up sheet (impactful, post-save moment); every subsequent appearance
 * falls back to the compact strip. The flag is `sessionStorage`-scoped so each
 * new tab gets one fresh sheet impression.
 */
const SESSION_KEY = "bsvibes_install_sheet_shown";

/**
 * Install pitch — one component, three surfaces, per LAUNCH_PLAN decision #10
 * + 2026-06-02 visual upgrade decision.
 *
 * Visibility is a four-condition gate (see `shouldShowInstallPitch`): recovery
 * file saved AND not already standalone AND supported platform AND not
 * suppressed. Returns `null` when any condition fails.
 *
 * Surface selection:
 * - `variant="inline"` → small strip inside the You modal done-state. No X.
 * - `variant="banner"` + first-tab-session → slide-up sheet with the BSVibes
 *   icon at 64px, headline, supporting line, primary CTA, recessive dismiss.
 * - `variant="banner"` + subsequent sessions → compact strip (the pre-2026-06
 *   shape).
 *
 * Platform branching (from `useInstallPlatform`):
 * - `one-tap` (Android Chrome/Brave/Edge/Samsung, desktop Chrome/Edge) — real
 *   button calling `promptInstall()`. `InstallContext` handles outcome →
 *   suppression internally (accepted = permanent engagement; dismissed = 30d).
 * - `manual-instructions` — iOS Safari, desktop Safari, Firefox Android.
 *   Visual instructions with the platform's actual install steps. iOS gets
 *   inline SVG icons for Share + Add-to-Home-Screen because Apple blocks
 *   programmatic install triggering — the icons make the manual instructions
 *   visually obvious.
 * - `open-in-safari` — iOS Chrome/Brave/Firefox/Edge. WebKit-wrapped browsers
 *   can't install PWAs on iOS; nudge user to open in Safari first.
 *
 * iOS Safari has no `appinstalled` event, but self-corrects: after the user
 * adds to home screen and opens from the icon, `detectStandalone() === true`,
 * the gate fails, the pitch hides forever on that device. Do NOT add a phantom
 * engagement tracker for iOS — the standalone gate IS the suppression.
 */
export function InstallPitch({ variant, onDismiss }: InstallPitchProps): React.JSX.Element | null {
  const { platform, installType } = useInstallPlatform();
  const standalone = useStandaloneMode();
  const { backedUp, isSuppressed, canPromptInstall, promptInstall, suppressForDays } =
    useInstallContext();

  // Banner only — decide once per mount whether this session gets the sheet.
  // Uses sessionStorage so the flag clears on tab close (next session sees the
  // sheet again) but persists across in-tab re-renders. Reading is guarded
  // because sessionStorage can throw in private modes / quota errors.
  const [useSheet, setUseSheet] = useState(false);
  const sheetChecked = useRef(false);

  useEffect(() => {
    if (variant !== "banner" || sheetChecked.current) return;
    sheetChecked.current = true;
    try {
      if (!sessionStorage.getItem(SESSION_KEY)) {
        sessionStorage.setItem(SESSION_KEY, "1");
        setUseSheet(true);
      }
    } catch {
      // sessionStorage blocked (private mode / quota exceeded) — fall through
      // to the compact strip. Better than risking an exception.
    }
  }, [variant]);

  const visible = shouldShowInstallPitch({
    backedUp,
    standalone,
    installType,
    suppressed: isSuppressed,
  });

  if (!visible) return null;

  async function handleInstallTap(): Promise<void> {
    if (!canPromptInstall) return;
    await promptInstall();
    // promptInstall handles suppression internally (accepted → engaged,
    // dismissed → 30d). Banner re-renders via context state change.
  }

  function handleDismiss(): void {
    suppressForDays(30);
    onDismiss?.();
  }

  // ─── Inline variant (inside You modal done-state) ──────────────────────────
  if (variant === "inline") {
    return (
      <div className="px-3 py-2.5 bg-amber-500/10 border-b border-amber-500/30 flex items-start gap-3">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-amber-400 shrink-0 mt-0.5"
        >
          <path d="M12 2v8" />
          <path d="m16 6-4 4-4-4" />
          <rect x="3" y="14" width="18" height="8" rx="2" />
        </svg>
        <div className="flex-1 min-w-0">
          {renderStripContent(installType, platform, canPromptInstall, handleInstallTap)}
        </div>
      </div>
    );
  }

  // ─── Banner variant — first-session slide-up sheet ────────────────────────
  if (useSheet) {
    return (
      <>
        <button
          type="button"
          className="fixed inset-0 z-[70] w-full bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] cursor-default"
          aria-label="Dismiss install prompt"
          onClick={handleDismiss}
        />
        <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center pointer-events-none animate-[slideUp_0.35s_ease-out_backwards]">
          <div
            className="w-full max-w-lg rounded-t-2xl border border-amber-400/20 border-b-0 shadow-[0_-8px_40px_rgba(0,0,0,0.7)] overflow-hidden pointer-events-auto"
            style={{ backgroundColor: "#0f0f0f" }}
            role="dialog"
            aria-modal="true"
            aria-label="Install BSVibes"
          >
            {/* Gold top stripe — same as StaleKeyModal / SignInModal / FundAddress */}
            <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

            {/* Drag handle + dismiss X */}
            <div className="relative flex justify-end px-5 pt-4 pb-0">
              <div className="absolute left-1/2 top-3 -translate-x-1/2 w-8 h-1 rounded-full bg-zinc-700" />
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss install prompt"
                className="relative -m-2 p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 pb-6 pt-3 text-center">
              {/* 64px BSVibes app icon — the actual home-screen preview, with
                  amber glow shadow so it reads as "premium" without shouting.
                  Decorative — aria-hidden because the headline does the lifting. */}
              {/* biome-ignore lint/performance/noImgElement: PWA icon path, no resize/CDN needed */}
              <img
                src="/icon-192.png"
                alt=""
                aria-hidden="true"
                width={64}
                height={64}
                className="rounded-xl mx-auto mb-4 shadow-[0_4px_16px_rgba(245,158,11,0.25)]"
              />
              {/* Locked headline — DECISIONS.md "Notification copy discipline" */}
              <p className="text-lg font-semibold text-amber-400 leading-snug mb-2">
                Get notified when you earn.
              </p>
              {/* Supporting line — possession framing, no fear */}
              <p className="text-sm text-zinc-400 leading-relaxed mb-5">
                Your earnings live on your phone, not a tab you&apos;ll close.
              </p>
              <div className="space-y-3">
                {renderSheetCTA(installType, platform, canPromptInstall, handleInstallTap)}
              </div>
            </div>
            {/* iOS home-indicator safe-area */}
            <div style={{ paddingBottom: "env(safe-area-inset-bottom)" }} />
          </div>
        </div>
      </>
    );
  }

  // ─── Banner variant — compact strip fallback (subsequent sessions) ────────
  return (
    <div className="border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0 text-[12px] leading-relaxed text-zinc-200">
        {renderStripContent(installType, platform, canPromptInstall, handleInstallTap)}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        className="relative -m-3 p-3 text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Sheet-scale CTA — larger touch targets, richer typography. Each platform
 * branch produces the right action shape for its install path.
 */
function renderSheetCTA(
  installType: ReturnType<typeof useInstallPlatform>["installType"],
  platform: InstallPlatform | null,
  canPromptInstall: boolean,
  handleInstallTap: () => Promise<void>
): React.JSX.Element {
  if (installType === "one-tap") {
    if (!canPromptInstall) {
      const fallback =
        platform === "android"
          ? "Open your browser menu, then choose Install."
          : "Open your browser menu, then choose Install app.";
      return <p className="text-[13px] text-zinc-400 leading-relaxed">{fallback}</p>;
    }
    return (
      <button
        type="button"
        onClick={handleInstallTap}
        className="w-full bg-amber-500 text-black rounded-xl px-4 py-3 text-sm font-semibold hover:bg-amber-400 active:bg-amber-600 transition-colors"
      >
        Add to home
      </button>
    );
  }

  if (installType === "manual-instructions") {
    if (platform === "ios-safari") {
      // "Almost there." prefix tells the user they're close — minimal
      // motivation that doesn't compete with the icon-hunting task.
      // Pill-shaped inline labels mirror iOS button visual treatment so the
      // user is matching shapes between sheet and Safari chrome.
      return (
        <div className="space-y-2">
          <p className="text-[13px] text-zinc-300 leading-relaxed">Almost there.</p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-400">
            <span>Tap</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 12H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-5" />
                <line x1="12" y1="2" x2="12" y2="15" />
                <polyline points="8 6 12 2 16 6" />
              </svg>
              Share
            </span>
            <span>then</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              Add to Home Screen
            </span>
          </div>
        </div>
      );
    }
    if (platform === "desktop-safari") {
      return (
        <p className="text-[13px] text-zinc-400 leading-relaxed">
          Open the <span className="text-zinc-200">File</span> menu, then{" "}
          <span className="text-zinc-200">Add to Dock</span>.
        </p>
      );
    }
    return (
      <p className="text-[13px] text-zinc-400 leading-relaxed">
        Open your browser menu, then <span className="text-zinc-200">Install</span>.
      </p>
    );
  }

  if (installType === "open-in-safari") {
    return (
      <p className="text-[13px] text-zinc-400 leading-relaxed">
        Open BSVibes in <span className="text-zinc-200">Safari</span> to add it to your home screen.
      </p>
    );
  }

  // installType === "unsupported" or null — should never reach here.
  return <span className="text-[13px] text-zinc-400">Get notified when you earn.</span>;
}

/**
 * Strip-scale content — used by the inline variant and the compact-strip
 * fallback. Compact one-line layout, smaller typography, in-line CTA.
 */
function renderStripContent(
  installType: ReturnType<typeof useInstallPlatform>["installType"],
  platform: InstallPlatform | null,
  canPromptInstall: boolean,
  handleInstallTap: () => Promise<void>
): React.JSX.Element {
  if (installType === "one-tap") {
    if (!canPromptInstall) {
      const fallback =
        platform === "android"
          ? "Open the browser menu, then Install."
          : "Open the browser menu, then Install app.";
      return (
        <div className="space-y-1">
          <span className="text-[12px] text-amber-400 font-medium block">
            Get notified when you earn.
          </span>
          <span className="text-[11px] text-zinc-400 block">{fallback}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-amber-400 font-medium">Get notified when you earn.</span>
        <button
          type="button"
          onClick={handleInstallTap}
          className="bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg px-3 py-1.5 text-[11px] font-medium hover:bg-amber-500/30 transition-colors"
        >
          Add to home
        </button>
      </div>
    );
  }

  if (installType === "manual-instructions") {
    const instructions =
      platform === "ios-safari" ? (
        <span className="text-[11px] text-zinc-400 block">
          Tap{" "}
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="inline-block text-zinc-300"
            style={{ verticalAlign: "-2px" }}
          >
            <path d="M9 12H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-5" />
            <line x1="12" y1="2" x2="12" y2="15" />
            <polyline points="8 6 12 2 16 6" />
          </svg>{" "}
          Share, then{" "}
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="inline-block text-zinc-300"
            style={{ verticalAlign: "-2px" }}
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>{" "}
          Add to Home Screen.
        </span>
      ) : platform === "desktop-safari" ? (
        <span className="text-[11px] text-zinc-400 block">Open File menu → Add to Dock.</span>
      ) : (
        <span className="text-[11px] text-zinc-400 block">
          Open the browser menu, then Install.
        </span>
      );
    return (
      <div className="space-y-1">
        <span className="text-[12px] text-amber-400 font-medium block">
          Get notified when you earn.
        </span>
        {instructions}
      </div>
    );
  }

  if (installType === "open-in-safari") {
    return (
      <div className="space-y-1">
        <span className="text-[12px] text-amber-400 font-medium block">
          Get notified when you earn.
        </span>
        <span className="text-[11px] text-zinc-400 block">Open BSVibes in Safari to install.</span>
      </div>
    );
  }

  // installType === "unsupported" or null — should never reach here because
  // shouldShowInstallPitch returns false for both. Render-safe fallback.
  return <span className="text-[12px] text-zinc-400">Get notified when you earn.</span>;
}
