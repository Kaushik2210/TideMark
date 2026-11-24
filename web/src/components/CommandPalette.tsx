"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface PaletteLake { id: string; name: string; name_kn: string | null }
interface Item { id: string; label: string; hint: string; href: string; keys: string }

const PAGES: Omit<Item, "id" | "keys">[] = [
  { label: "Map", hint: "Page", href: "/" },
  { label: "Lakes: compare all", hint: "Page", href: "/lakes/" },
  { label: "The story so far", hint: "Guided tour", href: "/story/" },
  { label: "Updates", hint: "Monthly changes", href: "/updates/" },
  { label: "Method and validation", hint: "How it works, where it fails", href: "/methodology/" },
  { label: "Data and downloads", hint: "Open data", href: "/data/" },
  { label: "Contribute", hint: "Report a photo or an observation", href: "/contribute/" },
];

/**
 * Ctrl/Cmd+K (or the header button) opens a jump-to box for every page and lake. It is a native modal dialog, so
 * focus is trapped and Escape closes it without custom code; results are a labelled listbox driven by the arrow keys.
 */
export function CommandPalette({ lakes }: { lakes: PaletteLake[] }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const items = useMemo<Item[]>(() => {
    const pages = PAGES.map((p) => ({ ...p, id: p.href, keys: `${p.label} ${p.hint}`.toLowerCase() }));
    const lk = lakes.map((l) => ({
      id: `lake-${l.id}`,
      label: l.name,
      hint: "Lake",
      href: `/lakes/${l.id}/`,
      keys: `${l.name} ${l.name_kn ?? ""} lake`.toLowerCase(),
    }));
    const rnd = lakes.length
      ? [{ id: "random", label: "Surprise me: a random lake", hint: "Action", href: "", keys: "random surprise lake" }]
      : [];
    return [...lk, ...pages, ...rnd];
  }, [lakes]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    const words = t.split(/\s+/);
    return items.filter((i) => words.every((w) => i.keys.includes(w)));
  }, [items, q]);

  const open = useCallback(() => {
    setQ("");
    setSel(0);
    if (dlg.current && !dlg.current.open) dlg.current.showModal();
    requestAnimationFrame(() => input.current?.focus());
  }, []);
  const close = () => dlg.current?.close();

  const go = (i: Item | undefined) => {
    if (!i) return;
    close();
    if (i.id === "random") router.push(`/lakes/${lakes[Math.floor(Math.random() * lakes.length)].id}/`);
    else router.push(i.href);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("tidemark:palette", open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tidemark:palette", open);
    };
  }, [open]);

  const active = shown[Math.min(sel, shown.length - 1)];

  return (
    <dialog
      ref={dlg}
      aria-label="Jump to a page or lake"
      onClick={(e) => { if (e.target === dlg.current) close(); }}
      className="m-auto mt-[12vh] w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60"
      data-testid="palette"
    >
      <div className="border-b border-border p-3">
        <label htmlFor="palette-q" className="sr-only">Search pages and lakes</label>
        <input
          id="palette-q"
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); go(active); }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={active ? `pal-${active.id}` : undefined}
          autoComplete="off"
          placeholder="Jump to a lake or page…"
          className="tap w-full rounded-md border border-border bg-bg px-3 text-base"
        />
      </div>
      <ul id="palette-list" role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
        {shown.length === 0 ? <li role="presentation" className="px-3 py-4 text-sm text-muted">Nothing matches “{q}”.</li> : null}
        {shown.map((i, n) => (
          <li
            key={i.id}
            id={`pal-${i.id}`}
            role="option"
            aria-selected={active?.id === i.id}
            onClick={() => go(i)}
            onMouseMove={() => setSel(n)}
            className={`tap flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 ${active?.id === i.id ? "bg-surface-2" : ""}`}
          >
            <span>{i.label}</span>
            <span className="text-xs text-muted">{i.hint}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-4 py-2 text-xs text-muted">Arrow keys to move, Enter to open, Esc to close.</p>
    </dialog>
  );
}

export function PaletteButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("tidemark:palette"))}
      aria-label="Search pages and lakes"
      aria-keyshortcuts="Control+K Meta+K"
      className="tap inline-flex items-center justify-center rounded-md px-2 text-muted hover:text-fg"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
    </button>
  );
}
