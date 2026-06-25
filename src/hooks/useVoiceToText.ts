"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice-to-text via record-and-transcribe (the "ChatGPT way") — `getUserMedia`
 * + `MediaRecorder` in the browser, audio POSTed to `/api/transcribe` (Groq
 * Whisper). Replaces the old Web Speech API mic, which is unfixable in iOS PWAs.
 * See DECISIONS.md "Mic: record + Groq Whisper".
 *
 * The host (PostForm) passes an `onTranscript(text)` callback that inserts the
 * returned text into the compose box. This hook owns ONLY the audio capture +
 * upload + state machine; it never touches the textarea.
 */

export type VoiceState = "idle" | "recording" | "transcribing";

// MIME candidates in preference order. Chrome/Firefox/Android → webm/opus;
// iOS Safari only supports audio/mp4 (AAC). Never hardcode — detect at runtime.
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4", // iOS Safari (AAC)
  "audio/ogg;codecs=opus",
  "audio/wav",
];

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm;codecs=opus": "webm",
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg;codecs=opus": "ogg",
  "audio/wav": "wav",
};

/** Pick the best MediaRecorder MIME type this browser supports (or "" = default). */
export function pickAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Map a MIME type to the file extension Whisper expects for the container. */
export function extForMime(mime: string): string {
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export interface UseVoiceToText {
  state: VoiceState;
  error: string | null;
  /** Whether this browser can record audio at all (getUserMedia + MediaRecorder). */
  supported: boolean;
  /** Tap handler: idle → record, recording → stop+transcribe, transcribing → no-op. */
  toggle: () => void;
  dismissError: () => void;
}

const ERROR_AUTO_DISMISS_MS = 5000;

export function useVoiceToText(onTranscript: (text: string) => void): UseVoiceToText {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("");
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest callback without re-creating the recorder handlers.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const showError = useCallback((msg: string) => {
    setState("idle");
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), ERROR_AUTO_DISMISS_MS);
  }, []);

  const releaseStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  // Release mic + timers on unmount so a navigation away never leaves the mic on.
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {
        /* already stopped */
      }
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    if (typeof window !== "undefined" && !window.isSecureContext) {
      showError("Voice input needs a secure (https) connection.");
      return;
    }
    if (!supported) {
      showError("Voice input isn't supported in this browser.");
      return;
    }

    // getUserMedia MUST be called synchronously within the user-gesture tick
    // (this runs straight off the button tap, before any await) so iOS allows it.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        showError("Microphone access denied. Enable it in your browser settings.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        showError("No microphone found.");
      } else {
        showError("Couldn't access the microphone.");
      }
      return;
    }
    streamRef.current = stream;

    const mime = pickAudioMimeType();
    mimeRef.current = mime;
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      releaseStream();
      showError("Couldn't start recording.");
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (ev) => {
      // Drop empty chunks — iOS Safari emits zero-byte chunks that confuse Whisper.
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onerror = () => {
      releaseStream();
      recorderRef.current = null;
      showError("Recording failed. Try again.");
    };
    recorder.onstop = async () => {
      releaseStream();
      recorderRef.current = null;
      const chunks = chunksRef.current;
      chunksRef.current = [];
      if (chunks.length === 0) {
        setState("idle");
        return;
      }
      const type = mimeRef.current || chunks[0]?.type || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) {
        setState("idle");
        return;
      }
      const file = new File([blob], `recording.${extForMime(type)}`, { type });

      setState("transcribing");
      try {
        const fd = new FormData();
        fd.append("audio", file);
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          showError(data?.error ?? "Couldn't transcribe that — try again.");
          return;
        }
        const data = (await res.json()) as { text?: string };
        const text = (data.text ?? "").trim();
        if (text) {
          onTranscriptRef.current(text);
          setState("idle");
        } else {
          showError("Didn't catch that — try again.");
        }
      } catch {
        showError("Couldn't reach transcription. Check your connection.");
      }
    };

    // start(1000): 1-second timeslice. REQUIRED for iOS Safari — its single
    // unchunked mp4 blob otherwise garbles Whisper (cuts off after a few words).
    // Chunking also lets us drop empty fragments in ondataavailable.
    recorder.start(1000);
    setState("recording");
  }, [supported, showError, releaseStream]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop(); // → onstop handles upload + the transition to "transcribing"
      } catch {
        /* already stopped */
      }
    }
  }, []);

  const toggle = useCallback(() => {
    if (state === "recording") stopRecording();
    else if (state === "idle") void startRecording();
    // "transcribing" → ignore taps until it resolves.
  }, [state, startRecording, stopRecording]);

  const dismissError = useCallback(() => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setError(null);
  }, []);

  return { state, error, supported, toggle, dismissError };
}
