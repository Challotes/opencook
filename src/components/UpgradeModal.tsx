"use client";

import { useState } from "react";
import { migrateIdentity, verifyMigrationChain } from "@/app/actions";
import { useCurrencyMode } from "@/hooks/useCurrencyMode";
import { type BackupData, downloadBackup } from "@/services/bsv/backup-template";
import { encryptWif } from "@/services/bsv/crypto";
import { commitUpgrade, upgradeIdentity } from "@/services/bsv/identity";
import type { Identity } from "@/types";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newIdentity: Identity, transferMsg: string | null) => void;
  currentIdentity: Identity;
}

export function UpgradeModal({
  isOpen,
  onClose,
  onSuccess,
  currentIdentity,
}: UpgradeModalProps): React.JSX.Element | null {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [upgrading, setUpgrading] = useState(false);
  const [chainWarning, setChainWarning] = useState(false);
  const { isGoat, toggle: toggleCurrency } = useCurrencyMode();

  function handleClose() {
    setPassphrase("");
    setConfirmPass("");
    setHint("");
    setError("");
    setChainWarning(false);
    onClose();
  }

  async function handleUpgrade() {
    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters");
      return;
    }
    if (passphrase !== confirmPass) {
      setError("Passphrases don't match");
      return;
    }

    // Pre-rotation chain verification — warn if posts would be orphaned
    if (!chainWarning) {
      try {
        const { PrivateKey } = await import("@bsv/sdk");
        const currentPubkey = PrivateKey.fromWif(currentIdentity.wif).toPublicKey().toString();
        const chain = await verifyMigrationChain(currentPubkey);
        if (!chain.healthy) {
          setError(
            `Warning: ${chain.orphanedCount} of your previous identities may lose their connection to your posts. Tap "Secure identity" again to proceed anyway.`
          );
          setChainWarning(true);
          return;
        }
      } catch {
        // Non-blocking — if the check fails, proceed anyway
      }
    }

    setUpgrading(true);
    setError("");
    try {
      const result = await upgradeIdentity(
        passphrase,
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
        throw new Error("Migration failed — your posts would be orphaned. Upgrade aborted.");
      }

      commitUpgrade(result.encStore, result.identity);

      // B2 fix: reuse the already-encrypted value from result.encStore instead of calling encryptWif again
      const newIdentity = result.identity;
      let encryptedWif: string;
      try {
        const parsedStore = JSON.parse(result.encStore) as { encrypted?: string };
        encryptedWif = parsedStore.encrypted ?? (await encryptWif(newIdentity.wif, passphrase));
      } catch {
        encryptedWif = await encryptWif(newIdentity.wif, passphrase);
      }
      const backupPayload: BackupData = {
        name: newIdentity.name,
        address: newIdentity.address,
        wif_encrypted: encryptedWif,
        createdAt: new Date().toISOString(),
        note: "Use your passphrase to restore.",
      };
      if (hint.trim()) backupPayload.hint = hint.trim();
      // Include old WIF encrypted — useful for fund recovery
      backupPayload.oldWif_encrypted = await encryptWif(currentIdentity.wif, passphrase);

      downloadBackup(
        backupPayload,
        `bsvibes-${newIdentity.name}-${new Date().toISOString().slice(0, 10)}.html`
      );

      let transferMsg: string | null = null;
      if (result.fundTransfer.txid) {
        const sats = result.fundTransfer.transferredSats.toLocaleString();
        transferMsg = `Transferred ${sats} sats to your new address.`;
      } else if (result.fundTransfer.error) {
        transferMsg = `Note: fund transfer failed — ${result.fundTransfer.error}. Your previous key is in the recovery file.`;
      } else if (result.fundTransfer.noFunds) {
        transferMsg = `No funds found at your previous address — nothing to transfer.`;
      }

      if (!isGoat) toggleCurrency();
      onSuccess(newIdentity, transferMsg);
      handleClose();
    } catch (e) {
      setError("Something went wrong — try again");
      console.error("BSVibes: upgrade failed", e);
    } finally {
      setUpgrading(false);
    }
  }

  if (!isOpen) return null;

  const canUpgrade =
    passphrase.length >= 8 && passphrase === confirmPass && hint.trim().length > 0 && !upgrading;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
    >
      <button
        type="button"
        className="absolute inset-0 w-full cursor-default"
        aria-label="Close modal"
        onClick={handleClose}
      />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl border border-amber-400/20 shadow-2xl overflow-hidden"
        style={{ backgroundColor: "#0f0f0f" }}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-400/10">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Secure your identity</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Add a passphrase so you can recover from any device
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
          <input
            type="password"
            placeholder="Passphrase (min 8 characters)"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canUpgrade) handleUpgrade();
            }}
            className="w-full bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
          />
          <input
            type="password"
            placeholder="Confirm passphrase"
            value={confirmPass}
            onChange={(e) => {
              setConfirmPass(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canUpgrade) handleUpgrade();
            }}
            className="w-full bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
          />

          {/* Memory clue — always visible, amber accent */}
          <div className="border-l-2 border-amber-500/60 pl-2.5 space-y-1">
            <label
              htmlFor="upgrade-hint"
              className="text-[11px] text-amber-400/80 font-medium block"
            >
              Memory clue
            </label>
            <input
              id="upgrade-hint"
              type="text"
              placeholder={`e.g. "blue house + 2019"`}
              value={hint}
              maxLength={100}
              onChange={(e) => setHint(e.target.value)}
              className="w-full bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
            />
            <p className="text-[10px] text-zinc-600">
              If you forget your passphrase, this is your only reminder. Stored as plain text.
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
              onClick={handleUpgrade}
              disabled={!canUpgrade}
              className="flex-1 bg-amber-400 text-black rounded-lg px-3 py-2 text-xs font-medium hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {upgrading ? "Securing..." : "Secure identity"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
