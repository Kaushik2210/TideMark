import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SourceMark } from "@/components/SourceMark";
import { Sparkline } from "@/components/Sparkline";
import { formatMonth, hasExtent } from "@/lib/data";
import { getLakes, getSeries } from "@/lib/server-data";
import { siteUrl } from "@/lib/site";

type Params = Promise<{ id: string }>;

export function generateStaticParams() {
  return getLakes().map((l) => ({ id: l.id }));
}

export const metadata: Metadata = {
  title: "Lake panel",
  robots: { index: false }, // the embeddable panel is not a page to find in search
};

/** Compact panel meant for an <iframe> on someone else's page. Header and footer are hidden for /embed. */
export default async function EmbedPage({ params }: { params: Params }) {
  const { id } = await params;
  const lake = getLakes().find((l) => l.id === id);
  if (!lake) notFound();
  const rows = getSeries(id);
  const latest = [...rows].reverse().find(hasExtent);
  const name = lake.name.replace(" (Halasuru Kere)", "");
  return (
    <div className="mx-auto max-w-md space-y-3 p-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold">{name}</h1>
        <p className="text-sm text-muted">Open water, from Sentinel satellite data</p>
      </div>
      {latest ? (
        <div className="num">
          <p className="text-4xl font-semibold">{latest.area_ha?.toFixed(1)} <span className="text-lg font-normal text-muted">ha</span></p>
          <p className="text-sm text-muted">{formatMonth(latest.month)} · <SourceMark source={latest.source} /> · ± {latest.unc_ha?.toFixed(1)} ha</p>
        </div>
      ) : null}
      <div>
        <Sparkline rows={rows} label={`Open-water area of ${name} by month, ${lake.first_month.slice(0, 4)} to ${lake.last_month.slice(0, 4)}`} />
        <p className="num text-xs text-muted">Monthly, {lake.first_month.slice(0, 4)}-{lake.last_month.slice(0, 4)}</p>
      </div>
      <p className="text-xs text-muted">
        Research estimate, not an official assessment. Contains modified Copernicus Sentinel data.{" "}
        <a className="underline" href={siteUrl(`/lakes/${id}/`)} target="_top">See the full record on Tidemark</a>.
      </p>
    </div>
  );
}
