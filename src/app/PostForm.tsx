"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { InstallBookmark } from "@/components/InstallBookmark";
import { useIdentityContext } from "@/contexts/IdentityContext";
import { AgentChat } from "./AgentChat";
import { createPost } from "./actions";

interface PostFormProps {
  onPostCreated?: (content: string, author: string, tempId: number) => void;
  onPostRejected?: (tempId: number, reason?: string) => void;
  agentHighlight?: boolean;
}

export function PostForm({
  onPostCreated,
  onPostRejected,
  agentHighlight,
}: PostFormProps): React.JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isListening, setIsListening] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [justPosted, setJustPosted] = useState(false);
  const [resumeNudge, setResumeNudge] = useState(false);
  // Surfaced mic errors (permission denied, no speech detected, etc.) — was
  // previously silent, leaving iOS users wondering why nothing happened.
  // Auto-clears after 4s; tap dismisses immediately.
  const [micError, setMicError] = useState<string | null>(null);
  // Set true between mic-tap and onstart firing — prevents double-tap races
  // that would call start() on an already-started instance (iOS throws).
  const isStartingRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { identity, needsUnlock, sign, requireIdentity } = useIdentityContext();
  // Set when the user tries to submit while locked — drives a focus + amber
  // border pulse once identity arrives, so the user knows their draft is
  // waiting and can hit Enter to send.
  const wantedToPostRef = useRef(false);

  // Clean up recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  // Refocus textarea after post completes
  const wasPendingRef = useRef(false);
  useEffect(() => {
    if (wasPendingRef.current && !isPending) {
      textareaRef.current?.focus();
    }
    wasPendingRef.current = isPending;
  }, [isPending]);

  const performSubmit = useCallback(
    (currentIdentity: NonNullable<typeof identity>, content: string): void => {
      if (!formRef.current) return;
      const formData = new FormData(formRef.current);
      formData.set("author", currentIdentity.name);
      formData.set("content", content);

      const tempId = Date.now();
      onPostCreated?.(content, currentIdentity.name, tempId);
      formRef.current.reset();
      setHasContent(false);
      setJustPosted(true);
      setTimeout(() => setJustPosted(false), 1500);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.focus();
      }

      startTransition(async () => {
        const sig = await sign(content);
        if (sig) {
          formData.set("signature", sig.signature);
          formData.set("pubkey", sig.pubkey);
        }
        const result = await createPost(formData);
        if (!result.ok) {
          onPostRejected?.(tempId, result.reason);
        }
      });
    },
    [onPostCreated, onPostRejected, sign]
  );

  function submitForm(): void {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    const content = formData.get("content");
    if (typeof content !== "string" || !content.trim()) return;
    const trimmed = content.trim();

    if (!requireIdentity() || !identity) {
      wantedToPostRef.current = true;
      return;
    }

    performSubmit(identity, trimmed);
  }

  // After sign-in, focus the textarea + pulse the amber border (only if
  // there's still text to send). The amber border itself shows whenever
  // hasContent, so the pulse is a "your draft is still here" reminder, not
  // a state change. Only fires when a locked submit was attempted —
  // prevents focus-stealing for users who unlock pre-emptively.
  useEffect(() => {
    if (identity && wantedToPostRef.current) {
      wantedToPostRef.current = false;
      textareaRef.current?.focus();
      const hasText = (textareaRef.current?.value.trim() ?? "").length > 0;
      if (hasText) {
        setResumeNudge(true);
        const timer = setTimeout(() => setResumeNudge(false), 1600);
        return () => clearTimeout(timer);
      }
    }
  }, [identity]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitForm();
    }
  }

  // Map raw SpeechRecognitionErrorEvent.error codes to user-friendly copy.
  // iOS Safari's most common failures are `not-allowed` (permission denied)
  // and `no-speech` (mic active but silence). Previously these all failed
  // silently — the user just saw the button do nothing.
  function micErrorMessage(code: string): string {
    switch (code) {
      case "not-allowed":
      case "service-not-allowed":
        return "Microphone access denied. Enable it in Settings → Safari → Microphone.";
      case "no-speech":
        return "Didn't catch that — try again.";
      case "audio-capture":
        return "Couldn't access the microphone.";
      case "network":
        return "Voice input needs an internet connection.";
      case "aborted":
        return ""; // user-initiated stop; no error to surface
      default:
        return "Voice input failed. Try again.";
    }
  }

  // Show a transient error toast that auto-clears after 4s. Empty string
  // clears immediately without showing anything.
  function showMicError(message: string): void {
    setIsListening(false);
    if (!message) {
      setMicError(null);
      return;
    }
    setMicError(message);
    setTimeout(() => {
      setMicError((prev) => (prev === message ? null : prev));
    }, 4000);
  }

  function toggleMic(): void {
    // Already listening — stop and clear state. Some iOS versions throw if
    // stop() is called on an already-ended instance; ignore those errors.
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* already stopped */
      }
      setIsListening(false);
      return;
    }

    // Guard against rapid double-taps between tap and `onstart` firing.
    if (isStartingRef.current) return;

    // Speech recognition is a secure-context API (HTTPS or localhost only).
    if (typeof window !== "undefined" && !window.isSecureContext) {
      showMicError("Voice input requires HTTPS.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showMicError("Voice input isn't supported in this browser.");
      return;
    }

    isStartingRef.current = true;

    // Best-effort permission pre-check. Safari historically returns "prompt"
    // or throws — wrap defensively. If we detect a definitive "denied" state,
    // surface the friendly nudge instead of attempting start() and failing
    // silently in onerror.
    const beginRecognition = (): void => {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognitionRef.current = recognition;

      // Use addEventListener for "start" — TypeScript's SpeechRecognition lib
      // type doesn't include the onstart property on all versions.
      recognition.addEventListener("start", () => {
        // Mic is actually live — flip the button visual now (not before).
        isStartingRef.current = false;
        setMicError(null);
        setIsListening(true);
      });

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // Build the transcript from FINAL results only, ignoring interim
        // results to reduce textarea churn. The final result fires once per
        // utterance on iOS Safari with `continuous=false`.
        let finalText = "";
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
          }
        }
        if (!finalText || !textareaRef.current) return;

        const el = textareaRef.current;
        // Append to existing content rather than overwriting — supports
        // dictating multiple chunks in one session.
        el.value = el.value ? `${el.value.trim()} ${finalText.trim()}` : finalText.trim();
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
        // CRITICAL: trigger React's onInput so `hasContent` updates and the
        // send button replaces the mic. Without this dispatch, direct .value
        // writes are invisible to React and the user can't send their post.
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };

      recognition.onend = () => {
        isStartingRef.current = false;
        recognitionRef.current = null;
        setIsListening(false);
      };

      recognition.onerror = (event: Event) => {
        isStartingRef.current = false;
        recognitionRef.current = null;
        const code = (event as { error?: string }).error ?? "unknown";
        const message = micErrorMessage(code);
        if (message) showMicError(message);
        else setIsListening(false);
      };

      try {
        recognition.start();
      } catch (e) {
        isStartingRef.current = false;
        // Abort the orphan instance before nulling the ref. Without this,
        // the addEventListener("start") handler attached above could still
        // fire if iOS retroactively starts the orphan — flipping isListening
        // true with a null recognitionRef. abort() definitively halts it
        // and clears all listeners on the instance.
        try {
          recognition.abort();
        } catch {
          /* abort on a never-started instance is a no-op per spec */
        }
        recognitionRef.current = null;
        // iOS throws InvalidStateError if start() is called while already
        // running. Treat as a no-op (the existing instance keeps listening).
        // Anything else is a real failure — surface to the user.
        const name = e instanceof Error ? e.name : "";
        if (name !== "InvalidStateError") {
          showMicError("Couldn't start voice input. Try again.");
        }
      }
    };

    // No pre-check. `navigator.permissions.query({ name: "microphone" })`
    // returns a stale "denied" on iOS Safari long after the user has
    // granted access in Settings — the Permissions API cache only
    // re-syncs after a hard refresh. Calling recognition.start() directly
    // is the single source of truth: iOS surfaces the native prompt on
    // first use, and `onerror`'s `not-allowed` path handles real denials.
    beginRecognition();
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submitForm();
      }}
      className="w-full max-w-2xl"
    >
      <div className="relative">
        <textarea
          ref={textareaRef}
          name="content"
          aria-label="Share an idea"
          placeholder={
            !identity && !needsUnlock ? "Setting up your identity..." : "Share an idea..."
          }
          maxLength={1000}
          disabled={!identity && !needsUnlock}
          onKeyDown={handleKeyDown}
          className={`block w-full bg-zinc-900 border rounded-3xl pl-4 pr-14 py-3 sm:pl-5 sm:py-4 text-sm sm:text-base resize-none focus:outline-none placeholder:text-zinc-600 min-h-[48px] sm:min-h-[56px] max-h-[200px] disabled:opacity-50 scrollbar-hide ${
            resumeNudge ? "" : "transition-colors duration-300"
          } ${
            justPosted
              ? "border-green-600/60 focus:border-green-600/60"
              : resumeNudge && hasContent
                ? "border-amber-400/60 focus:border-amber-400/60 animate-[nudgePulse_0.8s_ease-in-out_2]"
                : hasContent
                  ? "border-amber-400/60 focus:border-amber-400/60"
                  : "border-zinc-800 focus:border-zinc-700"
          }`}
          style={{ scrollbarWidth: "none" }}
          rows={1}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            setHasContent(el.value.trim().length > 0);
          }}
        />
        {hasContent ? (
          <button
            type="button"
            onClick={submitForm}
            className="absolute right-3 bottom-[7px] sm:bottom-[11px] bg-amber-500 text-black rounded-full p-2.5 transition-colors hover:bg-amber-400"
            title="Post"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14m0 0l-6-6m6 6l-6 6" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleMic}
            className={`absolute right-3 bottom-[7px] sm:bottom-[11px] rounded-full p-2.5 transition-colors ${
              isListening
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
            title={isListening ? "Stop recording" : "Voice to text"}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
        )}
      </div>
      {micError && (
        <button
          type="button"
          onClick={() => setMicError(null)}
          className="mt-1 w-full text-left text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 hover:bg-amber-500/15 transition-colors"
          aria-live="polite"
        >
          {micError}
        </button>
      )}
      {/* Three-column grid — helper text left (desktop only), install bookmark
          center, Ask AI right. Bookmark is centered relative to the textarea
          above. When the bookmark is not rendered (most of the time — only
          visible after the user has saved + protected + minimised the sheet),
          the center cell collapses gracefully. Mobile (helper text hidden)
          uses a sm:hidden spacer to hold the left cell's shape. */}
      <div className="grid grid-cols-3 items-center mt-1 ml-1 mr-1">
        <div className="hidden sm:flex items-center gap-2">
          <p className="text-[11px] text-zinc-600">Enter to post, Shift+Enter for new line</p>
          <span
            className={`text-[11px] text-green-500 transition-opacity duration-300 ${justPosted ? "opacity-100" : "opacity-0"}`}
            aria-live="polite"
          >
            Posted
          </span>
        </div>
        <div className="sm:hidden" />
        <div className="flex justify-center">
          <InstallBookmark />
        </div>
        <div className="flex justify-end">
          <AgentChat highlight={agentHighlight} />
        </div>
      </div>
    </form>
  );
}
