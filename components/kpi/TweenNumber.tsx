"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/utils";

/**
 * Numbers glide to their new value instead of jumping. Interruptible: a new
 * target restarts from wherever the tween currently is.
 */
export function useTween(target: number, duration = 380): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (reduced || !Number.isFinite(target)) {
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return value;
}

export function TweenNumber({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const v = useTween(value);
  return <span className={className}>{fmt(v, decimals)}</span>;
}
