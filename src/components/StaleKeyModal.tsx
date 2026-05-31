"use client";

import { useEffect, useState } from "react";
import { RestoreModal } from "@/components/RestoreModal";
import { useIdentityContext } from "@/contexts/IdentityContext";

/**
 * E30 — StaleKeyModal
 *
 * Surfaces when polling detects the locally-held key has been rotated forward
 * on-chain (typically: user rotated on another device, then opened this one).
 * Container mirrors SignInModal exactly (`max-w-sm`, gold top stripe,
 * `border-amber-400/20`, `#0f0f0f` bg) so the lock-state surfaces feel like
 * the same component family. z-[90] sits above SignInModal (z-[80]) and below
 * RestoreModal (z-[100]) so the restore flow stacks cleanly on top when the
 * user taps the primary CTA.
 *
 * Dismiss: backdrop / close X / Escape / pagehide (password-manager parity).
 * No "Maybe later" button — backdrop is the deferral path, and a labeled
 * "later" would normalise ignoring an action the user actually needs to take.
 * Once dismissed, the amber banner in PostForm takes over as the persistent
 * re-entry point; tapping that banner re-opens this modal.
 *
 * U1 escape hatch ("I don't have the newer file"): inline expand-below within
 * the same modal, link text flips to "Hide" when expanded (matches existing
 * IdentityBar "View all"/"Hide" pattern). Explanation is honest about the
 * dead end — funds and posting follow the newer key, the older key on this
 * device can't post or earn, on-chain history is intact under the newer key.
 * No "Got it" button; no "start fresh" path (out of scope for E30).
 *
 * RestoreModal is rendered independently from the stale modal so that closing
 * the stale modal (via CTA tap, backdrop, X, Escape, pagehide) does NOT
 * unmount or reset the restore flow that the CTA opened. Both modals can be
 * mounted simultaneously; RestoreModal sits at z-[100] above everything.
 */
export function StaleKeyModal(): React.JSX.Element | null {
  const { staleKeyModalOpen, closeStaleKeyModal, updateIdentity, clearStaleKey } =
    useIdentityContext();
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  // Reset ONLY the in-modal disclosure state when the stale modal closes.
  // Do NOT reset `restoreOpen` here — the "Restore recovery file" CTA closes
  // the stale modal AND opens the restore modal in the same handler. If this
  // effect also reset restoreOpen, the restore modal would unmount on the
  // very next commit (React batches the two state updates, then this effect
  // fires once because staleKeyModalOpen flipped).
  useEffect(() => {
    if (!staleKeyModalOpen) {
      setExplanationOpen(false);
    }
  }, [staleKeyModalOpen]);

  // Tab-blur / app-backgrounded — dismiss the stale modal for password-manager
  // parity. Uses `pagehide` (not `visibilitychange`) because iOS PWA fires
  // visibilitychange on keyboard transitions, which would close the modal
  // mid-interaction.
  useEffect(() => {
    if (!staleKeyModalOpen) return;
    function handleHide(): void {
      closeStaleKeyModal();
    }
    window.addEventListener("pagehide", handleHide);
    return () => window.removeEventListener("pagehide", handleHide);
  }, [staleKeyModalOpen, closeStaleKeyModal]);

  // Escape dismisses
  useEffect(() => {
    if (!staleKeyModalOpen) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") closeStaleKeyModal();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [staleKeyModalOpen, closeStaleKeyModal]);

  // Render nothing when neither modal is open. The components are siblings
  // (not parent/child) so closing the stale modal doesn't dismount the
  // restore modal.
  if (!staleKeyModalOpen && !restoreOpen) return null;

  return (
    <>
      {staleKeyModalOpen && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            className="fixed inset-0 z-[90] w-full bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] cursor-default"
            aria-label="Close"
            onClick={closeStaleKeyModal}
          />

          {/* Modal — pinned to top of viewport (iOS-native pattern, mirrors SignInModal) */}
          <div className="fixed inset-0 z-[90] flex items-start justify-center px-6 pt-[8vh] pointer-events-none">
            <div
              className="w-full max-w-sm rounded-2xl border border-amber-400/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden pointer-events-auto max-h-[80vh] overflow-y-auto animate-[slideUp_0.3s_ease-out_backwards]"
              style={{ backgroundColor: "#0f0f0f" }}
            >
              {/* Gold top stripe */}
              <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-amber-400/10">
                <p className="text-sm font-semibold text-zinc-100">This device has an older key</p>
                <button
                  type="button"
                  onClick={closeStaleKeyModal}
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

              {/* Body */}
              <div className="px-5 py-5 space-y-3">
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  Your account was upgraded to a newer key. Find your most recent recovery file to
                  continue.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setRestoreOpen(true);
                    closeStaleKeyModal();
                  }}
                  className="w-full bg-amber-400 text-black rounded-lg px-3 py-2 text-xs font-medium hover:bg-amber-300 transition-colors"
                >
                  Restore recovery file
                </button>

                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  You&apos;ll need to do this on each device where BSVibes is open.
                </p>

                {/* U1 escape-hatch trigger — recessive link, inline expand-below */}
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setExplanationOpen((v) => !v)}
                    className="text-[11px] text-zinc-500 underline underline-offset-2 hover:text-zinc-400 transition-colors"
                  >
                    {explanationOpen ? "Hide" : "I don't have the newer file"}
                  </button>
                </div>

                {/* U1 explanation — honest, no recovery promise, no "support" hook */}
                {explanationOpen && (
                  <div className="border-t border-zinc-800 mt-3 pt-3 space-y-2">
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Your account was upgraded to a newer key on another device. That key now
                      controls your posting and any earnings going forward.
                    </p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      The key on this device is an older one. It no longer has posting authority,
                      and earnings do not flow back to it.
                    </p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Your posts are still on-chain and visible. Only the key that holds the newer
                      file can post or earn under your account.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* RestoreModal at z-[100] — stacks above the stale modal when both are
          open (mid-transition between CTA tap and stale-modal close), and
          stands alone after the stale modal closes. currentIdentity is
          intentionally null: RestoreModal's E30 bypass (RestoreModal.tsx
          ~line 192) treats null as "stale-key flow, skip the save-outgoing-
          key prompt because the stale key has no posting authority and the
          user already had it on this device — there's nothing worth saving
          here that they didn't already have." onSuccess commits the new
          identity to React state via updateIdentity, which transitions
          staleKey → ready in one shot (avoiding a re-open loop where the
          OLD pubkey would otherwise be re-polled and re-flagged stale). */}
      {restoreOpen && (
        <RestoreModal
          isOpen={restoreOpen}
          onClose={() => setRestoreOpen(false)}
          onSuccess={(imported) => {
            updateIdentity(imported);
            clearStaleKey();
            setRestoreOpen(false);
          }}
          currentIdentity={null}
          isProtected={false}
          reAuthPassphrase=""
        />
      )}
    </>
  );
}
