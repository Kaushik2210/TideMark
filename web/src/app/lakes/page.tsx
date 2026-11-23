import type { Metadata } from "next";
import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import { Reveal } from "@/components/Reveal";
import { SourceMark } from "@/components/SourceMark";
import { Sparkline } from "@/components/Sparkline";
import { formatMonth } from "@/lib/data";
import { getLakes, getSeries } from "@/lib/server-data";

export const metadata: Metadata = { title: "Lakes" };

export default function LakesPage() {
  const lakes = getLakes();
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <header>
        <h1 className="font-serif text-4xl font-semibold">Lakes</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Three lakes are tracked so far. Each page has the monthly record, rainfall, flagged events and
          an experimental health index, with the uncertainty and validation caveats alongside.
        </p>
      </header>
      <Reveal as="ul" stagger className="grid gap-4 sm:grid-cols-3">
        {lakes.map((l) => (
          <li key={l.id}>
            <Link href={`/lakes/${l.id}/`} className="block h-full rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-surface-2">
              <h2 className="font-serif text-2xl font-semibold">{l.name.replace(" (Halasuru Kere)", "")}</h2>
              {l.name_kn ? <p lang="kn" className="text-sm text-muted">{l.name_kn}</p> : null}
              <div className="mt-4">
                <Sparkline rows={getSeries(l.id)} label={`Open-water area of ${l.name.replace(" (Halasuru Kere)", "")} by month, ${l.first_month.slice(0, 4)} to ${l.last_month.slice(0, 4)}`} />
                <p className="num text-xs text-muted">Monthly open water, {l.first_month.slice(0, 4)}-{l.last_month.slice(0, 4)}</p>
              </div>
              <dl className="num mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-muted">Latest open water ({formatMonth(l.latest_extent.month)})</dt>
                  <dd className="text-2xl font-semibold"><CountUp value={l.latest_extent.area_ha} decimals={1} /> ha</dd>
                  <dd><SourceMark source={l.latest_extent.source} /></dd>
                </div>
                <div>
                  <dt className="text-muted">Health index</dt>
                  <dd className="text-lg font-medium">{Math.round(l.health.score)}</dd>
                  <dd className="text-muted">range {l.health.range[0].toFixed(0)}-{l.health.range[1].toFixed(0)}, experimental</dd>
                </div>
                <div>
                  <dt className="text-muted">OSM outline</dt>
                  <dd className="text-lg font-medium">{l.outline_ha.toFixed(0)} ha</dd>
                  <dd className="text-muted">{l.months_with_extent} of {l.months} months</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm font-medium text-accent">Open lake page <span aria-hidden="true">&rarr;</span></p>
            </Link>
          </li>
        ))}
      </Reveal>
    </div>
  );
}
