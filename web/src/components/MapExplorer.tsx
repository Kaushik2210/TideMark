"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CompareView } from "./CompareView";
import { LakeMap, type BaseMode, type FlyTo, type GhostProps } from "./LakeMap";
import { SourceLegend, SourceMark } from "./SourceMark";
import { TimeSlider } from "./TimeSlider";
import { byMonth, fmtHa, formatMonth, hasExtent, loadLakes, loadSeries, loadValidation, monthRange, withBase } from "@/lib/data";
import { AnimatedNumber } from "./AnimatedNumber";
import { MiniTrend } from "./MiniTrend";
import { MOTION_OK, registerGsap } from "@/lib/motion";
import type { LakeIndex, Row, Validation } from "@/lib/types";

interface GhostFeature {
  properties: GhostProps & { worldcover_2021_builtup_frac?: number | null };
  geometry: { coordinates: [number, number] };
}


interface Loaded {
  lakes: LakeIndex[];
  series: Record<string, Row[]>;
  months: string[];
  start: number;
  cmpA: string;
  cmpB: string;
}

async function loadAll(): Promise<Loaded> {
  const lakes = await loadLakes();
  const all = await Promise.all(lakes.map((l) => loadSeries(l.id)));
  const series = Object.fromEntries(lakes.map((l, i) => [l.id, all[i]]));
  const months = monthRange(lakes[0].first_month, lakes[0].last_month);
  // Start on the latest month in which every lake has an extent, else the last month.
  let start = months.length - 1;
  for (let i = months.length - 1; i >= 0; i--) {
    if (lakes.every((l) => hasExtent(byMonth(series[l.id]).get(months[i])))) {
      start = i;
      break;
    }
  }
  const rows = series[lakes[0].id].filter(hasExtent);
  return {
    lakes,
    series,
    months,
    start,
    cmpA: rows.find((r) => r.source === "optical")?.month ?? months[0],
    cmpB: rows[rows.length - 1]?.month ?? months[months.length - 1],
  };
}

function Switch({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onClick={() => onChange(!checked)}
        className={`tap relative mt-0.5 h-8 w-14 shrink-0 rounded-full border transition-colors ${checked ? "border-accent bg-accent" : "border-border bg-surface-2"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-bg transition-transform ${checked ? "translate-x-7" : "translate-x-1"}`} />
        <span className="sr-only">{label}</span>
      </button>
      <label htmlFor={id} className="cursor-pointer text-sm">
        <span className="font-medium">{label}</span>
        {hint ? <span id={`${id}-hint`} className="block text-muted">{hint}</span> : null}
      </label>
    </div>
  );
}

