import { describe, expect, it } from "vitest";
import { generateBackupHtml, RECOVERY_FILE_VERSION } from "./backup-template";
import { parseRecoveryText } from "./restore-from-file";

describe("generateBackupHtml ↔ parseRecoveryText round-trip", () => {
  it("emits a version-stamped encrypted file the restore parser accepts", () => {
    const html = generateBackupHtml({
      name: "anon_test",
      address: "1ABCdefGHIjklMNOpqrSTUvwxYZ012345",
      wif_encrypted: "enc:deadbeef",
      pathType: "save",
      hint: "my hint",
      createdAt: "2026-06-14T00:00:00.000Z",
    });

    // Marker block present + version stamp embedded centrally.
    expect(html).toContain("@BACKUP_DATA_START");
    expect(html).toContain(`"fileVersion":${RECOVERY_FILE_VERSION}`);

    // Round-trips cleanly through the restore-policy parser.
    const parsed = parseRecoveryText(html);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload).toEqual({
        kind: "encrypted",
        wif_encrypted: "enc:deadbeef",
        name: "anon_test",
        hint: "my hint",
      });
    }
  });

  it("contains no rotation/previous-key leftovers after the teardown", () => {
    const html = generateBackupHtml({
      name: "anon_x",
      address: "1ABCdefGHIjklMNOpqrSTUvwxYZ012345",
      wif_encrypted: "enc:abc",
      pathType: "save",
      createdAt: "2026-06-14T00:00:00.000Z",
    });
    expect(html).not.toContain("wif-old-block");
    expect(html).not.toContain("card-previous");
    expect(html).not.toContain("oldWif_encrypted");
    expect(html).not.toContain("meta-old-address");
  });
});
