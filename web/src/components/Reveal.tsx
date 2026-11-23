"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { MOTION_OK, registerGsap } from "@/lib/motion";

type Tag = "div" | "section" | "ul";

interface Props {
  as?: Tag;
  className?: string;
  /** Animate the direct children one after another instead of the block as a whole. */
  stagger?: boolean;
  children: ReactNode;
  "aria-labelledby"?: string;
}

/** Fades content up once as it scrolls into view. Content is fully visible without JS or with reduced motion. */
export function Reveal({ as: Tag = "div", className, stagger = false, children, ...rest }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const gsap = registerGsap();
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const targets = stagger ? Array.from(el.children) : [el];
      gsap.from(targets, {
        opacity: 0,
        y: 22,
        duration: 0.7,
        ease: "power2.out",
        stagger: stagger ? 0.09 : 0,
        clearProps: "opacity,transform",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
      });
    });
    return () => mm.revert();
  }, [stagger]);

  const Component = Tag as "div";
  return (
    <Component ref={ref as React.RefObject<HTMLDivElement>} className={className} {...rest}>
      {children}
    </Component>
  );
}
