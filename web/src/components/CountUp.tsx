"use client";

import { useEffect, useRef } from "react";
import { MOTION_OK, registerGsap } from "@/lib/motion";

/** A number that counts up when scrolled into view. Screen readers and no-motion users get the final value only. */
export function CountUp({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const final = value.toFixed(decimals);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const gsap = registerGsap();
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const o = { v: 0 };
      el.textContent = (0).toFixed(decimals);
      gsap.to(o, {
        v: value,
        duration: 1.1,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 95%", once: true },
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
      <span ref={ref} aria-hidden="true" className={`num ${className ?? ""}`}>{final}</span>
      <span className="sr-only">{final}</span>
    </>
  );
}
