import { hasExtent } from "./data";
import type { Row } from "./types";

export interface Anomaly {
  /** Robust z-score of the month against that lake's own calendar-month median; null = no usable scene. */
  z: number | null;
  /** Hectares above (+) or below (-) the lake's median for this calendar month. */
  residualHa: number | null;
  /** The median itself, for wording ("usual March"). */
  medianHa: number | null;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Compares each month with the same calendar month in other years, so the normal monsoon cycle is removed and
 * what is left is "unusually wet/dry for the time of year". Scaled by 1.4826 x MAD of the residuals (robust to
 * the few extreme months), the same idea as the pipeline's anomaly flags.
 */
export function monthlyAnomalies(rows: Row[]): Anomaly[] {
  const byCal: number[][] = Array.from({ length: 12 }, () => []);
  rows.forEach((r) => {
    if (hasExtent(r) && r.area_ha !== null) byCal[Number(r.month.slice(5, 7)) - 1].push(r.area_ha);
  });
  const med = byCal.map((v) => (v.length ? median(v) : null));
  const resid = rows.map((r) => {
    const m = med[Number(r.month.slice(5, 7)) - 1];
    return hasExtent(r) && r.area_ha !== null && m !== null ? r.area_ha - m : null;
  });
  const have = resid.filter((v): v is number => v !== null);
  const mr = have.length ? median(have) : 0;
  const scale = have.length > 4 ? 1.4826 * median(have.map((v) => Math.abs(v - mr))) : 0;
  return rows.map((r, i) => {
    const m = med[Number(r.month.slice(5, 7)) - 1];
    const res = resid[i];
    return {
      z: res !== null && scale > 1e-9 ? res / scale : null,
      residualHa: res,
      medianHa: m,
    };
  });
}

/** Diverging colour-blind-safe scale (orange = drier than usual, blue = wetter), fixed so a PNG matches the page. */
export const STRIPE_STOPS = ["#7f3b08", "#b35806", "#e08214", "#fdb863", "#eeeeee", "#b2d4ea", "#6aa8d2", "#2166ac", "#08306b"] as const;

export function stripeColor(z: number | null, clamp = 2.5): string {
  if (z === null || Number.isNaN(z)) return "transparent";
  const t = (Math.max(-clamp, Math.min(clamp, z)) / clamp + 1) / 2; // 0..1
  const k = t * (STRIPE_STOPS.length - 1);
  const i = Math.min(STRIPE_STOPS.length - 2, Math.floor(k));
  const f = k - i;
  const a = STRIPE_STOPS[i];
  const b = STRIPE_STOPS[i + 1];
  const ch = (h: string, o: number) => parseInt(h.slice(1 + o * 2, 3 + o * 2), 16);
  const mix = (o: number) => Math.round(ch(a, o) + (ch(b, o) - ch(a, o)) * f);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

/** Words for a z-score, so the readout never needs the reader to know what a z-score is. */
export function describeAnomaly(z: number): string {
  const a = Math.abs(z);
  if (a < 0.5) return "close to usual";
  const dir = z < 0 ? "below" : "above";
  return a < 1.5 ? `${dir} usual` : `well ${dir} usual`;
}
