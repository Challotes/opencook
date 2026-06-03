import { describe, expect, it } from "vitest";
import { shouldShowInstallPitch } from "./install-pitch";

describe("shouldShowInstallPitch", () => {
  const allTrue = {
    backedUp: true,
    protected: true,
    standalone: false,
    installType: "one-tap" as const,
    engaged: false,
  };

  it("shows the pitch when all five conditions are met", () => {
    expect(shouldShowInstallPitch(allTrue)).toBe(true);
  });

  it("hides when the recovery file has not been saved", () => {
    expect(shouldShowInstallPitch({ ...allTrue, backedUp: false })).toBe(false);
  });

  it("hides when the user is not passphrase-protected (plaintext WIF)", () => {
    expect(shouldShowInstallPitch({ ...allTrue, protected: false })).toBe(false);
  });

  it("hides when both file is saved AND no passphrase (sequential flow not complete)", () => {
    expect(shouldShowInstallPitch({ ...allTrue, backedUp: true, protected: false })).toBe(false);
  });

  it("hides when the app is already running standalone (installed)", () => {
    expect(shouldShowInstallPitch({ ...allTrue, standalone: true })).toBe(false);
  });

  it("hides when installType is null (pre-hydration)", () => {
    expect(shouldShowInstallPitch({ ...allTrue, installType: null })).toBe(false);
  });

  it("hides when the platform is unsupported (e.g., desktop Firefox)", () => {
    expect(shouldShowInstallPitch({ ...allTrue, installType: "unsupported" })).toBe(false);
  });

  it("hides when the user has already engaged with install (accepted native prompt / appinstalled fired)", () => {
    expect(shouldShowInstallPitch({ ...allTrue, engaged: true })).toBe(false);
  });

  it("shows for manual-instructions installType (iOS Safari, desktop Safari, Firefox Android)", () => {
    expect(shouldShowInstallPitch({ ...allTrue, installType: "manual-instructions" })).toBe(true);
  });

  it("shows for open-in-safari installType (iOS Chrome/Brave/Firefox)", () => {
    expect(shouldShowInstallPitch({ ...allTrue, installType: "open-in-safari" })).toBe(true);
  });
});
