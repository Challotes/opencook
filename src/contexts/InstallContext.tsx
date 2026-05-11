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

const DISMISSED_UNTIL_KEY = "bsvibes_install_pitch_dismissed_until";
const ENGAGED_KEY = "bsvibes_install_engaged";
const DAY_MS = 24 * 60 * 60 * 1000;
const DISMISS_DAYS_DEFAULT = 30;

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
  /** Set `dismissedUntil = now + days × DAY_MS`. Called on X-tap on the install banner. */
  suppressForDays: (days: number) => void;
  /** Mark the user as having engaged the install path. Permanent. */
  markEngaged: () => void;
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

export function InstallProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [canPromptInstall, setCanPromptInstall] = useState(false);
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(() => readDismissedUntil());
  const [engaged, setEngaged] = useState<boolean>(() => readEngaged());
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

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

  // Derived on every render. Calling Date.now() here means a mid-session
  // expiry of dismissedUntil only becomes visible on the next render — fine
  // for this use case because consumers only render when something else
  // (state change, user interaction) prompts them.
  const isSuppressed = isSuppressedAt(Date.now(), dismissedUntil, engaged);

  return (
    <InstallContext.Provider
      value={{ canPromptInstall, promptInstall, isSuppressed, suppressForDays, markEngaged }}
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
