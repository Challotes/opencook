"use client";

import { useRef, useState } from "react";
import { migrateIdentity, verifyMigrationChain } from "@/app/actions";
import { useKeyboardOffset } from "@/hooks/useVisualViewport";
import { type BackupData, downloadBackup, getStoredHint } from "@/services/bsv/backup-template";
import { encryptWif } from "@/services/bsv/crypto";
import { commitUpgrade, sweepFunds, upgradeIdentity } from "@/services/bsv/identity";
import type { Identity } from "@/types";

interface MoveAddressModalProps {
  identity: Identity;
  isProtected: boolean;
  passphrase: string; // old passphrase for backup encryption (empty if unprotected)
  onComplete: (newIdentity: Identity) => void;
  onClose: () => void;
}

type Stage = "passphrase" | "creating" | "sweep-failed" | "recording" | "done" | "error";
type ErrorStage = "creating" | "recording";

interface StepState {
  heading: string;
  description: string;
}

const COMPLETED_STEPS: Record<ErrorStage, StepState> = {
  creating: {
    heading: "New key ready",
    description: "Your name, posts, earnings, and future payouts follow automatically.",
  },
  recording: {
    heading: "Move recorded on-chain",
    description: "Anyone can verify your old and new keys belong to the same identity.",
  },
};

