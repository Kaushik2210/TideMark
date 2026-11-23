import type { Metadata } from "next";
import { LakesExplorer } from "@/components/LakesExplorer";
import { getLakes, getSeries } from "@/lib/server-data";

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
      <LakesExplorer lakes={lakes} series={series} />
    </div>
  );
}
