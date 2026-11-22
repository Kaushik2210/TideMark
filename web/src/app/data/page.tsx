import type { Metadata } from "next";
import { REPO, repoFile } from "@/lib/data";
import { getLakes } from "@/lib/server-data";

export const metadata: Metadata = { title: "Data downloads" };

interface Item {
  file: string;
  what: string;
  licence: string;
}

export default function DataPage() {
  const lakes = getLakes();
  const items: Item[] = [
    ...lakes.map((l) => ({
      file: `${l.id}_monthly.csv`,
      what: `${l.name}: monthly water area, source, uncertainty, rainfall and candidate flags`,
      licence: "CC BY 4.0",
    })),
    { file: "events.csv", what: "All flagged candidate events, with rain context", licence: "CC BY 4.0" },
    { file: "lakes.geojson", what: "Lake outlines from OpenStreetMap with area and provenance", licence: "ODbL 1.0" },
    { file: "ghost_lakes.geojson", what: "Lost lakes: approximate points with the use today", licence: "CC BY-SA 4.0" },
    { file: "ground_truth.csv", what: "26 dated, sourced events used for validation", licence: "CC BY 4.0 (facts and our wording)" },
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="font-serif text-4xl font-semibold">Data downloads</h1>
        <p className="max-w-2xl text-muted">
          Everything on this site comes from these files. They are research outputs, unvalidated in the
          ways described on the <a className="underline" href="/methodology/">method page</a>.
        </p>
      </header>

      <section aria-labelledby="files-h" className="space-y-3">
        <h2 id="files-h" className="font-serif text-2xl font-semibold">Files</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Downloadable files and their licences</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">File</th>
                <th scope="col" className="py-2 pr-3 font-medium">Contents</th>
                <th scope="col" className="py-2 font-medium">Licence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.file} className="border-t border-border align-top">
                  <th scope="row" className="py-2 pr-3 font-normal">
                    <a className="tap inline-flex items-center underline" href={`/downloads/${i.file}`} download>{i.file}</a>
                  </th>
                  <td className="py-2 pr-3">{i.what}</td>
                  <td className="py-2">{i.licence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">
          More (Parquet time series, per-date optical extents, monthly fused extents as GeoJSON, rainfall,
          health and encroachment results) is in the <a className="underline" href={REPO}>repository&apos;s data folder</a>.
        </p>
      </section>

      <section aria-labelledby="lic-h" className="space-y-3">
        <h2 id="lic-h" className="font-serif text-2xl font-semibold">Licences and attribution</h2>
        <ul className="max-w-3xl list-disc space-y-2 pl-5">
          <li>Code: MIT. Derived data: CC BY 4.0, except where the table says otherwise.</li>
          <li>Lake outlines are © OpenStreetMap contributors and stay under the ODbL (share-alike, keep attribution).</li>
          <li>The lost-lake points come from Wikipedia text and are CC BY-SA 4.0; they are kept as a separate file.</li>
          <li>Rainfall is from Open-Meteo (CC BY 4.0) and must stay non-commercial under their free-tier terms.</li>
          <li>Contains modified Copernicus Sentinel data.</li>
        </ul>
        <p className="max-w-3xl text-sm text-muted">
          Suggested citation: &ldquo;Tidemark, satellite-derived water extent of Bengaluru lakes (research
          estimates, unvalidated), {REPO}.&rdquo; Full licence text:{" "}
          <a className="underline" href={repoFile("LICENSE-DATA.md")}>LICENSE-DATA.md</a>.
        </p>
      </section>
    </div>
  );
}
