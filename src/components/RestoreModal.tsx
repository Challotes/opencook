"use client";

import { useRef, useState } from "react";
import { cleanupMigrations } from "@/app/actions";
import { PassphrasePrompt } from "@/components/PassphrasePrompt";
import { downloadBackup, getStoredHint } from "@/services/bsv/backup-template";
import { decryptWif, encryptWif } from "@/services/bsv/crypto";
import { importIdentity, isIdentityEncrypted, signPost } from "@/services/bsv/identity";
import type { Identity } from "@/types";

interface RestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (identity: Identity) => void;
  currentIdentity: Identity;
  isProtected: boolean;
  reAuthPassphrase: string;
}

export function RestoreModal({
  isOpen,
  onClose,
  onSuccess,
  currentIdentity,
  isProtected,
  reAuthPassphrase,
}: RestoreModalProps): React.JSX.Element | null {
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [encryptedImportData, setEncryptedImportData] = useState<{
    wif_encrypted: string;
    name?: string;
    hint?: string;
  } | null>(null);
  const [encryptedImportError, setEncryptedImportError] = useState("");
  const [decryptingImport, setDecryptingImport] = useState(false);
  const [pendingRestoreWif, setPendingRestoreWif] = useState<string | null>(null);
  const [pendingRestoreName, setPendingRestoreName] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleClose() {
    setImportError("");
    setImporting(false);
    setImportSuccess(false);
    setEncryptedImportData(null);
    setEncryptedImportError("");
    setPendingRestoreWif(null);
    setPendingRestoreName(undefined);
    onClose();
  }

  async function doImport(wif: string, name?: string): Promise<void> {
    setImporting(true);
    setImportError("");
    try {
      if (isProtected && currentIdentity) {
        const passForBackup = reAuthPassphrase;
        const date = new Date().toISOString().slice(0, 10);
        if (passForBackup) {
          const encBackup = await encryptWif(currentIdentity.wif, passForBackup);
          downloadBackup(
            {
              name: currentIdentity.name,
              address: currentIdentity.address,
              wif_encrypted: encBackup,
              createdAt: new Date().toISOString(),
              note: "Previous identity saved before switching.",
              hint: getStoredHint(),
            },
            `bsvibes-${currentIdentity.name}-${date}.html`
          );
        }
        setPendingRestoreWif(wif);
        setPendingRestoreName(name);
        setImporting(false);
        return;
      }

      if (!isProtected && currentIdentity) {
        downloadBackup(
          {
            name: currentIdentity.name,
            address: currentIdentity.address,
            wif: currentIdentity.wif,
            createdAt: new Date().toISOString(),
            note: "Previous identity saved before switching.",
            hint: getStoredHint(),
          },
          `bsvibes-${currentIdentity.name}-${new Date().toISOString().slice(0, 10)}.html`
        );
      }

      await performImport(wif, name);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Restore failed");
      setImporting(false);
    }
  }

  async function performImport(wif: string, name?: string): Promise<void> {
    try {
      const imported = await importIdentity(wif, name);

      const cleanupTs = Date.now();
      const cleanupMsg = `cleanup:${imported.pubkey}:${cleanupTs}`;
      signPost(cleanupMsg)
        .then((sig) => {
          if (sig) return cleanupMigrations(imported.pubkey, sig.signature, cleanupTs);
        })
        .catch((err) => {
          console.warn("[BSVibes] RestoreModal: cleanupMigrations failed (non-critical)", err);
        });

      setImportSuccess(true);
      setTimeout(() => {
        onSuccess(imported);
        handleClose();
      }, 1200);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setImporting(false);
    }
  }

  async function confirmPendingRestore(): Promise<void> {
    if (!pendingRestoreWif) return;
    const wif = pendingRestoreWif;
    const name = pendingRestoreName;
    setPendingRestoreWif(null);
    setPendingRestoreName(undefined);
    setImporting(true);
    await performImport(wif, name);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = (ev.target?.result as string) ?? "";
      let parsed: { wif?: string; wif_encrypted?: string; name?: string; hint?: string } | null =
        null;

      const trimmed = text.trimStart();
      if (
        trimmed.startsWith("<!DOCTYPE") ||
        trimmed.startsWith("<html") ||
        text.includes("BACKUP_DATA")
      ) {
        const markerMatch = text.match(
          /@BACKUP_DATA_START[\s\S]*?const BACKUP_DATA\s*=\s*(\{[\s\S]*?\});\s*\/\/\s*@BACKUP_DATA_END/
        );
        if (markerMatch) {
          try {
            parsed = JSON.parse(markerMatch[1]);
          } catch {
            const legacyMatch = text.match(/const BACKUP_DATA\s*=\s*(\{[\s\S]*?\});/);
            if (legacyMatch) {
              try {
                parsed = JSON.parse(legacyMatch[1]);
              } catch {
                /* fall through */
              }
            }
          }
        } else {
          const legacyMatch = text.match(/const BACKUP_DATA\s*=\s*(\{[\s\S]*?\});/);
          if (legacyMatch) {
            try {
              parsed = JSON.parse(legacyMatch[1]);
            } catch {
              /* fall through */
            }
          }
        }
        if (!parsed) {
          setImportError("Could not read this recovery file — it may be corrupted");
          return;
        }
      } else if (trimmed.startsWith("{")) {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          setImportError(
            "Could not read file — make sure it is a BSVibes recovery file (.html or .json)"
          );
          return;
        }
      } else {
        setImportError(
          "Could not read file — make sure it is a BSVibes recovery file (.html or .json)"
        );
        return;
      }

      if (!parsed) {
        setImportError("File does not contain a valid recovery key");
        return;
      }

      if (parsed.wif_encrypted) {
        setEncryptedImportData({
          wif_encrypted: parsed.wif_encrypted,
          name: parsed.name,
          hint: parsed.hint,
        });
        setEncryptedImportError("");
        return;
      }

      if (parsed.wif) {
        await doImport(parsed.wif, parsed.name);
        return;
      }

      setImportError("File does not contain a valid recovery key");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleDecryptAndImport(passphrase: string): Promise<void> {
    if (!encryptedImportData) return;
    setDecryptingImport(true);
    setEncryptedImportError("");
    try {
      const wif = await decryptWif(encryptedImportData.wif_encrypted, passphrase);
      if (!wif) {
        setEncryptedImportError("Wrong passphrase — try again");
        setDecryptingImport(false);
        return;
      }
      const name = encryptedImportData.name;
      setEncryptedImportData(null);
      await doImport(wif, name);
    } catch {
      setEncryptedImportError("Something went wrong — try again");
    } finally {
      setDecryptingImport(false);
    }
  }

  if (!isOpen) return null;

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
        className="relative z-10 w-full max-w-sm rounded-xl border border-amber-400/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden"
        style={{ backgroundColor: "#0f0f0f" }}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-400/10">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Restore from another device</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Import a recovery file</p>
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
          <p className="text-[11px] text-amber-400/80 leading-relaxed">
            This will replace your current identity. Your current recovery file will be saved first.
          </p>

          {pendingRestoreWif !== null ? (
            <div className="space-y-2 bg-amber-400/5 rounded-lg p-2.5 border border-amber-400/15">
              <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">
                Your recovery file has been saved.
              </p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Continue with restore? This will replace your current identity.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingRestoreWif(null);
                    setPendingRestoreName(undefined);
                    setImporting(false);
                  }}
                  className="flex-1 bg-zinc-900 text-zinc-400 border border-amber-400/15 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmPendingRestore}
                  disabled={importing}
                  className="flex-1 bg-amber-400 text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {importing ? "Restoring..." : "Continue"}
                </button>
              </div>
            </div>
          ) : encryptedImportData !== null ? (
            <PassphrasePrompt
              context="This recovery file is encrypted. Enter the passphrase you used when creating it."
              error={encryptedImportError}
              loading={decryptingImport}
              onConfirm={handleDecryptAndImport}
              onCancel={() => {
                setEncryptedImportData(null);
                setEncryptedImportError("");
              }}
              confirmLabel="Restore"
              hint={encryptedImportData.hint}
            />
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.json,text/html,application/json"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="w-full bg-amber-400/10 text-amber-300 border border-amber-400/30 rounded-lg px-3 py-2 text-xs font-medium hover:bg-amber-400/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing ? "Restoring..." : "Choose recovery file"}
              </button>
            </>
          )}

          {importError && <p className="text-[11px] text-red-400 leading-relaxed">{importError}</p>}
          {importSuccess && (
            <p className="text-[11px] text-amber-400 font-medium">Identity restored.</p>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="w-full bg-zinc-900 text-zinc-400 border border-amber-400/15 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
