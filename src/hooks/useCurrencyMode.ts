"use client";

import { useCallback, useState } from "react";

export type CurrencyMode = "noob" | "goat";

const STORAGE_KEY = "opencook_currency_mode";
const IDENTITY_ENC_KEY = "bfn_keypair_enc";

/**
 * Toggle between Noob Mode (dollars) and Goat Mode (sats).
 *
 * Persistence + defaults:
 * - If the user has explicitly toggled, their choice is stored at STORAGE_KEY
 *   and respected forever.
 * - If they have NOT toggled (no STORAGE_KEY entry), the default is derived
 *   from protection status: protected accounts default to Goat, unprotected
 *   default to Noob. Read synchronously from IDENTITY_ENC_KEY in the lazy
 *   initializer to avoid a $→sats flash on first paint.
 *
 * Components driving the post-upgrade live switch use `setModeProgrammatically`
 * — does NOT mark the user as having chosen, so a future page reload still
 * re-applies the protection-aware default.
 */
export function useCurrencyMode(): {
  mode: CurrencyMode;
  toggle: () => void;
  isGoat: boolean;
  hasUserChosen: boolean;
  setModeProgrammatically: (m: CurrencyMode) => void;
} {
  const [mode, setMode] = useState<CurrencyMode>(() => {
    if (typeof window === "undefined") return "noob";
    const stored = localStorage.getItem(STORAGE_KEY) as CurrencyMode | null;
    if (stored === "noob" || stored === "goat") return stored;
    // Inline sync check (rather than calling isIdentityEncrypted) keeps this
    // hook decoupled from the BSV services layer.
    const isProtectedSync = localStorage.getItem(IDENTITY_ENC_KEY) !== null;
    return isProtectedSync ? "goat" : "noob";
  });

  const [hasUserChosen, setHasUserChosen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) !== null;
  });

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === "noob" ? "goat" : "noob";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
    setHasUserChosen(true);
  }, []);

  const setModeProgrammatically = useCallback((m: CurrencyMode) => {
    setMode(m);
  }, []);

  return {
    mode,
    toggle,
    isGoat: mode === "goat",
    hasUserChosen,
    setModeProgrammatically,
  };
}
