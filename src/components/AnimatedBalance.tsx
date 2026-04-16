"use client";

import { useEffect, useRef, useState } from "react";
import { satsToDollars } from "@/hooks/useBsvPrice";

interface AnimatedBalanceProps {
  sats: number;
  bsvPrice?: number;
  isGoat?: boolean;
  className?: string;
  /**
   * Optional separate value that drives the flash + "Agentic fairness" label.
   * When provided, the displayed number tracks `sats` but the flash/label only
   * fires when `flashTrigger` increases. Use this to flash on earnings while
   * displaying balance.
   */
  flashTrigger?: number;
}

export function AnimatedBalance({
  sats,
  bsvPrice = 50,
  isGoat = true,
  className = "",
  flashTrigger,
}: AnimatedBalanceProps) {
  const [displayed, setDisplayed] = useState(sats);
  const [flash, setFlash] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const prevSatsRef = useRef(sats);
  const prevFlashRef = useRef(flashTrigger ?? 0);
  const rafRef = useRef<number | null>(null);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Count-up animation when sats changes
  useEffect(() => {
    const prev = prevSatsRef.current;
    const next = sats;
    prevSatsRef.current = sats;

    if (next === prev) return;

    // If no flashTrigger, don't animate at all (just snap)
    if (flashTrigger !== undefined) {
      setDisplayed(next);
      return;
    }

    // Legacy mode (no flashTrigger): animate count-up + flash on increase
    if (next <= prev) {
      setDisplayed(next);
      return;
    }

    const duration = 600;
    const start = performance.now();

    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayed(Math.round(prev + (next - prev) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sats, flashTrigger]);

  // Flash + label when flashTrigger increases (real earnings only)
  useEffect(() => {
    if (flashTrigger === undefined) return;

    const prev = prevFlashRef.current;
    const next = flashTrigger;
    prevFlashRef.current = next;

    if (next <= prev || prev === 0) return; // skip initial load

    const delta = next - prev;
    const deltaDisplay = isGoat
      ? `+${delta.toLocaleString()} sats`
      : `+${satsToDollars(delta, bsvPrice)}`;

    setFlash(true);
    setLabel(`${deltaDisplay} · Agentic fairness`);
    setTimeout(() => setFlash(false), 1200);

    if (labelTimer.current) clearTimeout(labelTimer.current);
    labelTimer.current = setTimeout(() => setLabel(null), 3500);
  }, [flashTrigger, isGoat, bsvPrice]);

  const formattedValue = isGoat
    ? `${displayed.toLocaleString()} sats`
    : satsToDollars(displayed, bsvPrice);

  return (
    <span className="relative inline-flex items-center">
      <span
        className={`
          font-medium tabular-nums transition-all duration-300
          ${flash ? "text-amber-300 scale-110" : "text-amber-400 scale-100"}
          ${className}
        `}
        style={{ display: "inline-block", transformOrigin: "center" }}
      >
        {formattedValue}
      </span>

      {/* Agentic fairness label */}
      {label && (
        <span
          className="absolute top-full right-0 mt-1 whitespace-nowrap text-[9px] text-amber-400/80 font-medium transition-opacity duration-500"
          aria-live="polite"
        >
          {label}
        </span>
      )}
    </span>
  );
}
