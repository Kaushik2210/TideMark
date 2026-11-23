"use client";

import { useId, useState } from "react";
import { siteUrl } from "@/lib/site";

/** Copyable iframe snippet so schools, newsrooms and NGOs can put a live lake panel on their own page. */
export function EmbedCode({ lakeId, name }: { lakeId: string; name: string }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const code = `<iframe src="${siteUrl(`/embed/${lakeId}/`)}" title="${name}: open water from satellite data (Tidemark)" width="440" height="330" style="border:0;max-width:100%" loading="lazy"></iframe>`;
  return (
    <details className="max-w-3xl rounded-md border border-border bg-surface px-4 py-3 text-sm">
      <summary className="tap cursor-pointer py-2 font-medium">Embed this lake on your own page</summary>
      <div className="mt-2 space-y-3">
        <p className="text-muted">A live panel with the latest figure, trend and source credit. Free to use with the credit left in place.</p>
        <label htmlFor={id} className="block font-medium">HTML to paste</label>
        <textarea id={id} readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-border bg-bg p-2 font-mono text-xs" />
        <button
          type="button"
          className="tap rounded-md border border-border px-4 font-medium hover:bg-surface-2"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2500);
            } catch {
              setCopied(false);
            }
          }}
        >
          Copy code
        </button>
        <span role="status" className="ml-3 text-muted">{copied ? "Copied" : ""}</span>
      </div>
    </details>
  );
}
