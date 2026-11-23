"use client";

import { useState } from "react";

interface Props {
  title: string;
  text: string;
  /** Absolute or root-relative URL to share; defaults to the current page including its #state. */
  url?: string;
  label?: string;
  className?: string;
}

/** Native share sheet where available (phones), otherwise copies the link; never fails silently. */
export function ShareButton({ title, text, url, label = "Share", className }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "shared" | "manual">("idle");
  const target = () => (url ? new URL(url, window.location.href).href : window.location.href);

  async function share() {
    const href = target();
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ url: href }))) {
        await navigator.share({ title, text, url: href });
        setState("shared");
        return;
      }
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return; // the person closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(href);
      setState("copied");
      window.setTimeout(() => setState((s) => (s === "copied" ? "idle" : s)), 2500);
    } catch {
      setState("manual"); // clipboard blocked: show the link to copy by hand
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={share}
        className={className ?? "tap inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2"}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="3.5" r="2" />
          <circle cx="4" cy="8" r="2" />
          <circle cx="12" cy="12.5" r="2" />
          <path d="M5.8 7l4.4-2.6M5.8 9l4.4 2.6" />
        </svg>
        {label}
      </button>
      <span role="status" className="text-sm text-muted">
        {state === "copied" ? "Link copied" : state === "shared" ? "Shared" : ""}
      </span>
      {state === "manual" ? (
        <input
          readOnly
          value={target()}
          aria-label="Link to copy"
          onFocus={(e) => e.currentTarget.select()}
          className="tap w-64 max-w-full rounded-md border border-border bg-surface px-2 text-sm"
        />
      ) : null}
    </span>
  );
}
