import { Reveal } from "@/components/Reveal";
import type { Metadata } from "next";
import Link from "next/link";
import { repoFile } from "@/lib/data";
import { getValidation } from "@/lib/server-data";

export const metadata: Metadata = { title: "Method and validation" };

function SectionImpl({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Reveal as="section" aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="font-serif text-2xl font-semibold">{title}</h2>
      <div className="max-w-3xl space-y-3 text-[1.0625rem] leading-relaxed">{children}</div>
    </Reveal>
  );
}
const Section = SectionImpl;

const STATUS_CHIP: Record<string, string> = {
  "Broadly supported": "border-fused text-fused",
  Moderate: "border-radar text-radar",
  Failed: "border-danger text-danger",
  "Not validated": "border-border text-muted",
  "No conversion found": "border-fused text-fused",
  Experimental: "border-radar text-radar",
};

const STATUS = [
  { signal: "Open-water extent", status: "Broadly supported", detail: "Agrees with JRC Global Surface Water (overlap 0.73 to 0.85 at a 25% water-frequency cut; weaker for Varthur at stricter cuts). Ulsoor's 2026 draining and Bellandur's 2021 dewatering and 2022 overflow show up." },
  { signal: "Radar-filled months", status: "Moderate", detail: "Radar area is within about 12% of optical on average (correlation 0.83 to 0.89), but pixel overlap is moderate (0.58 to 0.83 where there is enough water)." },
  { signal: "Foam candidates", status: "Failed", detail: "0 detections in the 4 reported foam events that had a usable scene; 4 more had none (cloud). The one flag raised is likely cloud." },
  { signal: "Floating-mat flags", status: "Not validated", detail: "No usable ground truth. About a fifth of clean months are flagged on every lake, so it marks a condition, not an episode." },
  { signal: "Chlorophyll flags", status: "Not validated", detail: "Relative ranking against each lake's own record, not an absolute bloom threshold." },
  { signal: "Encroachment", status: "No conversion found", detail: "No water replaced by buildings inside the OpenStreetMap outlines; limited by an unofficial outline and undated building footprints." },
  { signal: "Health index", status: "Experimental", detail: "Weights and caps are judgement calls and the inputs are partly unvalidated. It does not measure water quality." },
];