export function MapExplorer() {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [lakes, setLakes] = useState<LakeIndex[]>([]);
  const [series, setSeries] = useState<Record<string, Row[]>>({});
  const [months, setMonths] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ghost, setGhost] = useState(false);
  const [basemap, setBasemap] = useState<BaseMode>("map");
  const [focus, setFocus] = useState("all");
  const [mode, setMode] = useState<"time" | "compare">("time");
  const [cmpLake, setCmpLake] = useState("bellandur");
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");
  const [ghostSel, setGhostSel] = useState<GhostProps | null>(null);
  const [ghostList, setGhostList] = useState<GhostFeature[]>([]);
  const [flyTo, setFlyTo] = useState<FlyTo | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "unsupported">("loading");
  const [hoverLake, setHoverLake] = useState<string | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const asideRef = useRef<HTMLElement>(null);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadAll()
      .then((d) => {
        if (cancelled) return;
        setLakes(d.lakes);
        setSeries(d.series);
        setMonths(d.months);
        setIdx(d.start);
        setCmpLake(d.lakes[0].id);
        setCmpA(d.cmpA);
        setCmpB(d.cmpB);
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setIdx((i) => {
        if (i >= months.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 650);
    return () => window.clearInterval(t);
  }, [playing, months.length]);

  useEffect(() => {
    if (!ghost || ghostList.length) return;
    fetch(withBase("/data/ghost_lakes.geojson"))
      .then((r) => r.json())
      .then((g: { features: GhostFeature[] }) => setGhostList(g.features))
      .catch(() => setGhostList([]));
  }, [ghost, ghostList.length]);

  // Reported events (from the validation set) that the satellite record picked up, as jump-to shortcuts.
  useEffect(() => {
    if (phase !== "ready") return;
    let cancelled = false;
    loadValidation().then((v) => { if (!cancelled) setValidation(v); }).catch(() => {});
    return () => { cancelled = true; };
  }, [phase]);

  // One-time entrance for the side panel (skipped with reduced motion).
  useEffect(() => {
    const el = asideRef.current;
    if (phase !== "ready" || !el) return;
    const gsap = registerGsap();
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.from(Array.from(el.children), { opacity: 0, y: 16, duration: 0.55, ease: "power2.out", stagger: 0.07, clearProps: "opacity,transform" });
    });
    return () => mm.revert();
  }, [phase]);

  const month = months[idx];
  const sel = useMemo(() => lakes.map((l) => ({ lake: l, row: byMonth(series[l.id] ?? []).get(month) })), [lakes, series, month]);
  const missing = sel.filter((s) => !hasExtent(s.row)).length;
  const cmpLakeObj = lakes.find((l) => l.id === cmpLake) ?? lakes[0];
  const moments = useMemo(() => {
    if (!validation) return [];
    const nameOf = (id: string) => (lakes.find((l) => l.id === id)?.name ?? id).replace(" (Halasuru Kere)", "").replace(" Lake", "");
    const out: { id: string; lake: string; month: string; label: string; outcome: string }[] = [];
    for (const e of validation.water_level) {
      if (e.outcome !== "hit" && e.outcome !== "partial") continue;
      const rows = series[e.lake];
      if (!rows) continue;
      const [a, b] = e.window.split("..").map((d) => d.slice(0, 7));
      const inWin = rows.filter((r) => hasExtent(r) && r.month >= a && r.month <= b);
      if (!inWin.length) continue;
      const low = e.signal === "extent_low";
      const pick = inWin.reduce((p, r) => (low ? (r.area_ha ?? Infinity) < (p.area_ha ?? Infinity) : (r.area_ha ?? -1) > (p.area_ha ?? -1)) ? r : p);
      out.push({ id: e.event_id, lake: e.lake, month: pick.month, outcome: e.outcome, label: `${nameOf(e.lake)}: ${low ? "drained or low water" : "overflow or high water"}, ${a.slice(0, 4)}` });
    }
    // Two reports of the same event can land on the same month; show one button.
    const seen = new Set<string>();
    return out
      .filter((m) => { const k = `${m.lake}|${m.month}|${m.label}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((x, y) => x.month.localeCompare(y.month));
  }, [validation, series, lakes]);

  if (phase === "loading") {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6" aria-busy="true" role="status">
        <div className="skeleton h-[52dvh] w-full rounded-xl" />
        <div className="skeleton h-24 w-full rounded-xl" />
        <span className="sr-only">Loading lake data</span>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div role="alert" className="mx-auto max-w-xl p-6">
        <h1 className="font-serif text-2xl font-semibold">The lake data could not be loaded</h1>
        <p className="mt-2 text-muted">Check your connection and try again. The same figures are available as downloads on the <Link className="underline" href="/data/">data page</Link>.</p>
        <button type="button" onClick={() => { setPhase("loading"); setReloadKey((k) => k + 1); }} className="tap mt-4 rounded-md bg-accent px-5 font-medium text-bg">Try again</button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
        {mode === "time" ? (
          <>
            <div className="relative h-[54dvh] min-h-80 lg:h-auto lg:flex-1">
              <LakeMap
                month={month}
                lakes={lakes}
                series={series}
                ghost={ghost}
                basemap={basemap}
                focus={focus}
                flyTo={flyTo}
                onGhostSelect={setGhostSel}
                onSelectLake={setFocus}
                onStatus={setMapStatus}
                highlight={hoverLake}
                onHoverLake={setHoverLake}
                ariaLabel="Map of Bengaluru lakes showing open-water extent for the selected month"
                className="absolute inset-0"
              />
              {mapStatus === "unsupported" ? (
                <div role="status" className="absolute inset-0 grid place-items-center bg-bg p-6 text-center">
                  <p className="max-w-sm">The interactive map needs WebGL, which is not available here. The table beside it and the <Link className="underline" href="/lakes/">lake pages</Link> show the same data.</p>
                </div>
              ) : null}
              <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-surface/90 px-2 py-1">
                <SourceLegend className="pointer-events-auto" />
              </div>
            </div>
            <div className="border-t border-border bg-surface px-4 py-3 sm:px-6">
              <TimeSlider months={months} idx={idx} onIdx={(i) => { setPlaying(false); setIdx(i); }} lakes={lakes} series={series} playing={playing} onTogglePlay={() => setPlaying((p) => !p)} />
            </div>
          </>
        ) : (
          <div className="overflow-y-auto p-4 sm:p-6">
            {cmpLakeObj ? (
              <CompareView lake={cmpLakeObj} rows={series[cmpLakeObj.id] ?? []} months={months} a={cmpA} b={cmpB} onA={setCmpA} onB={setCmpB} basemap={basemap} />
            ) : null}
          </div>
        )}
      </div>

      <aside ref={asideRef} aria-label="Details and controls" className="space-y-6 border-t border-border p-4 sm:p-6 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div>
          <h1 className="font-serif text-3xl font-semibold leading-tight">Bengaluru&apos;s lakes, seen from space</h1>
          <p className="mt-2 text-sm text-muted">
            Open-water area of three lakes each month since 2016, from free Sentinel satellite data.
            Estimates carry uncertainty and are not an official assessment.
          </p>
        </div>

        <div role="group" aria-label="View mode" className="grid grid-cols-2 gap-2">
          {(["time", "compare"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setPlaying(false); }} className={`tap rounded-md border px-3 text-sm font-medium ${mode === m ? "border-accent bg-surface-2" : "border-border text-muted"}`}>
              {m === "time" ? "Time slider" : "Compare dates"}
            </button>
          ))}
        </div>

        {mode === "compare" ? (
          <div>
            <label htmlFor="cmp-lake" className="block text-sm text-muted">Lake to compare</label>
            <select id="cmp-lake" value={cmpLake} onChange={(e) => {
              const l = lakes.find((x) => x.id === e.target.value);
              setCmpLake(e.target.value);
              const rows = (series[e.target.value] ?? []).filter(hasExtent);
              setCmpA(rows.find((r) => r.source === "optical")?.month ?? months[0]);
              setCmpB(rows[rows.length - 1]?.month ?? months[months.length - 1]);
              if (l) setFocus(l.id);
            }} className="tap w-full rounded-md border border-border bg-surface px-3 text-base">
              {lakes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted" id="focus-h">Focus the map</p>
            <div role="group" aria-labelledby="focus-h" className="mt-1 flex flex-wrap gap-2">
              {[{ id: "all", name: "All lakes" }, ...lakes].map((l) => (
                <button key={l.id} type="button" aria-pressed={focus === l.id} onClick={() => setFocus(l.id)} className={`tap rounded-full border px-3 text-sm ${focus === l.id ? "border-accent bg-surface-2" : "border-border text-muted"}`}>
                  {l.name.replace(" (Halasuru Kere)", "")}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium" id="base-h">Base map</p>
            <div role="group" aria-labelledby="base-h" aria-describedby="base-hint" className="mt-1 flex flex-wrap gap-2">
              {([["map", "Map"], ["satellite", "Satellite"], ["none", "None"]] as const).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={basemap === v} onClick={() => setBasemap(v)} data-testid={`base-${v}`} className={`tap rounded-full border px-4 text-sm ${basemap === v ? "border-accent bg-surface-2" : "border-border"}`}>
                  {label}
                </button>
              ))}
            </div>
            <p id="base-hint" className="mt-1 text-sm text-muted">
              {basemap === "satellite"
                ? "Sentinel-2 cloudless mosaic (2025) by EOX, 10 m resolution; a yearly composite, not the image behind the month shown."
                : basemap === "map"
                  ? "Roads and places from OpenFreeMap (OpenStreetMap data)."
                  : "Only the satellite water layers are drawn."}
            </p>
          </div>
          <Switch id="ghost-switch" checked={ghost} onChange={setGhost} label="Lost lakes (approximate)" hint="Tanks that have been built over, shown as approximate points with no outline." />
        </div>

        {mode === "time" ? (
          <section aria-labelledby="sel-h" data-testid="readout">
            <h2 id="sel-h" className="font-serif text-xl font-semibold">{formatMonth(month)}</h2>
            <table className="num mt-2 w-full text-left text-sm">
              <caption className="sr-only">Open-water area of each lake in {formatMonth(month)}</caption>
              <thead>
                <tr className="text-muted">
                  <th scope="col" className="py-1 pr-2 font-medium">Lake</th>
                  <th scope="col" className="py-1 pr-2 font-medium">Water area</th>
                  <th scope="col" className="py-1 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {sel.map(({ lake, row }) => (
                  <Fragment key={lake.id}>
                    <tr
                      className={`border-t border-border align-top transition-colors ${hoverLake === lake.id ? "bg-surface-2" : ""}`}
                      onMouseEnter={() => setHoverLake(lake.id)}
                      onMouseLeave={() => setHoverLake(null)}
                      onFocus={() => setHoverLake(lake.id)}
                      onBlur={() => setHoverLake(null)}
                    >
                      <th scope="row" className="py-2 pr-2 font-normal">
                        <Link className="underline decoration-border underline-offset-4 hover:decoration-fg" href={`/lakes/${lake.id}/`}>{lake.name.replace(" (Halasuru Kere)", "")}</Link>
                      </th>
                      {hasExtent(row) ? (
                        <>
                          <td className="py-2 pr-2"><AnimatedNumber value={row.area_ha ?? 0} /> ha <span className="text-muted">± {fmtHa(row.unc_ha)}</span></td>
                          <td className="py-2"><SourceMark source={row.source} label={false} /></td>
                        </>
                      ) : (
                        <td colSpan={2} className="py-2 text-muted">No usable scene (cloud, and no radar scene)</td>
                      )}
                    </tr>
                    <tr aria-hidden="true" className={hoverLake === lake.id ? "bg-surface-2" : ""}>
                      <td colSpan={3} className="pb-2">
                        <MiniTrend rows={series[lake.id] ?? []} months={months} idx={idx} active={hoverLake === lake.id} onScrub={(i) => { setPlaying(false); setIdx(i); }} />
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
            {missing > 0 && missing < lakes.length ? (
              <p className="mt-2 rounded-md border border-border p-2 text-sm text-muted">Partial data: {missing} of {lakes.length} lakes have no usable scene this month.</p>
            ) : null}
            <p className="mt-3 text-sm text-muted">
              Only open water is counted. Dry lakebed, and water hidden under floating plants, is not.
              The ± is a half-pixel edge bound, not a confidence interval.
            </p>
          </section>
        ) : null}

        {mode === "time" && moments.length > 0 ? (
          <section aria-labelledby="moments-h" data-testid="moments">
            <h2 id="moments-h" className="font-serif text-xl font-semibold">Jump to a reported event</h2>
            <p className="mt-1 text-sm text-muted">
              Events from news reports that the satellite record also shows. Each button opens the month with the
              lowest or highest water inside the reported window.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {moments.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => { setPlaying(false); setFocus(m.lake); setIdx(Math.max(0, months.indexOf(m.month))); }}
                    className="tap rounded-full border border-border px-3 text-left text-sm hover:bg-surface-2"
                  >
                    {m.label} <span className="text-muted">({formatMonth(m.month)}{m.outcome === "partial" ? ", partly matched" : ""})</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {ghost ? (
          <section aria-labelledby="ghost-h">
            <h2 id="ghost-h" className="font-serif text-xl font-semibold">Lost lakes</h2>
            <p className="mt-1 text-sm text-muted">
              Approximate points from a Wikipedia table (CC BY-SA); the table is not exhaustive and no
              outlines are implied. WorldCover shows the share of built-up land within 300 m.
            </p>
            {ghostSel ? (
              <div className="mt-3 rounded-lg border border-ghost p-3 text-sm" role="status">
                <p className="font-medium">{ghostSel.name}</p>
                <p>{ghostSel.occupied_today_by ?? "Use today not stated."}</p>
                {typeof ghostSel.worldcover_2021_builtup_frac === "number" ? (
                  <p className="text-muted">Built-up within 300 m (WorldCover 2021): {Math.round(ghostSel.worldcover_2021_builtup_frac * 100)}%</p>
                ) : null}
                {ghostSel.wikipedia_asterisk_unexplained ? <p className="text-muted">Marked with an unexplained asterisk in the source; the lake may partly survive.</p> : null}
                <a className="underline" href={ghostSel.source_url}>Source (Wikipedia)</a>
              </div>
            ) : null}
            <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1" aria-label="Lost lakes list">
              {ghostList.map((g) => (
                <li key={g.properties.name}>
                  <button type="button" className="tap w-full rounded-md border border-border px-3 py-1 text-left text-sm hover:bg-surface-2" onClick={() => { setGhostSel(g.properties); setFlyTo({ center: g.geometry.coordinates, zoom: 15, key: Date.now() }); }}>
                    {g.properties.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="text-sm text-muted">
          Want the numbers behind a lake? See its page for charts, rainfall, flagged events and the
          health index, or read <Link className="underline" href="/methodology/">how it works and what failed validation</Link>.
        </p>
      </aside>
    </div>
  );
}
