"use client";

import { useId, useMemo, useState } from "react";
import { EVENT_TYPES as TYPES } from "@/lib/eventTypes";
import type { EventItem } from "@/lib/types";

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

const INITIAL = 8;

export function EventTimeline({ events, lakeName }: { events: EventItem[]; lakeName: string }) {
  const listId = useId();
  const [active, setActive] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const types = useMemo(() => [...new Set(events.map((e) => e.type))].sort(), [events]);
  const shown = useMemo(
    () => [...events].filter((e) => active.size === 0 || active.has(e.type)).sort((a, b) => b.obs_date.localeCompare(a.obs_date)),
    [events, active],
  );
  const visible = all ? shown : shown.slice(0, INITIAL);
  const toggle = (t: string) => {
    setAll(false);
    setActive((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  };

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
          <button type="button" onClick={() => { setActive(new Set()); setAll(false); }} className="tap rounded-full px-3 text-sm underline">Clear filter</button>
        ) : null}
      </div>
      <p aria-live="polite" className="max-w-3xl text-sm text-muted">
        Showing {visible.length} of {shown.length}{shown.length !== events.length ? ` (filtered from ${events.length})` : ""} flagged events, newest first.
        These are candidates only: a flag is not a confirmed event. &ldquo;Follows rain&rdquo; is descriptive and was
        not found to differ from ordinary months.
      </p>

      <details className="max-w-3xl rounded-md border border-border bg-surface px-4 py-3 text-sm">
        <summary className="tap cursor-pointer py-2 font-medium">What do the evidence labels mean?</summary>
        <dl className="mt-3 space-y-3">
          {types.map((t) => (
            <div key={t}>
              <dt className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{TYPES[t]?.label ?? t}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[TYPES[t]?.status ?? "unvalidated"]}`}>{STATUS_WORD[TYPES[t]?.status ?? "unvalidated"]}</span>
              </dt>
              <dd className="mt-1 text-muted">{TYPES[t]?.note}</dd>
            </div>
          ))}
        </dl>
      </details>

      <ol id={listId} className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {visible.map((e, k) => {
          const t = TYPES[e.type];
          const st = t?.status ?? "unvalidated";
          return (
            <li key={`${e.obs_date}-${e.type}-${k}`} className="grid gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[7.5rem_1fr_auto] md:items-start">
              <time dateTime={e.obs_date} className="num text-sm text-muted">
                {e.obs_date}{e.date_is_approx ? " (approx.)" : ""}
              </time>
              <div className="min-w-0">
                <h3 className="font-medium">{t?.label ?? e.type}</h3>
                <p className="text-sm text-muted">{e.detail}</p>
                <p className="num mt-0.5 text-sm text-muted">
                  {e.follows_rain
                    ? `A rain event (${e.rain_event_total_mm ?? "?"} mm) ended ${e.rain_event_lag_days} days before.`
                    : "No qualifying rain event in the 14 days before."}
                  {e.rain_prior_14d_mm !== null ? ` ${e.rain_prior_14d_mm.toFixed(0)} mm fell in those 14 days.` : ""}
                </p>
              </div>
              <span className={`w-fit self-start whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[st]}`}>{STATUS_WORD[st]}</span>
            </li>
          );
        })}
      </ol>
      {shown.length > INITIAL ? (
        <button type="button" aria-expanded={all} aria-controls={listId} onClick={() => setAll(!all)} className="tap rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2">
          {all ? "Show fewer" : `Show all ${shown.length} events`}
        </button>
      ) : null}
    </div>
  );
}
