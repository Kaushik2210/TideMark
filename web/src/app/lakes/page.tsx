import type { Metadata } from "next";
import { LakesExplorer } from "@/components/LakesExplorer";
import Link from "next/link";
import { getCityLakes, getLakes, getSeries } from "@/lib/server-data";

export const metadata: Metadata = { title: "Lakes" };

export default function LakesPage() {
  const lakes = getLakes();
  const series = Object.fromEntries(lakes.map((l) => [l.id, getSeries(l.id)]));
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <header>
        <h1 className="font-serif text-4xl font-semibold">Lakes</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Three lakes are tracked so far. Compare them on one chart, then open a lake for its monthly record,
          rainfall, flagged events and an experimental health index, with the uncertainty and validation caveats
          alongside.
        </p>
      </header>
      <section aria-labelledby="directory-title" className="rounded-xl border border-border bg-surface px-5 py-4">
        <h2 id="directory-title" className="font-serif text-2xl">Satellite atlas</h2>
        <p className="my-2 text-sm text-muted">Explore {getCityLakes().length} additional named water bodies on the monthly satellite map. Area estimates and health scores are available separately for the monitored lakes below.</p>
        <details><summary className="tap cursor-pointer font-semibold">Browse mapped lakes</summary>
          <ul className="grid max-h-80 overflow-y-auto sm:grid-cols-2" aria-label="Mapped lakes">
            {getCityLakes().map(l => <li key={l.id}><Link className="tap inline-flex items-center underline" href={`/#lake=${l.id}&base=monthly`}>{l.name}</Link></li>)}
          </ul>
        </details>
      </section>
      <LakesExplorer lakes={lakes} series={series} />
    </div>
  );
}
