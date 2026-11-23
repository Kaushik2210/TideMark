import { hasExtent } from "./data";
import type { Row } from "./types";

export interface Note {
  month: string;
  /** Hertz, or null for a rest (no usable scene). */
  freq: number | null;
  wave: OscillatorType;
  areaHa: number | null;
  /** First month of a year: gets a soft tick so the listener can count years. */
  newYear: boolean;
}

// Pentatonic steps (semitones) repeated over three octaves: any two notes sound fine together.
const STEPS = [0, 2, 4, 7, 9];
const LOW = 196; // G3

/**
 * Turns a lake's monthly record into notes. Pitch follows open-water area, scaled to the lake's OWN range
 * (so a small lake and a big one both use the whole scale), timbre follows the data source, and months with no
 * usable scene are rests rather than invented values.
 */
export function notePlan(rows: Row[]): Note[] {
  const areas = rows.filter(hasExtent).map((r) => r.area_ha ?? 0);
  const max = Math.max(1e-9, ...areas);
  const WAVE: Record<Row["source"], OscillatorType> = { optical: "sine", fused: "triangle", radar: "square", none: "sine" };
  const top = STEPS.length * 3 - 1;
  return rows.map((r) => {
    if (!hasExtent(r) || r.area_ha === null) {
      return { month: r.month, freq: null, wave: "sine", areaHa: null, newYear: r.month.endsWith("-01") };
    }
    const k = Math.round((r.area_ha / max) * top);
    const semis = STEPS[k % STEPS.length] + 12 * Math.floor(k / STEPS.length);
    return { month: r.month, freq: LOW * 2 ** (semis / 12), wave: WAVE[r.source], areaHa: r.area_ha, newYear: r.month.endsWith("-01") };
  });
}
