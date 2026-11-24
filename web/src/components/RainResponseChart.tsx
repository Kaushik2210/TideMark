import { interpretRain, lagLabel } from "@/lib/rainwords";
import type { RainResponse } from "@/lib/types";

const W = 640;
const ROW = 46;
const M = { l: 92, r: 24, t: 12, b: 34 };

/** Correlation at each lag with its 95% interval. Static SVG: the table below carries the same numbers. */
export function RainResponseChart({ data, lake }: { data: RainResponse; lake: string }) {
  const H = M.t + M.b + data.lags.length * ROW;
  const extent = Math.max(0.4, ...data.lags.flatMap((l) => [Math.abs(l.ci[0] ?? 0), Math.abs(l.ci[1] ?? 0)])) * 1.1;
  const iw = W - M.l - M.r;
  const x = (v: number) => M.l + ((v + extent) / (2 * extent)) * iw;
  const { headline, detail } = interpretRain(data, lake);
  const ticks = [-extent, -extent / 2, 0, extent / 2, extent];

  return (
    <figure className="space-y-3">
      <figcaption>
        <p className="font-medium">{headline}</p>
        <p className="mt-1 max-w-3xl text-sm text-muted">{detail}</p>
      </figcaption>
      <div tabIndex={0} role="group" aria-label="Chart (scrolls sideways on small screens)" className="overflow-x-auto rounded-xl border border-border bg-surface p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label={`Correlation between regional rain and ${lake}'s water area at lags of 0 to 3 months, each with a 95% interval. ${headline}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={M.t} y2={H - M.b} stroke={t === 0 ? "var(--fg)" : "var(--border)"} strokeWidth={t === 0 ? 1.4 : 1} strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={x(t)} y={H - 14} textAnchor="middle" fontSize="11" fill="var(--muted)" className="num">{t.toFixed(1)}</text>
            </g>
          ))}
          {data.lags.map((l, i) => {
            const cy = M.t + i * ROW + ROW / 2;
            const lo = l.ci[0];
            const hi = l.ci[1];
            return (
              <g key={l.lag}>
                <text x={M.l - 10} y={cy + 4} textAnchor="end" fontSize="12" fill="var(--fg)">{lagLabel(l.lag)}</text>
                {lo !== null && hi !== null ? (
                  <>
                    <line x1={x(lo)} x2={x(hi)} y1={cy} y2={cy} stroke={l.clear ? "var(--accent)" : "var(--muted)"} strokeWidth="3" strokeLinecap="round" />
                    <line x1={x(lo)} x2={x(lo)} y1={cy - 6} y2={cy + 6} stroke={l.clear ? "var(--accent)" : "var(--muted)"} strokeWidth="2" />
                    <line x1={x(hi)} x2={x(hi)} y1={cy - 6} y2={cy + 6} stroke={l.clear ? "var(--accent)" : "var(--muted)"} strokeWidth="2" />
                  </>
                ) : null}
                {l.rho !== null ? <circle cx={x(l.rho)} cy={cy} r="5.5" fill={l.clear ? "var(--accent)" : "var(--bg)"} stroke={l.clear ? "var(--accent)" : "var(--muted)"} strokeWidth="2.2" /> : null}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-sm text-muted">
        Dot = rank correlation; bar = 95% interval. A filled dot means the interval excludes zero (a clear link); a hollow dot
        means it does not. Left of zero: wetter-than-usual months are followed by <em>less</em> water; right of zero: more.
      </p>
      <details className="max-w-2xl rounded-md border border-border bg-surface px-4 py-3 text-sm">
        <summary className="tap cursor-pointer py-2 font-medium">View the numbers</summary>
        <table className="num mt-2 w-full text-left">
          <caption className="sr-only">Correlation between regional rain and water area by lag, with 95% interval</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 pr-3 font-medium">Water area measured</th>
              <th scope="col" className="py-1 pr-3 font-medium">Correlation</th>
              <th scope="col" className="py-1 pr-3 font-medium">95% interval</th>
              <th scope="col" className="py-1 pr-3 font-medium">Months</th>
              <th scope="col" className="py-1 font-medium">Clear?</th>
            </tr>
          </thead>
          <tbody>
            {data.lags.map((l) => (
              <tr key={l.lag} className="border-t border-border">
                <th scope="row" className="py-1 pr-3 font-normal">{lagLabel(l.lag)}</th>
                <td className="py-1 pr-3">{l.rho === null ? "n/a" : l.rho.toFixed(2)}</td>
                <td className="py-1 pr-3">{l.ci[0] === null || l.ci[1] === null ? "n/a" : `${l.ci[0].toFixed(2)} to ${l.ci[1].toFixed(2)}`}</td>
                <td className="py-1 pr-3">{l.n}</td>
                <td className="py-1">{l.clear ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <details className="max-w-3xl rounded-md border border-border bg-surface px-4 py-3 text-sm">
        <summary className="tap cursor-pointer py-2 font-medium">How this was worked out, and what it cannot say</summary>
        <p className="mt-2 text-muted">
          Both rain and water area are turned into seasonal anomalies (each month minus that lake&apos;s usual for the calendar
          month), so the shared monsoon cycle does not create a link by itself. The interval comes from a block bootstrap
          ({data.resamples.toLocaleString("en")} resamples of {data.block_months}-month blocks), which respects the way
          neighbouring months resemble each other.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          {data.caveats.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </details>
    </figure>
  );
}
