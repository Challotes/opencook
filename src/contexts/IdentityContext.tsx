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
import { useIdentity } from "@/hooks/useIdentity";
import { detectStandalone } from "@/hooks/useStandaloneMode";
import { clearSessionCaches, getIdentity, importEncryptedIdentity } from "@/services/bsv/identity";
import type { Identity } from "@/types";

interface IdentityContextValue {
  identity: Identity | null;
  isLoading: boolean;
  needsUnlock: boolean;
  /**
   * True when running in standalone (installed PWA) mode AND no identity exists.
   * The wrapper renders `<HomeScreenWelcomeGate>` instead of the feed when true.
   * See LAUNCH_PLAN.md sequencing revision (2026-05-11) + DECISIONS.md
   * "Welcome gate fires when standalone-mode + no identity."
   */
  awaitingWelcomeGate: boolean;
  sign: (content: string) => Promise<{ signature: string; pubkey: string } | null>;
  updateIdentity: (newIdentity: Identity) => void;
  /**
   * SINGLE entry point for the welcome gate to commit a restored identity.
   * Every supported recovery file is encrypted, so a `passphrase` is always
   * present: it calls `importEncryptedIdentity` so the new identity is protected
   * by the same passphrase the user just typed to decrypt the file, with the
   * file's hint preserved (E28c). Restoring without a passphrase is no longer
   * supported (the parser rejects legacy plaintext files) — it throws.
   *
   * `importEncryptedIdentity` writes localStorage, sets the encrypted store, and
   * primes session caches. Then commits the result to React state. Callers MUST
   * use this instead of calling the underlying functions directly.
   *
   * Async to allow the gate to await the result before unmounting itself.
   */
  acceptRestoredIdentity: (
    wif: string,
    name?: string,
    passphrase?: string,
    hint?: string
  ) => Promise<Identity>;
  // Sign-in modal
  signInOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;
  /**
   * Block the `pagehide → clearSessionCaches()` handler from wiping the in-memory
   * session AND any other visibility-related teardown that should pause during
   * flows where iOS may fire a system sheet (Save Password, Share, Files picker)
   * that triggers pagehide / visibilitychange on a standalone PWA — those
   * background blips would otherwise torch the active rotation mid-flow.
   *
   * Ref-counted so nested callers compose safely. Always pair every
   * `blockSessionClear()` with a corresponding `unblockSessionClear()` (use a
   * cleanup in the same effect, or unblock in the modal's close path).
   *
   * `isSessionClearBlocked()` is the reader used by other visibility handlers
   * (e.g. the You modal's `visibilitychange→manageAuthed=false` teardown in
   * IdentityBar). Sharing one ref keeps the block surface coherent across
   * every page-occlusion-driven cleanup we have.
   */
  blockSessionClear: () => void;
  unblockSessionClear: () => void;
  isSessionClearBlocked: () => boolean;
  /**
   * Gate for any transaction-requiring action. Returns true if signed in,
   * otherwise opens <SignInModal> and returns false. Use at the top of every
   * handler that needs a signed BSV identity (post, boot, tip, future):
   *
   *   const { identity, requireIdentity } = useIdentityContext();
   *   if (!requireIdentity() || !identity) return;
   *   // identity is non-null here — proceed with sign / spend
   *
   * Do NOT call signPost, clientSideBoot, or any other wif-using service
   * from a UI handler without this gate. See CLAUDE.md "Universal pattern".
   */
  requireIdentity: () => boolean;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const identityValue = useIdentity();
  const [signInOpen, setSignInOpen] = useState(false);

  const openSignIn = useCallback(() => setSignInOpen(true), []);
  const closeSignIn = useCallback(() => setSignInOpen(false), []);

  // Ref-counted suppression of pagehide-driven session clearing. Ref (not
  // state) so the pagehide handler reads the live value without re-binding
  // the listener on every change, and so blockers don't trigger renders.
  const sessionClearBlockedRef = useRef(0);
  const blockSessionClear = useCallback(() => {
    sessionClearBlockedRef.current += 1;
  }, []);
  const unblockSessionClear = useCallback(() => {
    sessionClearBlockedRef.current = Math.max(0, sessionClearBlockedRef.current - 1);
  }, []);
  const isSessionClearBlocked = useCallback(() => sessionClearBlockedRef.current > 0, []);

