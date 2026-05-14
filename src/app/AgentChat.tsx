"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Message {
  from: "user" | "agent";
  text: string;
}

const SUGGESTED = [
  "What is this?",
  "How does booting work?",
  "What's the fairness agent?",
  "How do I post?",
];

export function AgentChat({ highlight }: { highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);

  const [userScrolled, setUserScrolled] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          from: "agent",
          text: "Hey! I can help you understand BSVibes, brainstorm ideas for posts, or answer any questions. What are you curious about?",
        },
      ]);
    }
  }, [open, messages.length]);

  // Only auto-scroll if user hasn't manually scrolled up
  useEffect(() => {
    if (!userScrolled) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [userScrolled]);

  // Reset scroll tracking when user sends a new message
  function handleUserScroll() {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolled(!atBottom);
  }

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Clean up any in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const ask = useCallback(async function ask(question: string) {
    const userMsg: Message = { from: "user", text: question };
    const thinking: Message = { from: "agent", text: "..." };
    const newMessages = [...messagesRef.current, userMsg];
    setMessages([...newMessages, thinking]);
    setInput("");
    setIsStreaming(true);
    setUserScrolled(false); // auto-scroll to user's own message

    // Abort any previous stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.filter((m) => m.text !== "..."),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessages([
          ...newMessages,
          { from: "agent", text: errorText || "Agent had a hiccup — try again in a moment." },
        ]);
        setIsStreaming(false);
        return;
      }

      if (!res.body) {
        setMessages([
          ...newMessages,
          { from: "agent", text: "Couldn't reach the agent right now." },
        ]);
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        // Update the last message with accumulated text
        const text = accumulated;
        setMessages([...newMessages, { from: "agent", text }]);
      }

      // Final update (ensure last chunk is flushed)
      if (accumulated) {
        setMessages([...newMessages, { from: "agent", text: accumulated }]);
      } else {
        setMessages([...newMessages, { from: "agent", text: "I'm not sure how to answer that." }]);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      console.error("Agent stream error:", e);
      setMessages([...newMessages, { from: "agent", text: "Couldn't reach the agent right now." }]);
    } finally {
      setIsStreaming(false);
    }
  }, []);

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    ask(input.trim());
    // Dismiss the iOS keyboard after sending — chat UX wants the user
    // reading the streaming reply, not staring at a focused input.
    inputRef.current?.blur();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-2 transition-all mt-1 ${
          highlight
            ? "text-amber-300 border-amber-500 bg-amber-500/10 scale-110 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
            : "text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300 hover:bg-zinc-900"
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${highlight ? "bg-amber-400 animate-ping" : "bg-cyan-400/70 animate-pulse"}`}
        />
        Ask AI
        {/* Decorative GitHub tease — devs notice, casuals don't. The actual
            link lives in the modal footer; this is a hint, not a CTA.
            Shown in BOTH normal and highlight states — the manifesto's
            "Chat with the agent" CTA puts the pill into highlight, and
            that's exactly when the open-source signal is most contextually
            relevant (the user just read the Vision pitch). */}
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
          className={`transition-colors ${
            highlight ? "text-amber-200/70" : "text-zinc-300 group-hover:text-zinc-100"
          }`}
        >
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 z-50 w-full bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] cursor-default"
        aria-label="Close dialog"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div
          className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden pointer-events-auto animate-[slideUp_0.3s_ease-out] shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="BSVibes Agent"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-sm font-medium text-zinc-300">BSVibes Agent</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4 4l8 8m0-8l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={handleUserScroll}
            className="h-[60vh] sm:h-[450px] overflow-y-auto scrollbar-hide px-4 py-3 space-y-3"
            style={{ scrollbarWidth: "none" }}
          >
            {messages.map((msg) => (
              <div
                key={`${msg.from}-${msg.text.slice(0, 32)}`}
                className={`flex flex-col ${msg.from === "user" ? "items-end" : "items-start"}`}
              >
                <span className="text-[10px] text-zinc-600 mb-0.5 px-1">
                  {msg.from === "agent" ? "agent" : "you"}
                </span>
                <div
                  className={`rounded-xl px-3 py-2 text-sm leading-relaxed max-w-[85%] ${
                    msg.from === "agent"
                      ? "bg-zinc-900 text-zinc-300"
                      : "bg-amber-500/10 border border-amber-500/20 text-amber-200"
                  } ${msg.text === "..." ? "animate-pulse" : ""}`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested questions */}
          {messages.length <= 1 && (
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => ask(q)}
                  disabled={isStreaming}
                  className="text-xs text-zinc-500 border border-zinc-800 rounded-full px-3 py-1.5 hover:border-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-zinc-800 px-4 py-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmit(e);
                }
              }}
              placeholder={isStreaming ? "Thinking..." : "Ask something..."}
              disabled={isStreaming}
              enterKeyHint="send"
              autoCapitalize="sentences"
              autoCorrect="on"
              autoComplete="off"
              className="w-full bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Open-source footer — quiet trust signal for users investigating
              the project. The pill's GitHub tease (decorative) brings them
              here; this is the actual repo link. Center-aligned with a
              half-opacity divider so it reads as a footer tier subordinate
              to the input row above. Safe-area padding so the link doesn't
              sit on the iOS home indicator on bottom-sheet display. */}
          <div className="border-t border-zinc-800/50 px-4 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5 flex justify-center">
            <a
              href="https://github.com/Challotes/bsvibes-"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 transition-colors"
            >
              <svg
                viewBox="0 0 16 16"
                width="16"
                height="16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              The code is open.
              <span className="text-zinc-600">↗</span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
