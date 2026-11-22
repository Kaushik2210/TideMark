"use client";

import { formatMonth } from "@/lib/data";
import type { LakeIndex, Row } from "@/lib/types";

interface Props {
  months: string[];
  idx: number;
  onIdx: (i: number) => void;
  lakes: LakeIndex[];
  series: Record<string, Row[]>;
  playing: boolean;
  onTogglePlay: () => void;
}

const FILL: Record<string, string> = { optical: "var(--optical)", fused: "var(--fused)", radar: "var(--radar)" };

/**
 * Month slider with an availability strip: one row per lake, one cell per month coloured by the
 * data source, empty where no usable scene exists. The native range input keeps full keyboard
 * and screen-reader support (arrows, Home/End, PageUp/PageDown).
 */
export function TimeSlider({ months, idx, onIdx, lakes, series, playing, onTogglePlay }: Props) {
  const n = months.length;
  const years = months.flatMap((m, i) => (m.endsWith("-01") ? [{ i, y: m.slice(0, 4) }] : []));
  const frac = n > 1 ? idx / (n - 1) : 0;
  return (
    <div className="space-y-2" data-testid="time-slider">
      <div className="flex items-center justify-between gap-2">
        <p className="num font-serif text-2xl font-semibold" aria-live="polite" data-testid="month-label">
          {formatMonth(months[idx])}
        </p>
        <div className="flex items-center gap-1">
          <button type="button" className="tap rounded-md border border-border px-3 text-sm" onClick={() => onIdx(Math.max(0, idx - 1))} disabled={idx === 0} aria-label="Previous month">
            ‹
          </button>
          <button type="button" className="tap rounded-md border border-border px-3 text-sm" onClick={() => onIdx(Math.min(n - 1, idx + 1))} disabled={idx === n - 1} aria-label="Next month">
            ›
          </button>
          <button type="button" className="tap rounded-md border border-border px-3 text-sm font-medium" onClick={onTogglePlay} aria-pressed={playing}>
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" className="tap rounded-md border border-border px-3 text-sm" onClick={() => onIdx(n - 1)} disabled={idx === n - 1}>
            Latest
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 text-xs text-muted sm:grid-cols-[5.5rem_1fr]">
        {lakes.map((l) => {
          const rows = new Map((series[l.id] ?? []).map((r) => [r.month, r]));
          return (
            <div key={l.id} className="contents">
              <span className="truncate" id={`strip-${l.id}`}>{l.name.replace(" (Halasuru Kere)", "")}</span>
              <svg viewBox={`0 0 ${n} 7`} preserveAspectRatio="none" className="h-3 w-full" role="img" aria-labelledby={`strip-${l.id}`} aria-describedby="strip-desc">
                <rect x="0" y="3" width={n} height="1" fill="var(--border)" />
                {months.map((m, i) => {
                  const s = rows.get(m)?.source ?? "none";
                  return s === "none" ? null : <rect key={m} x={i} y="0" width="1.02" height="7" fill={FILL[s]} />;
                })}
                <rect x={frac * (n - 1)} y="0" width="1.4" height="7" fill="var(--fg)" />
              </svg>
            </div>
          );
        })}
        <span />
        <div className="relative h-4" aria-hidden="true">
          {years.map((t) => (
            <span key={t.y} className="num absolute -translate-x-1/2" style={{ left: `${(t.i / (n - 1)) * 100}%` }}>
              {t.y}
            </span>
          ))}
        </div>
        <span />
        <input
          type="range"
          min={0}
          max={n - 1}
          step={1}
          value={idx}
          onChange={(e) => onIdx(Number(e.target.value))}
          aria-label="Month"
          aria-valuetext={formatMonth(months[idx])}
          data-testid="month-range"
        />
      </div>
      <p id="strip-desc" className="text-xs text-muted">
        Coloured cells are months with an extent (colour = data source); empty cells are months with no
        usable optical or radar scene.
      </p>
    </div>
  );
}
