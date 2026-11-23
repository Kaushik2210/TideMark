"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Flip } from "gsap/Flip";
import { AnimatedNumber } from "./AnimatedNumber";
import { MiniTrend } from "./MiniTrend";
import { Reveal } from "./Reveal";
import { SourceMark } from "./SourceMark";
import { WaterStripes } from "./WaterStripes";
import { fmtHa, formatMonth } from "@/lib/data";
import { MOTION_OK, registerGsap } from "@/lib/motion";
import type { LakeIndex, Row } from "@/lib/types";

type Metric = "ha" | "pct";
type Range = "all" | "5y" | "2y";
type Sort = "name" | "water" | "health" | "outline";

// Colour AND dash pattern per lake, so the chart never relies on colour alone.
const STYLE = [
  { color: "var(--lake-1)", dash: undefined },
  { color: "var(--lake-2)", dash: "8 4" },
  { color: "var(--lake-3)", dash: "1.5 4.5" },
];

const W = 720;
const H = 300;
const M = { l: 48, r: 14, t: 12, b: 30 };

const short = (l: LakeIndex) => l.name.replace(" (Halasuru Kere)", "").replace(" Lake", "");

function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= v * 1.05) return m * mag;
  return 10 * mag;
}

export function LakesExplorer({ lakes, series }: { lakes: LakeIndex[]; series: Record<string, Row[]> }) {
  const uid = useId();
  const months = useMemo(() => (series[lakes[0].id] ?? []).map((r) => r.month), [series, lakes]);
  const n = months.length;

  const [metric, setMetric] = useState<Metric>("ha");
  const [range, setRange] = useState<Range>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [shown, setShown] = useState<Set<string>>(() => new Set(lakes.map((l) => l.id)));
  const [idx, setIdx] = useState(n - 1);
  const [hover, setHover] = useState<string | null>(null);

  const start = range === "all" ? 0 : Math.max(0, n - (range === "5y" ? 60 : 24));
  const cur = Math.min(Math.max(idx, start), n - 1);
  const visible = lakes.filter((l) => shown.has(l.id));

  const value = (l: LakeIndex, i: number): number | null => {
    const r = series[l.id]?.[i];
    if (!r || r.source === "none" || r.area_ha === null) return null;
    return metric === "ha" ? r.area_ha : (r.area_ha / l.outline_ha) * 100;
  };

  const visibleKey = visible.map((l) => l.id).join();
  const yMax = useMemo(() => {
    let mx = 0;
    for (const l of visible) for (let i = start; i < n; i++) mx = Math.max(mx, value(l, i) ?? 0);
    return niceMax(mx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, metric, start, n]);

  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = (i: number) => M.l + ((i - start) / Math.max(1, n - 1 - start)) * iw;
  const y = (v: number) => M.t + ih - (v / yMax) * ih;
  const fmt = (v: number) => (metric === "ha" ? `${v.toFixed(1)} ha` : `${v.toFixed(1)}% of outline`);

  const path = (l: LakeIndex) => {
    let d = "";
    let pen = false;
    for (let i = start; i < n; i++) {
      const v = value(l, i);
      if (v === null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  // Line draw-on: wipe the clip rectangle open when the chart first appears and when its scale changes.
  const clip = useRef<SVGRectElement>(null);
  useLayoutEffect(() => {
    const el = clip.current;
    if (!el) return;
    const gsap = registerGsap();
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.fromTo(el, { attr: { width: 0 } }, { attr: { width: W }, duration: 1.0, ease: "power2.out" });
    });
    return () => {
      mm.revert();
      el.setAttribute("width", String(W));
    };
  }, [metric, range, shown]);

  // Re-ordering the cards glides them to their new places (GSAP Flip); skipped with reduced motion.
  const list = useRef<HTMLUListElement>(null);
  const flip = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const changeSort = (k: Sort) => {
    registerGsap();
    if (list.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      flip.current = Flip.getState(list.current.children);
    }
    setSort(k);
  };
  useLayoutEffect(() => {
    if (!flip.current) return;
    Flip.from(flip.current, { duration: 0.55, ease: "power2.inOut" });
    flip.current = null;
  }, [sort]);

  const ordered = useMemo(() => {
    const v = (l: LakeIndex) => series[l.id]?.[cur]?.area_ha ?? -1;
    const by: Record<Sort, (a: LakeIndex, b: LakeIndex) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      water: (a, b) => v(b) - v(a),
      health: (a, b) => b.health.score - a.health.score,
      outline: (a, b) => b.outline_ha - a.outline_ha,
    };
    return [...lakes].sort(by[sort]);
  }, [lakes, series, sort, cur]);

  const scrub = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointermove" && e.buttons === 0 && e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const f = Math.min(1, Math.max(0, (px - M.l) / iw));
    setIdx(start + Math.round(f * (n - 1 - start)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 12 : 1;
    let next = cur;
    if (e.key === "ArrowLeft") next = cur - step;
    else if (e.key === "ArrowRight") next = cur + step;
    else if (e.key === "Home") next = start;
    else if (e.key === "End") next = n - 1;
    else return;
    e.preventDefault();
    setIdx(Math.min(n - 1, Math.max(start, next)));
  };
  const toggle = (id: string) =>
    setShown((s) => {
      const t = new Set(s);
      if (t.has(id)) { if (t.size > 1) t.delete(id); } else t.add(id);
      return t;
    });

  const pill = (on: boolean) => `tap rounded-full border px-4 text-sm ${on ? "border-accent bg-surface-2" : "border-border text-muted hover:text-fg"}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const yearTicks = months.map((m, i) => ({ m, i })).filter(({ m, i }) => i >= start && m.endsWith("-01"));
  const readout = `${formatMonth(months[cur])}: ` + (visible
    .map((l) => { const v = value(l, cur); return `${short(l)} ${v === null ? "no usable scene" : fmt(v)}`; })
    .join("; "));

  return (
    <div className="space-y-10">
      <Reveal as="section" aria-labelledby={`${uid}-cmp`} className="space-y-4">
        <h2 id={`${uid}-cmp`} className="font-serif text-2xl font-semibold">Compare the lakes</h2>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div role="group" aria-label="Measure" className="flex gap-2">
            <button type="button" aria-pressed={metric === "ha"} onClick={() => setMetric("ha")} className={pill(metric === "ha")}>Hectares</button>
            <button type="button" aria-pressed={metric === "pct"} onClick={() => setMetric("pct")} className={pill(metric === "pct")}>Share of outline</button>
          </div>
          <div role="group" aria-label="Time range" className="flex gap-2">
            {([["all", "2016 on"], ["5y", "Last 5 years"], ["2y", "Last 2 years"]] as const).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={range === v} onClick={() => setRange(v)} className={pill(range === v)}>{label}</button>
            ))}
          </div>
        </div>

        <div role="group" aria-label="Lakes shown" className="flex flex-wrap gap-2">
          {lakes.map((l, k) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={shown.has(l.id)}
              onClick={() => toggle(l.id)}
              onMouseEnter={() => setHover(l.id)}
              onMouseLeave={() => setHover(null)}
              className={`${pill(shown.has(l.id))} inline-flex items-center gap-2`}
            >
              <svg width="30" height="10" aria-hidden="true">
                <line x1="1" x2="29" y1="5" y2="5" stroke={STYLE[k].color} strokeWidth="2.4" strokeDasharray={STYLE[k].dash} strokeLinecap="round" opacity={shown.has(l.id) ? 1 : 0.35} />
              </svg>
              {short(l)}
            </button>
          ))}
        </div>

        <div
          tabIndex={0}
          role="group"
          aria-label="Open water over time for the selected lakes. Use the left and right arrow keys to move through months; hold Shift to jump a year."
          aria-describedby={`${uid}-readout`}
          onKeyDown={onKey}
          className="overflow-x-auto rounded-xl border border-border bg-surface p-2"
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[620px] touch-pan-y select-none" onPointerMove={scrub} onPointerDown={scrub} role="img" aria-label={`Line chart of ${metric === "ha" ? "open-water hectares" : "open water as a share of each lake's OpenStreetMap outline"} by month for ${visible.map(short).join(", ")}.`}>
            <defs>
              <clipPath id="lakes-clip"><rect ref={clip} x="0" y="0" width={W} height={H} /></clipPath>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
                <text x={M.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">{metric === "ha" ? Math.round(t) : `${Math.round(t)}%`}</text>
              </g>
            ))}
            {yearTicks.filter((_, k) => (range === "2y" ? true : k % (range === "all" ? 1 : 1) === 0)).map(({ m, i }) => (
              <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)" className="num">{m.slice(0, 4)}</text>
            ))}
            <g clipPath="url(#lakes-clip)">
              {visible.map((l) => {
                const k = lakes.indexOf(l);
                const dim = hover !== null && hover !== l.id;
                return (
                  <path key={l.id} d={path(l)} fill="none" stroke={STYLE[k].color} strokeWidth={hover === l.id ? 3.2 : 2} strokeDasharray={STYLE[k].dash} strokeLinecap="round" strokeLinejoin="round" opacity={dim ? 0.3 : 1} />
                );
              })}
            </g>
            <line x1={x(cur)} x2={x(cur)} y1={M.t} y2={M.t + ih} stroke="var(--fg)" strokeWidth="1" opacity="0.6" />
            {visible.map((l) => {
              const v = value(l, cur);
              return v === null ? null : <circle key={l.id} cx={x(cur)} cy={y(v)} r="4.5" fill="var(--bg)" stroke={STYLE[lakes.indexOf(l)].color} strokeWidth="2.4" />;
            })}
          </svg>
        </div>

        <p id={`${uid}-readout`} aria-live="polite" className="num min-h-6 text-sm">{readout}</p>
        <p className="max-w-3xl text-sm text-muted">
          {metric === "pct"
            ? "Share of outline divides open water by the area of each lake's OpenStreetMap outline, which is unofficial and not exact: a small share can mean a dry bed, wetland or built-over edge inside the outline, not only low water. "
            : "Hectares of open water only; dry lakebed and water under floating plants are not counted. "}
          Gaps are months with no usable optical or radar scene. Hover or use the arrow keys to read a month.
        </p>

        <details className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
          <summary className="tap cursor-pointer py-2 font-medium">View this chart as a table</summary>
          <div tabIndex={0} role="region" aria-label="Table (scrolls)" className="mt-2 max-h-96 overflow-auto rounded-md">
            <table className="num w-full text-left">
              <caption className="sr-only">{metric === "ha" ? "Hectares of open water" : "Open water as a percentage of the outline"} by month</caption>
              <thead>
                <tr className="text-muted">
                  <th scope="col" className="sticky top-0 bg-surface py-1 pr-3 font-medium">Month</th>
                  {visible.map((l) => <th key={l.id} scope="col" className="sticky top-0 bg-surface py-1 pr-3 font-medium">{short(l)}</th>)}
                </tr>
              </thead>
              <tbody>
                {months.slice(start).map((m, k) => (
                  <tr key={m} className="border-t border-border">
                    <th scope="row" className="py-1 pr-3 font-normal">{formatMonth(m)}</th>
                    {visible.map((l) => { const v = value(l, start + k); return <td key={l.id} className="py-1 pr-3">{v === null ? "n/a" : v.toFixed(1)}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Reveal>

      <Reveal as="section" aria-labelledby={`${uid}-stripes`} className="space-y-4">
        <h2 id={`${uid}-stripes`} className="font-serif text-2xl font-semibold">Water stripes</h2>
        <p className="max-w-3xl text-muted">The last decade in one picture: every month of every lake, coloured by how unusual it was for the time of year.</p>
        <WaterStripes lakes={lakes} series={series} />
      </Reveal>

      <Reveal as="section" aria-labelledby={`${uid}-cards`} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id={`${uid}-cards`} className="font-serif text-2xl font-semibold">Each lake</h2>
          <div role="group" aria-label="Sort lakes by" className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Sort by</span>
            {([["name", "Name"], ["water", "Open water"], ["health", "Health index"], ["outline", "Outline size"]] as const).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={sort === v} onClick={() => changeSort(v)} className={pill(sort === v)}>{label}</button>
            ))}
          </div>
        </div>
        <ul ref={list} className="grid gap-4 sm:grid-cols-3">
          {ordered.map((l) => {
            const row = series[l.id]?.[cur];
            const k = lakes.indexOf(l);
            return (
              <li
                key={l.id}
                onMouseEnter={() => setHover(l.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(l.id)}
                onBlur={() => setHover(null)}
                className={`rounded-xl border bg-surface p-5 transition-colors ${hover === l.id ? "border-accent bg-surface-2" : "border-border"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-serif text-2xl font-semibold">
                      <Link href={`/lakes/${l.id}/`} className="underline decoration-transparent underline-offset-4 hover:decoration-fg">{l.name.replace(" (Halasuru Kere)", "")}</Link>
                    </h3>
                    {l.name_kn ? <p lang="kn" className="text-sm text-muted">{l.name_kn}</p> : null}
                  </div>
                  <svg width="30" height="10" aria-hidden="true" className="mt-3 shrink-0">
                    <line x1="1" x2="29" y1="5" y2="5" stroke={STYLE[k].color} strokeWidth="2.4" strokeDasharray={STYLE[k].dash} strokeLinecap="round" />
                  </svg>
                </div>
                <div className="mt-3">
                  <MiniTrend rows={series[l.id] ?? []} months={months} idx={cur} active={hover === l.id} onScrub={(i) => setIdx(Math.max(start, i))} />
                  <p className="num text-xs text-muted">Drag along the line to change the month</p>
                </div>
                <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="col-span-2">
                    <dt className="text-muted">Open water, {formatMonth(months[cur])}</dt>
                    <dd className="text-2xl font-semibold">
                      {row && row.source !== "none" && row.area_ha !== null ? <><AnimatedNumber value={row.area_ha} /> ha</> : <span className="text-base font-normal text-muted">no usable scene</span>}
                    </dd>
                    {row && row.source !== "none" ? <dd><SourceMark source={row.source} /></dd> : null}
                  </div>
                  <div>
                    <dt className="text-muted">Health index</dt>
                    <dd className="text-lg font-medium">{Math.round(l.health.score)}</dd>
                    <dd className="text-muted">range {l.health.range[0].toFixed(0)}-{l.health.range[1].toFixed(0)}, experimental</dd>
                  </div>
                  <div>
                    <dt className="text-muted">OSM outline</dt>
                    <dd className="text-lg font-medium">{fmtHa(l.outline_ha, 0)}</dd>
                    <dd className="text-muted">{l.months_with_extent} of {l.months} months</dd>
                  </div>
                </dl>
                <p className="mt-4 text-sm font-medium"><Link href={`/lakes/${l.id}/`} className="text-accent underline-offset-4 hover:underline">Open lake page <span aria-hidden="true">&rarr;</span></Link></p>
              </li>
            );
          })}
        </ul>
      </Reveal>
    </div>
  );
}
