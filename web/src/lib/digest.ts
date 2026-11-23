import { EVENT_TYPES } from "./eventTypes";
import { formatMonth, hasExtent } from "./data";
import { getEvents, getLakes, getSeries } from "./server-data";
import type { Row } from "./types";

const HOW: Record<Row["source"], string> = { optical: "Sentinel-2 optical", fused: "optical and radar combined", radar: "Sentinel-1 radar", none: "no data" };

export interface LakeDigest {
  id: string;
  name: string;
  /** One plain sentence per fact; every change is judged against the measurement uncertainty. */
  lines: string[];
  area: number | null;
  source: Row["source"];
}

export interface Digest {
  month: string;
  headline: string;
  lakes: LakeDigest[];
}

const sign = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);

/**
 * Describes the change between two monthly rows without over-claiming: a change smaller than the combined
 * half-pixel uncertainty is reported as "within the uncertainty", and a change across different sensors is
 * flagged because optical and radar define water slightly differently.
 */
export function describeChange(cur: Row, prev: Row | undefined, label: string): string {
  if (!prev || !hasExtent(prev)) return `No comparison with ${label}: no usable scene that month.`;
  const d = (cur.area_ha ?? 0) - (prev.area_ha ?? 0);
  const u = Math.hypot(cur.unc_ha ?? 0, prev.unc_ha ?? 0);
  const cross = cur.source !== prev.source ? " The two months used different sensors, so compare with care." : "";
  if (Math.abs(d) <= u) return `${sign(d)} ha since ${label}: within the measurement uncertainty (about ±${u.toFixed(1)} ha), so not a clear change.${cross}`;
  return `${d > 0 ? "Up" : "Down"} ${Math.abs(d).toFixed(1)} ha since ${label}, more than the ±${u.toFixed(1)} ha uncertainty.${cross}`;
}

export function buildDigests(count = 12): Digest[] {
  const lakes = getLakes();
  const series = Object.fromEntries(lakes.map((l) => [l.id, getSeries(l.id)]));
  const events = Object.fromEntries(lakes.map((l) => [l.id, getEvents(l.id)]));
  const n = series[lakes[0].id].length;
  const out: Digest[] = [];
  for (let k = 0; k < count && n - 1 - k >= 12; k++) {
    const i = n - 1 - k;
    const month = series[lakes[0].id][i].month;
    const per: LakeDigest[] = lakes.map((l) => {
      const name = l.name.replace(" (Halasuru Kere)", "");
      const rows = series[l.id];
      const cur = rows[i];
      if (!hasExtent(cur)) {
        return { id: l.id, name, area: null, source: "none", lines: [`${name}: no usable optical or radar scene in ${formatMonth(month)}.`] };
      }
      const lines = [
        `${name}: ${cur.area_ha?.toFixed(1)} ha of open water, ±${cur.unc_ha?.toFixed(1)} ha (${HOW[cur.source]}).`,
        describeChange(cur, rows[i - 1], formatMonth(rows[i - 1]?.month ?? month)),
        describeChange(cur, rows[i - 12], `${formatMonth(rows[i - 12].month)} (a year earlier)`),
      ];
      for (const e of events[l.id].filter((x) => x.month === month)) {
        lines.push(`Flagged: ${EVENT_TYPES[e.type]?.label ?? e.type}. This is a candidate signal, not a confirmed event.`);
      }
      return { id: l.id, name, area: cur.area_ha, source: cur.source, lines };
    });
    const headline = per.map((p) => `${p.name.replace(" Lake", "")} ${p.area === null ? "n/a" : p.area.toFixed(1) + " ha"}`).join(", ");
    out.push({ month, headline: `${formatMonth(month)}: ${headline}`, lakes: per });
  }
  return out;
}
