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
import {
  clearSessionCaches,
  getIdentity,
  importEncryptedIdentity,
  importIdentity,
} from "@/services/bsv/identity";
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
  /**
   * E30: true when the locally-held key has a forward migration on-chain.
   * When true, `requireIdentity()` opens the StaleKeyModal (instead of
   * SignInModal) and returns false — UI mutation handlers refuse to proceed
   * until the user restores their newer recovery file. The underlying
   * `identity` accessor still returns the cached key so non-signing reads
   * (chip name, address) continue to work.
   */
  staleKey: boolean;
  /**
   * E30: mark the active identity stale (called by the polling layer when the
   * server reports `key_status.stale === true`). Idempotent — no-op if already
   * stale, if no identity is loaded, or if `isSessionClearBlocked()` is true
   * (which means a rotation flow on THIS device is mid-flight; the polling
   * layer must not flag its own freshly-rotated key as stale before the
   * commit completes). Safe to call from any context that already holds an
   * identity reference.
   */
  markIdentityStale: () => void;
  /**
   * E30: clear `staleKey` (transition back to `ready`). Called when the user
   * restores their newer key in the same tab via `acceptRestoredIdentity`,
   * which fires after `updateIdentity` — `clearStaleKey` is exposed for
   * callers that need to drop stale state without changing the identity
   * itself (rare; primarily an escape hatch for tests + future flows).
   */
  clearStaleKey: () => void;
  sign: (content: string) => Promise<{ signature: string; pubkey: string } | null>;
  updateIdentity: (newIdentity: Identity) => void;
  /**
   * SINGLE entry point for the welcome gate to commit a restored identity.
   * Branches internally on whether a passphrase was used to decrypt the
   * source file:
   * - With `passphrase` → calls `importEncryptedIdentity` so the new identity
   *   is protected by the same passphrase the user just typed, with the
   *   file's hint preserved (E28c — matches RestoreModal's behavior).
   * - Without `passphrase` → calls `importIdentity` (plaintext path).
   *
   * Both internally write localStorage, clear/set the encrypted store, and
   * prime session caches. Then commits the result to React state. Callers
   * MUST use this instead of calling the underlying functions directly.
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

  // E30 stub opener: replaced in E30b with a real `setStaleModalOpen(true)`.
  // Kept in E30a as an explicit no-op so the staleKey branch in
  // `requireIdentity()` is a complete, type-checked code path — not a TODO.
  // Without an opener call, callers in staleKey state would silently fail
  // the mutation with no UI feedback (which is the wrong shape even though
  // E30a never reaches this branch in practice).
  const openStaleKeyModal = useCallback(() => {
    // Intentional no-op until E30b mounts <StaleKeyModal />.
  }, []);

  const requireIdentity = useCallback((): boolean => {
    // E30: stale-key state takes precedence over both "has identity" and
    // "needs sign-in" — even with a non-null identity reference, the
    // underlying key has been rotated forward on-chain and signing would
    // produce posts/boots attributed to a revoked key. Open the StaleKeyModal
    // (via the opener stub — replaced with `setStaleModalOpen(true)` in E30b)
    // instead of allowing the action through.
    if (identityValue.staleKey) {
      openStaleKeyModal();
      return false;
    }
    if (identityValue.identity) return true;
    setSignInOpen(true);
    return false;
  }, [identityValue.identity, identityValue.staleKey, openStaleKeyModal]);

  // E30 (F3 mitigation): suppress the stale-key transition while a rotation
  // flow is mid-flight on THIS device. MoveAddressModal / ChangePassphraseModal
  // call `blockSessionClear()` while rotating; the poll layer can fire a
  // stale signal between the migration-record write and the local
  // `commitUpgrade()` call, which would race-flag our OWN newly-rotated key
  // as stale on this device. The block window covers exactly that gap.
  // Wraps the hook's raw transition so the context is the single chokepoint
  // for the rule.
  const hookMarkStale = identityValue.markIdentityStale;
  const markIdentityStale = useCallback(() => {
    if (sessionClearBlockedRef.current > 0) return;
    hookMarkStale();
  }, [hookMarkStale]);

  const acceptRestoredIdentity = useCallback(
    async (wif: string, name?: string, passphrase?: string, hint?: string): Promise<Identity> => {
      // Branch on whether the file the user just restored was encrypted (and
      // they typed a passphrase to decrypt it). Mirrors RestoreModal's pattern:
      // - With passphrase → re-encrypt the new identity with the same passphrase
      //   (importEncryptedIdentity primes _sessionIdentity AND writes the
      //   encrypted store with the file's hint preserved).
      // - Without passphrase → plaintext path (importIdentity).
      //
      // Both functions are the SINGLE entry points for their respective shapes —
      // they handle WIF validation, address derivation, localStorage write,
      // encrypted-store toggling, and session cache priming. Duplicating that
      // logic here would risk drift.
      const identity = passphrase
        ? await importEncryptedIdentity(wif, passphrase, name, hint)
        : await importIdentity(wif, name);
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
    // Override hook's raw markIdentityStale with the context-level wrapper
    // that enforces the isSessionClearBlocked() guard.
    markIdentityStale,
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
