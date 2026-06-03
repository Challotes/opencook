"use client";

import { useEffect, useState } from "react";
import { useInstallContext } from "@/contexts/InstallContext";
import { useInstallPlatform } from "@/hooks/useInstallPlatform";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import { shouldShowInstallPitch } from "@/lib/install-pitch";

/**
 * Install bookmark — the minimised state of the install pitch. Sits in the
 * PostForm's footer row next to the Ask AI button. Tap to re-open the slide-up
 * sheet (`<InstallPitch variant="banner" />`).
 *
 * Design (settled 2026-06-03): bare 20px app icon, no chip border at rest,
 * subtle `p-1 rounded-sm hover:bg-zinc-800` so it reads as interactive on
 * tap. Sized to match the Ask AI button's visible height without competing
 * with the Ask AI pill's chip shape — Ask AI is "do an action" (chat),
 * bookmark is "your account is here" (the app logo, shrunk down).
 *
 * On collapse from the sheet, fires an Ask-AI-style highlight flash (amber
 * ring + scale-110 + pulsing dot) for 2000ms so the user's eye locks onto
 * where the sheet collapsed TO. Identical visual treatment as `AgentChat`'s
 * `highlight` state.
 *
 * Visibility = the same 5-condition `shouldShowInstallPitch` gate PLUS
 * `installSheetMode === "bookmark"`. While the sheet is open or hidden, this
 * component renders nothing.
 *
 * History (2026-06-02 → 2026-06-03):
 * - First shipped as a small icon in Feed.tsx's footer row next to bopen.ai
 *   link. Found to be too easy to mis-tap the link.
 * - Promoted to chip styling matching Ask AI dimensions. Felt visually
 *   "shouty" alongside the Ask AI pill — two pills side by side competed.
 * - Now: bare icon, PostForm row, same row as Ask AI. Reads as a personal-
 *   account indicator (the app logo) rather than a competing CTA.
 */
export function InstallBookmark(): React.JSX.Element | null {
  const { installType } = useInstallPlatform();
  const standalone = useStandaloneMode();
  const {
    backedUp,
    protected: isProtected,
    isSuppressed,
    installSheetMode,
    openSheetFromBookmark,
  } = useInstallContext();

  const visible = shouldShowInstallPitch({
    backedUp,
    protected: isProtected,
    standalone,
    installType,
    suppressed: isSuppressed,
  });

  // Ask-AI-style highlight flash — fires when the sheet collapses to here so
  // the user's eye tracks the destination. Local state, not context, because
  // only this component cares about the transient. Watches installSheetMode
  // so it fires exactly once per "sheet → bookmark" transition.
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    if (installSheetMode !== "bookmark") return;
    setHighlight(true);
    const t = setTimeout(() => setHighlight(false), 2000);
    return () => clearTimeout(t);
  }, [installSheetMode]);

  if (!visible) return null;
  if (installSheetMode !== "bookmark") return null;

  return (
    <button
      type="button"
      onClick={openSheetFromBookmark}
      aria-label="Open install prompt"
      className={`relative p-1 rounded-sm transition-all ${
        highlight
          ? "ring-2 ring-amber-500 bg-amber-500/10 scale-110 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
          : "hover:bg-zinc-800 active:bg-zinc-700"
      }`}
    >
      {/* biome-ignore lint/performance/noImgElement: PWA icon path, no resize/CDN needed */}
      <img
        src="/icon-192.png"
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        className="rounded-sm"
      />
      {/* Amber pinging dot during flash — matches Ask AI's highlight dot pattern */}
      {highlight && (
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
      )}
    </button>
  );
}
