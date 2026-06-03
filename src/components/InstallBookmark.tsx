"use client";

import { useEffect, useState } from "react";
import { useInstallContext } from "@/contexts/InstallContext";
import { useInstallPlatform } from "@/hooks/useInstallPlatform";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import { shouldShowInstallPitch } from "@/lib/install-pitch";

/**
 * Install bookmark — the minimised state of the install pitch. Sits in the
 * PostForm's footer row, centered (between the helper text on the left and
 * the Ask AI pill on the right). Tap to re-open the slide-up sheet
 * (`<InstallPitch variant="banner" />`).
 *
 * Design (settled 2026-06-03):
 * - Bare 20px BSVibes app icon at rest
 * - `ring-1 ring-zinc-700` outline at rest — subtle frame so the icon reads
 *   as interactive without competing with the Ask AI pill's chip shape.
 *   Lower-weight version of the highlight's `ring-2 ring-amber-500`.
 * - Ask-AI-style highlight flash on collapse from sheet → bookmark
 *   (`ring-2 ring-amber-500 + scale-110 + glow shadow`, 2000ms). No
 *   pinging dot — flash treatment alone reads as a strong attention signal
 *   without the extra noise.
 *
 * Visibility = the 5-condition `shouldShowInstallPitch` gate PLUS
 * `installSheetMode === "bookmark"`. While the sheet is open or hidden,
 * this component renders nothing.
 */
export function InstallBookmark(): React.JSX.Element | null {
  const { installType } = useInstallPlatform();
  const standalone = useStandaloneMode();
  const {
    backedUp,
    protected: isProtected,
    engaged,
    installSheetMode,
    openSheetFromBookmark,
  } = useInstallContext();

  const visible = shouldShowInstallPitch({
    backedUp,
    protected: isProtected,
    standalone,
    installType,
    engaged,
  });

  // Ask-AI-style highlight flash — fires when the sheet collapses to here so
  // the user's eye tracks the destination. Watches installSheetMode so it
  // fires exactly once per "sheet → bookmark" transition.
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
      className={`h-[34px] w-[34px] flex items-center justify-center rounded-sm border transition-all mt-1 ${
        highlight
          ? "border-amber-500 bg-amber-500/10 scale-110 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
          : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
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
    </button>
  );
}
