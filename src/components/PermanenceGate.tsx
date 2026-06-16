"use client";

/**
 * One-time permanence acknowledgement shown BEFORE a user's first post (Phase 3
 * surfacing). The first post is the legally-meaningful moment — the first time the
 * user causes a permanent on-chain write — so this is an affirmative-consent gate,
 * not a buried footer link. Copy mirrors `legal/permanence-acknowledgement.md`.
 * Shown once per device (a localStorage flag set on confirm), then never again.
 */
interface PermanenceGateProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function PermanenceGate({ onConfirm, onCancel }: PermanenceGateProps) {
  return (
    <>
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="fixed inset-0 z-[70] w-full cursor-default bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
      />
      <div className="fixed inset-0 z-[70] flex items-start justify-center px-6 pt-[12svh] pointer-events-none">
        <div
          className="w-full max-w-sm overflow-hidden rounded-2xl border border-amber-400/20 shadow-2xl pointer-events-auto animate-[slideUp_0.3s_ease-out_backwards]"
          style={{ backgroundColor: "#0f0f0f" }}
        >
          <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
          <div className="px-5 py-5">
            <h2 className="text-sm font-semibold text-zinc-100">Before you post</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-zinc-300">
              Your posts are written to a public blockchain — they are{" "}
              <strong className="font-semibold text-zinc-100">
                permanent and visible to anyone, forever
              </strong>
              , and we cannot delete them. If you lose your recovery file or passphrase, your
              identity and any value tied to it are lost for good, with no way to recover them.
              Please don&apos;t post your real name, contact details, or anything private — once
              it&apos;s on-chain, it stays on-chain.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="flex-1 rounded-lg bg-amber-400 px-3 py-2 text-xs font-medium text-black transition-colors hover:bg-amber-300"
              >
                I understand — Post
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
