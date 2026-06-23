"use client";

import { useState } from "react";

interface PassphrasePromptProps {
  context: string;
  placeholder?: string;
  error: string;
  loading: boolean;
  onConfirm: (passphrase: string) => void;
  onCancel: () => void;
  confirmLabel?: string;
  hint?: string | null;
}

export function PassphrasePrompt({
  context,
  placeholder = "Passphrase",
  error,
  loading,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  hint,
}: PassphrasePromptProps): React.JSX.Element {
  const [value, setValue] = useState("");

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-400 leading-relaxed">{context}</p>
      <input
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value) onConfirm(value);
        }}
        onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
      />
      {hint && (
        <div className="border-l-2 border-amber-500/60 pl-2 py-0.5">
          <span className="text-[11px] text-amber-400/90">Hint: {hint}</span>
        </div>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (value) onConfirm(value);
          }}
          disabled={!value || loading}
          className="flex-1 bg-white text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Working..." : confirmLabel}
        </button>
      </div>
    </div>
  );
}
