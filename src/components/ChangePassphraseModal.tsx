"use client";

import { useState } from "react";
import { migrateIdentity, verifyMigrationChain } from "@/app/actions";
import { type BackupData, downloadBackup, getStoredHint } from "@/services/bsv/backup-template";
import { encryptWif } from "@/services/bsv/crypto";
import { commitUpgrade, unlockIdentity, upgradeIdentity } from "@/services/bsv/identity";
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

  function handleClose() {
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
    try {
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
        throw new Error("Migration failed — passphrase change aborted.");
      }

      commitUpgrade(result.encStore, result.identity);

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
      setError("Something went wrong — try again");
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

      {/* Modal — full-height wizard bottom sheet on mobile, centered on desktop.
          flex flex-col so done-state buttons can pin to bottom via mt-auto. */}
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div
          className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-amber-400/20 shadow-2xl overflow-hidden pointer-events-auto animate-[slideUp_0.3s_ease-out] min-h-[80vh] sm:min-h-0 flex flex-col overflow-y-auto"
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
          <div className="px-4 py-4 space-y-3">
            {step === "done" ? (
              <>
                <div className="border-l-2 border-amber-500/60 pl-2.5 py-0.5">
                  <p className="text-[11px] text-amber-400/90 leading-relaxed">
                    Your new recovery file should have downloaded &mdash; check your downloads
                    folder before continuing. This file contains both your old and new key &mdash;
                    keep it somewhere safe.
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
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
                    <span className="text-[11px] text-amber-400/90">💡 {storedHint}</span>
                  </div>
                )}
                {error && <p className="text-[11px] text-red-400">{error}</p>}
                <div className="flex gap-2 pt-1">
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

                <div className="flex gap-2 pt-1">
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
