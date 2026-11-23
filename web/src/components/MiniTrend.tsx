"use client";

import type { Row } from "@/lib/types";

/**
 * A small area-over-time line with a marker at the selected month. Pointer users can click or drag
 * across it to move the month; keyboard and screen-reader users use the slider, so this is aria-hidden.
 */
export function MiniTrend({ rows, months, idx, onScrub, active }: {
  rows: Row[];
  months: string[];
  idx: number;
  onScrub: (i: number) => void;
  active?: boolean;
}) {
  const W = 240;
  const H = 34;
  const by = new Map(rows.map((r) => [r.month, r.source === "none" ? null : r.area_ha]));
  const vals = months.map((m) => by.get(m) ?? null);
  const nums = vals.filter((v): v is number => v !== null);
  if (nums.length < 2) return null;
  const max = Math.max(...nums);
  const x = (i: number) => (i / (months.length - 1)) * W;
  const y = (v: number) => H - 3 - (v / max) * (H - 8);
  let d = "";
  let pen = false;
  vals.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  const cur = vals[idx];

  const scrub = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointermove" && e.buttons === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onScrub(Math.round(f * (months.length - 1)));
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className="h-9 w-full cursor-col-resize touch-pan-y"
      onPointerDown={scrub}
      onPointerMove={scrub}
    >
      <line x1="0" y1={H - 1} x2={W} y2={H - 1} stroke="var(--border)" />
      <path d={d} fill="none" stroke={active ? "var(--accent)" : "var(--optical)"} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1={x(idx)} x2={x(idx)} y1="0" y2={H} stroke="var(--fg)" strokeWidth="1" opacity="0.7" />
      {cur !== null && cur !== undefined ? <circle cx={x(idx)} cy={y(cur)} r="3" fill="var(--fg)" /> : null}
    </svg>
  );
}
