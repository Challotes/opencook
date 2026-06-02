"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { isSuppressedAt } from "@/lib/install-suppression";
import { isEffectivelyProtected } from "@/services/bsv/identity";

const DISMISSED_UNTIL_KEY = "bsvibes_install_pitch_dismissed_until";
const ENGAGED_KEY = "bsvibes_install_engaged";
const BACKED_UP_KEY = "bsvibes_identity_backed_up";
const SHEET_SHOWN_KEY = "bsvibes_install_sheet_shown"; // sessionStorage
const DAY_MS = 24 * 60 * 60 * 1000;
const DISMISS_DAYS_DEFAULT = 30;
const SHEET_DELAY_MS = 800;

/**
 * Install pitch mode — drives which surface (sheet vs bookmark) is currently
 * rendered when the user passes the 4-condition visibility gate.
 *
 * - `"hidden"` — initial state; no surface visible. Used both before gate
 *   passes (no recovery file yet, etc.) AND during the first 800ms after the
 *   gate passes (gives the user a moment to land on the page).
 * - `"sheet"` — full slide-up sheet. The big-impact post-save moment.
 * - `"bookmark"` — minimised state. Small app-icon bookmark sits next to the
 *   "created with bopen.ai" link in Feed.tsx. Quietly visible, tap to re-open.
 */
export type InstallSheetMode = "hidden" | "sheet" | "bookmark";

interface InstallContextValue {
  /** True if a `beforeinstallprompt` event was captured and hasn't been consumed. */
  canPromptInstall: boolean;
  /**
   * Fire the captured deferred prompt. Returns the user's outcome, or `null`
   * if no prompt is available (e.g., on iOS where `beforeinstallprompt` never
   * fires). Defensive-return matches `requireIdentity()` — callers narrow with
   * `if (outcome === null) return;` rather than try/catch.
   */
  promptInstall: () => Promise<"accepted" | "dismissed" | null>;
  /**
   * Derived on every render — true if the user dismissed within the last 30
   * days OR has engaged with the install flow (accepted prompt OR `appinstalled`
   * event fired).
   */
  isSuppressed: boolean;
  /** Set `dismissedUntil = now + days × DAY_MS`. Called by `promptInstall` on dismissed outcome. */
  suppressForDays: (days: number) => void;
  /** Mark the user as having engaged the install path. Permanent. */
  markEngaged: () => void;
  /**
   * True if the user has saved a recovery file at least once (mirrored from
   * the `bsvibes_identity_backed_up` localStorage flag). The install pitch is
   * gated on this — without a recovery file, a fresh install lands in a new
   * sandbox with no recovery path. Source of truth for the trigger.
   */
  backedUp: boolean;
  /**
   * Mark the user as having saved a recovery file. Writes localStorage AND
   * updates context state so the bottom banner can react mid-session (without
   * this, the banner would only appear on the next page load). Idempotent.
   */
  markBackedUp: () => void;
  /**
   * True if the user's identity is passphrase-encrypted. Mirrors
   * `isEffectivelyProtected()` from `services/bsv/identity.ts` so the install
   * pitch gate can re-render when protection state changes (after rotation
   * via MoveAddressModal / ChangePassphraseModal, after encrypted restore via
   * RestoreModal). Initial value read synchronously on mount; refreshed when
   * `refreshProtected()` is called (after any rotation flow completes) and
   * when a `storage` event fires for the encrypted-key localStorage entry
   * (cross-tab restore).
   */
  protected: boolean;
  /**
   * Force a re-read of `isEffectivelyProtected()` and update context state.
   * Called by MoveAddressModal / ChangePassphraseModal / RestoreModal after
   * their commitUpgrade / importIdentity completes — those operations write
   * localStorage but don't fire a `storage` event in the same tab.
   */
  refreshProtected: () => void;
  /** Current install pitch surface — see `InstallSheetMode`. */
  installSheetMode: InstallSheetMode;
  /**
   * Called by `InstallPitch` once it determines the visibility gate has passed
   * for the first time this session. Idempotent — re-calls are no-ops.
   *
   * Behavior:
   * - First-ever call this tab session (no sessionStorage flag): sets the flag
   *   synchronously to prevent reload-during-delay double-fire, schedules
   *   `installSheetMode = "sheet"` after 800ms.
   * - Subsequent sessions (flag already set): `installSheetMode = "bookmark"`
   *   immediately. The user has already seen the sheet once; the bookmark is
   *   the persistent reminder.
   *
   * sessionStorage failure (private browsing / quota) is fail-open: behave as
   * "first time" each render, which means the user gets the sheet again. Worse
   * than ideal but better than crashing.
   */
  initializeSheetMode: () => void;
  /** Chevron tap on the sheet — minimises to the bookmark. */
  minimiseToBookmark: () => void;
  /** Bookmark tap — re-opens the sheet (slideUp animation). */
  openSheetFromBookmark: () => void;
  /**
   * Ref-counted block on the install-pitch sheet appearance — mirror of the
   * `blockSessionClear` pattern in IdentityContext. Used by rotation modals
   * (MoveAddressModal / ChangePassphraseModal / RestoreModal) to suppress the
   * sheet during their lifecycle: when those modals are mounted, `markBackedUp`
   * may fire mid-flow but the install pitch must not appear on top of an
   * active modal. Modals mount → `blockInstallPitch()`, unmount → `unblockInstallPitch()`.
   * Once the count returns to zero, the install pitch's gate re-evaluates and
   * fires the sheet (or bookmark) at a clean moment.
   *
   * Ref-counted so overlapping modals (e.g. RestoreModal stacked on top of
   * StaleKeyModal) compose safely.
   */
  blockInstallPitch: () => void;
  unblockInstallPitch: () => void;
  /** Reader for the block ref — true if any modal is currently blocking the pitch. */
  isInstallPitchBlocked: () => boolean;
  /**
   * Tick that increments whenever the block count returns to zero — forces
   * `InstallPitch` to re-render and re-check the gate even though the ref
   * count itself isn't React state. Consumers read this to participate in
   * the React lifecycle; don't read the ref directly.
   */
  installPitchBlockTick: number;
}

