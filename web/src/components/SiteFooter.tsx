import Link from "next/link";
import { REPO } from "@/lib/data";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8 text-sm text-muted sm:px-6">
        <p className="max-w-3xl">
          <strong className="text-fg">Research project, not an official assessment.</strong> Tidemark
          estimates open-water area and flags candidate signals from free satellite data. Most signals are
          not validated (see <Link className="underline" href="/methodology/">the method</Link>); nothing
          here is a legal boundary determination, a water-quality measurement, or advice.
        </p>
        <p className="max-w-3xl">
          Contains modified Copernicus Sentinel data. Lake outlines and base map © OpenStreetMap contributors (ODbL), tiles by OpenFreeMap; optional satellite view: EOxCloudless 2025 by EOX IT Services GmbH.
          Rainfall: Open-Meteo (CC BY 4.0, ERA5). Land cover: ESA WorldCover (CC BY 4.0). Lost-lake
          points: Wikipedia contributors (CC BY-SA 4.0). Code MIT; derived data CC BY 4.0 unless noted.
        </p>
        <p>
          <a className="underline" href={REPO}>Source code and data on GitHub</a>
          {" · "}
          <Link className="underline" href="/data/">Downloads and licences</Link>
        </p>
      </div>
    </footer>
  );
}
