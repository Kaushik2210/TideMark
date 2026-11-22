"use client";

import { useMemo, useState } from "react";
import type { EventItem } from "@/lib/types";

/** Plain-language label and validation status for each candidate type (from VALIDATION.md). */
const TYPES: Record<string, { label: string; status: "supported" | "weak" | "unvalidated" | "failed"; note: string }> = {
  extent_low: { label: "Water area unusually low", status: "supported", note: "Matched Ulsoor's 2026 draining; extent itself agrees with JRC." },
  extent_high: { label: "Water area unusually high", status: "unvalidated", note: "No ground truth for these dates." },
  rapid_change: { label: "Rapid month-to-month change", status: "weak", note: "2 of 13 matched a documented event; may be a sensor or cloud artifact." },
  floating_mat_candidate: { label: "Floating-mat candidate", status: "unvalidated", note: "Not validated; marks a persistent condition more than an episode." },
  chlorophyll_high_candidate: { label: "Chlorophyll in the lake's top decile", status: "unvalidated", note: "A ranking against the lake's own record, not an absolute bloom." },
  foam_candidate: { label: "Foam candidate", status: "failed", note: "Foam detection failed validation: this flag is likely a false alarm." },
};

const STATUS_STYLE: Record<string, string> = {
  supported: "border-fused text-fused",
  weak: "border-radar text-radar",
  unvalidated: "border-border text-muted",
  failed: "border-danger text-danger",
};
const STATUS_WORD: Record<string, string> = {
  supported: "Partly validated",
  weak: "Weak evidence",
  unvalidated: "Not validated",
  failed: "Failed validation",
};

export function EventTimeline({ events, lakeName }: { events: EventItem[]; lakeName: string }) {
  const [active, setActive] = useState<Set<string>>(new Set());
  const types = useMemo(() => [...new Set(events.map((e) => e.type))].sort(), [events]);
  const shown = useMemo(
    () => [...events].filter((e) => active.size === 0 || active.has(e.type)).sort((a, b) => b.obs_date.localeCompare(a.obs_date)),
    [events, active],
  );
  const toggle = (t: string) =>
    setActive((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  if (events.length === 0) {
    return <p className="rounded-md border border-border bg-surface p-4 text-sm">No candidate events were flagged for {lakeName}.</p>;
  }
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filter events by type" className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={active.has(t)}
            onClick={() => toggle(t)}
            className={`tap rounded-full border px-3 text-sm transition-colors ${active.has(t) ? "border-accent bg-surface-2 text-fg" : "border-border text-muted hover:text-fg"}`}
          >
            {TYPES[t]?.label ?? t}
            <span className="num ml-1.5 text-muted">{events.filter((e) => e.type === t).length}</span>
          </button>
        ))}
        {active.size > 0 ? (
          <button type="button" onClick={() => setActive(new Set())} className="tap rounded-full px-3 text-sm underline">Clear filter</button>
        ) : null}
      </div>
      <p aria-live="polite" className="text-sm text-muted">
        Showing {shown.length} of {events.length} flagged events. Candidates only: a flag is not a
        confirmed event. &ldquo;Follows rain&rdquo; is descriptive and was not found to differ from ordinary months.
      </p>
      <ol className="space-y-3">
        {shown.map((e, k) => {
          const t = TYPES[e.type];
          return (
            <li key={`${e.obs_date}-${e.type}-${k}`} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{t?.label ?? e.type}</h3>
                <time dateTime={e.obs_date} className="num text-sm text-muted">
                  {e.obs_date}{e.date_is_approx ? " (approx.)" : ""}
                </time>
              </div>
              <p className="mt-1 text-sm">{e.detail}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[t?.status ?? "unvalidated"]}`}>
                  {STATUS_WORD[t?.status ?? "unvalidated"]}
                </span>
                <span>{t?.note}</span>
              </p>
              <p className="num mt-2 text-sm text-muted">
                {e.follows_rain
                  ? `A rain event (${e.rain_event_total_mm ?? "?"} mm) ended ${e.rain_event_lag_days} days before.`
                  : "No qualifying rain event in the 14 days before."}
                {e.rain_prior_14d_mm !== null ? ` ${e.rain_prior_14d_mm.toFixed(0)} mm fell in those 14 days.` : ""}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
