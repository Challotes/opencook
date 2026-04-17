"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { ChangePassphraseModal } from "@/components/ChangePassphraseModal";
import { EarningsSparkline } from "@/components/EarningsSparkline";
import { MoveAddressModal } from "@/components/MoveAddressModal";
import { PassphrasePrompt } from "@/components/PassphrasePrompt";
import { RestoreModal } from "@/components/RestoreModal";
import { UpgradeModal } from "@/components/UpgradeModal";
import { useIdentityContext } from "@/contexts/IdentityContext";
import { satsToDollars, useBsvPrice } from "@/hooks/useBsvPrice";
import { useCurrencyMode } from "@/hooks/useCurrencyMode";
import { downloadBackup, getStoredHint } from "@/services/bsv/backup-template";
import { encryptWif } from "@/services/bsv/crypto";
import { isIdentityEncrypted, unlockIdentity } from "@/services/bsv/identity";
import { FundAddress } from "./FundAddress";

const BACKED_UP_KEY = "bsvibes_identity_backed_up";

// ─── Main IdentityChip ─────────────────────────────────────────────────────

export function IdentityChip(): React.JSX.Element | null {
  const { identity, isLoading, needsUnlock, updateIdentity } = useIdentityContext();
  const [open, setOpen] = useState(false);

  // Security state
  const [isProtected, setIsProtected] = useState(false);
  const [backedUp, setBackedUp] = useState<boolean | null>(null);
  // After download fires we wait for the user to explicitly acknowledge
  // ("Got it") before flipping backedUp. Prevents the silent "advanced
  // believing backup was saved" failure mode when the browser didn't
  // actually save the file (popup blocker, disk full, CSP deny, etc).
  const [justDownloaded, setJustDownloaded] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);

  // Balance / earnings
  const [earnedSats, setEarnedSats] = useState<number | null>(null);
  const [balanceSats, setBalanceSats] = useState<number | null>(null);
  const [activity, setActivity] = useState<
    Array<{
      amount: number;
      direction: "in" | "out";
      label: string;
      created_at: string;
      txid?: string;
    }>
  >([]);
  const [earningsHistory, setEarningsHistory] = useState<Array<{ t: string; cumulative: number }>>(
    []
  );
  const bsvPrice = useBsvPrice();
  const { toggle: toggleCurrency, isGoat } = useCurrencyMode();

  // Save recovery file state
  const [downloading, setDownloading] = useState(false);

  // Re-auth grace window (for actions that need passphrase confirmation)
  const [reAuthTime, setReAuthTime] = useState(0);
  const reAuthPassphraseRef = useRef("");

  // Re-auth prompt
  const [reAuthAction, setReAuthAction] = useState<(() => void) | null>(null);
  const [reAuthError, setReAuthError] = useState("");
  const [reAuthLoading, setReAuthLoading] = useState(false);

  // Import state moved to RestoreModal

  // Advanced section (Show/Copy/Paste key)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  // Unlock state (when needsUnlock)
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [storedHint, setStoredHint] = useState<string | null>(null);
  const [showUnlockHint, setShowUnlockHint] = useState(false);

  // Activity / chart expand
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(true);

  // Deposit modal
  const [showDeposit, setShowDeposit] = useState(false);
  // Manage identity modal
  const [showManage, setShowManage] = useState(false);
  // Restore modal
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  // Move Address Modal — row click goes straight to modal (no inline expand)
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movePassphrase, setMovePassphrase] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Helpers defined early for use in effects ──────────────────────────────

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setReAuthAction(null);
    setReAuthError("");
    setShowAdvanced(false);
    setKeyRevealed(false);
    setCopied(false);
  }, []);

  const loadStoredHint = useCallback(() => {
    try {
      const raw = localStorage.getItem("bfn_keypair_enc");
      if (raw) {
        const parsed = JSON.parse(raw) as { hint?: string };
        setStoredHint(parsed.hint ?? null);
      }
    } catch {
      /* non-critical */
    }
  }, []);

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setBackedUp(localStorage.getItem(BACKED_UP_KEY) === "1");
    const encrypted = isIdentityEncrypted();
    setIsProtected(encrypted);
    loadStoredHint();
  }, [loadStoredHint]);

  useEffect(() => {
    if (!identity) return;
    const encrypted = isIdentityEncrypted();
    setIsProtected(encrypted);
    loadStoredHint();
  }, [identity?.address, identity?.wif, identity, loadStoredHint]);

  useEffect(() => {
    if (!identity?.address) return;
    function fetchLiveBalance() {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/balance?address=${encodeURIComponent(identity?.address ?? "")}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.balance === "number") {
            setBalanceSats(data.balance);
          }
          // On failure: preserve last-known balance (don't flash to 0)
        })
        .catch(() => {});
    }
    fetchLiveBalance();
    const interval = setInterval(fetchLiveBalance, 30_000);
    return () => clearInterval(interval);
  }, [identity?.address]);

  useEffect(() => {
    if (!identity?.address) return;
    fetch(`/api/earnings?address=${encodeURIComponent(identity.address)}`)
      .then((res) => res.json())
      .then((data) => {
        setEarnedSats(data.totalEarned ?? 0);
        setActivity(data.recentActivity ?? []);
        setEarningsHistory(data.earningsHistory ?? []);
      })
      .catch(() => setEarnedSats(0));
  }, [identity?.address]);

  // Background earnings poll (30s) — drives the chip flash for real earnings.
  // When the dropdown is open we also refresh the activity feed and earnings
  // history so recent boots/payouts appear live instead of waiting for the next
  // close→reopen cycle. When closed, we stay on the summary=1 fast path.
  useEffect(() => {
    if (!identity?.address) return;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      const url = open
        ? `/api/earnings?address=${encodeURIComponent(identity.address)}`
        : `/api/earnings?address=${encodeURIComponent(identity.address)}&summary=1`;
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (typeof data.totalEarned === "number") setEarnedSats(data.totalEarned);
          if (open) {
            if (Array.isArray(data.recentActivity)) setActivity(data.recentActivity);
            if (Array.isArray(data.earningsHistory)) setEarningsHistory(data.earningsHistory);
          }
        })
        .catch(() => {});
    };
    const interval = setInterval(poll, 30_000);
    poll(); // initial fetch
    return () => clearInterval(interval);
  }, [identity?.address, open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      // Don't close the dropdown if the upgrade modal or move modal is open — those
      // modals render outside dropdownRef so every click inside them would otherwise
      // trigger this handler.
      if (showUpgradeModal || showChangePassModal || showMoveModal) return;
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, showUpgradeModal, showChangePassModal, showMoveModal, closeDropdown]);

  // ── Helpers ────────────────────────────────────────────────────────────

  function resetManageState() {
    setReAuthAction(null);
    setReAuthError("");
    setShowAdvanced(false);
    setKeyRevealed(false);
    setCopied(false);
  }

  function closeManageModal() {
    setShowManage(false);
    resetManageState();
  }

  function isRecentlyAuthed(): boolean {
    return Date.now() - reAuthTime <= 60_000;
  }

  function requireReAuth(action: () => void): void {
    if (!isProtected || isRecentlyAuthed()) {
      action();
      return;
    }
    setReAuthAction(() => action);
    setReAuthError("");
  }

  async function handleReAuthConfirm(passphrase: string): Promise<void> {
    setReAuthLoading(true);
    setReAuthError("");
    try {
      const unlocked = await unlockIdentity(passphrase);
      if (!unlocked) {
        setReAuthError("Wrong passphrase");
        setReAuthLoading(false);
        return;
      }
      setReAuthTime(Date.now());
      reAuthPassphraseRef.current = passphrase;
      const pendingAction = reAuthAction;
      setReAuthAction(null);
      if (pendingAction) pendingAction();
    } catch {
      setReAuthError("Something went wrong — try again");
    } finally {
      setReAuthLoading(false);
    }
  }

  // ── Unlock ──────────────────────────────────────────────────────────────

  async function handleUnlock(): Promise<void> {
    if (!unlockPassphrase) return;
    setUnlocking(true);
    setUnlockError("");
    try {
      const unlocked = await unlockIdentity(unlockPassphrase);
      if (!unlocked) {
        setUnlockError("Wrong passphrase — try again");
      } else {
        setReAuthTime(Date.now());
        reAuthPassphraseRef.current = unlockPassphrase;
        updateIdentity(unlocked);
        setUnlockPassphrase("");
      }
    } catch {
      setUnlockError("Something went wrong — try again");
    } finally {
      setUnlocking(false);
    }
  }

  // ── Save recovery file ─────────────────────────────────────────────────

  function handleSaveFile(): void {
    if (isProtected) {
      // Single passphrase entry: re-auth captures passphrase, then save directly
      if (isRecentlyAuthed() && reAuthPassphraseRef.current) {
        void handleSaveEncrypted(reAuthPassphraseRef.current);
        return;
      }
      requireReAuth(() => {
        if (reAuthPassphraseRef.current) {
          void handleSaveEncrypted(reAuthPassphraseRef.current);
        }
      });
      return;
    }
    // Unprotected: plaintext download
    if (!identity) return;
    doDownloadPlaintext();
  }

  function doDownloadPlaintext() {
    if (!identity) return;
    setDownloading(true);
    downloadBackup(
      {
        name: identity.name,
        address: identity.address,
        wif: identity.wif,
        createdAt: new Date().toISOString(),
        hint: getStoredHint(),
      },
      `bsvibes-${identity.name}-${new Date().toISOString().slice(0, 10)}.html`
    );
    setJustDownloaded(true);
    setShowManage(false);
    setOpen(true);
    setTimeout(() => setDownloading(false), 1000);
  }

  async function handleSaveEncrypted(passphrase: string): Promise<void> {
    if (!identity) return;
    setDownloading(true);
    try {
      // Read already-encrypted value from the local store if available (avoids double-encrypting)
      let encryptedWif: string;
      try {
        const raw = localStorage.getItem("bfn_keypair_enc");
        if (raw) {
          const parsed = JSON.parse(raw) as { encrypted?: string };
          encryptedWif = parsed.encrypted ?? (await encryptWif(identity.wif, passphrase));
        } else {
          encryptedWif = await encryptWif(identity.wif, passphrase);
        }
      } catch {
        encryptedWif = await encryptWif(identity.wif, passphrase);
      }

      downloadBackup(
        {
          name: identity.name,
          address: identity.address,
          wif_encrypted: encryptedWif,
          createdAt: new Date().toISOString(),
          note: "Use your passphrase to restore.",
          hint: getStoredHint(),
        },
        `bsvibes-${identity.name}-${new Date().toISOString().slice(0, 10)}.html`
      );
      setJustDownloaded(true);
      setShowManage(false);
      setOpen(true);
    } catch {
      console.error("BSVibes: save encrypted failed");
    } finally {
      setTimeout(() => setDownloading(false), 1000);
    }
  }

  function markBackedUp() {
    if (!backedUp) {
      localStorage.setItem(BACKED_UP_KEY, "1");
      setBackedUp(true);
    }
  }

  // ── Advanced: Show/Copy key ────────────────────────────────────────────

  function handleCopy(): void {
    requireReAuth(() => {
      if (!identity) return;
      navigator.clipboard.writeText(identity.wif);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      markBackedUp();
    });
  }

  function handleRevealKey(): void {
    requireReAuth(() => setKeyRevealed((v) => !v));
  }

  // ── Modal launchers ────────────────────────────────────────────────────

  function openUpgradeModal(): void {
    setShowUpgradeModal(true);
  }

  function openMoveModal(pass: string): void {
    setMovePassphrase(pass);
    setShowManage(false);
    setShowMoveModal(true);
  }

  // ── Loading / identity guards ──────────────────────────────────────────

  if (isLoading) return null;

  // ── Unlock prompt ──────────────────────────────────────────────────────

  if (needsUnlock && !identity) {
    return (
      <div className="relative">
        <div
          className="w-[calc(100vw-2rem)] sm:w-72 max-w-72 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: "#18181b" }}
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-emerald-500 shrink-0"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-xs text-zinc-300 font-medium">
              Enter your passphrase to unlock
            </span>
          </div>
          <div className="px-3 py-3 space-y-2">
            <input
              type="password"
              placeholder="Passphrase"
              value={unlockPassphrase}
              onChange={(e) => {
                setUnlockPassphrase(e.target.value);
                setUnlockError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUnlock();
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
            {storedHint && (
              <div className="text-[10px] text-zinc-600">
                {showUnlockHint ? (
                  <span className="text-zinc-400">Clue: {storedHint}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowUnlockHint(true)}
                    className="hover:text-zinc-400 transition-colors underline underline-offset-2"
                  >
                    Need a reminder?
                  </button>
                )}
              </div>
            )}
            {unlockError && <p className="text-[11px] text-red-400">{unlockError}</p>}
            <button
              type="button"
              onClick={handleUnlock}
              disabled={!unlockPassphrase || unlocking}
              className="w-full bg-white text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {unlocking ? "Unlocking..." : "Unlock"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!identity) return null;

  const showWarningDot = backedUp === false;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Modals — rendered at root level to avoid dropdown stacking context */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSuccess={(newIdentity, transferMsg) => {
          updateIdentity(newIdentity);
          setReAuthTime(Date.now());
          setIsProtected(true);
          setBackupConfirmed(true);
          if (transferMsg) setTransferStatus(transferMsg);
        }}
        currentIdentity={identity}
      />
      <ChangePassphraseModal
        isOpen={showChangePassModal}
        onClose={() => setShowChangePassModal(false)}
        onSuccess={(newIdentity, transferMsg) => {
          updateIdentity(newIdentity);
          setReAuthTime(Date.now());
          setIsProtected(true);
          setBackupConfirmed(true);
          if (transferMsg) setTransferStatus(transferMsg);
        }}
        currentIdentity={identity}
      />
      {showMoveModal && identity && (
        <MoveAddressModal
          identity={identity}
          isProtected={isProtected}
          passphrase={movePassphrase}
          onComplete={(newIdentity) => {
            updateIdentity(newIdentity);
            setIsProtected(true);
            setReAuthTime(Date.now());
            localStorage.removeItem(BACKED_UP_KEY);
            setBackedUp(false);
          }}
          onClose={() => {
            setShowMoveModal(false);
            setMovePassphrase("");
          }}
        />
      )}
      {showDeposit && identity && (
        <FundAddress
          address={identity.address}
          balance={balanceSats ?? undefined}
          onClose={() => setShowDeposit(false)}
        />
      )}

      {showRestoreModal && identity && (
        <RestoreModal
          isOpen={showRestoreModal}
          onClose={() => setShowRestoreModal(false)}
          onSuccess={(imported) => {
            updateIdentity(imported);
            setShowRestoreModal(false);
          }}
          currentIdentity={identity}
          isProtected={isProtected}
          reAuthPassphrase={reAuthPassphraseRef.current}
        />
      )}

      {/* ── Manage Identity modal ── */}
      {showManage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
        >
          <button
            type="button"
            className="absolute inset-0 w-full cursor-default"
            aria-label="Close modal"
            onClick={closeManageModal}
          />
          <div className="relative z-10 w-full flex items-center justify-center">
            <div
              className="w-full max-w-sm rounded-xl border border-amber-400/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden"
              style={{ backgroundColor: "#0f0f0f" }}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
              <div className="flex items-center justify-between px-4 py-3 border-b border-amber-400/10">
                <p className="text-sm font-semibold text-zinc-100">You</p>
                <button
                  type="button"
                  onClick={closeManageModal}
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

              <div className="divide-y divide-amber-400/10">
                {/* Save recovery file */}
                {reAuthAction !== null ? (
                  <div className="px-4 py-3">
                    <PassphrasePrompt
                      context="Enter your passphrase to continue."
                      error={reAuthError}
                      loading={reAuthLoading}
                      onConfirm={handleReAuthConfirm}
                      onCancel={() => {
                        setReAuthAction(null);
                        setReAuthError("");
                      }}
                      confirmLabel="Continue"
                      hint={storedHint}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveFile}
                    disabled={downloading}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-400/5 transition-colors text-left disabled:opacity-40"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={backedUp === false ? "text-amber-400" : "text-zinc-400"}
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-xs font-medium block ${backedUp === false ? "text-amber-400" : "text-zinc-200"}`}
                      >
                        {downloading ? "Saving..." : "Save recovery file"}
                      </span>
                      {backedUp === false && (
                        <span className="text-[10px] text-amber-400/70 block mt-0.5">
                          Not saved yet — save now to avoid losing access
                        </span>
                      )}
                    </div>
                    {backedUp === false && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                      </span>
                    )}
                  </button>
                )}

                {/* Secure / Change passphrase */}
                <button
                  type="button"
                  onClick={() => {
                    closeManageModal();
                    if (isProtected) setShowChangePassModal(true);
                    else openUpgradeModal();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-400/5 transition-colors text-left"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-amber-400"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    {isProtected && <path d="m9 12 2 2 4-4" />}
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-xs font-medium block ${isProtected ? "text-zinc-200" : "text-amber-400"}`}
                    >
                      Passphrase
                    </span>
                    <span
                      className={`text-[10px] block mt-0.5 ${isProtected ? "text-zinc-500" : "text-amber-400/70"}`}
                    >
                      {isProtected
                        ? "Set · tap to change"
                        : "Not set — add one so you can recover from any device"}
                    </span>
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-zinc-600 shrink-0"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                {/* Restore from another device — opens RestoreModal */}
                <button
                  type="button"
                  onClick={() => {
                    closeManageModal();
                    if (isProtected && !isRecentlyAuthed()) {
                      requireReAuth(() => setShowRestoreModal(true));
                    } else {
                      setShowRestoreModal(true);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-400/5 transition-colors text-left"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-zinc-400"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-zinc-200 block">
                      Restore from another device
                    </span>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">
                      Import a recovery file
                    </span>
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-zinc-600 shrink-0"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                {/* Move to a new address — goes straight to MoveAddressModal */}
                <button
                  type="button"
                  onClick={() => {
                    closeManageModal();
                    if (isProtected && !isRecentlyAuthed()) {
                      requireReAuth(() => openMoveModal(reAuthPassphraseRef.current));
                    } else {
                      openMoveModal(reAuthPassphraseRef.current);
                    }
                  }}
                  disabled={!identity}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-400/5 transition-colors text-left disabled:opacity-40"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-zinc-600 shrink-0"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-zinc-200 block">
                      Move to a new address
                    </span>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">
                      Rotate to a new address. Your name, earnings, and posts stay intact.
                    </span>
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-zinc-600 shrink-0"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                {/* Show recovery key (advanced) */}
                {!showAdvanced ? (
                  <button
                    type="button"
                    onClick={() => requireReAuth(() => setShowAdvanced(true))}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-400/5 transition-colors text-left"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="text-zinc-600"
                    >
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-400">Show recovery key</span>
                        <span className="text-[9px] font-medium text-amber-400/60 bg-amber-400/5 border border-amber-400/20 rounded px-1 py-px uppercase tracking-wide">
                          Advanced
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 block mt-0.5">
                        View, copy, or manually paste your key
                      </span>
                    </div>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="text-zinc-600 shrink-0"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                ) : (
                  <div className="px-4 py-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-200">Recovery key</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdvanced(false);
                          setKeyRevealed(false);
                        }}
                        className="text-[10px] text-red-400/80 hover:text-red-300 transition-colors font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="bg-amber-400/5 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-amber-300/70 break-all leading-relaxed">
                      {keyRevealed
                        ? identity.wif
                        : `${"\u2022".repeat(12)}${identity.wif.slice(-4)}`}
                    </div>
                    {!keyRevealed && (
                      <button
                        type="button"
                        onClick={handleRevealKey}
                        className="w-full bg-amber-400/10 text-amber-300 border border-amber-400/30 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-amber-400/15 transition-colors"
                      >
                        Show key
                      </button>
                    )}
                    {keyRevealed && (
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="w-full bg-amber-400/10 text-amber-300 border border-amber-400/30 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-amber-400/15 transition-colors"
                      >
                        {copied ? "Copied" : "Copy key"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={dropdownRef} className="relative">
        {/* Chip */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative flex items-center gap-1.5 sm:gap-2 rounded-full bg-zinc-900 border border-zinc-800 px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm hover:border-zinc-700 transition-colors"
        >
          {/* Static protection-status dot. Hidden while the pulsing backup
              warning is visible to avoid two overlapping amber dots competing
              for attention — the backup warning is urgent and time-sensitive;
              protection status can be seen in the modal. */}
          {!(showWarningDot && backedUp === false) && (
            <span
              className={`w-2 h-2 rounded-full ${isProtected ? "bg-amber-400" : "bg-red-500"}`}
            />
          )}
          <span className="text-zinc-300">{identity.name}</span>
          {balanceSats !== null && balanceSats > 0 && (
            <AnimatedBalance
              sats={balanceSats}
              bsvPrice={bsvPrice}
              isGoat={isGoat}
              className="text-[10px]"
              flashTrigger={earnedSats ?? 0}
            />
          )}
          {showWarningDot && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
          )}
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-80 border border-amber-400/20 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] z-50 overflow-hidden max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: "#0f0f0f" }}
          >
            {/* Gold top stripe */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
            {/* ── Header: name + address + close ── */}
            <div className="px-3 py-2.5 border-b border-amber-400/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${isProtected ? "bg-amber-400" : "bg-red-500"}`}
                  />
                  <span className="text-sm font-semibold text-white">{identity.name}</span>
                  {isProtected && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-amber-400 shrink-0"
                      aria-label="Identity protected"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeDropdown}
                  className="text-zinc-500 hover:text-zinc-200 transition-colors"
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(identity.address);
                  setAddressCopied(true);
                  setTimeout(() => setAddressCopied(false), 1500);
                }}
                className="flex items-center gap-1.5 ml-4 mt-1 group cursor-copy"
              >
                <span
                  className={`text-xs font-mono ${addressCopied ? "text-emerald-400" : "text-zinc-400"} group-hover:text-zinc-200 transition-colors`}
                >
                  {addressCopied
                    ? "Copied!"
                    : `${identity.address.slice(0, 6)}...${identity.address.slice(-4)}`}
                </span>
                {!addressCopied && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-zinc-500 group-hover:text-zinc-200 transition-colors"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>

            {/* ── One-time backup banner — persists until the user saves
                 AND acknowledges, then gone forever. Coinbase/Phantom
                 pattern: no recurring guilt, single clear CTA above
                 everything else.
                 After download fires, the banner flips to a "Got it"
                 confirmation — only on explicit click does backedUp get
                 marked, so if the browser silently failed to save, the
                 banner re-appears. ── */}
            {backedUp === false && !justDownloaded && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // Protected identities need a passphrase prompt, which only
                  // renders inside the Manage modal — so route through it.
                  // Unprotected: download directly, no re-auth needed.
                  if (isProtected) {
                    setOpen(false);
                    setShowManage(true);
                  } else {
                    handleSaveFile();
                  }
                }}
                disabled={downloading}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-amber-500/10 border-b border-amber-500/30 hover:bg-amber-500/15 transition-colors text-left disabled:opacity-50"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-amber-400 block">
                    {downloading ? "Saving..." : "Save your recovery file"}
                  </span>
                  <span className="text-[10px] text-amber-400/70 block">
                    One tap — lets you get back in from any device.
                  </span>
                </div>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="text-amber-400 shrink-0"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
            {backedUp === false && justDownloaded && (
              <div className="px-3 py-2.5 bg-emerald-500/10 border-b border-emerald-500/30 flex items-start gap-3">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="text-emerald-400 shrink-0 mt-0.5"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-emerald-300 block">
                    Your file should have downloaded
                  </span>
                  <span className="text-[10px] text-emerald-300/80 block mt-0.5 mb-2 leading-relaxed">
                    Move it somewhere safe (phone, cloud, USB). It&apos;s the only way back into
                    your account.
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      markBackedUp();
                      setJustDownloaded(false);
                    }}
                    className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg px-3 py-1 text-[11px] font-medium hover:bg-emerald-500/30 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </div>
            )}

            {/* ── Security warning (unprotected only — protected uses inline checkmark) ── */}
            {!isProtected && (
              <div className="border-b border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openMoveModal("");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-red-950/20 hover:bg-red-950/40 transition-colors cursor-pointer text-left"
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  <span className="text-[11px] text-red-400 font-medium flex-1">Not protected</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-red-400/60 shrink-0"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            )}

            {/* ── All-time earnings (hero section, collapsible chart, default open) ── */}
            <div className="px-3 py-2.5 border-b border-amber-400/10 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium block mb-0.5">
                    All-time earnings
                  </span>
                  <span className="text-xl text-amber-400 font-bold tabular-nums">
                    {earnedSats !== null && earnedSats > 0
                      ? isGoat
                        ? `${earnedSats.toLocaleString()} sats`
                        : satsToDollars(earnedSats, bsvPrice)
                      : isGoat
                        ? "0 sats"
                        : "$0.00"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCurrency();
                  }}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-amber-400/25 text-zinc-300 hover:text-white hover:border-amber-400/50 hover:bg-amber-400/5 transition-colors"
                  title={isGoat ? "Switch to dollar mode" : "Switch to sats mode"}
                >
                  {isGoat ? <span>🐐 Goat</span> : <span>💵 Noob</span>}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setChartExpanded((v) => !v)}
                className="w-full flex items-center justify-end gap-1 group"
              >
                <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  {chartExpanded ? "Hide chart" : "Show chart"}
                </span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`text-zinc-500 group-hover:text-zinc-300 transition-transform ${chartExpanded ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {chartExpanded && (
                <EarningsSparkline
                  history={earningsHistory}
                  totalSats={earnedSats ?? 0}
                  isGoat={isGoat}
                  bsvPrice={bsvPrice}
                />
              )}
            </div>

            {/* ── Activity (2 visible, expand to see all) ── */}
            <div className="px-3 py-2.5 border-b border-amber-400/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
                  Activity
                </span>
                {activity.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setActivityExpanded((v) => !v)}
                    className="text-[11px] text-zinc-100 font-medium underline underline-offset-2 decoration-zinc-600 hover:decoration-zinc-400 transition-colors"
                  >
                    {activityExpanded ? "Show less" : `View all ${activity.length}`}
                  </button>
                )}
              </div>
              {activity.length === 0 ? (
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  Nothing yet — when your posts get featured, earnings appear here
                </p>
              ) : (
                <div className="space-y-1">
                  {(activityExpanded ? activity : activity.slice(0, 2)).map((a, i) => {
                    const isFree = a.amount === 0;
                    const isBoot = a.label.toLowerCase().includes("boot");
                    return (
                      <div
                        key={`${a.created_at}-${a.label}-${i}`}
                        className="flex items-center justify-between text-[11px]"
                      >
                        <span className="text-zinc-500 truncate mr-2">
                          {a.label}
                          {isBoot && (
                            <span
                              className={`ml-1 text-[10px] ${isFree ? "text-zinc-600" : "text-amber-500/70"}`}
                            >
                              {isFree
                                ? "· free"
                                : isGoat
                                  ? `· ${a.amount.toLocaleString()} sats`
                                  : `· ${satsToDollars(a.amount, bsvPrice)}`}
                            </span>
                          )}
                        </span>
                        <span
                          className={`font-mono shrink-0 ${a.direction === "in" ? "text-amber-400" : "text-zinc-500"}`}
                        >
                          {isFree ? (
                            <span className="text-zinc-600 text-[10px] font-sans">FREE</span>
                          ) : (
                            <>
                              {a.direction === "in" ? "+" : "-"}
                              {isGoat
                                ? a.amount.toLocaleString()
                                : satsToDollars(a.amount, bsvPrice)}
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Balance (demoted — secondary to earnings) ── */}
            <div className="px-3 py-2 border-b border-amber-400/10">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
                  Balance
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white font-semibold tabular-nums">
                    {isGoat
                      ? `${(balanceSats ?? 0).toLocaleString()} sats`
                      : satsToDollars(balanceSats ?? 0, bsvPrice)}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      setShowDeposit(true);
                    }}
                    className="text-[11px] text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline transition-colors"
                  >
                    Add funds
                  </button>
                </div>
              </div>
            </div>

            {/* ── Transient banners ── */}
            {backupConfirmed && (
              <div className="px-3 py-2 border-b border-emerald-800/60 bg-emerald-950/40">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-emerald-400 flex-1">Recovery file saved</span>
                  <button
                    type="button"
                    onClick={() => setBackupConfirmed(false)}
                    className="text-emerald-700 hover:text-emerald-400 transition-colors"
                    aria-label="Dismiss"
                  >
                    <svg
                      width="12"
                      height="12"
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
              </div>
            )}
            {transferStatus && (
              <div
                className={`px-3 py-2 border-b text-[11px] leading-relaxed ${
                  transferStatus.startsWith("Note:")
                    ? "border-amber-900/40 bg-amber-950/20 text-amber-400"
                    : "border-emerald-900/30 bg-emerald-950/20 text-emerald-400"
                }`}
              >
                {transferStatus}
                <button
                  type="button"
                  onClick={() => setTransferStatus(null)}
                  className="ml-2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* ── Manage button ── */}
            <div className="px-3 py-2.5">
              <button
                type="button"
                onClick={() => setShowManage(true)}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-400/10 border border-amber-400/25 py-2 text-sm text-amber-300 font-medium hover:bg-amber-400/15 hover:border-amber-400/40 transition-all"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Manage
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