// Spinners / checkmarks as inline SVG
function SpinnerIcon() {
  return (
    <svg
      className="animate-spin w-4 h-4 text-amber-400 shrink-0 mt-0.5"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg
      className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CompletedStep({ heading, description, variant }: StepState & { variant?: "warn" }) {
  return (
    <div className="flex items-start gap-2.5">
      {variant === "warn" ? <WarnIcon /> : <CheckIcon />}
      <div>
        <p
          className={`text-xs font-medium ${variant === "warn" ? "text-amber-400" : "text-zinc-400"}`}
        >
          {heading}
        </p>
        <p
          className={`text-[10px] mt-0.5 ${variant === "warn" ? "text-amber-400/70" : "text-zinc-600"}`}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

function ActiveStep({ heading, description }: StepState) {
  return (
    <div className="flex items-start gap-2.5">
      <SpinnerIcon />
      <div>
        <p className="text-xs font-semibold text-zinc-100">{heading}</p>
        <p className="text-[11px] text-zinc-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export function MoveAddressModal({
  identity,
  isProtected,
  passphrase,
  onComplete,
  onClose,
}: MoveAddressModalProps): React.JSX.Element {
  const [stage, setStage] = useState<Stage>("passphrase");
  const [errorStage, setErrorStage] = useState<ErrorStage | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [sweepWarning, setSweepWarning] = useState(false);
  const [chainWarning, setChainWarning] = useState("");

  // New passphrase for the rotated key
  const [newPass, setNewPass] = useState("");
  const [confirmNewPass, setConfirmNewPass] = useState("");
  const [newHint, setNewHint] = useState("");
  const [passError, setPassError] = useState("");

  // Track which steps have completed — drives the progress dots and step list
  const [completedSteps, setCompletedSteps] = useState(0);

  // Store upgradeIdentity result so later stages can use it
  const upgradeResultRef = useRef<Awaited<ReturnType<typeof upgradeIdentity>> | null>(null);
  // Store the combined BackupData from runRecording so "Download again" can re-fire it
  const combinedBackupRef = useRef<Parameters<typeof downloadBackup>[0] | null>(null);
  // Pre-rotation backup payload, built in submitPassphrase and held in memory.
  // We deliberately DON'T fire the download here — it's only emitted from
  // error states (runCreating / runRecording failure) so the user gets the
  // safety net when they actually need it. In the happy path, the final
  // combined recovery file at done-state supersedes this entirely.
  const preRotationBackupRef = useRef<BackupData | null>(null);

  const kbd = useKeyboardOffset();

  // ── Stage runners ──────────────────────────────────────────────────────────

  async function buildPreRotationBackup(): Promise<BackupData> {
    if (isProtected && passphrase) {
      const encBackup = await encryptWif(identity.wif, passphrase);
      const backupPayload: BackupData = {
        name: identity.name,
        address: identity.address,
        wif_encrypted: encBackup,
        pathType: "pre-rotation",
        createdAt: new Date().toISOString(),
        note: "Previous identity — may hold unconfirmed UTXOs until mempool clears.",
      };
      const hint = getStoredHint();
      if (hint) backupPayload.hint = hint;
      return backupPayload;
    }
    const backupPayload: BackupData = {
      name: identity.name,
      address: identity.address,
      wif: identity.wif,
      pathType: "pre-rotation",
      createdAt: new Date().toISOString(),
      note: "Previous identity — may hold unconfirmed UTXOs until mempool clears.",
    };
    const hint = getStoredHint();
    if (hint) backupPayload.hint = hint;
    return backupPayload;
  }

  function downloadPreRotationBackup(): void {
    if (preRotationBackupRef.current) downloadBackup(preRotationBackupRef.current);
  }

  async function submitPassphrase(): Promise<void> {
    setPassError("");
    if (newPass.length < 8) {
      setPassError("Passphrase must be at least 8 characters");
      return;
    }
    if (newPass !== confirmNewPass) {
      setPassError("Passphrases don't match");
      return;
    }
    if (isProtected && passphrase && newPass === passphrase) {
      setPassError("Same as your current passphrase");
      return;
    }
    if (!newHint.trim()) {
      setPassError("Add a memory clue — it's your only reminder if you forget.");
      return;
    }
    // Pre-rotation chain verification — moved here from the dropped saved-confirm
    // stage. If unhealthy, surface the warning inline; user can tap submit again
    // to proceed anyway.
    if (!chainWarning) {
      try {
        const { PrivateKey } = await import("@bsv/sdk");
        const currentPubkey = PrivateKey.fromWif(identity.wif).toPublicKey().toString();
        const chain = await verifyMigrationChain(currentPubkey);
        if (!chain.healthy) {
          setChainWarning(
            `${chain.orphanedCount} of your previous identities may lose their connection to your posts.`
          );
          return;
        }
      } catch {
        // Non-blocking — proceed if verification fails
      }
    }
    setChainWarning("");

    // Build the pre-rotation backup payload in memory. NOT downloaded — only
    // emitted if rotation fails mid-flight (see error branches below).
    try {
      preRotationBackupRef.current = await buildPreRotationBackup();
    } catch (e) {
      setPassError(
        e instanceof Error ? e.message : "Couldn't prepare the rotation. Please try again."
      );
      return;
    }
    void runCreating();
  }

  async function runCreating(): Promise<void> {
    setStage("creating");
    try {
      // Reuse a prior result if one exists — retry reuses the same key
      if (!upgradeResultRef.current) {
        const result = await upgradeIdentity(
          newPass,
          identity.wif,
          identity.name,
          newHint.trim() || undefined
        );
        upgradeResultRef.current = result;
      }

      const result = upgradeResultRef.current;

      // Sweep failure blocks the rotation — user must retry or explicitly proceed
      if (result.fundTransfer.error) {
        setSweepWarning(true);
        setErrorMessage(result.fundTransfer.error);
        setStage("sweep-failed");
        return;
      }

      if (result.fundTransfer.noFunds) {
        setSweepWarning(false);
      }

      setCompletedSteps(1);
      await runRecording();
    } catch (e) {
      setStage("error");
      setErrorStage("creating");
      setErrorMessage(
        e instanceof Error ? e.message : "Failed to create new address. Please try again."
      );
    }
  }

  async function retrySweep(): Promise<void> {
    if (!upgradeResultRef.current) return;
    setStage("creating");
    setErrorMessage("");
    try {
      const result = upgradeResultRef.current;
      const oldAddress = identity.address;
      const newAddress = result.identity.address;
      const sweepResult = await sweepFunds(identity.wif, oldAddress, newAddress);

      upgradeResultRef.current = { ...result, fundTransfer: sweepResult };

      if (sweepResult.error) {
        setSweepWarning(true);
        setErrorMessage(sweepResult.error);
        setStage("sweep-failed");
        return;
      }

      setSweepWarning(false);
      setCompletedSteps(1);
      await runRecording();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Sweep retry failed. Please try again.");
      setStage("sweep-failed");
    }
  }

  function proceedWithoutFunds(): void {
    setSweepWarning(true);
    setCompletedSteps(1);
    void runRecording();
  }

  async function runRecording(): Promise<void> {
    setStage("recording");
    const result = upgradeResultRef.current;
    if (!result) {
      setStage("error");
      setErrorStage("recording");
      setErrorMessage(
        "Internal error: missing new identity data. Please retry from the beginning."
      );
      return;
    }
    try {
      await migrateIdentity(
        result.migration.oldPubkey,
        result.migration.newPubkey,
        result.migration.migrationSignature,
        result.migration.migrationMessage
      );

      // Commit encrypted key to localStorage
      commitUpgrade(result.encStore, result.identity);

      // Download combined recovery file containing BOTH keys, encrypted under
      // the new passphrase. The final file supersedes the temporary stage-1
      // file: one passphrase decrypts both keys.
      // CRITICAL: identity.wif here is the OLD key (prop captured at mount).
      // Do not replace with localStorage.getItem — commitUpgrade above wrote
      // the NEW key already.
      const newIdentity = result.identity;
      let encryptedWif: string;
      try {
        const parsedStore = JSON.parse(result.encStore) as { encrypted?: string };
        encryptedWif = parsedStore.encrypted ?? (await encryptWif(newIdentity.wif, newPass));
      } catch {
        encryptedWif = await encryptWif(newIdentity.wif, newPass);
      }
      const oldWifEncrypted = await encryptWif(identity.wif, newPass);
      const newBackup: BackupData = {
        name: newIdentity.name,
        address: newIdentity.address,
        wif_encrypted: encryptedWif,
        oldWif_encrypted: oldWifEncrypted,
        oldAddress: identity.address,
        pathType: "rotation",
        createdAt: new Date().toISOString(),
        note: "Use your passphrase to reveal both keys. The previous key is included for recovering any funds left on the old address.",
      };
      if (newHint.trim()) newBackup.hint = newHint.trim();
      combinedBackupRef.current = newBackup;
      downloadBackup(newBackup);

      setCompletedSteps(2);
      setStage("done");
      onComplete(result.identity);
    } catch (e) {
      setStage("error");
      setErrorStage("recording");
      setErrorMessage(
        e instanceof Error ? e.message : "Failed to record migration on-chain. Please retry."
      );
    }
  }

  async function handleRetry(): Promise<void> {
    if (!errorStage) return;
    if (errorStage === "creating") {
      // runCreating() reuses upgradeResultRef.current if set — safe to retry
      await runCreating();
    } else if (errorStage === "recording") {
      await runRecording();
    }
  }

  // ── Derived display values ─────────────────────────────────────────────────

  const isPassphraseStage = stage === "passphrase";
  // activeStep: 1=creating/sweep-failed, 2=recording (0 = done / error / passphrase)
  const activeStep =
    stage === "creating" || stage === "sweep-failed" ? 1 : stage === "recording" ? 2 : 0;

  const isDone = stage === "done";
  const isError = stage === "error";
  const isSweepFailed = stage === "sweep-failed";
  const isRunning = !isDone && !isError && !isSweepFailed && !isPassphraseStage;

  // ── Render ─────────────────────────────────────────────────────────────────

  // Backdrop is only clickable in sweep-failed states — protects mid-flight
  // stages (creating, recording, etc.) from accidental dismissal. Done state
  // is ALSO locked: user must explicitly tap Download again / Got it to leave,
  // ensuring they engage with the safeguard reminder before exiting.
  const backdropDismissable = isSweepFailed;

  return (
    <>
      {/* Backdrop — full-screen button. Conditionally dismissable: during
          active wizard stages tapping outside does nothing (protects the
          rotation flow from accidental closes). */}
      {backdropDismissable ? (
        <button
          type="button"
          className="fixed inset-0 z-[70] w-full bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] cursor-default"
          aria-label="Close modal"
          onClick={onClose}
        />
      ) : (
        <div
          className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
          aria-hidden="true"
        />
      )}

      {/* Modal — centered. Padding-bottom inflates with the iOS keyboard
          during passphrase stage. */}
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-6 pointer-events-none transition-[padding] duration-200 ease-out"
        style={{ paddingBottom: `calc(1.5rem + ${kbd}px)` }}
      >
        <div className="w-full max-w-md rounded-2xl bg-[#0f0f0f] border border-amber-400/20 shadow-2xl min-h-[220px] max-h-[calc(100dvh-3rem)] overflow-y-auto pointer-events-auto animate-[slideUp_0.3s_ease-out] p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                {isPassphraseStage ? "Protect your new key" : "Moving to a new key"}
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {isPassphraseStage
                  ? "Choose a passphrase"
                  : isDone
                    ? "All done."
                    : "Don\u2019t close this window."}
              </p>
            </div>
            {(isDone || isPassphraseStage) && (
              <button
                type="button"
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg leading-none ml-3"
                aria-label="Close"
              >
                &#x2715;
              </button>
            )}
          </div>

          {/* Passphrase entry — shown before the wizard starts */}
          {isPassphraseStage ? (
            <div className="space-y-3">
              <input
                type="password"
                placeholder="New passphrase (min 8 characters)"
                value={newPass}
                onChange={(e) => {
                  setNewPass(e.target.value);
                  setPassError("");
                }}
                className="w-full bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
              />
              <input
                type="password"
                placeholder="Confirm passphrase"
                value={confirmNewPass}
                onChange={(e) => {
                  setConfirmNewPass(e.target.value);
                  setPassError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitPassphrase();
                }}
                className="w-full bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
              />
              <div className="border-l-2 border-amber-500/60 pl-2.5 space-y-1">
                <label
                  htmlFor="move-hint"
                  className="text-[11px] text-amber-400/80 font-medium block"
                >
                  Memory clue
                </label>
                <input
                  id="move-hint"
                  type="text"
                  placeholder={`e.g. "blue house + 2019"`}
                  value={newHint}
                  maxLength={100}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setNewHint(e.target.value);
                    setPassError("");
                  }}
                  className="w-full bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
                />
                <p className="text-[10px] text-red-400/90">
                  Only you should know what this means &mdash; it&apos;s stored unprotected in your
                  recovery file.
                </p>
              </div>
              {passError && <p className="text-[11px] text-red-400">{passError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-zinc-900 text-zinc-400 border border-amber-400/15 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitPassphrase()}
                  disabled={newPass.length < 8 || newPass !== confirmNewPass || !newHint.trim()}
                  className="flex-1 bg-amber-400 text-black rounded-lg px-3 py-2 text-xs font-medium hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 2-dot progress indicator (New key → Recorded) */}
              <div className="flex justify-center gap-2 mb-5">
                {[1, 2].map((step) => (
                  <div
                    key={step}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      completedSteps >= step
                        ? "bg-amber-500"
                        : activeStep === step && isRunning
                          ? "bg-amber-400 animate-pulse"
                          : "bg-zinc-800"
                    }`}
                  />
                ))}
              </div>

              {/* Step list */}
              <div className="space-y-3">
                {/* Step 1 — Creating / Sweep (was Step 2 before saving stage removal) */}
                {completedSteps >= 1 && stage !== "error" && stage !== "sweep-failed" ? (
                  <CompletedStep
                    heading={
                      sweepWarning
                        ? "New key ready \u2014 transfer skipped"
                        : COMPLETED_STEPS.creating.heading
                    }
                    description={
                      sweepWarning
                        ? "You chose to proceed without transferring funds. They\u2019re safe on your old key \u2014 use your backup file."
                        : COMPLETED_STEPS.creating.description
                    }
                    variant={sweepWarning ? "warn" : undefined}
                  />
                ) : stage === "creating" ? (
                  <ActiveStep
                    heading="Creating your new key"
                    description="Generating a fresh keypair and sweeping funds\u2026"
                  />
                ) : stage === "sweep-failed" ? (
                  <div className="flex items-start gap-2.5">
                    <WarnIcon />
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-amber-400">Fund transfer failed</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        {errorMessage || "Couldn\u2019t move your funds to the new key."}
                      </p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Your funds are safe on your old key. You can retry the transfer or proceed
                        without moving funds.
                      </p>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => void retrySweep()}
                          className="flex-1 bg-amber-400/10 text-amber-300 border border-amber-400/30 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-amber-400/15 transition-colors"
                        >
                          Retry transfer
                        </button>
                        <button
                          type="button"
                          onClick={proceedWithoutFunds}
                          className="flex-1 bg-zinc-900 text-zinc-400 border border-amber-400/15 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-800 transition-colors"
                        >
                          Proceed without
                        </button>
                      </div>
                    </div>
                  </div>
                ) : stage === "error" && errorStage === "creating" ? (
                  <div className="space-y-2.5">
                    <ErrorStep
                      heading="Creation failed"
                      errorMessage={errorMessage}
                      onRetry={() => void handleRetry()}
                      onClose={onClose}
                      partialWarning={false}
                    />
                    {/* Deferred pre-rotation backup — only emitted on
                          failure so the user has a recovery file for their
                          OLD key if they can't retry to success. Built in
                          submitPassphrase and held in memory until needed. */}
                    {preRotationBackupRef.current && (
                      <button
                        type="button"
                        onClick={downloadPreRotationBackup}
                        className="w-full bg-zinc-900 text-zinc-300 border border-amber-400/20 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-800 transition-colors"
                      >
                        Download backup of old key
                      </button>
                    )}
                  </div>
                ) : null}

                {/* Step 2 — Recording (was Step 3 before saving stage removal) */}
                {completedSteps >= 1 &&
                  (completedSteps >= 2 && stage !== "error" ? (
                    <CompletedStep {...COMPLETED_STEPS.recording} />
                  ) : stage === "recording" ? (
                    <ActiveStep
                      heading="Recording the move"
                      description="Writing an on-chain migration record linking both addresses\u2026"
                    />
                  ) : stage === "error" && errorStage === "recording" ? (
                    <div className="space-y-2.5">
                      <ErrorStep
                        heading="Recording failed"
                        errorMessage={errorMessage}
                        onRetry={() => void handleRetry()}
                        onClose={onClose}
                        partialWarning={true}
                      />
                      {preRotationBackupRef.current && (
                        <button
                          type="button"
                          onClick={downloadPreRotationBackup}
                          className="w-full bg-zinc-900 text-zinc-300 border border-amber-400/20 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-800 transition-colors"
                        >
                          Download backup of old key
                        </button>
                      )}
                    </div>
                  ) : null)}

                {/* Done state */}
                {isDone && (
                  <div className="space-y-3 pt-1">
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      You&apos;re on a fresh key. Same name, same history &mdash; nothing changed
                      for anyone else.
                    </p>
                    {!sweepWarning &&
                    upgradeResultRef.current?.fundTransfer.transferredSats &&
                    upgradeResultRef.current.fundTransfer.transferredSats > 0 ? (
                      <div className="border-l-2 border-emerald-500/60 pl-2.5 py-0.5">
                        <p className="text-[11px] text-emerald-400/90 leading-relaxed">
                          {upgradeResultRef.current.fundTransfer.transferredSats.toLocaleString()}{" "}
                          sats moved to your new key.
                        </p>
                      </div>
                    ) : null}
                    {sweepWarning && (
                      <div className="border-l-2 border-amber-500/60 pl-2.5 py-0.5">
                        <p className="text-[11px] text-amber-400/90 leading-relaxed">
                          Funds weren&apos;t moved &mdash; they&apos;re still on your old key. Use
                          your backup file to recover them.
                        </p>
                      </div>
                    )}
                    <div className="border-l-2 border-amber-500/60 pl-2.5 py-0.5">
                      <p className="text-[11px] text-amber-400/90 leading-relaxed">
                        This file contains both your old and new key &mdash; keep it somewhere safe
                        (cloud, USB) and remember your passphrase.{" "}
                        <span className="font-semibold text-amber-300">
                          Without both, you can&apos;t get back in.
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (combinedBackupRef.current) downloadBackup(combinedBackupRef.current);
                        }}
                        className="flex-1 bg-zinc-900 text-zinc-300 border border-amber-400/20 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-800 transition-colors"
                      >
                        Download again
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 bg-amber-500/10 text-amber-400 border border-amber-500/40 rounded-lg px-3 py-2 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface ErrorStepProps {
  heading: string;
  errorMessage: string;
  onRetry: () => void;
  onClose: () => void;
  partialWarning: boolean;
}

function ErrorStep({ heading, errorMessage, onRetry, onClose, partialWarning }: ErrorStepProps) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-red-400 shrink-0 mt-0.5 text-sm" aria-hidden="true">
        &#x2715;
      </span>
      <div>
        <p className="text-xs font-medium text-red-400">{heading}</p>
        <p className="text-[11px] text-zinc-400 mt-0.5">{errorMessage}</p>
        {partialWarning && (
          <p className="text-[10px] text-amber-400/80 mt-1 leading-relaxed">
            The move may have partially completed. Check your identity.
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={onRetry}
            className="bg-amber-400/10 text-amber-300 border border-amber-400/30 rounded-lg px-2.5 py-1 text-[11px] font-medium hover:bg-amber-400/15 transition-colors"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-zinc-900 text-zinc-400 border border-amber-400/15 rounded-lg px-2.5 py-1 text-[11px] font-medium hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
