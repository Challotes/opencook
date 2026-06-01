"use client";

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
   * above the compose area. Has an X for 30-day suppression.
   */
  variant: "inline" | "banner";
  /**
   * Banner-only. Fires when the user taps the X. Parent unmounts the banner
   * for this session; the 30-day suppression flag persists across sessions.
   */
  onDismiss?: () => void;
}

/**
 * Install pitch — one component, two surfaces, per LAUNCH_PLAN decision #10.
 *
 * Visibility is a four-condition gate (see `shouldShowInstallPitch`): recovery
 * file saved AND not already standalone AND supported platform AND not
 * suppressed. Returns `null` when any condition fails.
 *
 * Platform branching (from `useInstallPlatform`):
 * - `one-tap` (Android Chrome/Brave/Edge/Samsung, desktop Chrome/Edge) — real
 *   button calling `promptInstall()`. `InstallContext` handles outcome →
 *   suppression internally (accepted = permanent engagement; dismissed = 30d).
 * - `manual-instructions` — iOS Safari, desktop Safari, Firefox Android.
 *   Visual instructions with the platform's actual install steps.
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

  const content = renderContent(installType, platform, canPromptInstall, handleInstallTap);

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
        <div className="flex-1 min-w-0">{content}</div>
      </div>
    );
  }

  // banner variant — full-width strip above the compose area
  return (
    <div className="border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0 text-[12px] leading-relaxed text-zinc-200">{content}</div>
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
 * Pure render branch — picks the right CTA shape for each install path.
 * Kept as a function (not a separate component) so the variant wrappers can
 * embed it without prop-drilling.
 */
function renderContent(
  installType: ReturnType<typeof useInstallPlatform>["installType"],
  platform: InstallPlatform | null,
  canPromptInstall: boolean,
  handleInstallTap: () => Promise<void>
): React.JSX.Element {
  if (installType === "one-tap") {
    // Chrome's engagement heuristic must fire before `beforeinstallprompt`
    // arrives. If we hit this branch before the prompt is captured, fall back
    // to the platform's manual menu instructions — a visible path beats a
    // disabled button with no tooltip.
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
          Install
        </button>
      </div>
    );
  }

  if (installType === "manual-instructions") {
    // Three sub-platforms share this branch; each gets a one-line instruction.
    // iOS Safari uses inline SVG icons (Share + plus-square) because Apple
    // blocks programmatic Add-to-Home-Screen triggering — the icons make the
    // manual instructions visually obvious. License-safe Heroicons-style
    // glyphs (NOT SF Symbols — Apple's license forbids web use). Icons get
    // `aria-hidden` because the surrounding prose is complete on its own;
    // screen readers reading "box with upward arrow, Share..." would be worse
    // than hiding the icon.
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