export default function MethodologyPage() {
  const v = getValidation();
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <h1 className="font-serif text-4xl font-semibold">How this works, and what failed</h1>
        <p className="max-w-3xl text-lg text-muted">
          Tidemark is a research project. It estimates how much open water each lake has every month
          and flags candidate signals. It is <strong className="text-fg">not an official assessment</strong>,
          not a legal boundary determination, and not a water-quality measurement.
        </p>
      </header>

      <Section id="status" title="What holds up, at a glance">
        <div className="overflow-x-auto rounded-md" tabIndex={0} role="region" aria-label="Table (scrolls sideways on small screens)">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Validation status of each signal</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Signal</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 font-medium">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {STATUS.map((s) => (
                <tr key={s.signal} className="border-t border-border align-top">
                  <th scope="row" className="py-2 pr-3 font-medium">{s.signal}</th>
                  <td className="py-2 pr-3"><span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${STATUS_CHIP[s.status] ?? "border-border text-muted"}`}>{s.status}</span></td>
                  <td className="py-2 text-muted">{s.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="water" title="Water extent from optical imagery">
        <p>
          For each lake and month the pipeline picks the Sentinel-2 scene with the least cloud, shadow and
          missing data over the lake (not the least cloud over the whole tile). It computes the modified
          normalised difference water index from the green and shortwave-infrared bands, chooses a
          threshold per scene, cleans the mask, and keeps water connected to the lake outline.
        </p>
        <p>
          The per-scene threshold is only trusted when the scene is clearly two-class and the threshold is
          physically plausible; otherwise a fixed fallback is used and recorded. Scenes whose &ldquo;water&rdquo;
          has the high shortwave-infrared signature of haze are flagged and excluded from candidate signals,
          because Sentinel-2&apos;s own cloud mask misses thin cloud.
        </p>
      </Section>

      <Section id="radar" title="Filling cloudy months with radar">
        <p>
          Sentinel-1 radar sees through cloud. Water is mapped where filtered backscatter is below
          &minus;14 dB, a threshold calibrated against clean optical months: it reproduced the optical mask
          with an overlap (IoU) of 0.71, versus 0.38 for the textbook &minus;18 dB, because these lakes are
          darker than land but not very dark (floating plants, froth). Where optical pixels are valid they
          win; cloud gaps are filled from radar. Each month is labelled optical, fused or radar, and the
          label travels with every number on this site.
        </p>
        <p>
          Radar and optical define water differently, so a jump across a sensor change can be an artifact.
          That is why the &ldquo;rapid change&rdquo; flag only compares months from the same sensor.
        </p>
      </Section>

      <Section id="candidates" title="Candidate signals (bloom, foam, anomalies)">
        <p>
          <strong>Floating mats</strong> are flagged where the floating algae index is high over a quarter of
          the water. It cannot tell algae from floating plants. <strong>Chlorophyll</strong> is high on all
          three lakes in nearly every month, so it is shown as a level and flagged only when a month is in
          the lake&apos;s own top decile. <strong>Foam</strong> is looked for as bright, low-saturation patches
          beside water; it failed validation (below).
        </p>
        <p>
          Extent anomalies compare a month with the lake&apos;s typical value for that calendar month, since a
          dry-season drop is normal. Each event notes rain in the previous 14 days (ERA5 reanalysis, about
          28 km grid, so regional rain). Events were <em>not</em> found to follow rain more often than
          ordinary months.
        </p>
      </Section>

      <Section id="encroachment" title="Encroachment">
        <p>
          An encroachment candidate is a pixel that was usually water in 2016&ndash;2018, is almost never
          water in clean months of 2023&ndash;2026, and is now built-up according to ESA WorldCover or
          Microsoft building footprints. None was found for any lake. Bellandur lost about 40 ha of water
          (27 to 66 ha across thresholds), but that land is now cropland, scrub or trees, not buildings.
          Boundaries are OpenStreetMap outlines because no licensed official boundary dataset was found, so
          this cannot show that nothing was built on the true lake boundary.
        </p>
        <p>An earlier spectral built-up method was dropped because it mistook dried lakebed for roofs.</p>
      </Section>

      <Section id="health" title="The health index">
        <p>
          A 0-100 score from four components (extent stability 30%, bloom indicators 30%, encroachment
          15%, anomalies 25%) over the latest 36 months, with a sensitivity range under alternative
          weightings. The weights are judgement calls. It measures extent and satellite signals only: a
          polluted lake can score well, and Bellandur currently scores above Ulsoor. Each lake page shows
          the formula and inputs.
        </p>
      </Section>

      <Section id="validation" title="Validation against reports">
        <p>
          {v.ground_truth.events} dated events from {v.ground_truth.distinct_sources} news and other pages
          (foam spills, fires, draining, overflows, hyacinth removal, court orders) were collected, each with a
          source URL. {v.ground_truth.testable} could be tested with a satellite signal. Results: of 10 water-level
          events, 5 matched, 3 partly matched, 0 were missed and 2 were not observed in time. Foam failed
          (see the table above). Ulsoor in May 2026 is an open question: imagery shows water returning while
          two articles still describe the lake as drained.
        </p>
        <p>
          The ground truth is incomplete and skewed towards dramatic events, so an unmatched flag does not
          mean a false one. The scoring rules were changed once after a first pass gave a misleading result;
          both versions are written up. Full details: <a className="underline" href={repoFile("VALIDATION.md")}>VALIDATION.md</a>.
        </p>
      </Section>

      <Section id="data" title="Data and code">
        <p>
          Sentinel-1 and Sentinel-2 via Microsoft Planetary Computer (contains modified Copernicus Sentinel
          data); lake outlines © OpenStreetMap contributors; rainfall from Open-Meteo (ERA5); land cover from
          ESA WorldCover; water reference from JRC Global Surface Water. Everything is open: see{" "}
          <Link className="underline" href="/data/">downloads and licences</Link>, and the{" "}
          <a className="underline" href={repoFile("docs/fusion.md")}>method notes</a> in the repository.
        </p>
      </Section>
    </div>
  );
}
