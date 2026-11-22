"use client";

import { useId, useMemo, useState } from "react";
import { MarkerShape, SourceLegend } from "./SourceMark";
import { fmtHa, formatMonth, hasExtent } from "@/lib/data";
import type { Row } from "@/lib/types";

const W = 720;
const M = { top: 12, right: 12, bottom: 24, left: 44 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Year ticks: indices of January months. */
function yearTicks(months: string[]): { i: number; label: string }[] {
  return months.flatMap((m, i) => (m.endsWith("-01") ? [{ i, label: m.slice(0, 4) }] : []));
}

function useScale(months: string[], height: number) {
  const n = months.length;
  const iw = W - M.left - M.right;
  const x = (i: number) => M.left + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const ih = height - M.top - M.bottom;
  return { x, ih, iw, n };
}

/**
 * Keyboard- and pointer-driven month cursor shared by the charts. Arrow keys move one month,
 * Home/End jump to the ends, so the exact values are available without a pointer.
 */
function useCursor(n: number) {
  const [i, setI] = useState<number | null>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const cur = i ?? n - 1;
    if (e.key === "ArrowLeft") setI(Math.max(0, cur - 1));
    else if (e.key === "ArrowRight") setI(Math.min(n - 1, cur + 1));
    else if (e.key === "Home") setI(0);
    else if (e.key === "End") setI(n - 1);
    else return;
    e.preventDefault();
  };
  return { i, setI, onKeyDown };
}

function pointerIndex(e: React.PointerEvent<SVGSVGElement>, n: number, iw: number): number {
  const rect = e.currentTarget.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * W - M.left;
  return Math.min(n - 1, Math.max(0, Math.round((px / iw) * (n - 1))));
}

