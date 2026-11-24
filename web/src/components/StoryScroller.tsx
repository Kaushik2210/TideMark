"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { LakeMap } from "./LakeMap";
import { formatMonth } from "@/lib/data";
import { registerGsap } from "@/lib/motion";
import type { Chapter } from "@/lib/story";
import type { LakeIndex, Row } from "@/lib/types";

const TONE: Record<Chapter["evidence"]["tone"], string> = {
  ok: "border-fused text-fused",
  weak: "border-radar text-radar",
  fail: "border-danger text-danger",
  info: "border-border text-muted",
};

/**
 * Scroll-driven tour. The map is pinned and follows whichever chapter is in view (month and framing); the chapters
 * are ordinary headings and paragraphs, so the story reads fine without the map, without JavaScript animation, and
 * with a screen reader. Each chapter says how it is known, and links to its published source where there is one.
 */
export function StoryScroller({ chapters, lakes, series }: { chapters: Chapter[]; lakes: LakeIndex[]; series: Record<string, Row[]> }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const cur = chapters[active];

  useEffect(() => {
    registerGsap();
    const triggers = refs.current.map((el, i) =>
      el
        ? ScrollTrigger.create({
            trigger: el,
            start: "top 60%",
            end: "bottom 60%",
            onToggle: (self) => { if (self.isActive) setActive(i); },
          })
        : null,
    );
    return () => triggers.forEach((t) => t?.kill());
  }, [chapters.length]);

  return (
    <div className="mx-auto grid max-w-[1400px] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="sticky top-14 z-10 h-[42dvh] border-b border-border lg:h-[calc(100dvh-3.5rem)] lg:border-b-0 lg:border-r">
        <LakeMap
          month={cur.month}
          lakes={lakes}
          series={series}
          ghost={false}
          basemap="map"
          focus={cur.focus}
          interactive={false}
          ariaLabel={`Map of the lakes in ${formatMonth(cur.month)}, following the story`}
          className="absolute inset-0"
        />
        <div aria-hidden="true" className="pointer-events-none absolute left-3 top-3 rounded-md bg-surface/90 px-3 py-1.5">
          <p className="num font-serif text-2xl font-semibold" data-testid="story-month">{formatMonth(cur.month)}</p>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-surface/90 px-3 py-1.5 text-xs text-muted">
          Chapter {active + 1} of {chapters.length}
        </div>
      </div>

      <div className="px-4 pb-24 sm:px-8">
        {chapters.map((c, i) => (
          <section
            key={c.id}
            id={c.id}
            ref={(el) => { refs.current[i] = el; }}
            aria-labelledby={`${c.id}-h`}
            data-chapter={i}
            className={`flex min-h-[70dvh] flex-col justify-center border-l-4 py-12 pl-5 transition-colors duration-500 motion-reduce:transition-none ${i === active ? "border-accent" : "border-transparent"}`}
          >
            <p className="text-sm font-medium uppercase tracking-wide text-accent">{c.kicker}</p>
            <h2 id={`${c.id}-h`} className="mt-1 font-serif text-3xl font-semibold leading-tight">{c.title}</h2>
            <div className="mt-4 max-w-xl space-y-3 text-[1.0625rem] leading-relaxed">
              {c.body.map((p) => <p key={p}>{p}</p>)}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className={`rounded-full border px-2.5 py-0.5 ${TONE[c.evidence.tone]}`}>{c.evidence.label}</span>
              {c.evidence.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                  Source: {s.name}
                </a>
              ))}
            </div>
            {i === chapters.length - 1 ? (
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/" className="tap inline-flex items-center rounded-md bg-accent px-5 font-medium text-bg">Explore the map</Link>
                <Link href="/lakes/" className="tap inline-flex items-center rounded-md border border-border px-5 font-medium hover:bg-surface-2">Compare the lakes</Link>
                <Link href="/contribute/" className="tap inline-flex items-center rounded-md border border-border px-5 font-medium hover:bg-surface-2">Help test it</Link>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
