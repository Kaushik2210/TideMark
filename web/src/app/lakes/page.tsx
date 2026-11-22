import type { Metadata } from "next";
import Link from "next/link";
import { SourceMark } from "@/components/SourceMark";
import { formatMonth } from "@/lib/data";
import { getLakes } from "@/lib/server-data";

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
      <ul className="grid gap-4 sm:grid-cols-3">
        {lakes.map((l) => (
          <li key={l.id}>
            <Link href={`/lakes/${l.id}/`} className="block h-full rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-surface-2">
              <h2 className="font-serif text-2xl font-semibold">{l.name.replace(" (Halasuru Kere)", "")}</h2>
              {l.name_kn ? <p lang="kn" className="text-sm text-muted">{l.name_kn}</p> : null}
              <dl className="num mt-4 space-y-2 text-sm">
                <div>
                  <dt className="text-muted">Latest open water ({formatMonth(l.latest_extent.month)})</dt>
                  <dd className="text-lg font-medium">{l.latest_extent.area_ha.toFixed(1)} ha</dd>
                  <dd><SourceMark source={l.latest_extent.source} /></dd>
                </div>
                <div>
                  <dt className="text-muted">OpenStreetMap outline</dt>
                  <dd>{l.outline_ha.toFixed(0)} ha</dd>
                </div>
                <div>
                  <dt className="text-muted">Health index (experimental)</dt>
                  <dd>{Math.round(l.health.score)} <span className="text-muted">(range {l.health.range[0].toFixed(0)}-{l.health.range[1].toFixed(0)})</span></dd>
                </div>
                <div>
                  <dt className="text-muted">Months with an extent</dt>
                  <dd>{l.months_with_extent} of {l.months}</dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