const InstallContext = createContext<InstallContextValue | null>(null);

function readDismissedUntil(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DISMISSED_UNTIL_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function readEngaged(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ENGAGED_KEY) === "1";
  } catch {
    return false;
  }
}

function readBackedUp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(BACKED_UP_KEY) === "1";
  } catch {
    return false;
  }
}

function readProtected(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return isEffectivelyProtected();
  } catch {
    return false;
  }
}

export function InstallProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [canPromptInstall, setCanPromptInstall] = useState(false);
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(() => readDismissedUntil());
  const [engaged, setEngaged] = useState<boolean>(() => readEngaged());
  const [backedUp, setBackedUp] = useState<boolean>(() => readBackedUp());
  const [installSheetMode, setInstallSheetMode] = useState<InstallSheetMode>("hidden");
  const [protectedState, setProtectedState] = useState<boolean>(() => readProtected());
  const [installPitchBlockTick, setInstallPitchBlockTick] = useState(0);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  // initializeSheetMode is callable many times across re-renders but should
  // only do its first-pass logic ONCE. Ref-guarded so React Strict Mode's
  // double-invoke can't cause a double-fire of the sessionStorage write or
  // the 800ms timer.
  const sheetInitRef = useRef(false);
  const sheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref-counted block — modal mount → +1, unmount → -1. When count returns
  // to 0, install pitch can fire. Tick state increments on the 0-edge so
  // consumers in the React tree re-evaluate.
  const installPitchBlockRef = useRef(0);

  // Capture beforeinstallprompt + appinstalled events
  useEffect(() => {
    function handleBeforeInstallPrompt(e: BeforeInstallPromptEvent): void {
      e.preventDefault();
      deferredPromptRef.current = e;
      setCanPromptInstall(true);
    }

    function handleAppInstalled(): void {
      deferredPromptRef.current = null;
      setCanPromptInstall(false);
      window.localStorage.setItem(ENGAGED_KEY, "1");
      setEngaged(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | null> => {
    const deferred = deferredPromptRef.current;
    if (!deferred) return null;
    try {
      await deferred.prompt();
      const result = await deferred.userChoice;
      // Deferred event is single-use per spec — clear regardless of outcome.
      deferredPromptRef.current = null;
      setCanPromptInstall(false);
      // Per architect refinement: both outcomes count as engagement, but dismissed
      // gets 30-day suppression (consistent with X-tap), accepted gets permanent.
      if (result.outcome === "accepted") {
        window.localStorage.setItem(ENGAGED_KEY, "1");
        setEngaged(true);
      } else {
        const until = Date.now() + DISMISS_DAYS_DEFAULT * DAY_MS;
        window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(until));
        setDismissedUntil(until);
      }
      return result.outcome;
    } catch {
      // Browser refused to show prompt (rare — e.g., already in flight). Treat
      // as "no outcome" — caller can retry, no suppression applied.
      return null;
    }
  }, []);

  const suppressForDays = useCallback((days: number): void => {
    const until = Date.now() + days * DAY_MS;
    try {
      window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(until));
    } catch {
      // localStorage write failed (private browsing quota, etc.) — still update
      // in-memory state so this session suppresses.
    }
    setDismissedUntil(until);
  }, []);

  const markEngaged = useCallback((): void => {
    try {
      window.localStorage.setItem(ENGAGED_KEY, "1");
    } catch {
      // Same fallback as above — in-memory still flips.
    }
    setEngaged(true);
  }, []);

  const markBackedUp = useCallback((): void => {
    try {
      window.localStorage.setItem(BACKED_UP_KEY, "1");
    } catch {
      // localStorage write failed (private browsing quota, etc.) — still flip
      // in-memory so the banner reacts this session.
    }
    setBackedUp(true);
  }, []);

  const refreshProtected = useCallback((): void => {
    setProtectedState(readProtected());
  }, []);

  // Cross-tab protection sync — storage events fire when ANOTHER tab writes
  // to localStorage. Same-tab writes (after rotation flow in MoveAddressModal /
  // ChangePassphraseModal / RestoreModal) don't fire `storage`, so those modals
  // must call `refreshProtected()` explicitly after their commit step.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function handleStorage(e: StorageEvent): void {
      // Both plaintext + encrypted store key changes affect isEffectivelyProtected().
      if (e.key === "bfn_keypair" || e.key === "bfn_keypair_enc") {
        setProtectedState(readProtected());
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const blockInstallPitch = useCallback((): void => {
    installPitchBlockRef.current += 1;
  }, []);

  const unblockInstallPitch = useCallback((): void => {
    installPitchBlockRef.current = Math.max(0, installPitchBlockRef.current - 1);
    if (installPitchBlockRef.current === 0) {
      // Force re-render of consumers (InstallPitch) so the gate re-evaluates
      // and initializeSheetMode fires now that the modal is gone. Counter
      // (not boolean) so two close-in-time tick increments are still treated
      // as distinct events.
      setInstallPitchBlockTick((t) => t + 1);
    }
  }, []);

  const isInstallPitchBlocked = useCallback((): boolean => {
    return installPitchBlockRef.current > 0;
  }, []);

  const initializeSheetMode = useCallback((): void => {
    if (sheetInitRef.current) return;
    sheetInitRef.current = true;
    // Atomically set the sessionStorage flag BEFORE scheduling the 800ms reveal.
    // If the user hard-reloads during the 800ms window, we want the next mount
    // to land on "bookmark" (flag already set), not on a fresh "sheet" — that
    // would double-fire the impactful surface.
    try {
      if (window.sessionStorage.getItem(SHEET_SHOWN_KEY)) {
        // Already shown this tab session — straight to bookmark.
        setInstallSheetMode("bookmark");
        return;
      }
      window.sessionStorage.setItem(SHEET_SHOWN_KEY, "1");
    } catch {
      // sessionStorage blocked (private mode / quota). Fall through to the
      // 800ms timer — user gets the sheet, no flag persisted. Slightly worse
      // than ideal but no crash.
    }
    sheetTimerRef.current = setTimeout(() => {
      setInstallSheetMode("sheet");
      sheetTimerRef.current = null;
    }, SHEET_DELAY_MS);
  }, []);

  const minimiseToBookmark = useCallback((): void => {
    // If the timer is still pending (user shouldn't be able to act on a hidden
    // sheet, but defensive), clear it so the sheet doesn't pop up after they
    // already minimised.
    if (sheetTimerRef.current !== null) {
      clearTimeout(sheetTimerRef.current);
      sheetTimerRef.current = null;
    }
    setInstallSheetMode("bookmark");
  }, []);

  const openSheetFromBookmark = useCallback((): void => {
    setInstallSheetMode("sheet");
  }, []);

  // Clean up any pending timer on provider unmount (HMR, route change).
  useEffect(() => {
    return () => {
      if (sheetTimerRef.current !== null) {
        clearTimeout(sheetTimerRef.current);
        sheetTimerRef.current = null;
      }
    };
  }, []);

  // Derived on every render. Calling Date.now() here means a mid-session
  // expiry of dismissedUntil only becomes visible on the next render — fine
  // for this use case because consumers only render when something else
  // (state change, user interaction) prompts them.
  const isSuppressed = isSuppressedAt(Date.now(), dismissedUntil, engaged);

  return (
    <InstallContext.Provider
      value={{
        canPromptInstall,
        promptInstall,
        isSuppressed,
        suppressForDays,
        markEngaged,
        backedUp,
        markBackedUp,
        protected: protectedState,
        refreshProtected,
        installSheetMode,
        initializeSheetMode,
        minimiseToBookmark,
        openSheetFromBookmark,
        blockInstallPitch,
        unblockInstallPitch,
        isInstallPitchBlocked,
        installPitchBlockTick,
      }}
    >
      {children}
    </InstallContext.Provider>
  );
}

export function useInstallContext(): InstallContextValue {
  const ctx = useContext(InstallContext);
  if (!ctx) {
    throw new Error("useInstallContext must be used within InstallProvider");
  }
  return ctx;
}
