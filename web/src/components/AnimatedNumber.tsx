"use client";

import { useEffect, useRef } from "react";
import { MOTION_OK, registerGsap } from "@/lib/motion";

/** Tweens between values when `value` changes (e.g. while scrubbing months). Screen readers get the final value. */
export function AnimatedNumber({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const final = value.toFixed(decimals);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const gsap = registerGsap();
    const mm = gsap.matchMedia();
    const from = prev.current;
    prev.current = value;
    mm.add(MOTION_OK, () => {
      if (from === value) return;
      const o = { v: from };
      gsap.to(o, {
        v: value,
        duration: 0.45,
        ease: "power2.out",
        overwrite: true,
        onUpdate: () => { el.textContent = o.v.toFixed(decimals); },
        onComplete: () => { el.textContent = final; },
      });
    });
    return () => {
      mm.revert();
      el.textContent = final;
    };
  }, [value, decimals, final]);

  return (
    <>
      <span ref={ref} aria-hidden="true">{final}</span>
      <span className="sr-only">{final}</span>
    </>
  );
}
