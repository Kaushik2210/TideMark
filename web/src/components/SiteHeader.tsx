"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Map" },
  { href: "/lakes/", label: "Lakes" },
  { href: "/methodology/", label: "Method" },
  { href: "/data/", label: "Data" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href.replace(/\/$/, ""));
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="tap flex items-center gap-2 py-2" aria-label="Tidemark, home">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <path d="M2 13c3-4 5-4 8 0s5 4 8 0 4-3 6-1" fill="none" stroke="var(--optical)" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M2 19c3-4 5-4 8 0s5 4 8 0 4-3 6-1" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
            <line x1="2" y1="7" x2="24" y2="7" stroke="var(--fg)" strokeWidth="1.4" />
          </svg>
          <span className="font-serif text-xl font-semibold tracking-tight">Tidemark</span>
        </Link>
        <nav aria-label="Main">
          <ul className="flex items-center gap-1">
            {LINKS.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`tap inline-flex items-center rounded-md px-3 text-sm font-medium transition-colors ${
                      active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
