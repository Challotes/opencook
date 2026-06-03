"use client";

import { useEffect, useRef, useState } from "react";
import { migrateIdentity, verifyMigrationChain } from "@/app/actions";
import { useIdentityContext } from "@/contexts/IdentityContext";
import { useInstallContext } from "@/contexts/InstallContext";
import { type BackupData, downloadBackup, getStoredHint } from "@/services/bsv/backup-template";
import { encryptWif } from "@/services/bsv/crypto";
import {
  commitUpgrade,
  derivePubkeyFromWif,
  unlockIdentity,
  upgradeIdentity,
} from "@/services/bsv/identity";
import type { Identity } from "@/types";

interface ChangePassphraseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newIdentity: Identity, transferMsg: string | null) => void;
  currentIdentity: Identity;
  /**
   * Passphrase that was already verified at the parent gate (manage modal entry).
   * When provided, the verify step is skipped — user goes straight to newpass entry.
   */
  preVerifiedPassphrase?: string;
}

export function ChangePassphraseModal({
  isOpen,
  onClose,
  onSuccess,
  currentIdentity,
  preVerifiedPassphrase,
}: ChangePassphraseModalProps): React.JSX.Element | null {
  const [step, setStep] = useState<"verify" | "newpass" | "done">(
    preVerifiedPassphrase ? "newpass" : "verify"
  );
  // Store BackupData from successful change so "Download again" can re-fire it
  const [doneBackup, setDoneBackup] = useState<Parameters<typeof downloadBackup>[0] | null>(null);
  const [currentPass, setCurrentPass] = useState(preVerifiedPassphrase ?? "");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [chainWarning, setChainWarning] = useState(false);

  // Suppress pagehide-driven session wipe from the moment rotation starts until
  // the user dismisses "done". iOS Save-Password sheet on PWA fires pagehide;
  // without this the encrypted store unlocks but the in-memory session is
  // torched and the modal renders into a re-locked state.
  const { blockSessionClear, unblockSessionClear } = useIdentityContext();
  const blockedRef = useRef(false);
  const block = () => {
    if (!blockedRef.current) {
      blockedRef.current = true;
      blockSessionClear();
    }
  };
  const unblock = () => {
    if (blockedRef.current) {
      blockedRef.current = false;
      unblockSessionClear();
    }
  };
  // Safety net: if the modal unmounts mid-flow without handleClose firing
  // (e.g., parent re-renders the tree), make sure we release our block.
  useEffect(() => {
    return () => {
      if (blockedRef.current) {
        blockedRef.current = false;
        unblockSessionClear();
      }
    };
  }, [unblockSessionClear]);

  // E32: block the install pitch while this modal is mounted (prevents the
  // pitch from sliding up over the done state when the user saves their new
  // recovery file). Released on unmount → install pitch fires at a clean
  // moment. Also call refreshProtected after commitUpgrade so the gate's
  // protected condition flips for users who passphrase-changed.
  const { blockInstallPitch, unblockInstallPitch, refreshProtected } = useInstallContext();
  useEffect(() => {
    blockInstallPitch();
    return () => unblockInstallPitch();
  }, [blockInstallPitch, unblockInstallPitch]);

  function handleClose() {
    unblock();
    setStep(preVerifiedPassphrase ? "newpass" : "verify");
    setCurrentPass(preVerifiedPassphrase ?? "");
    setNewPass("");
    setConfirmPass("");
    setHint("");
    setError("");
    setChainWarning(false);
    setDoneBackup(null);
    onClose();
  }

  async function handleVerify() {
    setWorking(true);
    setError("");
    try {
      const unlocked = await unlockIdentity(currentPass);
      if (!unlocked) {
        setError("Wrong passphrase");
        setWorking(false);
        return;
      }
      setStep("newpass");
    } catch {
      setError("Something went wrong");
    } finally {
      setWorking(false);
    }
  }

  async function handleChange() {
    if (newPass.length < 8) {
      setError("Passphrase must be at least 8 characters");
      return;
    }
    if (newPass !== confirmPass) {
      setError("Passphrases don't match");
      return;
    }
    if (newPass === currentPass) {
      setError("New passphrase must be different");
      return;
    }

    // Pre-rotation chain verification
    if (!chainWarning) {
      try {
        const { PrivateKey } = await import("@bsv/sdk");
        const currentPubkey = PrivateKey.fromWif(currentIdentity.wif).toPublicKey().toString();
        const chain = await verifyMigrationChain(currentPubkey);
        if (!chain.healthy) {
          setError(
            `Warning: ${chain.orphanedCount} of your previous identities may lose their connection to your posts. Tap "Change passphrase" again to proceed anyway.`
          );
          setChainWarning(true);
          return;
        }
      } catch {
        // Non-blocking
      }
    }

    setWorking(true);
    setError("");
    // Hold the session lock from this point through the "done" step — iOS may
    // fire pagehide on its Save-Password sheet. Released in handleClose.
    block();
    try {
      // E31 client-side preflight: reject rotation if the current key has a
      // forward migration on-chain. Without this check, `upgradeIdentity`
      // would run the sweep BEFORE the server-side `migrateIdentity` reject
      // — leaving funds at a new address the server can't recognise.
      // Fail-CLOSED on network errors so we don't proceed without verification.
      try {
        const currentPubkey = await derivePubkeyFromWif(currentIdentity.wif);
        const res = await fetch(
          `/api/restore-eligibility?pubkey=${encodeURIComponent(currentPubkey)}`
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { allowed: boolean };
        if (!data.allowed) {
          setError(
            "This key has already been replaced on another device. Restore your most recent recovery file to continue."
          );
          setWorking(false);
          return;
        }
      } catch (e) {
        // Bind the error so it can be logged for debugging — the user-facing
        // copy stays generic (network failure, server hiccup, etc.) but we
        // preserve the actual error in the console so future production
        // issues can be traced. E31 auditor Low finding follow-up.
        console.error("[BSVibes] ChangePassphraseModal: eligibility check failed", e);
        setError("Couldn't verify your key — check your connection and try again.");
        setWorking(false);
        return;
      }

      const result = await upgradeIdentity(
        newPass,
        currentIdentity.wif,
        currentIdentity.name,
        hint.trim() || undefined
      );

      const migrationResult = await migrateIdentity(
        result.migration.oldPubkey,
        result.migration.newPubkey,
        result.migration.migrationSignature,
        result.migration.migrationMessage
      );

      if (!migrationResult.success) {
        // E31: surface the stale-key case with specific copy. Other failure
        // reasons fall through to the generic catch-block message.
        if (migrationResult.reason === "stale_key") {
          throw new Error(
            "This key has already been replaced on another device. Restore your most recent recovery file to continue."
          );
        }
        throw new Error("Migration failed — passphrase change aborted.");
      }

      commitUpgrade(result.encStore, result.identity);
      // E32: protection state didn't change here (user was already protected
      // — this is a passphrase CHANGE not an UPGRADE), but call for parity
      // with MoveAddressModal's pattern. Cheap idempotent re-read.
      refreshProtected();

      const newIdentity = result.identity;
      let encryptedWif: string;
      try {
        const parsedStore = JSON.parse(result.encStore) as { encrypted?: string };
        encryptedWif = parsedStore.encrypted ?? (await encryptWif(newIdentity.wif, newPass));
      } catch {
        encryptedWif = await encryptWif(newIdentity.wif, newPass);
      }
      const backupPayload: BackupData = {
        name: newIdentity.name,
        address: newIdentity.address,
        wif_encrypted: encryptedWif,
        // oldAddress intentionally undefined — passphrase rotation keeps the same address
        pathType: "rotation",
        createdAt: new Date().toISOString(),
        note: "Use your new passphrase to restore.",
      };
      if (hint.trim()) backupPayload.hint = hint.trim();
      backupPayload.oldWif_encrypted = await encryptWif(currentIdentity.wif, newPass);

      downloadBackup(backupPayload);
      setDoneBackup(backupPayload);

      let transferMsg: string | null = null;
      if (result.fundTransfer.txid) {
        const sats = result.fundTransfer.transferredSats.toLocaleString();
        transferMsg = `Transferred ${sats} sats to your new address.`;
      } else if (result.fundTransfer.error) {
        transferMsg = `Note: fund transfer failed — ${result.fundTransfer.error}. Your previous key is in the recovery file.`;
      } else if (result.fundTransfer.noFunds) {
        transferMsg = `No funds found at your previous address — nothing to transfer.`;
      }

      onSuccess(newIdentity, transferMsg);
      setStep("done");
    } catch (e) {
      // Preserve specific error messages (e.g. E31 stale-key copy) when the
      // thrown error already carries actionable user-facing text. Generic
      // failures fall back to the boilerplate message.
      const msg = e instanceof Error ? e.message : "";
      setError(
        msg && msg !== "Migration failed — passphrase change aborted."
          ? msg
          : "Something went wrong — try again"
      );
      console.error("BSVibes: passphrase change failed", e);
    } finally {
      setWorking(false);
    }
  }

  if (!isOpen) return null;

  const storedHint = getStoredHint();

  return (
    <>
      {/* Backdrop — full-screen click target for dismiss */}
      <button
        type="button"
        className="fixed inset-0 z-[60] w-full bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] cursor-default"
        aria-label="Close modal"
        onClick={handleClose}
      />

      {/* Modal — pinned to top of viewport (iOS-native pattern). Does
          NOT track the keyboard; sits above where it slides up. */}
      <div className="fixed inset-0 z-[60] flex items-start justify-center px-6 pt-[6svh] pointer-events-none">
        <div
          className="w-full max-w-md rounded-2xl border border-amber-400/20 shadow-2xl overflow-hidden pointer-events-auto animate-[slideUp_0.3s_ease-out_backwards] max-h-[80svh] flex flex-col overflow-y-auto"
          style={{ backgroundColor: "#0f0f0f" }}
        >
          <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-400/10">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Change passphrase</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {step === "verify"
                  ? "Verify your current passphrase first"
                  : "A new recovery file will be downloaded"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
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
            {step === "done" ? (
              <>
                <div className="border-l-2 border-amber-500/60 pl-2.5 py-0.5">
                  <p className="text-[11px] text-amber-400/90 leading-relaxed">
                    Your new recovery file should have downloaded &mdash; check your downloads
                    folder before continuing. This file contains both your old and new key &mdash;
                    keep it somewhere safe.
                  </p>
                </div>
                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (doneBackup) downloadBackup(doneBackup);
                    }}
                    className="flex-1 bg-zinc-900 text-zinc-300 border border-amber-400/20 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-800 transition-colors"
                  >
                    Download again
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 bg-amber-500/10 text-amber-400 border border-amber-500/40 rounded-lg px-3 py-2 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </>
            ) : step === "verify" ? (
              <>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Current passphrase"
                  value={currentPass}
                  onChange={(e) => {
                    setCurrentPass(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && currentPass) handleVerify();
                  }}
                  className="w-full bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
                />
                {storedHint && (
                  <div className="border-l-2 border-amber-500/60 pl-2 py-0.5">
                    <span className="text-[11px] text-amber-400/90">Hint: {storedHint}</span>
                  </div>
                )}
                {error && <p className="text-[11px] text-red-400">{error}</p>}
                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 bg-zinc-900 text-zinc-400 border border-amber-400/15 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={!currentPass || working}
                    className="flex-1 bg-amber-400 text-black rounded-lg px-3 py-2 text-xs font-medium hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {working ? "Checking..." : "Continue"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] text-amber-400/80 leading-relaxed">
                  Your old recovery file will stop working. A new one will be downloaded.
                </p>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="New passphrase (min 8 characters)"
                  value={newPass}
                  onChange={(e) => {
                    setNewPass(e.target.value);
                    setError("");
                  }}
                  className="w-full bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm new passphrase"
                  value={confirmPass}
                  onChange={(e) => {
                    setConfirmPass(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      newPass.length >= 8 &&
                      newPass === confirmPass &&
                      !working
                    )
                      handleChange();
                  }}
                  className="w-full bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
                />

                {/* Memory clue — always visible, amber accent */}
                <div className="border-l-2 border-amber-500/60 pl-2.5 space-y-1">
                  <label
                    htmlFor="change-hint"
                    className="text-[11px] text-amber-400/80 font-medium block"
                  >
                    Memory clue
                  </label>
                  <input
                    id="change-hint"
                    type="text"
                    placeholder={`e.g. "blue house + 2019"`}
                    value={hint}
                    maxLength={100}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    onChange={(e) => setHint(e.target.value)}
                    className="w-full bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
                  />
                  <p className="text-[10px] text-zinc-600">
                    Only you should know what this means &mdash; it&apos;s stored unprotected in
                    your recovery file.
                  </p>
                </div>

                {error && <p className="text-[11px] text-red-400">{error}</p>}

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 bg-zinc-900 text-zinc-400 border border-amber-400/15 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleChange}
                    disabled={
                      newPass.length < 8 || newPass !== confirmPass || !hint.trim() || working
                    }
                    className="flex-1 bg-amber-400 text-black rounded-lg px-3 py-2 text-xs font-medium hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {working ? "Changing..." : "Change passphrase"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
