import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BloomChart, ExtentChart, RainChart, SeriesTable } from "@/components/charts";
import { EventTimeline } from "@/components/EventTimeline";
import { HealthCard } from "@/components/HealthCard";
import { SourceMark } from "@/components/SourceMark";
import { formatMonth, hasExtent, repoFile } from "@/lib/data";
import { getEvents, getHealth, getLakes, getSeries, getValidation } from "@/lib/server-data";

type Params = Promise<{ id: string }>;

export function generateStaticParams() {
  return getLakes().map((l) => ({ id: l.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const lake = getLakes().find((l) => l.id === id);
  return { title: lake ? lake.name.replace(" (Halasuru Kere)", "") : "Lake" };
}

const OUTCOME: Record<string, string> = {
  hit: "Matched",
  partial: "Partly matched",
  miss: "Missed",
  not_observed: "Not observed in time",
  detected: "Detected",
  missed: "Not detected",
};

export default async function LakePage({ params }: { params: Params }) {
  const { id } = await params;
  const lake = getLakes().find((l) => l.id === id);
  if (!lake) notFound();
  const rows = getSeries(id);
  const health = getHealth(id);
  const events = getEvents(id);
  const validation = getValidation();
  const name = lake.name.replace(" (Halasuru Kere)", "");
  const have = rows.filter(hasExtent);
  const latest = have[have.length - 1];
  const water = validation.water_level.filter((e) => e.lake === id);
  const foam = validation.foam.filter((e) => e.lake === id);
  const optical = have.filter((r) => r.source === "optical").length;
  const fused = have.filter((r) => r.source === "fused").length;
  const radar = have.filter((r) => r.source === "radar").length;

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link className="underline" href="/lakes/">Lakes</Link> / {name}
        </nav>
        <h1 className="font-serif text-4xl font-semibold">{lake.name}</h1>
        {lake.name_kn ? <p lang="kn" className="text-muted">{lake.name_kn}</p> : null}
        <dl className="num grid grid-cols-2 gap-4 pt-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">Latest open water</dt>
            <dd className="text-2xl font-semibold">{latest?.area_ha?.toFixed(1)} ha</dd>
            <dd className="text-muted">{latest ? formatMonth(latest.month) : ""} · {latest ? <SourceMark source={latest.source} label={false} /> : null}</dd>
          </div>
          <div>
            <dt className="text-muted">OpenStreetMap outline</dt>
            <dd className="text-2xl font-semibold">{lake.outline_ha.toFixed(0)} ha</dd>
            <dd className="text-muted">not an official boundary</dd>
          </div>
          <div>
            <dt className="text-muted">Months with an extent</dt>
            <dd className="text-2xl font-semibold">{lake.months_with_extent} / {lake.months}</dd>
            <dd className="text-muted">{optical} optical, {fused} fused, {radar} radar</dd>
          </div>
          <div>
            <dt className="text-muted">Record</dt>
            <dd className="text-2xl font-semibold">{formatMonth(lake.first_month).split(" ")[1]}-{formatMonth(lake.last_month).split(" ")[1]}</dd>
            <dd className="text-muted">monthly</dd>
          </div>
        </dl>
        <p className="max-w-3xl rounded-md border border-border bg-surface p-3 text-sm text-muted">
          Estimates from Sentinel satellite data, not an official assessment. The area counts{" "}
          <strong className="text-fg">open water only</strong>: it excludes dry lakebed and water covered by floating plants.
        </p>
      </header>

      <HealthCard health={health} name={name} />

      <section aria-labelledby="extent-h" className="space-y-4">
        <h2 id="extent-h" className="font-serif text-2xl font-semibold">Open-water area over time</h2>
        <ExtentChart rows={rows} outlineHa={lake.outline_ha} name={name} />
        <RainChart rows={rows} />
        <SeriesTable rows={rows} />
      </section>

      <section aria-labelledby="bloom-h" className="space-y-4">
        <h2 id="bloom-h" className="font-serif text-2xl font-semibold">Bloom indicators (candidates)</h2>
        <BloomChart rows={rows} />
        <p className="max-w-3xl text-sm text-muted">
          The chlorophyll proxy is high (0.3 to 0.6) in almost every month on these lakes, so it is shown
          as a level, not as episodes. Hazy scenes are excluded from every flag.
        </p>
      </section>

      <section aria-labelledby="events-h" className="space-y-4">
        <h2 id="events-h" className="font-serif text-2xl font-semibold">Flagged events</h2>
        <EventTimeline events={events} lakeName={name} />
      </section>

      <section aria-labelledby="val-h" className="space-y-4">
        <h2 id="val-h" className="font-serif text-2xl font-semibold">What we checked against reports</h2>
        <p className="max-w-3xl text-sm text-muted">
          Dated news reports were compared with the satellite record ({validation.ground_truth.events} events in
          total, from {validation.ground_truth.distinct_sources} sources, for all three lakes). Results for {name}:
        </p>
        {water.length === 0 && foam.length === 0 ? (
          <p className="text-sm">No reported events for this lake were testable.</p>
        ) : (
          <table className="w-full max-w-2xl text-left text-sm">
            <caption className="sr-only">Reported events and whether the satellite record agreed</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-1 pr-3 font-medium">Reported event</th>
                <th scope="col" className="py-1 pr-3 font-medium">Dates</th>
                <th scope="col" className="py-1 font-medium">Satellite record</th>
              </tr>
            </thead>
            <tbody>
              {[...water.map((e) => ({ ...e, what: e.signal === "extent_high" ? "Overflow / high water" : "Drained or low water" })),
                ...foam.map((e) => ({ ...e, what: "Foam spill" }))].map((e) => (
                <tr key={e.event_id} className="border-t border-border">
                  <th scope="row" className="py-2 pr-3 font-normal">{e.what}</th>
                  <td className="num py-2 pr-3">{e.window.replace("..", " to ")}</td>
                  <td className="py-2">{OUTCOME[e.outcome] ?? e.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="max-w-3xl text-sm text-muted">
          Foam detection did not work and its flags should not be read as foam. See the full write-up,
          including failures, in <a className="underline" href={repoFile("VALIDATION.md")}>VALIDATION.md</a>.
        </p>
      </section>

      <p className="text-sm">
        <a className="underline" href={`/downloads/${id}_monthly.csv`} download>Download this lake&apos;s monthly data (CSV)</a>
        {" · "}
        <Link className="underline" href="/data/">All downloads and licences</Link>
      </p>
    </div>
  );
}
