import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { REPO } from "@/lib/data";
import { issueUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contribute",
  description: "Help test what the satellites show: report dated, sourced events, share what you saw, or flag a data problem.",
};

const WAYS = [
  {
    id: "ground-truth",
    title: "Report a dated event",
    what: "A lake drained, overflowed, foamed, burned or was built on, and a public source says so with a date.",
    why: "This is the most valuable thing you can send. Tidemark's checks against reports are small (26 events, 19 testable), so every well-sourced event makes the validation stronger, including when it shows the satellites are wrong.",
    cta: "Report an event",
    href: issueUrl("ground-truth.yml", "[Event] "),
  },
  {
    id: "observation",
    title: "Share what you saw",
    what: "A dated first-hand observation or a cropped photo from a visit.",
    why: "Context for the numbers: colour, foam, plants, construction. It is shown as context only and is never used on its own to score the satellite record.",
    cta: "Share an observation",
    href: issueUrl("observation.yml", "[Observation] "),
  },
  {
    id: "data-problem",
    title: "Flag a data problem",
    what: "A month that looks impossible, an outline that does not match the lake, or a label that misleads.",
    why: "Honest negative results are part of this project. A well-explained problem report is as useful as a new event.",
    cta: "Report a problem",
    href: issueUrl("data-problem.yml", "[Data] "),
  },
];

export default function ContributePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <h1 className="font-serif text-4xl font-semibold">Help test what the satellites show</h1>
        <p className="max-w-2xl text-lg text-muted">
          Tidemark is only as trustworthy as the checks behind it. You do not need to be an expert: a dated,
          sourced report from a news article or an official order is enough to make the project better.
        </p>
      </header>

      <Reveal as="ul" stagger className="grid gap-4 md:grid-cols-3">
        {WAYS.map((w) => (
          <li key={w.id} className="flex flex-col rounded-xl border border-border bg-surface p-5">
            <h2 className="font-serif text-xl font-semibold">{w.title}</h2>
            <p className="mt-2 text-sm">{w.what}</p>
            <p className="mt-2 flex-1 text-sm text-muted">{w.why}</p>
            <a href={w.href} className="tap mt-4 inline-flex items-center justify-center rounded-md bg-accent px-4 font-medium text-bg" rel="noopener">
              {w.cta}
            </a>
          </li>
        ))}
      </Reveal>
      <p className="text-sm text-muted">
        These open a short form on GitHub, so you need a free GitHub account. Nothing is sent to Tidemark until you
        press submit, and everything you submit there is public.
      </p>

      <Reveal as="section" aria-labelledby="after-h" className="space-y-3">
        <h2 id="after-h" className="font-serif text-2xl font-semibold">What happens to a report</h2>
        <ol className="max-w-3xl list-decimal space-y-2 pl-5 text-[1.0625rem] leading-relaxed">
          <li>A maintainer opens the source and checks it says what the report says, for that lake and those dates.</li>
          <li>If it does, the event is added to the validation set with its link, date range and type, so anyone can audit it.</li>
          <li>The pipeline re-scores the satellite record against the larger set. If the match is worse than before, <a className="underline" href={`${REPO}/blob/main/VALIDATION.md`}>VALIDATION.md</a> says so.</li>
          <li>Your GitHub handle can be credited in the validation file if you want it; ask in the report.</li>
        </ol>
      </Reveal>

      <Reveal as="section" aria-labelledby="rules-h" className="space-y-3">
        <h2 id="rules-h" className="font-serif text-2xl font-semibold">What will not be accepted</h2>
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-[1.0625rem] leading-relaxed">
          <li><strong>Claims without a public source.</strong> The satellite record is tested against published, dated reports only.</li>
          <li><strong>Accusations.</strong> Tidemark does not name who caused anything. Reports that blame a person or company beyond what the source itself states are removed.</li>
          <li><strong>Personal data.</strong> No names of private individuals, faces, number plates or home addresses. Crop photos, which can also carry location data.</li>
          <li><strong>Legal or safety claims.</strong> This is a research project, not an official assessment, and nothing here determines a boundary or tells anyone whether water is safe.</li>
        </ul>
      </Reveal>

      <Reveal as="section" aria-labelledby="more-h" className="space-y-3">
        <h2 id="more-h" className="font-serif text-2xl font-semibold">Other ways to take part</h2>
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-[1.0625rem] leading-relaxed">
          <li><Link className="underline" href="/updates/">Follow the monthly updates</Link> (or subscribe to the feed) and share a month you find interesting.</li>
          <li><Link className="underline" href="/lakes/">Embed a live lake panel</Link> on a school, newsroom or community page: open a lake and use “Embed this lake”.</li>
          <li>Add a lake: each one needs a pinned OpenStreetMap outline and a check of its water signal. Open a data-problem form to propose one and say why.</li>
          <li>Read or improve the code and the method on <a className="underline" href={REPO}>GitHub</a>.</li>
        </ul>
      </Reveal>
    </div>
  );
}
