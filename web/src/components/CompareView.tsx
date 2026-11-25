"use client";

import { useState } from "react";
import { LakeMap, type BaseMode, type View } from "./LakeMap";
import { SatelliteCredit } from "./SatelliteCredit";
import { SourceMark } from "./SourceMark";
import { fmtHa, formatMonth, hasExtent } from "@/lib/data";
import type { LakeIndex, Row } from "@/lib/types";

interface Props {
  lake: LakeIndex;
  rows: Row[];
  months: string[];
  a: string;
  b: string;
  onA: (m: string) => void;
  onB: (m: string) => void;
  basemap: BaseMode;
}

function MonthSelect({ id, label, value, months, rows, onChange }: { id: string; label: string; value: string; months: string[]; rows: Row[]; onChange: (m: string) => void }) {
  const by = new Map(rows.map((r) => [r.month, r]));
  return (
    <div className="flex-1">
      <label htmlFor={id} className="block text-sm text-muted">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="tap w-full rounded-md border border-border bg-surface px-3 text-base">
        {[...months].reverse().map((m) => {
          const r = by.get(m);
          const ok = hasExtent(r);
          return (
            <option key={m} value={m} disabled={!ok}>
              {formatMonth(m)}{ok ? ` · ${(r.area_ha as number).toFixed(0)} ha` : " · no usable scene"}
            </option>
          );
        })}
      </select>
    </div>
  );
}

/**
 * Before/after comparison: two synchronised maps, the "after" one clipped to the right of a
 * divider. The divider is a native range input, so it is fully keyboard accessible.
 */
export function CompareView({ lake, rows, months, a, b, onA, onB, basemap }: Props) {
  const [pos, setPos] = useState(50);
  const [view, setView] = useState<View | null>(null);
  const by = new Map(rows.map((r) => [r.month, r]));
  const ra = by.get(a);
  const rb = by.get(b);
  const change = hasExtent(ra) && hasExtent(rb) ? (rb.area_ha as number) - (ra.area_ha as number) : null;
  const pct = change !== null && ra && (ra.area_ha as number) > 0 ? (change / (ra.area_ha as number)) * 100 : null;

  const have = rows.filter(hasExtent);
  const preset = () => {
    if (!have.length) return;
    const hi = have.reduce((p, r) => ((r.area_ha as number) > (p.area_ha as number) ? r : p));
    const lo = have.reduce((p, r) => ((r.area_ha as number) < (p.area_ha as number) ? r : p));
    onA(hi.month < lo.month ? hi.month : lo.month);
    onB(hi.month < lo.month ? lo.month : hi.month);
  };

  const mapProps = { lakes: [lake], series: { [lake.id]: rows }, ghost: false, basemap, focus: lake.id, view, onViewChange: setView };
  return (
    <section aria-labelledby="cmp-h" className="space-y-3">
      <h2 id="cmp-h" className="font-serif text-xl font-semibold">Compare two dates: {lake.name}</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <MonthSelect id="cmp-a" label="Before" value={a} months={months} rows={rows} onChange={onA} />
        <MonthSelect id="cmp-b" label="After" value={b} months={months} rows={rows} onChange={onB} />
        <button type="button" onClick={preset} className="tap rounded-md border border-border px-3 text-sm">Largest vs smallest</button>
      </div>

      <div className="relative h-[52dvh] min-h-72 overflow-hidden rounded-xl border border-border" data-testid="compare">
        <LakeMap {...mapProps} month={a} className="absolute inset-0" ariaLabel={`Map of ${lake.name} water extent, before date ${formatMonth(a)}`} />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <LakeMap {...mapProps} month={b} className="absolute inset-0" ariaLabel={`Map of ${lake.name} water extent, after date ${formatMonth(b)}`} />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${pos}%` }} aria-hidden="true" />
        <span className="pointer-events-none absolute left-3 top-3 rounded bg-surface/90 px-2 py-1 text-xs">Before · {formatMonth(a)}</span>
        <span className="pointer-events-none absolute right-12 top-3 rounded bg-surface/90 px-2 py-1 text-xs">After · {formatMonth(b)}</span>
        <div className="absolute inset-x-3 bottom-2">
          <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Comparison divider position: before on the left, after on the right" data-testid="compare-divider" />
        </div>
      </div>

      {basemap === "satellite" && <SatelliteCredit />}
      <div className="num grid gap-3 text-sm sm:grid-cols-3" aria-live="polite">
        <p>
          <span className="text-muted">Before ({formatMonth(a)})</span>
          <br />
          {hasExtent(ra) ? `${fmtHa(ra.area_ha)} ± ${fmtHa(ra.unc_ha)}` : "no usable scene"}{" "}
          {ra ? <SourceMark source={ra.source} label={false} /> : null}
        </p>
        <p>
          <span className="text-muted">After ({formatMonth(b)})</span>
          <br />
          {hasExtent(rb) ? `${fmtHa(rb.area_ha)} ± ${fmtHa(rb.unc_ha)}` : "no usable scene"}{" "}
          {rb ? <SourceMark source={rb.source} label={false} /> : null}
        </p>
        <p>
          <span className="text-muted">Change</span>
          <br />
          {change === null ? "n/a" : `${change >= 0 ? "+" : ""}${change.toFixed(1)} ha${pct === null ? "" : ` (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`}`}
        </p>
      </div>
      {ra && rb && ra.source !== rb.source ? (
        <p className="rounded-md border border-radar p-3 text-sm">
          These two months come from different sensors ({ra.source} vs {rb.source}). Radar and optical
          define water differently, so part of the difference can be a measurement artifact.
        </p>
      ) : null}
    </section>
  );
}
