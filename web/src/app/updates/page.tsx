import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { ShareButton } from "@/components/ShareButton";
import { formatMonth, withBase } from "@/lib/data";
import { buildDigests } from "@/lib/digest";
import { siteUrl, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Monthly updates",
  description: "What changed in Bengaluru's lakes this month, with every change judged against the measurement uncertainty.",
  alternates: { types: { "application/atom+xml": `${SITE_URL}/feed.xml` } },
};

export default function UpdatesPage() {
  const digests = buildDigests(12);
  const [latest, ...older] = digests;
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <h1 className="font-serif text-4xl font-semibold">Monthly updates</h1>
        <p className="max-w-2xl text-muted">
          A short, plain-language account of each lake every month. Changes smaller than the measurement
          uncertainty are labelled as such instead of being reported as news, and a flag is always a candidate,
          not a confirmed event.
        </p>
        <p className="flex flex-wrap items-center gap-3 text-sm">
          <a className="tap inline-flex items-center rounded-md border border-border bg-surface px-4 font-medium hover:bg-surface-2" href={withBase("/feed.xml")}>
            Subscribe (Atom feed)
          </a>
          <span className="text-muted">Works in any feed reader; a new entry appears after each monthly data update.</span>
        </p>
      </header>

      {[latest, ...older].map((d, k) => (
        <Reveal key={d.month} as="section" aria-labelledby={`m-${d.month}`} className="space-y-4">
          {k === 1 ? <h2 className="font-serif text-2xl font-semibold">Earlier months</h2> : null}
          <details open={k === 0} className="rounded-xl border border-border bg-surface p-5">
            <summary className="tap cursor-pointer list-none">
              <span id={`m-${d.month}`} className="font-serif text-2xl font-semibold">{formatMonth(d.month)}</span>
              <span className="num mt-1 block text-sm text-muted">{d.headline.slice(d.headline.indexOf(":") + 2)}</span>
            </summary>
            <div className="mt-4 space-y-5">
              {d.lakes.map((l) => (
                <div key={l.id}>
                  <h3 className="font-medium"><Link className="underline underline-offset-4" href={`/lakes/${l.id}/`}>{l.name}</Link></h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted marker:text-border">
                    {l.lines.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </div>
              ))}
              <ShareButton title={`Tidemark: ${formatMonth(d.month)}`} text={`${d.headline}. Open water from Sentinel satellite data (research estimate, not official).`} url={siteUrl(`/updates/#m-${d.month}`)} label="Share this month" />
            </div>
          </details>
        </Reveal>
      ))}
    </div>
  );
}
