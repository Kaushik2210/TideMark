import { readFileSync } from "node:fs";
import path from "node:path";
import { monthlyAnomalies } from "./anomaly";
import { parseCsv } from "./csv";
import { formatMonth, hasExtent } from "./data";
import { getLakes, getSeries, getValidation } from "./server-data";
import type { Row } from "./types";

export type Tone = "ok" | "weak" | "fail" | "info";

export interface Chapter {
  id: string;
  kicker: string;
  title: string;
  body: string[];
  /** Month shown on the map while this chapter is in view. */
  month: string;
  /** "all" or a lake id to frame. */
  focus: string;
  evidence: { label: string; tone: Tone; sources: { name: string; url: string }[] };
}

interface GroundTruth {
  event_id: string;
  lake_id: string;
  event_type: string;
  date_start: string;
  date_end: string;
  description: string;
  source_url: string;
  source_publisher: string;
}

const readTruth = (): GroundTruth[] =>
  parseCsv(readFileSync(path.join(process.cwd(), "public", "downloads", "ground_truth.csv"), "utf-8")) as unknown as GroundTruth[];

const nameOf = (id: string) => getLakes().find((l) => l.id === id)!.name.replace(" (Halasuru Kere)", "");

/** The month inside [start,end] with the lowest (or highest) area, i.e. where the reported event shows most. */
function extremeMonth(rows: Row[], start: string, end: string, low: boolean): Row | null {
  const inWin = rows.filter((r) => hasExtent(r) && r.month >= start.slice(0, 7) && r.month <= end.slice(0, 7));
  if (!inWin.length) return null;
  return inWin.reduce((p, r) => ((low ? (r.area_ha ?? Infinity) < (p.area_ha ?? Infinity) : (r.area_ha ?? -1) > (p.area_ha ?? -1)) ? r : p));
}

/**
 * Builds the guided story from the data itself: the record's own peaks, reported events the satellite record
 * matched (with their published sources), the foam events it failed to detect, and today. Nothing here is typed in
 * by hand except the framing sentences.
 */
