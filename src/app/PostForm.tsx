"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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

    // Opens SignInModal if locked; caller retaps after signing in.
    if (!identity) {
      wantedToPostRef.current = true;
      requireIdentity();
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

  function toggleMic(): void {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");

      if (textareaRef.current) {
        textareaRef.current.value = transcript;
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.start();
    setIsListening(true);
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
            className="absolute right-3 bottom-[5px] sm:bottom-[11px] bg-amber-500 text-black rounded-full p-2 transition-colors hover:bg-amber-400"
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
            className={`absolute right-3 bottom-[5px] sm:bottom-[11px] rounded-full p-2 transition-colors ${
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
      <div className="flex items-center justify-between mt-1 ml-1 mr-1">
        <div className="hidden sm:flex items-center gap-2">
          <p className="text-[11px] text-zinc-600">Enter to post, Shift+Enter for new line</p>
          <span
            className={`text-[11px] text-green-500 transition-opacity duration-300 ${justPosted ? "opacity-100" : "opacity-0"}`}
            aria-live="polite"
          >
            Posted
          </span>
        </div>
        <p className="text-[11px] text-zinc-600 sm:hidden">&nbsp;</p>
        <AgentChat highlight={agentHighlight} />
      </div>
    </form>
  );
}
