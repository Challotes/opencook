"use client";

import { useEffect, useRef, useState } from "react";
import { migrateIdentity } from "@/app/actions";
import { type BackupData, downloadBackup, getStoredHint } from "@/services/bsv/backup-template";
import { encryptWif } from "@/services/bsv/crypto";
import { resetIdentity } from "@/services/bsv/identity";
import type { Identity } from "@/types";

interface MoveAddressModalProps {
  identity: Identity;
  isProtected: boolean;
  passphrase: string; // already collected from inline re-auth before modal opens
  onComplete: (newIdentity: Identity) => void;
  onClose: () => void;
}

type Stage = "saving" | "creating" | "recording" | "done" | "error";
type ErrorStage = "saving" | "creating" | "recording";

interface StepState {
  heading: string;
  description: string;
}

const COMPLETED_STEPS: Record<ErrorStage, StepState> = {
  saving: {
    heading: "Old key saved",
    description:
      "Old key saved. Check your downloads. That file can recover any funds on your old address.",
  },
  creating: {
    heading: "New address ready",
    description: "New address ready. Your name, posts, earnings, and future payouts will follow.",
  },
  recording: {
    heading: "Move recorded on-chain",
    description: "Move recorded on-chain. Anyone can verify both addresses are the same identity.",
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
  const [stage, setStage] = useState<Stage>("saving");
  const [errorStage, setErrorStage] = useState<ErrorStage | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [sweepWarning, setSweepWarning] = useState(false);

  // Track which steps have completed — drives the progress dots and step list
  const [completedSteps, setCompletedSteps] = useState(0);

  // Store resetIdentity result so Stage 3 can use it
  const resetResultRef = useRef<Awaited<ReturnType<typeof resetIdentity>> | null>(null);

  // Run on mount — starts the wizard automatically
  const hasStarted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional run-once on mount; runSaving is defined below and re-creating it as a dep would cause an infinite loop
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    void runSaving();
  }, []);

  // ── Stage runners ──────────────────────────────────────────────────────────

  async function runSaving(): Promise<void> {
    setStage("saving");
    setErrorStage(null);
    setErrorMessage("");
    try {
      const oldDate = new Date().toISOString().slice(0, 10);
      if (isProtected && passphrase) {
        const encBackup = await encryptWif(identity.wif, passphrase);
        const backupPayload: BackupData = {
          name: identity.name,
          address: identity.address,
          wif_encrypted: encBackup,
          createdAt: new Date().toISOString(),
          note: "Previous identity — may hold unconfirmed UTXOs until mempool clears.",
        };
        const hint = getStoredHint();
        if (hint) backupPayload.hint = hint;
        downloadBackup(backupPayload, `bsvibes-${identity.name}-old-${oldDate}.html`);
      } else {
        const backupPayload: BackupData = {
          name: identity.name,
          address: identity.address,
          wif: identity.wif,
          createdAt: new Date().toISOString(),
          note: "Previous identity — may hold unconfirmed UTXOs until mempool clears.",
        };
        const hint = getStoredHint();
        if (hint) backupPayload.hint = hint;
        downloadBackup(backupPayload, `bsvibes-${identity.name}-old-${oldDate}.html`);
      }

      // Wait 1.5s after download fires, then show checkmark
      await delay(1500);
      setCompletedSteps(1);

      // Wait another 2.5s then auto-advance
      await delay(2500);
      await runCreating();
    } catch (e) {
      setStage("error");
      setErrorStage("saving");
      setErrorMessage(e instanceof Error ? e.message : "Failed to save backup. Please try again.");
    }
  }

  async function runCreating(): Promise<void> {
    setStage("creating");
    try {
      const result = await resetIdentity(identity.wif, identity.name, { deferCommit: true });
      resetResultRef.current = result;

      if (result.fundTransfer.error) {
        setSweepWarning(true);
      }

      await delay(2000);
      setCompletedSteps(2);
      await runRecording();
    } catch (e) {
      setStage("error");
      setErrorStage("creating");
      setErrorMessage(
        e instanceof Error ? e.message : "Failed to create new address. Please try again."
      );
    }
  }

  async function runRecording(): Promise<void> {
    setStage("recording");
    const result = resetResultRef.current;
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

      // Only NOW commit the new key to localStorage + session caches.
      // All three stages succeeded — safe to switch identity permanently.
      // This prevents the bug where localStorage updates to the new key
      // but the sweep/migration failed, stranding funds on the old address.
      result.commit();

      await delay(2000);
      setCompletedSteps(3);
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
    if (errorStage === "saving") {
      await runSaving();
    } else if (errorStage === "creating") {
      await runCreating();
    } else if (errorStage === "recording") {
      await runRecording();
    }
  }

  // ── Derived display values ─────────────────────────────────────────────────

  // activeStep: 1=saving, 2=creating, 3=recording (0 = done / error)
  const activeStep =
    stage === "saving" ? 1 : stage === "creating" ? 2 : stage === "recording" ? 3 : 0;

  const isDone = stage === "done";
  const isError = stage === "error";
  const isRunning = !isDone && !isError;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      {/* Backdrop — no click-through during active stages */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={isDone ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Moving to a new address</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {isDone
                ? "All done."
                : "This takes about 10 seconds \u2014 don\u2019t close this window."}
            </p>
          </div>
          {isDone && (
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

        {/* 3-dot progress indicator */}
        <div className="flex justify-center gap-2 mb-5">
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={`w-2 h-2 rounded-full transition-colors ${
                completedSteps >= step
                  ? "bg-amber-500"
                  : activeStep === step && isRunning
                    ? "bg-amber-400 animate-pulse"
                    : "bg-zinc-700"
              }`}
            />
          ))}
        </div>

        {/* Step list */}
        <div className="space-y-3">
          {/* Step 1 — Saving */}
          {completedSteps >= 1 && stage !== "error" ? (
            <CompletedStep {...COMPLETED_STEPS.saving} />
          ) : stage === "saving" ? (
            <ActiveStep
              heading="Saving your current key"
              description="Downloading a recovery file for your old address\u2026"
            />
          ) : stage === "error" && errorStage === "saving" ? (
            <ErrorStep
              heading="Save failed"
              errorMessage={errorMessage}
              onRetry={() => void handleRetry()}
              onClose={onClose}
              partialWarning={false}
            />
          ) : null}

          {/* Step 2 — Creating */}
          {completedSteps >= 1 &&
            (completedSteps >= 2 && stage !== "error" ? (
              <CompletedStep
                heading={
                  sweepWarning
                    ? "New address ready \u2014 transfer pending"
                    : COMPLETED_STEPS.creating.heading
                }
                description={
                  sweepWarning
                    ? "Couldn\u2019t move your funds right now (network issue). They\u2019re safe on your old address."
                    : COMPLETED_STEPS.creating.description
                }
                variant={sweepWarning ? "warn" : undefined}
              />
            ) : stage === "creating" ? (
              <ActiveStep
                heading="Creating your new address"
                description="Generating a fresh keypair and sweeping confirmed funds\u2026"
              />
            ) : stage === "error" && errorStage === "creating" ? (
              <ErrorStep
                heading="Creation failed"
                errorMessage={errorMessage}
                onRetry={() => void handleRetry()}
                onClose={onClose}
                partialWarning={false}
              />
            ) : null)}

          {/* Step 3 — Recording */}
          {completedSteps >= 2 &&
            (completedSteps >= 3 && stage !== "error" ? (
              <CompletedStep {...COMPLETED_STEPS.recording} />
            ) : stage === "recording" ? (
              <ActiveStep
                heading="Recording the move"
                description="Writing an on-chain migration record linking both addresses\u2026"
              />
            ) : stage === "error" && errorStage === "recording" ? (
              <ErrorStep
                heading="Recording failed"
                errorMessage={errorMessage}
                onRetry={() => void handleRetry()}
                onClose={onClose}
                partialWarning={true}
              />
            ) : null)}

          {/* Done state */}
          {isDone && (
            <div className="space-y-3 pt-1">
              <p className="text-[11px] text-zinc-300 leading-relaxed">
                You&apos;re on a fresh address. Your identity is intact \u2014 same name, same
                history.
              </p>
              {sweepWarning && (
                <div className="border-l-2 border-amber-500/60 pl-2.5 py-0.5">
                  <p className="text-[11px] text-amber-400/90 leading-relaxed">
                    Funds weren&apos;t transferred \u2014 still on your old address. Use your backup
                    file to recover them.
                  </p>
                </div>
              )}
              <div className="border-l-2 border-amber-500/60 pl-2.5 py-0.5">
                <p className="text-[11px] text-amber-400/90 leading-relaxed">
                  Save your new recovery key from the identity menu before you close this.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-amber-500/10 text-amber-400 border border-amber-500/40 rounded-lg px-3 py-2 text-xs font-medium hover:bg-amber-500/20 transition-colors"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
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
            className="bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg px-2.5 py-1 text-[11px] font-medium hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-zinc-800 text-zinc-500 border border-zinc-700 rounded-lg px-2.5 py-1 text-[11px] font-medium hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Utility ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
