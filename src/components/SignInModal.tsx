"use client";

import { useEffect, useRef, useState } from "react";
import { useIdentityContext } from "@/contexts/IdentityContext";
import { getStoredHint } from "@/services/bsv/backup-template";
import { unlockIdentity } from "@/services/bsv/identity";

/**
 * Centered sign-in modal. Opens when a locked user attempts a transaction
 * action (via requireIdentity()). On success the modal closes and the caller
 * is expected to retap their action — no auto-replay.
 *
 * Container, header, body, and button row mirror the You modal's locked-state
 * passphrase gate so both unlock surfaces feel like the same component.
 */
export function SignInModal(): React.JSX.Element | null {
  const { signInOpen, closeSignIn, updateIdentity } = useIdentityContext();

  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [storedHint, setStoredHint] = useState<string | null>(null);
  const [hintRevealed, setHintRevealed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Load hint and autofocus on open
  useEffect(() => {
    if (signInOpen) {
      setStoredHint(getStoredHint() ?? null);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [signInOpen]);

  // Tab blur — close modal and clear state (password-manager parity)
  useEffect(() => {
    if (!signInOpen) return;
    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        closeSignIn();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [signInOpen, closeSignIn]);

  // Escape key
  useEffect(() => {
    if (!signInOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeSignIn();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [signInOpen, closeSignIn]);

  // Clear state when the modal closes so a re-open is always fresh
  useEffect(() => {
    if (!signInOpen) {
      setPassphrase("");
      setError("");
      setUnlocking(false);
      setHintRevealed(false);
    }
  }, [signInOpen]);

  async function handleUnlock(): Promise<void> {
    if (!passphrase || unlocking) return;
    setUnlocking(true);
    setError("");
    try {
      const unlocked = await unlockIdentity(passphrase);
      if (!unlocked) {
        setError("Wrong passphrase, try again.");
        setShakeKey((k) => k + 1);
        setUnlocking(false);
        return;
      }
      updateIdentity(unlocked);
      closeSignIn();
    } catch {
      setError("Something went wrong — try again.");
      setUnlocking(false);
    }
  }

  if (!signInOpen) return null;

  return (
    <>
      {/* Backdrop click closes */}
      <button
        type="button"
        className="fixed inset-0 z-[80] w-full bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] cursor-default"
        aria-label="Close"
        onClick={closeSignIn}
      />

      {/* Modal — bottom sheet on mobile, centered on desktop */}
      <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div
          key={shakeKey === 0 ? "modal" : `modal-shake-${shakeKey}`}
          className={`w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-amber-400/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden pointer-events-auto ${
            shakeKey > 0 ? "animate-[shake_0.5s_ease-in-out]" : "animate-[slideUp_0.3s_ease-out]"
          }`}
          style={{ backgroundColor: "#0f0f0f" }}
        >
          {/* Gold top stripe */}
          <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

          {/* Header — mirrors You modal */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-400/10">
            <p className="text-sm font-semibold text-zinc-100">Sign in</p>
            <button
              type="button"
              onClick={closeSignIn}
              className="text-zinc-500 hover:text-zinc-200 transition-colors ml-3"
              aria-label="Close"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body — mirrors You modal locked-state */}
          <div className="px-4 py-4 space-y-3">
            <input
              ref={inputRef}
              type="password"
              placeholder="Passphrase"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && passphrase) handleUnlock();
              }}
              className="w-full bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
            />
            {storedHint &&
              (hintRevealed ? (
                <div className="border-l-2 border-amber-500/60 pl-2 py-0.5">
                  <span className="text-[11px] text-amber-400/90">Hint: {storedHint}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setHintRevealed(true)}
                  className="text-[11px] text-zinc-500 hover:text-amber-400/90 underline underline-offset-2 transition-colors"
                >
                  Need a reminder?
                </button>
              ))}
            {error && <p className="text-[11px] text-red-400">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeSignIn}
                className="flex-1 bg-zinc-900 text-zinc-400 border border-amber-400/15 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUnlock}
                disabled={!passphrase || unlocking}
                className="flex-1 bg-amber-400 text-black rounded-lg px-3 py-2 text-xs font-medium hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {unlocking ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
