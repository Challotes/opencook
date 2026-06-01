"use client";

import { useInstallContext } from "@/contexts/InstallContext";
import { useInstallPlatform } from "@/hooks/useInstallPlatform";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import { shouldShowInstallPitch } from "@/lib/install-pitch";

/**
 * Install bookmark — the minimised state of the install pitch. Sits in normal
 * page flow next to the "created with bopen.ai" link in `Feed.tsx`. Tap to
 * re-open the slide-up sheet (`<InstallPitch variant="banner" />`).
 *
 * Design: 20px BSVibes app icon at 30% opacity. Sits at "credits / attribution"
 * visual weight — same recessive level as the bopen.ai link itself — so it's
 * findable when the user looks for it and ignorable when they don't. No glow,
 * no pulse, no urgency framing. The bookmark IS the suppressed state — there's
 * no explicit dismiss; the gate naturally hides it once the user installs.
 *
 * Visibility = the same 4-condition `shouldShowInstallPitch` gate PLUS
 * `installSheetMode === "bookmark"`. While the sheet is open or hidden, this
 * component renders nothing.
 *
 * Rationale + pattern decided 2026-06-02. See DECISIONS.md "Install pitch
 * bookmark dismissal pattern" (forthcoming when E32 docs land).
 */
export function InstallBookmark(): React.JSX.Element | null {
  const { installType } = useInstallPlatform();
  const standalone = useStandaloneMode();
  const { backedUp, isSuppressed, installSheetMode, openSheetFromBookmark } = useInstallContext();

  const visible = shouldShowInstallPitch({
    backedUp,
    standalone,
    installType,
    suppressed: isSuppressed,
  });

  if (!visible) return null;
  if (installSheetMode !== "bookmark") return null;

  return (
    <button
      type="button"
      onClick={openSheetFromBookmark}
      aria-label="Open install prompt"
      className="opacity-30 hover:opacity-70 transition-opacity duration-300"
    >
      {/* biome-ignore lint/performance/noImgElement: PWA icon path, no resize/CDN needed */}
      <img
        src="/icon-192.png"
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        className="rounded-md"
      />
    </button>
  );
}
