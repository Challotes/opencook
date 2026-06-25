import { describe, expect, it } from "vitest";
import { extForMime, pickAudioMimeType } from "./useVoiceToText";

describe("extForMime", () => {
  it("maps known MIME types to file extensions", () => {
    expect(extForMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extForMime("audio/webm")).toBe("webm");
    expect(extForMime("audio/mp4")).toBe("mp4"); // iOS Safari
    expect(extForMime("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extForMime("audio/wav")).toBe("wav");
  });

  it("falls back by substring for unmapped variants", () => {
    expect(extForMime("audio/mp4;codecs=mp4a.40.2")).toBe("mp4");
    expect(extForMime("audio/ogg")).toBe("ogg");
    expect(extForMime("audio/x-wav")).toBe("wav");
  });

  it("defaults to webm for empty/unknown types", () => {
    expect(extForMime("")).toBe("webm");
    expect(extForMime("audio/aac")).toBe("webm");
  });
});

describe("pickAudioMimeType", () => {
  it("returns empty string when MediaRecorder is unavailable (node/test env)", () => {
    // The hook guards on `typeof MediaRecorder === "undefined"` so this is a
    // safe no-op in non-browser environments — the recorder then uses the
    // browser default.
    expect(pickAudioMimeType()).toBe("");
  });
});