export function buildStory(): Chapter[] {
  const lakes = getLakes();
  const series = Object.fromEntries(lakes.map((l) => [l.id, getSeries(l.id)]));
  const truth = readTruth();
  const val = getValidation();
  const first = series[lakes[0].id][0].month;
  const last = series[lakes[0].id][series[lakes[0].id].length - 1].month;
  const chapters: Chapter[] = [];

  chapters.push({
    id: "start",
    kicker: "Start",
    title: "Ten years of three lakes",
    body: [
      `Open water in Bellandur, Varthur and Ulsoor lakes, measured every month since ${formatMonth(first)} from free Sentinel satellite data.`,
      "This is a short tour: what the record shows, what published reports say about the same moments, and where the method falls short. Scroll, and the map follows.",
    ],
    month: first,
    focus: "all",
    evidence: { label: "Satellite estimates; every figure carries an uncertainty", tone: "info", sources: [] },
  });

  const bell = series.bellandur;
  const peak = bell.filter(hasExtent).reduce((p, r) => ((r.area_ha ?? 0) > (p.area_ha ?? 0) ? r : p));
  chapters.push({
    id: "bellandur-peak",
    kicker: "Bellandur",
    title: `Its fullest: ${formatMonth(peak.month)}`,
    body: [
      `The largest open-water extent in Bellandur's record is ${peak.area_ha?.toFixed(1)} ha in ${formatMonth(peak.month)}, from ${peak.source === "optical" ? "Sentinel-2 optical" : peak.source === "fused" ? "combined optical and radar" : "Sentinel-1 radar"} imagery.`,
      "The lake's mapped outline is about 315 ha, so even this peak is a fraction of it. Open water only is counted: dry bed and water under floating plants are not.",
      ...(peak.source === "radar" ? ["This month comes from radar, which defines water slightly differently from optical imagery, so treat the exact figure with care."] : []),
    ],
    month: peak.month,
    focus: "bellandur",
    evidence: { label: "From the satellite record only", tone: "info", sources: [] },
  });

  // Reported water-level events the record picked up, grouped by lake, year and direction.
  const groups = new Map<string, { lake: string; low: boolean; ids: string[]; outcome: string }>();
  for (const e of val.water_level) {
    if (e.outcome !== "hit" && e.outcome !== "partial") continue;
    const year = e.window.slice(0, 4);
    const low = e.signal === "extent_low";
    const key = `${e.lake}|${year}|${low}`;
    const g = groups.get(key);
    if (g) {
      g.ids.push(e.event_id);
      if (e.outcome === "hit") g.outcome = "hit";
    } else groups.set(key, { lake: e.lake, low, ids: [e.event_id], outcome: e.outcome });
  }
  const events = [...groups.entries()]
    .map(([key, g]) => ({ key, ...g, gt: truth.filter((t) => g.ids.includes(t.event_id)) }))
    .filter((g) => g.gt.length > 0)
    .sort((a, b) => a.gt[0].date_start.localeCompare(b.gt[0].date_start));

  for (const g of events) {
    const main = g.gt[g.gt.length - 1];
    const rows = series[g.lake];
    const row = extremeMonth(rows, g.gt[0].date_start, g.gt[g.gt.length - 1].date_end, g.low);
    if (!row) continue;
    const anom = monthlyAnomalies(rows)[rows.indexOf(row)];
    const year = g.gt[0].date_start.slice(0, 4);
    const many = g.gt.length > 1;
    chapters.push({
      id: `ev-${g.lake}-${year}-${g.low ? "low" : "high"}`,
      kicker: nameOf(g.lake),
      title: g.outcome === "partial"
        ? `Reported ${g.low ? "drained" : "overflowing"}, only partly seen: ${formatMonth(row.month)}`
        : `${g.low ? "Drained or very low" : "Overflowing"}: ${formatMonth(row.month)}`,
      body: [
        main.description,
        `The satellite record shows ${row.area_ha?.toFixed(1)} ha in ${formatMonth(row.month)}${anom.medianHa !== null ? `, against a typical ${anom.medianHa.toFixed(1)} ha for that lake in that calendar month` : ""}.`,
        ...(many ? [`${g.gt.length} separate reports in ${year} describe this; the month shown is where the record is ${g.low ? "lowest" : "highest"}.`] : []),
        ...(g.outcome === "partial" ? ["The match was only partial: the satellite signal was weaker or later than the report suggests."] : []),
      ],
      month: row.month,
      focus: g.lake,
      evidence: {
        label: g.outcome === "hit" ? "Reported event, matched by the satellite record" : "Reported event, partly matched",
        tone: g.outcome === "hit" ? "ok" : "weak",
        sources: g.gt.slice(-2).map((t) => ({ name: t.source_publisher, url: t.source_url })),
      },
    });
  }

  // What the method could not see.
  const foam = truth.filter((t) => t.event_type === "foam_spill");
  const foamMissed = val.foam.filter((f) => f.outcome === "missed").length;
  const foamCloud = val.foam.filter((f) => f.outcome === "not_observed").length;
  const foamDetected = val.foam.filter((f) => f.outcome === "detected").length;
  if (foam.length) {
    const f = foam[0];
    const row = series[f.lake_id].find((r) => r.month === f.date_start.slice(0, 7))!;
    chapters.push({
      id: "foam",
      kicker: "Where it falls short",
      title: "Foam the satellites did not catch",
      body: [
        f.description,
        `Tidemark tried to flag foam from imagery. Of ${val.foam.length} reported foam events, ${foamCloud} had no usable clear scene on those days (cloud), and of the ${foamMissed + foamDetected} that did, it detected ${foamDetected}. A supplementary test using every low-cloud scene still found no foam. Its foam flags should not be read as foam.`,
        "Reporting this is part of the project: a method that hides what it cannot do is not worth trusting.",
      ],
      month: row ? row.month : f.date_start.slice(0, 7),
      focus: f.lake_id,
      evidence: { label: "Failed validation", tone: "fail", sources: [{ name: f.source_publisher, url: f.source_url }] },
    });
  }

  const latest = lakes.map((l) => ({ name: nameOf(l.id), row: series[l.id][series[l.id].length - 1] }));
  chapters.push({
    id: "today",
    kicker: "Today",
    title: formatMonth(last),
    body: [
      latest.map((l) => `${l.name} ${hasExtent(l.row) ? `${l.row.area_ha?.toFixed(1)} ha` : "no usable scene"}`).join(", ") + ".",
      "Every month's figure, its source and its uncertainty are on the lake pages; the map lets you scrub through all of it.",
    ],
    month: last,
    focus: "all",
    evidence: { label: "Satellite estimates, not an official assessment", tone: "info", sources: [] },
  });
  return chapters;
}
