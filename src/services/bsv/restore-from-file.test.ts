import { describe, expect, it } from "vitest";
import { parseRecoveryText } from "./restore-from-file";

describe("parseRecoveryText", () => {
  it("parses HTML with marker block + encrypted payload (version-stamped)", () => {
    const html = `<!DOCTYPE html><html><head></head><body><script>
      // @BACKUP_DATA_START
      const BACKUP_DATA = {"wif_encrypted":"enc:abc123","name":"anon_test","hint":"my hint","fileVersion":1};
      // @BACKUP_DATA_END
    </script></body></html>`;
    const result = parseRecoveryText(html);
    expect(result).toEqual({
      ok: true,
      payload: {
        kind: "encrypted",
        wif_encrypted: "enc:abc123",
        name: "anon_test",
        hint: "my hint",
      },
    });
  });

  it("parses legacy const BACKUP_DATA container (no marker) when version-stamped", () => {
    const html = `<!DOCTYPE html><html><body><script>
      const BACKUP_DATA = {"wif_encrypted":"enc:legacy","name":"anon_old","fileVersion":1};
    </script></body></html>`;
    const result = parseRecoveryText(html);
    expect(result).toEqual({
      ok: true,
      payload: {
        kind: "encrypted",
        wif_encrypted: "enc:legacy",
        name: "anon_old",
      },
    });
  });

  it("parses standalone JSON file with encrypted payload (version-stamped)", () => {
    const json = `{"wif_encrypted":"enc:abc","name":"anon_json","hint":"clue","fileVersion":1}`;
    const result = parseRecoveryText(json);
    expect(result).toEqual({
      ok: true,
      payload: {
        kind: "encrypted",
        wif_encrypted: "enc:abc",
        name: "anon_json",
        hint: "clue",
      },
    });
  });

  // --- Restore policy: legacy files are rejected ---

  it("rejects an encrypted file with no version stamp (pre-policy file)", () => {
    const json = `{"wif_encrypted":"enc:old","name":"anon_pre"}`;
    expect(parseRecoveryText(json)).toEqual({ ok: false, error: "unsupported_version" });
  });

  it("rejects a plaintext-wif HTML file as unsupported_version", () => {
    const html = `<!DOCTYPE html><html><body><script>
      // @BACKUP_DATA_START
      const BACKUP_DATA = {"wif":"L1plainKey","name":"anon_x"};
      // @BACKUP_DATA_END
    </script></body></html>`;
    expect(parseRecoveryText(html)).toEqual({ ok: false, error: "unsupported_version" });
  });

  it("rejects a plaintext-wif JSON file as unsupported_version", () => {
    const json = `{"wif":"L1plain","name":"anon_p"}`;
    expect(parseRecoveryText(json)).toEqual({ ok: false, error: "unsupported_version" });
  });

  it("rejects plaintext wif even with a version stamp (no plain path survives)", () => {
    const json = `{"wif":"L1plainStamped","name":"anon_ps","fileVersion":1}`;
    expect(parseRecoveryText(json)).toEqual({ ok: false, error: "unsupported_version" });
  });

  it("handles HTML detection via BACKUP_DATA substring — plaintext still rejected", () => {
    const html = `<some-html><script>const BACKUP_DATA = {"wif":"L1noDoctype"};</script>`;
    expect(parseRecoveryText(html)).toEqual({ ok: false, error: "unsupported_version" });
  });

  // --- Malformed / empty containers ---

  it("returns parse_failed for invalid HTML (BACKUP_DATA absent)", () => {
    const html = `<!DOCTYPE html><html><body>nothing here</body></html>`;
    expect(parseRecoveryText(html)).toEqual({ ok: false, error: "parse_failed" });
  });

  it("returns parse_failed for malformed JSON", () => {
    expect(parseRecoveryText(`{not valid json`)).toEqual({ ok: false, error: "parse_failed" });
  });

  it("returns parse_failed for random text", () => {
    expect(parseRecoveryText("this is not a recovery file")).toEqual({
      ok: false,
      error: "parse_failed",
    });
  });

  it("returns parse_failed for empty input", () => {
    expect(parseRecoveryText("")).toEqual({ ok: false, error: "parse_failed" });
  });

  it("returns no_key when a version-stamped file has neither wif nor wif_encrypted", () => {
    expect(parseRecoveryText(`{"name":"anon_x","hint":"clue","fileVersion":1}`)).toEqual({
      ok: false,
      error: "no_key",
    });
  });
});
