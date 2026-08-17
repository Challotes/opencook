import { describe, expect, it } from "vitest";
import { excludeOrdinalDust, selectUtxos } from "./client-boot";

// ── Test helpers ────────────────────────────────────────────
// selectUtxos/excludeOrdinalDust operate on the ClientUtxo shape. We only need
// tx_hash / tx_pos / value for selection, so build minimal fixtures.
type Utxo = { tx_hash: string; tx_pos: number; value: number };

let _n = 0;
function utxo(value: number): Utxo {
  _n += 1;
  return { tx_hash: `hash${_n}`, tx_pos: 0, value };
}

// Mirror the constants selectUtxos uses so the tests document the intent.
// outputCount for a real boot = shares.length + 2 (payouts + OP_RETURN + change).
const OUTPUT_COUNT = 3; // 1 payout + OP_RETURN + change (a typical small boot)

describe("excludeOrdinalDust", () => {
  it("removes only 1-sat outputs (ordinal/token carriers)", () => {
    const set = [utxo(1), utxo(2), utxo(1), utxo(50_000)];
    const kept = excludeOrdinalDust(set);
    expect(kept.map((u) => u.value).sort((a, b) => a - b)).toEqual([2, 50_000]);
  });

  it("keeps 2–15 sat coins (legitimate spendable change, above the 1-sat floor)", () => {
    // These are BELOW consolidation's DUST_THRESHOLD (16) but are NOT ordinals —
    // the selection floor must be exactly >1, never a higher value.
    const set = [utxo(2), utxo(7), utxo(15)];
    const kept = excludeOrdinalDust(set);
    expect(kept.map((u) => u.value).sort((a, b) => a - b)).toEqual([2, 7, 15]);
  });

  it("returns an empty set when every coin is 1-sat", () => {
    expect(excludeOrdinalDust([utxo(1), utxo(1), utxo(1)])).toEqual([]);
  });
});

describe("selectUtxos — 1-sat ordinal protection", () => {
  it("(a) NEVER selects a 1-sat UTXO as an input, even when mixed with real coins", () => {
    const ordinal = utxo(1); // mis-landed ordinal / BSV-21 token
    const spendable = utxo(50_000);
    const result = selectUtxos([ordinal, spendable], 20_000, OUTPUT_COUNT);

    expect(result).not.toBeNull();
    const selectedHashes = result?.selected.map((u) => u.tx_hash) ?? [];
    // The ordinal must never appear among the inputs.
    expect(selectedHashes).not.toContain(ordinal.tx_hash);
    // Every selected input must be strictly above the 1-sat floor.
    for (const u of result?.selected ?? []) {
      expect(u.value).toBeGreaterThan(1);
    }
  });

  it("does not select a 1-sat coin even when it is the smallest and selection sorts smallest-first", () => {
    // Smallest-first ordering would grab the 1-sat coin first if unfiltered.
    const ordinal = utxo(1);
    const coins = [ordinal, utxo(30_000), utxo(40_000)];
    const result = selectUtxos(coins, 20_000, OUTPUT_COUNT);
    expect(result).not.toBeNull();
    expect(result?.selected.some((u) => u.value === 1)).toBe(false);
  });
});

describe("selectUtxos — normal >1-sat behavior unchanged", () => {
  it("(b) a normal boost with an adequate >1-sat coin selects it and funds the boost", () => {
    const coin = utxo(50_000);
    const bootPrice = 20_000;
    const result = selectUtxos([coin], bootPrice, OUTPUT_COUNT);

    expect(result).not.toBeNull();
    expect(result?.selected).toHaveLength(1);
    expect(result?.selected[0].tx_hash).toBe(coin.tx_hash);
    expect(result?.total).toBe(50_000);
    // total must cover bootPrice + the computed fee (funds the boost).
    expect(result?.total).toBeGreaterThanOrEqual(bootPrice + (result?.estimatedFee ?? 0));
  });

  it("consolidates several small (>1-sat) coins to cover the boot", () => {
    // Six 5,000-sat coins, none covers the boot alone; together they do.
    const coins = [utxo(5000), utxo(5000), utxo(5000), utxo(5000), utxo(5000), utxo(5000)];
    const result = selectUtxos(coins, 20_000, OUTPUT_COUNT);
    expect(result).not.toBeNull();
    expect(result?.total).toBeGreaterThanOrEqual(20_000 + (result?.estimatedFee ?? 0));
    // All selected inputs are the legitimate 5000-sat coins.
    for (const u of result?.selected ?? []) {
      expect(u.value).toBe(5000);
    }
  });

  it("(c) a wallet whose ONLY coins are 1-sat reports insufficient funds (returns null, no crash, no under-pay)", () => {
    const result = selectUtxos([utxo(1), utxo(1), utxo(1)], 20_000, OUTPUT_COUNT);
    expect(result).toBeNull();
  });

  it("a genuinely broke wallet (some >1-sat coins but not enough) still returns null", () => {
    const result = selectUtxos([utxo(2), utxo(10), utxo(100)], 20_000, OUTPUT_COUNT);
    expect(result).toBeNull();
  });

  it("an empty UTXO set returns null", () => {
    expect(selectUtxos([], 20_000, OUTPUT_COUNT)).toBeNull();
  });
});
