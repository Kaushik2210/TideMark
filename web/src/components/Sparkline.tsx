import type { Row } from "@/lib/types";

/** Tiny area-over-time line for list cards. Gaps (no extent) break the line; it is decorative context,
 *  so the exact figures stay in the text next to it. */
export function Sparkline({ rows, label }: { rows: Row[]; label: string }) {
  const W = 240;
  const H = 56;
  const vals = rows.map((r) => (r.source === "none" ? null : r.area_ha));
  const nums = vals.filter((v): v is number => v !== null);
  if (nums.length < 2) return null;
  const max = Math.max(...nums);
  const x = (i: number) => (i / (vals.length - 1)) * W;
  const y = (v: number) => H - 4 - (v / max) * (H - 10);
  let d = "";
  let pen = false;
  vals.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-14 w-full">
      <line x1="0" y1={H - 1} x2={W} y2={H - 1} stroke="var(--border)" strokeWidth="1" />
      <path d={d} fill="none" stroke="var(--optical)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
