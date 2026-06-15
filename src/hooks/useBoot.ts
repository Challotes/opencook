"use client";

import { useCallback } from "react";
import { bootPost } from "@/app/actions";
import { useBootContext } from "@/contexts/BootContext";
import { bootConfirmMessage } from "@/lib/boot-message";
import { clientSideBoot, consolidateUtxos } from "@/services/bsv/client-boot";

export type { BootStatus } from "@/contexts/BootContext";

export interface BootResult {
  success: boolean;
  isFree?: boolean;
  needsFund?: { address: string; balance?: number; fee?: number };
}

interface UseBootOptions {
  onBooted?: () => void;
  onFreeBootUsed?: () => void;
  onFundNeeded?: (address: string, balance?: number, fee?: number) => void;
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
            onFundNeeded?.(identity.address, bootResult.balance, bootResult.estimatedFee);
            releaseBoot();
            return {
              success: false,
              needsFund: {
                address: identity.address,
                balance: bootResult.balance,
                fee: bootResult.estimatedFee,
              },
            };
          }

          if (bootResult.status === "error" || bootResult.status === "broadcast_failed") {
            console.error("[useBoot] clientSideBoot failed:", bootResult.status, bootResult.error);
            failBoot("Boot failed, tap to retry.");
            return { success: false };
          }

          if (bootResult.status === "success" && bootResult.txid) {
            // Authenticate the boot: sign `boot:<postId>:<txid>` with the booter's
            // key so the server can derive the credited address from the verified
            // pubkey (not a client-supplied address). Prevents boot-attribution
            // forgery / mempool-race credit theft. See SECURITY_AUDIT.md Step 7.
            const { PrivateKey } = await import("@bsv/sdk");
            const bootKey = PrivateKey.fromWif(identity.wif);
            const message = bootConfirmMessage(postId, bootResult.txid);
            const signature = bootKey
              .sign(Array.from(new TextEncoder().encode(message)))
              .toDER("hex") as string;
            const booterPubkey = bootKey.toPublicKey().toString();

            // The tx is ALREADY broadcast (we have a txid). On a confirm failure we
            // must NEVER rebuild a NEW tx — that mints a new txid and DOUBLE-PAYS
            // (the server replay guard is txid-only). Finding 6. So we re-POST the
            // SAME confirm body (idempotent: a duplicate hits the server's 409 txid
            // replay guard) and never re-enter the broadcast path on failure.
            const confirmBody = JSON.stringify({
              postId,
              txid: bootResult.txid,
              rawTx: bootResult.rawTx,
              booterPubkey,
              signature,
              booterName: identity.name,
            });
            const postConfirm = () =>
              fetch("/api/boot-confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: confirmBody,
              });

            let confirmRes: Response;
            try {
              confirmRes = await postConfirm();
              // Re-POST the SAME confirm (NOT a rebuild) up to 2× on a transient 503.
              for (let attempt = 0; attempt < 2 && confirmRes.status === 503; attempt++) {
                await new Promise((r) => setTimeout(r, 1500));
                confirmRes = await postConfirm();
              }
            } catch (e) {
              // The fetch itself THREW (offline, connection dropped, abort) AFTER a
              // successful broadcast — the money is on-chain. Do NOT fall through to
              // the outer catch, which would failBoot → "tap to retry" → rebuild a
              // NEW tx → double-pay. This is the MOST LIKELY transient failure, so
              // it must be handled here. Release quietly (the tx is recordable later
              // by re-submitting the SAME txid → server 409 idempotent path). F6.
              console.error("[useBoot] confirm fetch threw after broadcast — NOT retrying:", e);
              releaseBoot();
              return { success: false };
            }

            // Treat 409 "already recorded" as idempotent success (prior confirm worked)
            if (confirmRes.ok || confirmRes.status === 409) {
              // Distinguish "already recorded" (good) from "conflict" (bad) via payload
              const confirmData = await confirmRes.json().catch(() => ({ error: "parse_failed" }));
              if (confirmRes.status === 409 && confirmData.code === "TX_CONFLICT") {
                // Inputs already spent — the tx won't confirm, so it never landed;
                // rebuilding with fresh UTXOs is SAFE (the only retry-rebuild case).
                console.error("[useBoot] boot-confirm TX_CONFLICT:", confirmData);
                failBoot("Payment couldn't be confirmed, tap to retry.");
                return { success: false };
              }
              onBooted?.();
              releaseBoot();
              return { success: true };
            }

            // Terminal confirm failure AFTER a successful broadcast. The money is
            // on-chain; do NOT offer "tap to retry" (which rebuilds + double-pays).
            // Release quietly — a later identical re-submit of the SAME txid would
            // hit the server's 409 idempotent path. After the server-side
            // record-from-chain fix (Finding 6) this path is effectively
            // unreachable for a legitimate client (drift no longer rejects).
            const errData = await confirmRes.json().catch(() => ({ error: "unknown" }));
            console.error(
              "[useBoot] boot-confirm failed after broadcast — NOT retrying (tx already on-chain):",
              confirmRes.status,
              errData
            );
            releaseBoot();
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
