import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BloomChart, ExtentChart, RainChart, SeriesTable } from "@/components/charts";
import { CitizenPhotos } from "@/components/CitizenPhotos";
import { CountUp } from "@/components/CountUp";
import { EmbedCode } from "@/components/EmbedCode";
import { EventTimeline } from "@/components/EventTimeline";
import { HealthCard } from "@/components/HealthCard";
import { ListenLake } from "@/components/ListenLake";
import { Reveal } from "@/components/Reveal";
import { ThenNow } from "@/components/ThenNow";
import { RainResponseChart } from "@/components/RainResponseChart";
import { ReportCard } from "@/components/ReportCard";
import { SeasonalLandscape } from "@/components/SeasonalLandscape";
import { ShareButton } from "@/components/ShareButton";
import { SourceMark } from "@/components/SourceMark";
import { formatMonth, hasExtent, repoFile, withBase } from "@/lib/data";
import { SITE_URL } from "@/lib/site";
import { getEvents, getHealth, getLakes, getRainResponse, getSeries, getValidation } from "@/lib/server-data";

type Params = Promise<{ id: string }>;

export function generateStaticParams() {
  return getLakes().map((l) => ({ id: l.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const lake = getLakes().find((l) => l.id === id);
  const name = lake ? lake.name.replace(" (Halasuru Kere)", "") : "Lake";
  const card = SITE_URL + "/lakes/" + id + "/og.png";
  return {
    title: name,
    openGraph: { title: name + " | Tidemark", images: [{ url: card, width: 1200, height: 630, alt: name + ": open water from satellite data" }] },
    twitter: { card: "summary_large_image", images: [card] },
  };
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
  const rain = getRainResponse(id);
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
            <dd className="text-2xl font-semibold">{latest?.area_ha != null ? <CountUp value={latest.area_ha} decimals={1} /> : "n/a"} ha</dd>
            <dd className="text-muted">{latest ? formatMonth(latest.month) : ""} · {latest ? <SourceMark source={latest.source} label={false} /> : null}</dd>
          </div>
          <div>
            <dt className="text-muted">OpenStreetMap outline</dt>
            <dd className="text-2xl font-semibold"><CountUp value={lake.outline_ha} /> ha</dd>
            <dd className="text-muted">not an official boundary</dd>
          </div>
          <div>
            <dt className="text-muted">Months with an extent</dt>
            <dd className="text-2xl font-semibold"><CountUp value={lake.months_with_extent} /> / {lake.months}</dd>
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
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <ReportCard
            data={{
              id, name, areaHa: latest?.area_ha ?? null, month: latest ? formatMonth(latest.month) : "n/a",
              sourceLabel: latest ? { optical: "Sentinel-2 optical", fused: "optical + radar fused", radar: "Sentinel-1 radar", none: "none" }[latest.source] : "none",
              score: Math.round(health.score), range: health.sensitivity_range.map(Math.round) as [number, number],
              lowCoverage: health.low_coverage,
            }}
          />
          <a className="tap inline-flex items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2" href={withBase(`/downloads/${id}_monthly.csv`)} download>
            Download monthly data (CSV)
          </a>
          <ShareButton title={name + " | Tidemark"} text={name + ": " + (latest?.area_ha?.toFixed(1) ?? "n/a") + " ha of open water in " + (latest ? formatMonth(latest.month) : "") + ", from Sentinel satellite data (research estimate, not official)."} />
        </div>
        <nav aria-label="On this page" className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-sm">
          {[["#health-h", "Health index"], ["#extent-h", "Water area"], ["#tn-h", "Then and now"], ["#landscape-h", "3D landscape"], ["#rain-h", "Rain response"], ["#bloom-h", "Bloom indicators"], ["#events-h", "Flagged events"], ["#val-h", "Validation"], ["#citizen-h", "Photos"]].map(([href, label]) => (
            <a key={href} href={href} className="tap inline-flex items-center text-muted underline-offset-4 hover:text-fg hover:underline">{label}</a>
          ))}
        </nav>
      </header>

      <Reveal><HealthCard health={health} name={name} /></Reveal>

      <Reveal as="section" aria-labelledby="extent-h" className="space-y-4">
        <h2 id="extent-h" className="font-serif text-2xl font-semibold">Open-water area over time</h2>
        <ExtentChart rows={rows} outlineHa={lake.outline_ha} name={name} />
        <RainChart rows={rows} />
        <SeriesTable rows={rows} />
        <ListenLake rows={rows} name={name} />
      </Reveal>

      <Reveal as="section" aria-labelledby="tn-h" className="space-y-4">
        <h2 id="tn-h" className="font-serif text-2xl font-semibold">Then and now</h2>
        <ThenNow rows={rows} bbox={lake.bbox} lakeId={id} name={name} />
      </Reveal>

      <Reveal as="section" aria-labelledby="landscape-h" className="space-y-4">
        <h2 id="landscape-h" className="font-serif text-2xl font-semibold">Seasonal landscape (3D)</h2>
        <SeasonalLandscape rows={rows} name={name} />
      </Reveal>

      <Reveal as="section" aria-labelledby="rain-h" className="space-y-4">
        <h2 id="rain-h" className="font-serif text-2xl font-semibold">Does rain move the lake?</h2>
        <RainResponseChart data={rain} lake={name} />
      </Reveal>

      <Reveal as="section" aria-labelledby="bloom-h" className="space-y-4">
        <h2 id="bloom-h" className="font-serif text-2xl font-semibold">Bloom indicators (candidates)</h2>
        <BloomChart rows={rows} />
        <p className="max-w-3xl text-sm text-muted">
          The chlorophyll proxy is high (0.3 to 0.6) in almost every month on these lakes, so it is shown
          as a level, not as episodes. Hazy scenes are excluded from every flag.
        </p>
      </Reveal>

      <Reveal as="section" aria-labelledby="events-h" className="space-y-4">
        <h2 id="events-h" className="font-serif text-2xl font-semibold">Flagged events</h2>
        <EventTimeline events={events} lakeName={name} />
      </Reveal>

      <Reveal as="section" aria-labelledby="val-h" className="space-y-4">
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
      </Reveal>

      <CitizenPhotos lakeId={id} lakeName={name} />

      <EmbedCode lakeId={id} name={name} />

      <p className="text-sm">
        <Link className="underline" href="/data/">All downloads and licences</Link>
      </p>
    </div>
  );
}
