"use client";

import { useCallback } from "react";
import { bootPost } from "@/app/actions";
import { useBootContext } from "@/contexts/BootContext";
import { clientSideBoot, consolidateUtxos } from "@/services/bsv/client-boot";

export type { BootStatus } from "@/contexts/BootContext";

export interface BootResult {
  success: boolean;
  isFree?: boolean;
  needsFund?: { address: string; balance?: number };
}

interface UseBootOptions {
  onBooted?: () => void;
  onFreeBootUsed?: () => void;
  onFundNeeded?: (address: string, balance?: number) => void;
}

/**
 * Shared boot logic: free → server pays, paid → client trustless tx with consolidation.
 * Coordinates with BootContext for global "one boot at a time" state.
 */
export function useBoot(opts: UseBootOptions = {}) {
  const { onBooted, onFreeBootUsed, onFundNeeded } = opts;
  const {
    bootingPostId,
    bootStatus,
    bootError,
    claimBoot,
    setStatus,
    releaseBoot,
    failBoot,
    consolidationWarningDismissed,
    dismissConsolidationWarning,
  } = useBootContext();

  const isBooting = bootingPostId !== null;

  const boot = useCallback(
    async (
      postId: number,
      identity: { wif: string; address: string; name: string }
    ): Promise<BootResult> => {
      // claimBoot is atomic — returns false if another boot is in flight.
      // The previous check-then-claim pattern was a TOCTOU race; the lock now
      // lives in a synchronous ref inside BootContext. See SECURITY_AUDIT.md OBS-N2.
      if (!claimBoot(postId)) return { success: false };
      setStatus("pending");

      // 2s timer: upgrade "pending" → "sending" if still pending
      const extendedTimer = setTimeout(() => {
        setStatus("sending");
      }, 2000);

      // 8s timer: upgrade to "preparing" to reset anxiety clock
      const preparingTimer = setTimeout(() => {
        setStatus("preparing");
      }, 8000);

      try {
        // Try server-side boot first (handles free boots)
        const result = await bootPost(postId, identity.address, identity.name);

        if (result.error) {
          clearTimeout(extendedTimer);
          clearTimeout(preparingTimer);
          failBoot("Boot failed, tap to retry.");
          return { success: false };
        }

        if (result.success && result.isFree) {
          clearTimeout(extendedTimer);
          clearTimeout(preparingTimer);
          onFreeBootUsed?.();
          onBooted?.();
          releaseBoot();
          return { success: true, isFree: true };
        }

        if (result.requiresPayment) {
          // Sync free boot state immediately
          onFreeBootUsed?.();

          setStatus("sending");
          clearTimeout(extendedTimer);

          const sharesRes = await fetch(
            `/api/boot-shares?postId=${postId}&pubkey=${encodeURIComponent(identity.address)}`
          );
          if (!sharesRes.ok) {
            clearTimeout(preparingTimer);
            failBoot("Boot failed, tap to retry.");
            return { success: false };
          }
          const sharesData = await sharesRes.json();

          let bootResult = await clientSideBoot(
            identity.wif,
            identity.address,
            postId,
            sharesData.shares,
            sharesData.bootPrice,
            (status) => setStatus(status)
          );

          // Wallet too fragmented — consolidate first, then retry
          if (bootResult.status === "needs_consolidation") {
            clearTimeout(preparingTimer);
            setStatus("preparing");
            // Show first-time consolidation warning
            const consolidateResult = await consolidateUtxos(identity.wif, identity.address, () =>
              setStatus("preparing")
            );
            if (consolidateResult.status !== "success") {
              console.error("[useBoot] consolidation failed:", consolidateResult.error);
              failBoot("Boot failed, tap to retry.");
              return { success: false };
            }
            dismissConsolidationWarning();
            setStatus("sending");
            bootResult = await clientSideBoot(
              identity.wif,
              identity.address,
              postId,
              sharesData.shares,
              sharesData.bootPrice,
              (status) => setStatus(status)
            );
          }

          clearTimeout(preparingTimer);

          if (bootResult.status === "insufficient_funds") {
            onFundNeeded?.(identity.address, bootResult.balance);
            releaseBoot();
            return {
              success: false,
              needsFund: { address: identity.address, balance: bootResult.balance },
            };
          }

          if (bootResult.status === "error" || bootResult.status === "broadcast_failed") {
            console.error("[useBoot] clientSideBoot failed:", bootResult.status, bootResult.error);
            failBoot("Boot failed, tap to retry.");
            return { success: false };
          }

          if (bootResult.status === "success" && bootResult.txid) {
            const confirmRes = await fetch("/api/boot-confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                postId,
                txid: bootResult.txid,
                rawTx: bootResult.rawTx,
                booterPubkey: identity.address,
                booterName: identity.name,
              }),
            });

            // Treat 409 "already recorded" as idempotent success (prior confirm worked)
            if (confirmRes.ok || confirmRes.status === 409) {
              // Distinguish "already recorded" (good) from "conflict" (bad) via payload
              const confirmData = await confirmRes.json().catch(() => ({ error: "parse_failed" }));
              if (confirmRes.status === 409 && confirmData.code === "TX_CONFLICT") {
                console.error("[useBoot] boot-confirm TX_CONFLICT:", confirmData);
                failBoot("Payment couldn't be confirmed, tap to retry.");
                return { success: false };
              }
              onBooted?.();
              releaseBoot();
              return { success: true };
            }

            // Non-ok response — log and fail visibly so user sees what happened
            const errData = await confirmRes.json().catch(() => ({ error: "unknown" }));
            console.error("[useBoot] boot-confirm failed:", confirmRes.status, errData);
            failBoot("Boot failed, tap to retry.");
            return { success: false };
          }

          failBoot("Boot failed, tap to retry.");
          return { success: false };
        }

        // Free boot success (no requiresPayment flag)
        clearTimeout(extendedTimer);
        clearTimeout(preparingTimer);
        onBooted?.();
        releaseBoot();
        return { success: true };
      } catch {
        clearTimeout(extendedTimer);
        clearTimeout(preparingTimer);
        failBoot("Boot failed, tap to retry.");
        return { success: false };
      }
    },
    [
      claimBoot,
      setStatus,
      releaseBoot,
      failBoot,
      dismissConsolidationWarning,
      onBooted,
      onFreeBootUsed,
      onFundNeeded,
    ]
  );

  return {
    boot,
    isBooting,
    bootStatus,
    bootError,
    bootingPostId,
    consolidationWarningDismissed,
  };
}
