import type { EventItem, Health, LakeIndex, Row, Source, Validation } from "./types";

export const REPO = "https://github.com/Kaushik2210/TideMark";
export const REPO_REF = "main";
/** Set for hosts that serve the site under a sub-path (GitHub Pages project sites), e.g. "/TideMark". */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
/** Prefix a root-absolute path for plain fetch/img/anchor use (next/link adds it by itself). */
export const withBase = (p: string) => `${BASE_PATH}${p}`;
export const repoFile = (path: string) => `${REPO}/blob/${REPO_REF}/${path}`;

/** Client-side loader with an in-memory cache, used by interactive components. */
const cache = new Map<string, Promise<unknown>>();

export function getJson<T>(path: string): Promise<T> {
  let hit = cache.get(path);
  if (!hit) {
    hit = fetch(withBase(path)).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });
    cache.set(path, hit);
    hit.catch(() => cache.delete(path)); // allow retry after a failure
  }
  return hit as Promise<T>;
}

export const loadLakes = () => getJson<LakeIndex[]>("/data/lakes.json");
export const loadSeries = (id: string) => getJson<Row[]>(`/data/series/${id}.json`);
export const loadEvents = (id: string) => getJson<EventItem[]>(`/data/events/${id}.json`);
export const loadHealth = (id: string) => getJson<Health>(`/data/health/${id}.json`);
export const loadValidation = () => getJson<Validation>("/data/validation.json");

/** Months "YYYY-MM" from first to last inclusive. */
export function monthRange(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function fmtHa(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || Number.isNaN(v) ? "n/a" : `${v.toFixed(digits)} ha`;
}

/** Row lookup by month, built once per series. */
export function byMonth(rows: Row[]): Map<string, Row> {
  return new Map(rows.map((r) => [r.month, r]));
}

/** A row that has a usable extent: source is a sensor and the area is a number. */
export type WithExtent = Row & { source: Exclude<Source, "none">; area_ha: number };

export const hasExtent = (r: Row | undefined): r is WithExtent =>
  !!r && r.source !== "none" && r.area_ha !== null;
