"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type BootStatus = "idle" | "pending" | "sending" | "retrying" | "preparing" | "failed";

interface BootContextValue {
  bootingPostId: number | null;
  bootStatus: BootStatus;
  bootError: string | null;
  /** Whether the throttle is currently active (boots disabled) */
  throttled: boolean;
  /** Call when a boot starts — claims the global lock */
  claimBoot: (postId: number) => boolean;
  /** Update status while a boot is in progress */
  setStatus: (status: BootStatus) => void;
  /** Call on success or clean exit */
  releaseBoot: () => void;
  /** Call on failure — sets error, auto-resets after 5s */
  failBoot: (message: string) => void;
  /** Whether the first-time consolidation warning has been dismissed */
  consolidationWarningDismissed: boolean;
  dismissConsolidationWarning: () => void;
}

/** Cooldown after each boot. Eliminates rapid-click edge cases (orphan races,
 *  mempool conflicts, double-spend attempts) at zero code complexity. */
const BOOT_THROTTLE_MS = 3000;

const BootContext = createContext<BootContextValue | null>(null);

export function BootProvider({ children }: { children: React.ReactNode }) {
  const [bootingPostId, setBootingPostId] = useState<number | null>(null);
  const [bootStatus, setBootStatus] = useState<BootStatus>("idle");
  const [bootError, setBootError] = useState<string | null>(null);
  const [throttled, setThrottled] = useState(false);
  const [consolidationWarningDismissed, setConsolidationWarningDismissed] = useState(false);
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Authoritative lock — synchronous read/write so concurrent claimBoot() calls
  // can't both observe null and proceed (a real risk with React's batched
  // setState updates). The `bootingPostId` state mirrors this ref for render
  // purposes (disabled buttons etc.) but is NOT the source of truth for the
  // lock. See SECURITY_AUDIT.md OBS-N2.
  const bootingPostIdRef = useRef<number | null>(null);

  const startThrottle = useCallback(() => {
    setThrottled(true);
    if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    throttleTimerRef.current = setTimeout(() => {
      setThrottled(false);
      throttleTimerRef.current = null;
    }, BOOT_THROTTLE_MS);
  }, []);

  const claimBoot = useCallback((postId: number): boolean => {
    // Atomic check-and-claim. Returns false if another boot is in flight.
    if (bootingPostIdRef.current !== null) return false;
    bootingPostIdRef.current = postId;
    setBootingPostId(postId);
    return true;
  }, []);

  const setStatus = useCallback((status: BootStatus) => {
    setBootStatus(status);
  }, []);

  const releaseBoot = useCallback(() => {
    if (failTimerRef.current) {
      clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
    }
    bootingPostIdRef.current = null;
    setBootingPostId(null);
    setBootStatus("idle");
    setBootError(null);
    startThrottle();
  }, [startThrottle]);

  const failBoot = useCallback(
    (message: string) => {
      setBootStatus("failed");
      setBootError(message);
      bootingPostIdRef.current = null;
      setBootingPostId(null);
      if (failTimerRef.current) clearTimeout(failTimerRef.current);
      failTimerRef.current = setTimeout(() => {
        setBootStatus("idle");
        setBootError(null);
        failTimerRef.current = null;
      }, 5000);
      startThrottle();
    },
    [startThrottle]
  );

  const dismissConsolidationWarning = useCallback(() => {
    setConsolidationWarningDismissed(true);
  }, []);

  return (
    <BootContext.Provider
      value={{
        bootingPostId,
        bootStatus,
        bootError,
        throttled,
        claimBoot,
        setStatus,
        releaseBoot,
        failBoot,
        consolidationWarningDismissed,
        dismissConsolidationWarning,
      }}
    >
      {children}
    </BootContext.Provider>
  );
}

export function useBootContext(): BootContextValue {
  const ctx = useContext(BootContext);
  if (!ctx) throw new Error("useBootContext must be used inside <BootProvider>");
  return ctx;
}