export function ExtentChart({ rows, outlineHa, name }: { rows: Row[]; outlineHa: number; name: string }) {
  const H = 300;
  const months = rows.map((r) => r.month);
  const { x, ih, iw, n } = useScale(months, H);
  const maxArea = Math.max(outlineHa, ...rows.map((r) => (r.area_ha ?? 0) + (r.unc_ha ?? 0)));
  const yMax = niceMax(maxArea);
  const y = (v: number) => M.top + ih - (v / yMax) * ih;
  const { i, setI, onKeyDown } = useCursor(n);
  const titleId = useId();
  const cur = i === null ? null : rows[i];

  const segments = useMemo(() => {
    const segs: string[] = [];
    let cur: string[] = [];
    rows.forEach((r, k) => {
      if (hasExtent(r)) cur.push(`${x(k).toFixed(1)},${y(r.area_ha).toFixed(1)}`);
      else {
        if (cur.length > 1) segs.push(cur.join(" "));
        cur = [];
      }
    });
    if (cur.length > 1) segs.push(cur.join(" "));
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, yMax]);

  return (
    <figure className="space-y-2">
      <figcaption id={titleId} className="text-sm text-muted">
        Monthly open-water area of {name}, with a ±edge-uncertainty bar. Gaps are months with no usable
        optical or radar scene.
      </figcaption>
      <div
        tabIndex={0}
        role="group"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-readout`}
        onKeyDown={onKeyDown}
        onBlur={() => setI(null)}
        className="rounded-md"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-pan-y select-none"
          onPointerMove={(e) => setI(pointerIndex(e, n, iw))}
          onPointerLeave={() => setI(null)}
          aria-hidden="true"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={M.left} x2={W - M.right} y1={y(yMax * f)} y2={y(yMax * f)} stroke="var(--border)" strokeWidth="0.7" />
              <text x={M.left - 6} y={y(yMax * f) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">
                {Math.round(yMax * f)}
              </text>
            </g>
          ))}
          <text x="4" y={M.top + ih / 2} fontSize="11" fill="var(--muted)" transform={`rotate(-90 10 ${M.top + ih / 2})`} textAnchor="middle">
            hectares
          </text>
          {yearTicks(months).map((t) => (
            <text key={t.label} x={x(t.i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)" className="num">
              {t.label}
            </text>
          ))}
          <line x1={M.left} x2={W - M.right} y1={y(outlineHa)} y2={y(outlineHa)} stroke="var(--muted)" strokeDasharray="5 4" strokeWidth="1.2" />
          <text x={W - M.right} y={y(outlineHa) - 5} textAnchor="end" fontSize="11" fill="var(--muted)">
            OpenStreetMap outline {outlineHa.toFixed(0)} ha
          </text>
          {segments.map((s, k) => (
            <polyline key={k} points={s} fill="none" stroke="var(--border)" strokeWidth="1.2" />
          ))}
          {rows.map((r, k) =>
            hasExtent(r) ? (
              <g key={r.month}>
                {r.unc_ha ? (
                  <line x1={x(k)} x2={x(k)} y1={y(Math.max(0, r.area_ha - r.unc_ha))} y2={y(r.area_ha + r.unc_ha)} stroke={`var(--${r.source})`} strokeWidth="1" opacity="0.55" />
                ) : null}
                <MarkerShape source={r.source} cx={x(k)} cy={y(r.area_ha)} r={3.2} />
              </g>
            ) : null,
          )}
          {i !== null ? <line x1={x(i)} x2={x(i)} y1={M.top} y2={M.top + ih} stroke="var(--fg)" strokeWidth="1" /> : null}
        </svg>
      </div>
      <p id={`${titleId}-readout`} aria-live="polite" className="num min-h-6 text-sm">
        {cur
          ? hasExtent(cur)
            ? `${formatMonth(cur.month)}: ${fmtHa(cur.area_ha)} (±${fmtHa(cur.unc_ha)}), ${cur.source}${cur.rain_mm !== null ? `, ${cur.rain_mm.toFixed(0)} mm rain that month` : ""}`
            : `${formatMonth(cur.month)}: no usable scene`
          : "Hover, touch, or focus the chart and use the arrow keys to read a month."}
      </p>
      <SourceLegend />
    </figure>
  );
}

export function RainChart({ rows }: { rows: Row[] }) {
  const H = 130;
  const months = rows.map((r) => r.month);
  const { x, ih, n } = useScale(months, H);
  const max = niceMax(Math.max(...rows.map((r) => r.rain_mm ?? 0)));
  const bw = Math.max(1.2, ((W - M.left - M.right) / n) * 0.8);
  return (
    <figure className="space-y-1">
      <figcaption className="text-sm text-muted">
        Monthly rainfall (ERA5 reanalysis, about 28 km grid: regional rain, not what fell on the lake).
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Bar chart of monthly rainfall in millimetres, 2016 to 2026, with a monsoon peak between June and October each year.">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={M.left} x2={W - M.right} y1={M.top + ih - f * ih} y2={M.top + ih - f * ih} stroke="var(--border)" strokeWidth="0.7" />
            <text x={M.left - 6} y={M.top + ih - f * ih + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {rows.map((r, k) =>
          r.rain_mm ? (
            <rect key={r.month} x={x(k) - bw / 2} y={M.top + ih - (r.rain_mm / max) * ih} width={bw} height={(r.rain_mm / max) * ih} fill="var(--muted)" opacity="0.7" />
          ) : null,
        )}
        {yearTicks(months).map((t) => (
          <text key={t.label} x={x(t.i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)" className="num">
            {t.label}
          </text>
        ))}
        <text x="4" y={M.top + ih / 2} fontSize="11" fill="var(--muted)" transform={`rotate(-90 10 ${M.top + ih / 2})`} textAnchor="middle">
          mm
        </text>
      </svg>
    </figure>
  );
}

export function BloomChart({ rows }: { rows: Row[] }) {
  const H = 220;
  const months = rows.map((r) => r.month);
  const { x, ih } = useScale(months, H);
  const y = (v: number) => M.top + ih - (Math.min(Math.max(v, 0), 0.8) / 0.8) * ih;
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm text-muted">
        Candidate chlorophyll proxy (median NDCI) on clean optical months. Filled points can be trusted
        more than hollow ones, which are hazy scenes that were excluded from every flag. Rings mark months
        flagged as floating-mat <em>candidates</em> (FAI). These flags are not validated.
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Scatter chart of median NDCI by month. Values are typically between 0.3 and 0.6 on all three lakes; hollow points are hazy months; rings mark floating-mat candidate months.">
        {[0, 0.2, 0.4, 0.6, 0.8].map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="0.7" />
            <text x={M.left - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {rows.map((r, k) =>
          r.ndci_median === null ? null : (
            <g key={r.month}>
              {r.floating_mat && !r.haze ? <circle cx={x(k)} cy={y(r.ndci_median)} r="6.5" fill="none" stroke="var(--fused)" strokeWidth="1.5" /> : null}
              <circle cx={x(k)} cy={y(r.ndci_median)} r="3" fill={r.haze ? "var(--bg)" : "var(--accent)"} stroke="var(--accent)" strokeWidth="1.5" />
            </g>
          ),
        )}
        {yearTicks(months).map((t) => (
          <text key={t.label} x={x(t.i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)" className="num">
            {t.label}
          </text>
        ))}
      </svg>
    </figure>
  );
}

/** Screen-reader and keyboard friendly table alternative for the charts. */
export function SeriesTable({ rows }: { rows: Row[] }) {
  return (
    <details className="rounded-md border border-border bg-surface">
      <summary className="tap cursor-pointer px-4 py-3 text-sm font-medium">View the monthly data as a table</summary>
      <div className="max-h-96 overflow-auto px-2 pb-3">
        <table className="num w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">Monthly water area, source, rainfall and candidate flags</caption>
          <thead className="sticky top-0 bg-surface">
            <tr>
              {["Month", "Area (ha)", "± (ha)", "Source", "Rain (mm)", "NDCI", "Haze", "Floating-mat flag"].map((h) => (
                <th key={h} scope="col" className="px-2 py-2 font-medium text-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.month} className="border-t border-border">
                <th scope="row" className="px-2 py-1.5 font-normal">{formatMonth(r.month)}</th>
                <td className="px-2">{r.area_ha === null ? "no scene" : r.area_ha.toFixed(1)}</td>
                <td className="px-2">{r.unc_ha === null ? "" : r.unc_ha.toFixed(1)}</td>
                <td className="px-2">{r.source}</td>
                <td className="px-2">{r.rain_mm === null ? "" : r.rain_mm.toFixed(0)}</td>
                <td className="px-2">{r.ndci_median === null ? "" : r.ndci_median.toFixed(2)}</td>
                <td className="px-2">{r.haze ? "yes" : ""}</td>
                <td className="px-2">{r.floating_mat && !r.haze ? "candidate" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
