import type { InstallType } from "@/hooks/useInstallPlatform";

/**
 * Returns true if the install pitch should be visible given the five trigger
 * conditions. Pure — no DOM, no storage, no `Date.now()` — so it can be
 * unit-tested with a truth-table.
 *
 * Inputs:
 * - `backedUp` — user has saved their recovery file (gate against pre-save install,
 *   which would leave them with no recovery path in the new sandbox).
 * - `protected` — user's identity is passphrase-encrypted (`isEffectivelyProtected`
 *   returns true). Sequential flow: save → upgrade → install. Pinning an
 *   unprotected (plaintext WIF) key to the home screen is a security regression
 *   we don't want to enable.
 * - `standalone` — already-installed PWA mode. If true, the pitch is pointless.
 * - `installType` — from `useInstallPlatform`. `null` means pre-hydration (SSR or
 *   first render); render nothing until populated. `"unsupported"` means no install
 *   path exists on this platform (e.g., desktop Firefox).
 * - `engaged` — set permanently after `appinstalled` fires OR after the user
 *   accepts the native install prompt. Suppresses the pitch in the lingering
 *   browser tab between accept-prompt and standalone-mode-detection (narrow
 *   window). Replaces the prior `suppressed` flag that combined this with a
 *   30-day dismissal timer — the timer was removed 2026-06-03 because no
 *   surface fires it anymore (the install sheet's X was replaced with a
 *   chevron-minimise-to-bookmark, and no other surface has a dismiss).
 *
 * All five must agree before the pitch shows. Any single failure → hide.
 */
export function shouldShowInstallPitch(args: {
  backedUp: boolean;
  protected: boolean;
  standalone: boolean;
  installType: InstallType | null;
  engaged: boolean;
}): boolean {
  if (!args.backedUp) return false;
  if (!args.protected) return false;
  if (args.standalone) return false;
  if (args.installType === null) return false; // pre-hydration
  if (args.installType === "unsupported") return false;
  if (args.engaged) return false;
  return true;
}
