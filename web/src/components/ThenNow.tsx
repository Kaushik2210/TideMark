"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMonth, getJson, hasExtent } from "@/lib/data";
import type { Row } from "@/lib/types";

type Ring = [number, number][];
interface Feat { geometry: { type: string; coordinates: unknown } | null }

/** Outer and inner rings of a (Multi)Polygon, as plain coordinate lists. */
function rings(f: Feat | null): Ring[] {
  const g = f?.geometry;
  if (!g) return [];
  if (g.type === "Polygon") return g.coordinates as Ring[];
  if (g.type === "MultiPolygon") return (g.coordinates as Ring[][]).flat();
  return [];
}

/**
 * Swipe between two months of one lake: the mapped open-water outline for each month is drawn from the same data the
 * map uses, one on each side of a draggable divider. Months with no usable scene are not offered, so nothing here is
 * interpolated. The words under it follow the same uncertainty rule as the monthly digest.
 */
export function ThenNow({ rows, bbox, lakeId, name }: { rows: Row[]; bbox: [number, number, number, number]; lakeId: string; name: string }) {
  const months = useMemo(() => rows.filter(hasExtent), [rows]);
  const [a, setA] = useState(months[0]?.month ?? "");
  const [b, setB] = useState(months[months.length - 1]?.month ?? "");
  const [pos, setPos] = useState(50);
  const [fa, setFa] = useState<Feat | null>(null);
  const [fb, setFb] = useState<Feat | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let live = true;
    setState("loading");
    Promise.all([getJson<Feat>(`/data/extents/${lakeId}/${a}.geojson`), getJson<Feat>(`/data/extents/${lakeId}/${b}.geojson`)])
      .then(([x, y]) => { if (live) { setFa(x); setFb(y); setState("ready"); } })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [lakeId, a, b]);

  // Equirectangular fit of the lake's bounding box into a 600x400 frame, padded so outlines never touch the edge.
  const [w, s, e, n] = bbox;
  const k = Math.cos(((s + n) / 2) * Math.PI / 180);
  const spanX = (e - w) * k, spanY = n - s;
  const scale = Math.min(560 / spanX, 360 / spanY);
  const ox = (600 - spanX * scale) / 2, oy = (400 - spanY * scale) / 2;
  const path = (f: Feat | null) =>
    rings(f).map((r) => "M" + r.map(([x, y]) => `${(ox + (x - w) * k * scale).toFixed(1)},${(oy + (n - y) * scale).toFixed(1)}`).join("L") + "Z").join("");

  const ra = months.find((r) => r.month === a), rb = months.find((r) => r.month === b);
  let words = "";
  if (ra && rb) {
    const d = (rb.area_ha ?? 0) - (ra.area_ha ?? 0);
    const u = Math.hypot(ra.unc_ha ?? 0, rb.unc_ha ?? 0);
    const cross = ra.source !== rb.source ? " The two months used different sensors, so compare with care." : "";
    words = a === b
      ? "Both sides show the same month."
      : Math.abs(d) <= u
        ? `${formatMonth(a)} to ${formatMonth(b)}: ${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} ha, within the measurement uncertainty (about ±${u.toFixed(1)} ha), so not a clear change.${cross}`
        : `${formatMonth(a)} to ${formatMonth(b)}: ${d > 0 ? "up" : "down"} ${Math.abs(d).toFixed(1)} ha, more than the ±${u.toFixed(1)} ha uncertainty.${cross}`;
  }

  const select = (id: string, label: string, v: string, set: (m: string) => void) => (
    <div>
      <label htmlFor={id} className="block text-sm text-muted">{label}</label>
      <select id={id} value={v} onChange={(e) => set(e.target.value)} className="tap rounded-md border border-border bg-surface px-3 text-base">
        {months.map((r) => <option key={r.month} value={r.month}>{formatMonth(r.month)}</option>)}
      </select>
    </div>
  );

  if (months.length < 2) return <p className="text-sm text-muted">Not enough months with a usable scene to compare.</p>;

  return (
    <div className="space-y-3" data-testid="thennow">
      <div className="flex flex-wrap items-end gap-4">
        {select("tn-a", "Left side", a, setA)}
        {select("tn-b", "Right side", b, setB)}
      </div>
      <div className="relative overflow-hidden rounded-lg border border-border bg-surface">
        <svg viewBox="0 0 600 400" role="img" aria-label={`${name}: open-water outline in ${formatMonth(a)} on the left and ${formatMonth(b)} on the right, split at ${pos} percent`} className="block w-full">
          <defs>
            <clipPath id="tn-l"><rect x="0" y="0" width={6 * pos} height="400" /></clipPath>
            <clipPath id="tn-r"><rect x={6 * pos} y="0" width={600 - 6 * pos} height="400" /></clipPath>
          </defs>
          <g clipPath="url(#tn-l)"><path d={path(fa)} fill="var(--optical)" fillOpacity="0.85" stroke="var(--optical)" strokeWidth="1" fillRule="evenodd" /></g>
          <g clipPath="url(#tn-r)"><path d={path(fb)} fill="var(--fused)" fillOpacity="0.85" stroke="var(--fused)" strokeWidth="1" fillRule="evenodd" /></g>
          <line x1={6 * pos} x2={6 * pos} y1="0" y2="400" stroke="var(--fg)" strokeWidth="2" />
          <text x="10" y="22" fill="var(--fg)" fontSize="16" className="num">{formatMonth(a)}{ra ? ` · ${ra.area_ha?.toFixed(1)} ha` : ""}</text>
          <text x="590" y="22" fill="var(--fg)" fontSize="16" textAnchor="end" className="num">{formatMonth(b)}{rb ? ` · ${rb.area_ha?.toFixed(1)} ha` : ""}</text>
        </svg>
        {state === "loading" ? <p className="absolute inset-0 grid place-items-center bg-surface/70 text-sm text-muted">Loading outlines…</p> : null}
        {state === "error" ? <p role="alert" className="absolute inset-0 grid place-items-center bg-surface/90 px-4 text-center text-sm">The outline for one of these months could not be loaded. Pick another month.</p> : null}
      </div>
      <div>
        <label htmlFor="tn-pos" className="block text-sm text-muted">Divider position</label>
        <input id="tn-pos" type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="tap w-full accent-[var(--accent)]" />
      </div>
      <p className="max-w-2xl text-sm" aria-live="polite" data-testid="thennow-words">{words}</p>
      <p className="max-w-2xl text-xs text-muted">Outlines are the open-water mask for each month, same scale, same frame. Dry bed and water under floating plants are not drawn. They are estimates, not survey boundaries.</p>
    </div>
  );
}
