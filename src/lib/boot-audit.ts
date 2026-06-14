/**
 * Canonical on-chain BOOT audit record — the JSON OP_RETURN payload written by
 * every boot transaction. SINGLE SOURCE OF TRUTH shared by BOTH boot builders:
 * the server-funded path (`boot-payment.ts`) and the client-funded path
 * (`client-boot.ts`). Centralizing it here stops the two from drifting into
 * different shapes (they previously did — the client path emitted a positional
 * field-array with no version field).
 *
 * Envelope matches the post / migration records (`onchain.ts`): v → app → type
 * → body → ts. `booter` is provenance metadata — which address performed the
 * boot (the server path funds the tx from the server wallet, so without this
 * the booter would not appear on-chain at all). `funded` records whether the
 * server wallet subsidised the boot ("server" = a free boot) or the booter paid
 * ("booter" = a paid boot), keeping the on-chain subsidy auditable. `recipients`
 * / `formula_version` are included only when the writer actually computed them
 * (the server path); the client path omits them rather than fabricate audit
 * fields it doesn't have.
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
  return JSON.stringify({
    v: 1,
    app: "bsvibes",
    type: "boot_split",
    post_id: input.postId,
    booter: input.booter,
    funded: input.funded,
    total: input.total,
    ...(input.recipients !== undefined ? { recipients: input.recipients } : {}),
    ...(input.formulaVersion !== undefined ? { formula_version: input.formulaVersion } : {}),
    ts: Date.now(),
  });
}
