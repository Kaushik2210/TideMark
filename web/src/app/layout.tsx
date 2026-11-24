import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getLakes } from "@/lib/server-data";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: "Tidemark: Bengaluru lakes from space", template: "%s | Tidemark" },
  description:
    "Open research tracking the water extent, health indicators and change of Bengaluru's lakes from free Sentinel-1 and Sentinel-2 satellite data, 2016 to now. Not an official assessment.",
  metadataBase: new URL(SITE_URL + "/"),
  openGraph: { type: "website", siteName: "Tidemark", title: "Tidemark: Bengaluru lakes from space", images: [{ url: SITE_URL + "/og.png", width: 1200, height: 630, alt: "Tidemark: Bengaluru's lakes seen from space" }] },
  twitter: { card: "summary_large_image", images: [SITE_URL + "/og.png"] },
  alternates: { types: { "application/atom+xml": SITE_URL + "/feed.xml" } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[1000] focus:rounded focus:bg-surface focus:px-4 focus:py-3 focus:text-fg"
        >
          Skip to main content
        </a>
        <SiteHeader lakes={getLakes().map((x) => ({ id: x.id, name: x.name, name_kn: x.name_kn }))} />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
