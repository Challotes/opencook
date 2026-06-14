import { onchainRecord } from "./onchain-record";

/**
 * Canonical on-chain BOOT audit record (`type: "boot_split"`). SINGLE SOURCE OF
 * TRUTH shared by BOTH boot builders: the server-funded path (`boot-payment.ts`)
 * and the client-funded path (`client-boot.ts`). Centralizing it here stops the
 * two from drifting into different shapes (they previously did — the client path
 * emitted a positional field-array with no version field).
 *
 * Wraps the shared `onchainRecord` envelope (v/app/type/…/ts — see
 * `onchain-record.ts` for the reader contract). `booter` is provenance metadata
 * — which address performed the boot (the server path funds the tx from the
 * server wallet, so without this the booter would not appear on-chain at all).
 * `funded` records whether the server wallet subsidised the boot ("server" = a
 * free boot) or the booter paid ("booter" = a paid boot), keeping the on-chain
 * subsidy auditable. `recipients` / `formula_version` are included only when the
 * writer actually computed them (the server path); the client path omits them
 * rather than fabricate audit fields it doesn't have.
 */
export interface BootAuditInput {
  postId: number;
  booter: string;
  funded: "server" | "booter";
  total: number;
  recipients?: number;
  formulaVersion?: string; // semver string from FAIRNESS_CONFIG (e.g. "0.1.0")
}

export function bootAuditPayload(input: BootAuditInput): string {
  const body: Record<string, unknown> = {
    post_id: input.postId,
    booter: input.booter,
    funded: input.funded,
    total: input.total,
  };
  if (input.recipients !== undefined) body.recipients = input.recipients;
  if (input.formulaVersion !== undefined) body.formula_version = input.formulaVersion;
  return onchainRecord("boot_split", body);
}
