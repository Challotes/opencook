/**
 * Returns true if the install pitch should be suppressed at the given time.
 *
 * Suppression has two paths (per LAUNCH_PLAN.md decision #10):
 * - User dismissed the pitch (X tap on banner OR declined the native prompt).
 *   Sets `dismissedUntil = now + 30 days`. Suppression is in effect while
 *   `dismissedUntil > now`.
 * - User engaged the install flow (accepted prompt OR completed install via
 *   `appinstalled` event). Permanent suppression — `engaged = true` from then on.
 *
 * Extracted as a pure function (no `Date.now()`, no DOM, no storage) so it can
 * be unit-tested deterministically.
 */
export function isSuppressedAt(
  now: number,
  dismissedUntil: number | null,
  engaged: boolean
): boolean {
  if (engaged) return true;
  if (dismissedUntil !== null && dismissedUntil > now) return true;
  return false;
}