  const requireIdentity = useCallback((): boolean => {
    if (identityValue.identity) return true;
    setSignInOpen(true);
    return false;
  }, [identityValue.identity]);

  const acceptRestoredIdentity = useCallback(
    async (wif: string, name?: string, passphrase?: string, hint?: string): Promise<Identity> => {
      // Every supported recovery file is encrypted, so the user always typed a
      // passphrase to decrypt it. Re-encrypt the new identity under that same
      // passphrase (importEncryptedIdentity primes _sessionIdentity AND writes
      // the encrypted store with the file's hint preserved). It is the SINGLE
      // entry point for this shape — it handles WIF validation, address
      // derivation, localStorage write, encrypted-store set, and cache priming.
      // Plaintext restore is no longer supported (the parser rejects legacy
      // plaintext files upstream); guard defensively.
      if (!passphrase) {
        throw new Error("This recovery file is no longer supported.");
      }
      const identity = await importEncryptedIdentity(wif, passphrase, name, hint);
      // updateIdentity transitions the state machine to `kind: "ready"`,
      // simultaneously clearing whatever state was previously active
      // (awaitingWelcomeGate, needsUnlock, or loading).
      identityValue.updateIdentity(identity);
      return identity;
    },
    [identityValue.updateIdentity]
  );

  // Real backgrounding → clear in-memory session caches (parity with You
  // modal password-manager pattern). Only fires in standalone mode where
  // the app can stay open in the background for long periods.
  //
  // Uses `pagehide` instead of `visibilitychange` because the latter fires
  // on transient hides on iOS PWA — including keyboard transitions — which
  // wiped the session mid-transaction. `pagehide` fires only on real page
  // unloads and app-backgrounding events.
  //
  // detectStandalone() is read INSIDE the handler (not captured in closure)
  // so iPad Stage Manager transitions between modes are caught correctly.
  useEffect(() => {
    function handleHide(): void {
      // Suppress during rotation/save-password flows — iOS fires pagehide on
      // its own system sheets (Save Password, Share, Files picker) even
      // though the user hasn't really backgrounded the app.
      if (sessionClearBlockedRef.current > 0) return;
      if (detectStandalone()) {
        clearSessionCaches();
      }
    }
    window.addEventListener("pagehide", handleHide);
    return () => window.removeEventListener("pagehide", handleHide);
  }, []);

  // Cross-tab identity sync — if another tab in the same sandbox writes an
  // identity (e.g., user completed restore in tab A while tab B was open),
  // re-read it and commit to this tab's state. Idempotent: both tabs converge
  // on the same WIF/address.
  //
  // `clearSessionCaches()` runs FIRST so `getIdentity` reflects what's actually
  // in localStorage right now, not this tab's stale in-memory cache. Without it,
  // a logout-or-rotate in tab A could leave tab B re-committing its old session
  // identity because `_sessionIdentity` short-circuits the storage read.
  useEffect(() => {
    function handleStorage(e: StorageEvent): void {
      if (e.key === "bfn_keypair" || e.key === "bfn_keypair_enc") {
        clearSessionCaches();
        getIdentity({ allowAutoGen: false })
          .then((id) => {
            if (id) identityValue.updateIdentity(id);
          })
          .catch(() => {
            /* non-fatal — local state stays as-is */
          });
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [identityValue.updateIdentity]);

  const contextValue: IdentityContextValue = {
    ...identityValue,
    acceptRestoredIdentity,
    signInOpen,
    openSignIn,
    closeSignIn,
    requireIdentity,
    blockSessionClear,
    unblockSessionClear,
    isSessionClearBlocked,
  };

  return <IdentityContext.Provider value={contextValue}>{children}</IdentityContext.Provider>;
}

export function useIdentityContext(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error("useIdentityContext must be used inside <IdentityProvider>");
  }
  return ctx;
}

/**
 * Ergonomic hook for components that need both the identity and a guard.
 * Usage:
 *   const { identity, requireIdentity } = useRequiresIdentity();
 *   function handleAction() {
 *     if (!requireIdentity()) return;   // opens modal if locked, returns false
 *     // identity is non-null here
 *   }
 */
export function useRequiresIdentity(): {
  identity: Identity | null;
  requireIdentity: () => boolean;
} {
  const ctx = useIdentityContext();
  return { identity: ctx.identity, requireIdentity: ctx.requireIdentity };
}
