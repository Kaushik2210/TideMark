"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MLMap, GeoJSONSource, Marker } from "maplibre-gl";
import { getJson, withBase } from "@/lib/data";
import type { LakeIndex, Row } from "@/lib/types";

export interface View {
  center: [number, number];
  zoom: number;
}
export interface GhostProps {
  name: string;
  occupied_today_by: string | null;
  worldcover_2021_builtup_frac?: number | null;
  source_url: string;
  wikipedia_asterisk_unexplained?: boolean;
}
export interface FlyTo {
  center: [number, number];
  zoom: number;
  key: number;
}

interface Props {
  month: string;
  lakes: LakeIndex[];
  series: Record<string, Row[]>;
  ghost: boolean;
  street: boolean;
  focus: string; // lake id or "all"
  interactive?: boolean;
  view?: View | null;
  onViewChange?: (v: View) => void;
  onGhostSelect?: (p: GhostProps | null) => void;
  onSelectLake?: (id: string) => void;
  onStatus?: (s: "loading" | "ready" | "unsupported") => void;
  flyTo?: FlyTo | null;
  ariaLabel: string;
  className?: string;
}

const EMPTY = { type: "FeatureCollection", features: [] } as const;
const OSM_TILES = process.env.NEXT_PUBLIC_BASEMAP_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = process.env.NEXT_PUBLIC_BASEMAP_ATTRIBUTION || "© OpenStreetMap contributors";

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function LakeMap(props: Props) {
  const { month, lakes, series, ghost, street, focus, interactive = true, view, flyTo } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const readyRef = useRef(false);
  const latest = useRef(props);
  latest.current = props;

  // Create the map once in the browser.
  useEffect(() => {
    let cancelled = false;
    let map: MLMap | null = null;
    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        maplibregl.setWorkerUrl(new URL(withBase("/maplibre/maplibre-gl-worker.js"), window.location.origin).href);
        if (cancelled || !container.current) return;
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const bg = cssVar("--bg", dark ? "#0b1220" : "#f5f7fb");
        const m: MLMap = new maplibregl.Map({
          container: container.current,
          style: {
            version: 8,
            sources: {
              osm: { type: "raster", tiles: [OSM_TILES], tileSize: 256, maxzoom: 19, attribution: OSM_ATTRIBUTION },
            },
            layers: [
              { id: "bg", type: "background", paint: { "background-color": bg } },
              {
                id: "osm",
                type: "raster",
                source: "osm",
                layout: { visibility: "none" },
                paint: dark ? { "raster-brightness-max": 0.38, "raster-saturation": -0.7, "raster-contrast": 0.15 } : {},
              },
            ],
          },
          center: [77.65, 12.95],
          zoom: 10.6,
          interactive,
          attributionControl: { compact: true },
          cooperativeGestures: false,
          fadeDuration: 0,
        });
        map = m;
        mapRef.current = m;
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        m.on("error", (e) => {
          // Tile and source hiccups must not break the page; the data table stays available.
          if (e && (e as unknown as { sourceId?: string }).sourceId === "osm") return;
        });

        m.on("load", () => {
          const cs = {
            optical: cssVar("--optical", "#38bdf8"),
            fused: cssVar("--fused", "#34d399"),
            radar: cssVar("--radar", "#fbbf24"),
            muted: cssVar("--muted", "#9db0c7"),
            ghost: cssVar("--ghost", "#c4b5fd"),
            fg: cssVar("--fg", "#e6edf7"),
          };
          m.addSource("outlines", { type: "geojson", data: withBase("/data/lakes.geojson") });
          m.addLayer({
            id: "outline-line",
            type: "line",
            source: "outlines",
            paint: { "line-color": cs.muted, "line-width": 1.4, "line-dasharray": [3, 2] },
          });
          for (const l of latest.current.lakes) {
            m.addSource(`extent-${l.id}`, { type: "geojson", data: EMPTY as never });
            m.addLayer({
              id: `extent-fill-${l.id}`,
              type: "fill",
              source: `extent-${l.id}`,
              paint: {
                "fill-color": ["match", ["get", "source"], "optical", cs.optical, "fused", cs.fused, "radar", cs.radar, cs.optical],
                "fill-opacity": 0.78,
              },
            });
            m.addLayer({
              id: `extent-line-${l.id}`,
              type: "line",
              source: `extent-${l.id}`,
              paint: { "line-color": cs.fg, "line-width": 0.8, "line-opacity": 0.8 },
            });
          }
          m.addSource("ghost", { type: "geojson", data: withBase("/data/ghost_lakes.geojson") });
          m.addLayer({
            id: "ghost",
            type: "circle",
            source: "ghost",
            layout: { visibility: "none" },
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 9],
              "circle-color": cs.ghost,
              "circle-stroke-color": cs.fg,
              "circle-stroke-width": 1.5,
              "circle-opacity": 0.9,
            },
          });
          m.on("click", "ghost", (e) => {
            const f = e.features?.[0];
            latest.current.onGhostSelect?.(f ? (f.properties as unknown as GhostProps) : null);
          });
          m.on("mouseenter", "ghost", () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", "ghost", () => (m.getCanvas().style.cursor = ""));

          // Accessible lake labels: real buttons positioned on the map.
          for (const l of latest.current.lakes) {
            const el = document.createElement("button");
            el.type = "button";
            el.textContent = l.name.replace(" (Halasuru Kere)", "");
            el.setAttribute("aria-label", `Focus ${l.name}`);
            el.className =
              "tap rounded-full border border-border bg-surface/90 px-3 text-sm font-medium text-fg shadow-sm backdrop-blur-sm";
            el.addEventListener("click", () => latest.current.onSelectLake?.(l.id));
            markersRef.current.push(new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -4] }).setLngLat(l.centroid).addTo(m));
          }

          m.on("moveend", (e) => {
            // Only report user-driven moves, to avoid sync feedback loops between maps.
            if ((e as unknown as { originalEvent?: unknown }).originalEvent) {
              const c = m.getCenter();
              latest.current.onViewChange?.({ center: [c.lng, c.lat], zoom: m.getZoom() });
            }
          });
          readyRef.current = true;
          container.current?.setAttribute("data-ready", "true");
          latest.current.onStatus?.("ready");
          applyAll();
        });
      } catch {
        latest.current.onStatus?.("unsupported");
      }
    })();

    function applyAll() {
      applyExtents();
      applyToggles();
      applyFocus();
    }
    // exposed to other effects through the ref-bound closures below
    (container.current as unknown as { __apply?: () => void }).__apply = applyAll;

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      readyRef.current = false;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyExtents() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { month, lakes, series } = latest.current;
    for (const l of lakes) {
      const src = map.getSource(`extent-${l.id}`) as GeoJSONSource | undefined;
      if (!src) continue;
      const row = series[l.id]?.find((r) => r.month === month);
      if (!row || row.source === "none") {
        src.setData(EMPTY as never);
        continue;
      }
      getJson<unknown>(`/data/extents/${l.id}/${month}.geojson`)
        .then((feature) => {
          // Ignore stale responses if the month changed meanwhile.
          if (latest.current.month === month) src.setData(feature as never);
        })
        .catch(() => src.setData(EMPTY as never));
    }
    container.current?.setAttribute("data-month", month);
  }

  function applyToggles() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setLayoutProperty("ghost", "visibility", latest.current.ghost ? "visible" : "none");
    map.setLayoutProperty("osm", "visibility", latest.current.street ? "visible" : "none");
  }

  function applyFocus() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { lakes, focus } = latest.current;
    const set = focus === "all" ? lakes : lakes.filter((l) => l.id === focus);
    if (!set.length) return;
    const w = Math.min(...set.map((l) => l.bbox[0]));
    const s = Math.min(...set.map((l) => l.bbox[1]));
    const e = Math.max(...set.map((l) => l.bbox[2]));
    const n = Math.max(...set.map((l) => l.bbox[3]));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds([[w, s], [e, n]], { padding: 56, duration: reduce ? 0 : 500, maxZoom: 15 });
  }

  useEffect(() => { applyExtents(); }, [month, series, lakes]);
  useEffect(() => { applyToggles(); }, [ghost, street]);
  useEffect(() => { applyFocus(); }, [focus, lakes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !view) return;
    const c = map.getCenter();
    if (Math.abs(c.lng - view.center[0]) > 1e-6 || Math.abs(c.lat - view.center[1]) > 1e-6 || Math.abs(map.getZoom() - view.zoom) > 1e-3) {
      map.jumpTo({ center: view.center, zoom: view.zoom });
    }
  }, [view]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !flyTo) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({ center: flyTo.center, zoom: flyTo.zoom, duration: reduce ? 0 : 600 });
  }, [flyTo]);

  // Re-apply once the map reports ready (effects above ran before 'load').
  useEffect(() => {
    const el = container.current as unknown as { __apply?: () => void } | null;
    const t = window.setInterval(() => {
      if (readyRef.current) {
        el?.__apply?.();
        window.clearInterval(t);
      }
    }, 200);
    return () => window.clearInterval(t);
  }, []);

  return (
    // MapLibre sets `position: relative` on its container, which would override a caller's
    // `absolute inset-0`; the outer div keeps the caller's sizing and the map fills it.
    <div className={props.className}>
      <div
        ref={container}
        role="region"
        aria-label={props.ariaLabel}
        className="h-full w-full"
        data-testid="lake-map"
      />
    </div>
  );
}
