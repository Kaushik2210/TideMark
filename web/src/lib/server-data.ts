import { readFileSync } from "node:fs";
import path from "node:path";
import type { CityLake, SceneArchive, EventItem, Health, LakeIndex, RainResponse, Row, Validation } from "./types";

/** Build-time readers for the static JSON bundle in public/data (server components only). */
const DATA = path.join(process.cwd(), "public", "data");

function read<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(path.join(DATA, ...parts), "utf-8")) as T;
}

export const getLakes = () => read<LakeIndex[]>("lakes.json");
export const getSeries = (id: string) => read<Row[]>("series", `${id}.json`);
export const getEvents = (id: string) => read<EventItem[]>("events", `${id}.json`);
export const getHealth = (id: string) => read<Health>("health", `${id}.json`);
export const getValidation = () => read<Validation>("validation.json");
export const getRainResponse = (id: string) => read<RainResponse>("rain_response", `${id}.json`);

export const getArchive = () => read<SceneArchive>("scenes", "index.json");
export function getCityLakes() {
  const places = read<{ features: { properties: CityLake }[] }>("city-lakes.geojson")
    .features.map(f => f.properties);
  const counts = new Map<string, number>();
  for (const p of places) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  return places.map(p => {
    if (counts.get(p.name) === 1) return p;
    const [w, s, e, n] = p.bbox;
    const position = `${((s + n) / 2).toFixed(3)}°N, ${((w + e) / 2).toFixed(3)}°E`;
    return { ...p, name: `${p.name} · ${position}` };
  });
}
