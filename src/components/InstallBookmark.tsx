"use client";

import { useEffect, useState } from "react";
import { useInstallContext } from "@/contexts/InstallContext";
import { useInstallPlatform } from "@/hooks/useInstallPlatform";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import { shouldShowInstallPitch } from "@/lib/install-pitch";

/**
 * Install bookmark chip — the minimised state of the install pitch. Sits in
 * normal page flow in the left third of `Feed.tsx`'s footer row (next to
 * "created with bopen.ai"). Tap to re-open the slide-up sheet (`<InstallPitch
 * variant="banner" />`).
 *
 * Design: chip shape matching the Ask AI pill (`rounded-full border px-2.5 py-2`)
 * with the 18px BSVibes app icon inside. Visible by default — does NOT hide
 * itself with low opacity. The user opted to minimise rather than dismiss;
 * the chip is the persistent reminder + tap-target. The 4-condition gate
 * (now 5 with `protected`) naturally hides it once the user installs.
 *
 * On collapse from the sheet, the chip fires an Ask-AI-style highlight flash
 * (amber border + bg + scale-110 + glow + pulsing dot) for 2000ms so the
 * user's eye locks onto where the sheet collapsed TO. Identical visual
 * treatment as `AgentChat`'s `highlight` state.
 *
 * Rationale + pattern decided 2026-06-02. See DECISIONS.md install-pitch
 * entries + the E32 install-pitch refinements session.
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
  // so it fires exactly once per "sheet → bookmark" transition. Re-fires if
  // the user reopens + minimises again — intentional, the eye-track serves
  // its purpose every collapse.
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
      className={`relative flex items-center justify-center border rounded-full px-2.5 py-2 transition-all mt-1 animate-[fadeIn_0.3s_ease-out_backwards] ${
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
        width={18}
        height={18}
        className="rounded-sm"
      />
      {/* Amber pinging dot during flash — matches Ask AI's highlight dot pattern */}
      {highlight && (
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
      )}
    </button>
  );
}
