"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Row } from "@/lib/types";

function Placeholder() {
  return <div className="h-[340px] w-full animate-pulse rounded-xl border border-border bg-surface sm:h-[460px]" aria-hidden="true" />;
}

// three.js (~0.6 MB) is only fetched once this section is about to scroll into view.
const Scene = dynamic(() => import("./SeasonalScene"), { ssr: false, loading: () => <Placeholder /> });

export function SeasonalLandscape({ rows, name }: { rows: Row[]; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Very old browsers without IntersectionObserver just load the scene straight away.
  const [show, setShow] = useState(() => typeof window !== "undefined" && !("IntersectionObserver" in window));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <div ref={ref}>{show ? <Scene rows={rows} name={name} /> : <Placeholder />}</div>;
}
