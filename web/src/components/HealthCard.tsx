import type { Health } from "@/lib/types";

const LABELS: Record<string, { title: string; formula: string; reading: string }> = {
  extent_stability: {
    title: "Extent stability",
    formula: "100 × (1 − min(CV, 1)), CV = std ÷ mean of monthly water area",
    reading: "How steady the open-water area is over the last 36 months.",
  },
  bloom: {
    title: "Bloom indicators",
    formula:
      "average of 100 × (1 − floating-mat share ÷ 0.5) and 100 × (1 − (median NDCI − 0.1) ÷ 0.4), both clipped to 0-100",
    reading: "Share of clean months with a floating-mat candidate, and the chlorophyll proxy level.",
  },
  encroachment: {
    title: "Encroachment",
    formula: "100 × (1 − min(upper-bound built-up % of early water footprint ÷ 10, 1))",
    reading: "Water that became built-up land. No conversion found, but the outline is unofficial.",
  },
  anomalies: {
    title: "Anomalies",
    formula: "100 × (1 − min(alarm events per year ÷ 4, 1))",
    reading: "Unusual extent, rapid changes and foam candidates in the last 36 months.",
  },
};

function scoreWord(s: number): string {
  if (s >= 75) return "higher";
  if (s >= 50) return "middle";
  return "lower";
}

export function HealthCard({ health, name }: { health: Health; name: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <section aria-labelledby="health-h" className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <h2 id="health-h" className="font-serif text-2xl font-semibold">
        Satellite health index <span className="text-base font-normal text-muted">(experimental)</span>
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        A transparent score built from satellite signals, for comparing lakes and months. It does{" "}
        <strong className="text-fg">not</strong> measure sewage, toxicity, oxygen or drinking safety: a
        lake famous for pollution can still score well here.
      </p>
      <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label={`${name} health index ${health.score} out of 100, sensitivity range ${health.sensitivity_range[0]} to ${health.sensitivity_range[1]}`}>
            <circle cx="64" cy="64" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
            <circle cx="64" cy="64" r={r} fill="none" stroke="var(--optical)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(health.score / 100) * c} ${c}`} transform="rotate(-90 64 64)" />
            <text x="64" y="68" textAnchor="middle" fontSize="34" fontWeight="600" fill="var(--fg)" className="num">
              {Math.round(health.score)}
            </text>
            <text x="64" y="88" textAnchor="middle" fontSize="11" fill="var(--muted)">out of 100</text>
          </svg>
          <div className="text-sm">
            <p className="num">
              Range <strong>{health.sensitivity_range[0].toFixed(0)}-{health.sensitivity_range[1].toFixed(0)}</strong> under alternative weightings
            </p>
            <p className="text-muted">A {scoreWord(health.score)} score in this index, not a verdict.</p>
            {health.low_coverage ? (
              <p className="mt-1 text-danger">Low data coverage in the window: treat with extra caution.</p>
            ) : null}
          </div>
        </div>
        <ul className="grid flex-1 gap-3" aria-label="Score components">
          {Object.entries(health.components).map(([k, v]) => (
            <li key={k}>
              <div className="flex items-baseline justify-between text-sm">
                <span>{LABELS[k].title} <span className="text-muted">({Math.round((health.weights[k] ?? 0) * 100)}%)</span></span>
                <span className="num font-medium">{v.toFixed(0)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="presentation">
                <div className="h-full rounded-full bg-optical" style={{ width: `${v}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <details className="mt-5 rounded-md border border-border bg-bg">
        <summary className="tap cursor-pointer px-4 py-3 text-sm font-medium">How is this calculated?</summary>
        <div className="space-y-4 px-4 pb-4 text-sm">
          <p>
            Window: the latest 36 months with an extent ({health.inputs.window[0]} to {health.inputs.window[1]},
            {" "}{health.inputs.months_with_extent} of {health.inputs.months_in_span} months had one). Each
            component is scored 0-100 (higher is better) and combined with fixed weights.
          </p>
          <table className="w-full text-left">
            <caption className="sr-only">Score components, formulas and inputs</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-1 pr-3 font-medium">Component</th>
                <th scope="col" className="py-1 pr-3 font-medium">Formula</th>
                <th scope="col" className="py-1 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(LABELS).map(([k, l]) => (
                <tr key={k} className="border-t border-border align-top">
                  <th scope="row" className="py-2 pr-3 font-medium">{l.title}</th>
                  <td className="py-2 pr-3">
                    <code className="text-[13px]">{l.formula}</code>
                    <div className="text-muted">{l.reading}</div>
                  </td>
                  <td className="num py-2">{health.components[k as keyof Health["components"]].toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="num grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <div><dt className="text-muted">Extent CV</dt><dd>{health.inputs.extent_cv ?? "n/a"}</dd></div>
            <div><dt className="text-muted">Clean optical months</dt><dd>{health.inputs.clean_optical_months}</dd></div>
            <div><dt className="text-muted">Floating-mat share</dt><dd>{health.inputs.floating_mat_share ?? "n/a"}</dd></div>
            <div><dt className="text-muted">Median NDCI</dt><dd>{health.inputs.ndci_median ?? "n/a"}</dd></div>
            <div><dt className="text-muted">Built-up upper bound</dt><dd>{health.inputs.upper_bound_built_pct_of_early_footprint ?? "n/a"}%</dd></div>
            <div><dt className="text-muted">Alarm events</dt><dd>{health.inputs.alarm_events}</dd></div>
          </dl>
          <p>
            Weights ({Object.entries(health.weights).map(([k, w]) => `${LABELS[k].title.toLowerCase()} ${Math.round(w * 100)}%`).join(", ")})
            and caps are judgement calls, not derived from data. Under alternative weightings the score is{" "}
            {Object.entries(health.alternative_weightings).map(([k, v]) => `${k.replace("_", " ")} ${v.toFixed(0)}`).join(", ")}.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            {health.notes.map((n) => <li key={n}>{n}</li>)}
            <li>The foam, floating-mat and chlorophyll signals feeding this score are not validated; see the method page.</li>
          </ul>
        </div>
      </details>
    </section>
  );
}
