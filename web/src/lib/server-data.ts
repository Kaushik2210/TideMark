import { readFileSync } from "node:fs";
import path from "node:path";
import type { EventItem, Health, LakeIndex, Row, Validation } from "./types";

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
