"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ShareButton } from "./ShareButton";
import { describeAnomaly, monthlyAnomalies, STRIPE_STOPS, stripeColor } from "@/lib/anomaly";
import { formatMonth } from "@/lib/data";
import { MOTION_OK, registerGsap } from "@/lib/motion";
import type { LakeIndex, Row } from "@/lib/types";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const short = (l: LakeIndex) => l.name.replace(" (Halasuru Kere)", "").replace(" Lake", "");

/**
 * "Water stripes": one stripe per month and lake, coloured by how unusual the month is for the time of year
 * (orange = drier than that lake's usual for the calendar month, blue = wetter). The shape of the last decade
 * reads at a glance, and the picture can be saved and shared.
 */
export function WaterStripes({ lakes, series }: { lakes: LakeIndex[]; series: Record<string, Row[]> }) {
  const uid = useId();
  const months = useMemo(() => (series[lakes[0].id] ?? []).map((r) => r.month), [series, lakes]);
  const anomalies = useMemo(() => Object.fromEntries(lakes.map((l) => [l.id, monthlyAnomalies(series[l.id] ?? [])])), [lakes, series]);
  const n = months.length;
  const [idx, setIdx] = useState(n - 1);
  const [row, setRow] = useState(0);
  const [busy, setBusy] = useState(false);

  const ROW_H = 26;
  const GAP = 6;
  const H = lakes.length * (ROW_H + GAP) - GAP;
  const SC = 1.4; // on-screen pixels per svg unit vertically; labels use the same factor so they stay aligned

  const clip = useRef<SVGRectElement>(null);
  useLayoutEffect(() => {
    const el = clip.current;
    if (!el) return;
    const gsap = registerGsap();
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.fromTo(el, { attr: { width: 0 } }, { attr: { width: n }, duration: 1.4, ease: "power2.inOut" });
    });
    return () => {
      mm.revert();
      el.setAttribute("width", String(n));
    };
  }, [n]);

  const lake = lakes[row];
  const a = anomalies[lake.id]?.[idx];
  const r = series[lake.id]?.[idx];
  const calMonth = MONTH_NAMES[Number(months[idx].slice(5, 7)) - 1];
  const readout =
    a && a.z !== null && r?.area_ha != null && a.medianHa !== null
      ? `${formatMonth(months[idx])}, ${short(lake)}: ${r.area_ha.toFixed(1)} ha, ${describeAnomaly(a.z)} for ${calMonth} (typical ${a.medianHa.toFixed(1)} ha).`
      : `${formatMonth(months[idx])}, ${short(lake)}: no usable scene, so no stripe.`;

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    setIdx(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - b.left) / b.width) * n))));
    setRow(Math.min(lakes.length - 1, Math.max(0, Math.floor(((e.clientY - b.top) / b.height) * lakes.length))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 12 : 1;
    if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - step));
    else if (e.key === "ArrowRight") setIdx((i) => Math.min(n - 1, i + step));
    else if (e.key === "ArrowUp") setRow((x) => Math.max(0, x - 1));
    else if (e.key === "ArrowDown") setRow((x) => Math.min(lakes.length - 1, x + 1));
    else if (e.key === "Home") setIdx(0);
    else if (e.key === "End") setIdx(n - 1);
    else return;
    e.preventDefault();
  };

  function download() {
    setBusy(true);
    try {
      const W = 1600;
      const Hh = 900;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = Hh;
      const g = c.getContext("2d");
      if (!g) return;
      g.fillStyle = "#0b1220";
      g.fillRect(0, 0, W, Hh);
      const sans = "system-ui, -apple-system, Segoe UI, sans-serif";
      const serif = 'Georgia, "Times New Roman", serif';
      g.fillStyle = "#9db0c7";
      g.font = `600 26px ${sans}`;
      g.fillText("TIDEMARK · WATER STRIPES", 80, 80);
      g.fillStyle = "#e6edf7";
      g.font = `700 64px ${serif}`;
      g.fillText("Bengaluru's lakes, 2016 to now", 80, 160);
      g.fillStyle = "#9db0c7";
      g.font = `400 28px ${sans}`;
      g.fillText("Each stripe is one month. Colour shows how unusual that month is for the time of year.", 80, 205);
      const x0 = 260;
      const x1 = W - 80;
      const sw = (x1 - x0) / n;
      const rowH = 118;
      lakes.forEach((l, k) => {
        const y = 260 + k * (rowH + 22);
        g.fillStyle = "#e6edf7";
        g.font = `600 32px ${sans}`;
        g.textBaseline = "middle";
        g.fillText(short(l), 80, y + rowH / 2);
        anomalies[l.id].forEach((an, i) => {
          if (an.z === null) {
            g.fillStyle = "#2a3a52";
          } else {
            g.fillStyle = stripeColor(an.z);
          }
          g.fillRect(x0 + i * sw, y, Math.ceil(sw) + 0.5, rowH);
        });
      });
      g.textBaseline = "alphabetic";
      g.fillStyle = "#9db0c7";
      g.font = `400 24px ${sans}`;
      months.forEach((m, i) => {
        if (m.endsWith("-01") && Number(m.slice(0, 4)) % 2 === 0) g.fillText(m.slice(0, 4), x0 + i * sw - 20, 260 + lakes.length * (rowH + 22) + 12);
      });
      const ly = 260 + lakes.length * (rowH + 22) + 56;
      const lw = 520;
      STRIPE_STOPS.forEach((col, i) => {
        g.fillStyle = col;
        g.fillRect(x0 + (i * lw) / STRIPE_STOPS.length, ly, lw / STRIPE_STOPS.length + 1, 22);
      });
      g.fillStyle = "#9db0c7";
      g.font = `400 22px ${sans}`;
      g.fillText("drier than usual", x0, ly + 52);
      g.textAlign = "right";
      g.fillText("wetter than usual", x0 + lw, ly + 52);
      g.textAlign = "left";
      g.fillText("grey = no usable scene", x0 + lw + 60, ly + 19);
      g.font = `400 21px ${sans}`;
      g.fillText("Research estimates from Sentinel-1/2 data, compared with each lake's own usual for the calendar month. Not an official assessment.", 80, Hh - 40);
      c.toBlob((blob) => {
        setBusy(false);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "tidemark-water-stripes.png";
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch {
      setBusy(false);
    }
  }

  const yearMarks = months.map((m, i) => ({ m, i })).filter(({ m }) => m.endsWith("-01") && Number(m.slice(0, 4)) % 2 === 0);

  return (
    <div className="space-y-3" data-testid="stripes">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={download} disabled={busy} className="tap rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2">
          {busy ? "Preparing…" : "Save as image (PNG)"}
        </button>
        <ShareButton title="Tidemark water stripes" text="Bengaluru's lakes month by month since 2016: orange is drier than usual for the time of year, blue is wetter (satellite estimates, not official)." url={undefined} />
      </div>

      <div
        tabIndex={0}
        role="group"
        aria-label="Water stripes: each stripe is a month. Use the arrow keys to move between months and lakes; hold Shift to jump a year."
        aria-describedby={`${uid}-r`}
        onKeyDown={onKey}
        className="overflow-x-auto rounded-xl border border-border bg-surface p-3"
      >
        <div className="flex min-w-[560px] gap-3">
          <ul className="flex flex-col text-sm text-muted" style={{ gap: GAP * SC }} aria-hidden="true">
            {lakes.map((l, k) => (
              <li key={l.id} className={`flex items-center ${k === row ? "font-medium text-fg" : ""}`} style={{ height: ROW_H * SC }}>{short(l)}</li>
            ))}
          </ul>
          <div className="min-w-0 flex-1">
            <svg
              viewBox={`0 0 ${n} ${H}`}
              preserveAspectRatio="none"
              className="block w-full cursor-crosshair touch-pan-y select-none"
              style={{ height: H * SC }}
              onPointerMove={pick}
              onPointerDown={pick}
              role="img"
              aria-label={`Colour stripes of how unusual each month is for the time of year, for ${lakes.map(short).join(", ")}, ${months[0].slice(0, 4)} to ${months[n - 1].slice(0, 4)}.`}
            >
              <defs>
                <clipPath id="stripe-clip"><rect ref={clip} x="0" y="0" width={n} height={H} /></clipPath>
                <pattern id="stripe-gap" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="2" height="2" fill="var(--surface-2)" />
                  <line x1="0" y1="0" x2="0" y2="2" stroke="var(--border)" strokeWidth="0.9" />
                </pattern>
              </defs>
              <g clipPath="url(#stripe-clip)">
                {lakes.map((l, k) => (
                  <g key={l.id} transform={`translate(0 ${k * (ROW_H + GAP)})`}>
                    {anomalies[l.id].map((an, i) => (
                      <rect key={i} x={i} y={0} width={1.04} height={ROW_H} fill={an.z === null ? "url(#stripe-gap)" : stripeColor(an.z)} />
                    ))}
                  </g>
                ))}
              </g>
              <rect x={idx} y={row * (ROW_H + GAP) - 1} width={1} height={ROW_H + 2} fill="none" stroke="var(--fg)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              <rect x={idx} y={row * (ROW_H + GAP) - 1} width={1} height={ROW_H + 2} fill="none" stroke="var(--bg)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" opacity="0.5" />
            </svg>
            <div className="relative mt-1 h-5 text-xs text-muted" aria-hidden="true">
              {yearMarks.map(({ m, i }) => (
                <span key={m} className="num absolute -translate-x-1/2" style={{ left: `${(i / (n - 1)) * 100}%` }}>{m.slice(0, 4)}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p id={`${uid}-r`} aria-live="polite" className="num min-h-6 text-sm">{readout}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted" aria-label="Colour scale">
        <span>drier than usual</span>
        <span aria-hidden="true" className="flex h-3 w-48 overflow-hidden rounded-sm">
          {STRIPE_STOPS.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
        </span>
        <span>wetter than usual</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-border" style={{ background: "repeating-linear-gradient(45deg, var(--surface-2) 0 2px, var(--border) 2px 3px)" }} />no usable scene</span>
      </div>
      <p className="max-w-3xl text-sm text-muted">
        Each month is compared with the same calendar month in other years for the same lake, so the normal monsoon cycle is
        removed and each lake is scaled by its own spread: a stripe says &ldquo;unusual for this lake at this time of year&rdquo;,
        not &ldquo;big&rdquo; or &ldquo;small&rdquo;. Lakes are not comparable by colour intensity.
      </p>
    </div>
  );
}
