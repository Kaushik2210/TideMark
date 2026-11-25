"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef } from "react";
import type { Map as MLMap, GeoJSONSource, Marker } from "maplibre-gl";
import { getJson, withBase } from "@/lib/data";
import type { CityLake, SceneArchive, LakeIndex, Row } from "@/lib/types";

export type BaseMode = "monthly" | "map" | "satellite" | "none";

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
  archive?: SceneArchive;
  places?: CityLake[];
  lakes: LakeIndex[];
  series: Record<string, Row[]>;
  ghost: boolean;
  basemap: BaseMode;
  focus: string; // lake id or "all"
  interactive?: boolean;
  view?: View | null;
  onViewChange?: (v: View) => void;
  onGhostSelect?: (p: GhostProps | null) => void;
  onSelectLake?: (id: string) => void;
  onStatus?: (s: "loading" | "ready" | "unsupported") => void;
  /** Lake whose outline should be emphasised (hovered row or polygon), or null. */
  highlight?: string | null;
  onHoverLake?: (id: string | null) => void;
  flyTo?: FlyTo | null;
  ariaLabel: string;
  className?: string;
}

const EMPTY = { type: "FeatureCollection", features: [] } as const;
// OpenFreeMap: free vector basemap, no key or sign-up, OpenStreetMap data. Attribution comes from the
// style itself. Override with NEXT_PUBLIC_BASEMAP_STYLE_URL to use another MapLibre style.
const STYLE_DARK = process.env.NEXT_PUBLIC_BASEMAP_STYLE_URL || "https://tiles.openfreemap.org/styles/dark";
const STYLE_LIGHT = process.env.NEXT_PUBLIC_BASEMAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron";

// EOX Sentinel-2 cloudless mosaic (free for non-commercial use with attribution; 10 m, so it is
// upsampled beyond zoom 14). A local city overview sits below the streamed detail.
const SAT_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg";
const SAT_ATTRIBUTION = '<a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2025)';

/** Plain background used when the basemap style cannot be fetched, so the data layers still work. */
function fallbackStyle(bg: string) {
  return { version: 8 as const, sources: {}, layers: [{ id: "tidemark-background", type: "background" as const, paint: { "background-color": bg } }] };
}

async function pickStyle(url: string, bg: string) {
  try {
    const ctl = new AbortController();
    const t = window.setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(url, { signal: ctl.signal });
    window.clearTimeout(t);
    if (r.ok) return url;
  } catch {
    /* fall through to the plain background */
  }
  return fallbackStyle(bg);
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function LakeMap(props: Props) {
  const { month, lakes, series, ghost, basemap, focus, interactive = true, view, flyTo } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const readyRef = useRef(false);
  const baseIds = useRef(new Map<string, "visible" | "none">());
  const displayedScene = useRef<string | null>(null);
  const streetRequested = useRef(false);
  const latest = useRef(props);
  latest.current = props;

  // Create the map once in the browser.
  useEffect(() => {
    const streetLayers = baseIds.current;
    let cancelled = false;
    let map: MLMap | null = null;
    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        maplibregl.setWorkerUrl(new URL(withBase("/maplibre/maplibre-gl-worker.js"), window.location.origin).href);
        if (cancelled || !container.current) return;
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const bg = cssVar("--bg", dark ? "#0b1220" : "#f5f7fb");
        const style = fallbackStyle(bg);
        const m: MLMap = new maplibregl.Map({
          container: container.current,
          style,
          center: [77.65, 12.95],
          zoom: 10.6,
          interactive,
          attributionControl: { compact: true },
          cooperativeGestures: false,
          fadeDuration: 0,
        });
        map = m;
        mapRef.current = m;
        if (interactive) {
          m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
          m.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 80 }), "top-right");
        }

        m.on("error", (e) => {
          // Tile and source hiccups must not break the page; the data table stays available.
          if (e && (e as unknown as { sourceId?: string }).sourceId === "osm") return;
        });

        m.on("load", () => {
          // Corners are the outer Web Mercator edges of the twelve original overview tiles.
          m.addSource("city-overview", {
            type: "image", url: withBase("/bengaluru-2025.webp"),
            coordinates: [[77.34375, 13.2399455], [78.046875, 13.2399455],
              [78.046875, 12.7260843], [77.34375, 12.7260843]],
          });
          m.addLayer({ id: "city-overview", type: "raster", source: "city-overview",
            layout: { visibility: latest.current.basemap === "satellite" ? "visible" : "none" } });
          m.addSource("eox", { type: "raster", tiles: [SAT_TILES], tileSize: 256, maxzoom: 14, attribution: SAT_ATTRIBUTION });
          m.addLayer({ id: "eox", type: "raster", source: "eox", layout: { visibility: "none" } });
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
          if (latest.current.places) {
            m.addSource("places", { type: "geojson", data: withBase("/data/city-lakes.geojson"),
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' });
            m.addLayer({ id: "place-fill", type: "fill", source: "places",
              paint: { "fill-color": cs.optical, "fill-opacity": 0.025 } });
            m.addLayer({ id: "place-line", type: "line", source: "places",
              paint: { "line-color": "#d5ede8", "line-width": 1, "line-opacity": 0.65 } });
            m.on("click", "place-fill", e => {
              const id = e.features?.[0]?.properties.id;
              if (id) latest.current.onSelectLake?.(id);
            });
          }
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

          // Hover (or tap) a lake's water to read its figure for the selected month.
          const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "tide-popup", maxWidth: "240px" });
          const describe = (id: string) => {
            const { lakes: ls, series: ss, month: mo } = latest.current;
            const lake = ls.find((x) => x.id === id);
            const row = ss[id]?.find((r) => r.month === mo);
            const nm = (lake?.name ?? id).replace(" (Halasuru Kere)", "");
            return row && row.area_ha !== null && row.source !== "none"
              ? `${nm}: ${row.area_ha.toFixed(1)} ha (${row.source}), ${mo}`
              : `${nm}: no usable scene in ${mo}`;
          };
          for (const l of latest.current.lakes) {
            const layer = `extent-fill-${l.id}`;
            const show = (e: { lngLat: { lng: number; lat: number } }) => {
              m.getCanvas().style.cursor = "pointer";
              popup.setLngLat(e.lngLat).setText(describe(l.id)).addTo(m);
              latest.current.onHoverLake?.(l.id);
            };
            m.on("mousemove", layer, show);
            m.on("click", layer, show);
            m.on("mouseleave", layer, () => {
              m.getCanvas().style.cursor = "";
              popup.remove();
              latest.current.onHoverLake?.(null);
            });
          }

          // Accessible lake labels: real buttons positioned on the map.
          for (const l of latest.current.lakes) {
            const el = document.createElement("button");
            el.type = "button";
            const label = document.createElement("span");
            label.textContent = l.name.replace(" (Halasuru Kere)", "");
            label.className = "rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold text-fg shadow";
            el.append(label);
            el.setAttribute("aria-label", `Focus ${l.name}`);
            el.className =
              "tap flex items-end justify-center rounded-md pb-1";
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
          // The compact attribution opens by itself on load; keep it collapsed so it never covers the legend.
          container.current?.querySelectorAll(".maplibregl-ctrl-attrib").forEach((el) => {
            el.classList.remove("maplibregl-compact-show");
            el.removeAttribute("open");
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
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      readyRef.current = false;
      displayedScene.current = null;
      streetRequested.current = false;
      streetLayers.clear();
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
          if (map === mapRef.current && latest.current.month === month) src.setData(feature as never);
        })
        .catch(() => {
          if (map === mapRef.current && latest.current.month === month) src.setData(EMPTY as never);
        });
    }
    container.current?.setAttribute("data-month", month);
  }

  const applyWaterStyle = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { basemap, highlight, lakes } = latest.current;
    const satellite = basemap === "satellite" || basemap === "monthly";
    for (const lake of lakes) {
      const selected = highlight === lake.id;
      const dim = Boolean(highlight && !selected);
      const opacity = satellite ? (selected ? 0.43 : 0.23) : (selected ? 0.95 : 0.78);
      map.setPaintProperty(`extent-fill-${lake.id}`, "fill-opacity", dim ? opacity * 0.5 : opacity);
      map.setPaintProperty(`extent-line-${lake.id}`, "line-width", selected ? 2.6 : satellite ? 1.5 : 0.8);
      map.setPaintProperty(`extent-line-${lake.id}`, "line-color", satellite ? "#f2ffff" : cssVar("--fg", "#e6edf7"));
    }
  }, []);

  const applyScene = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { basemap, archive, month } = latest.current;
    const scene = basemap === "monthly" ? archive?.months[month] : undefined;
    if ((scene?.item ?? null) === displayedScene.current) return;
    for (const id of ["scene-detail", "scene-overview"]) {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    }
    displayedScene.current = scene?.item ?? null;
    if (!archive || !scene) return;
    const [w, s, e, n] = archive.bbox;
    map.addSource("scene-overview", { type: "image", url: withBase("/data/scenes/" + scene.file),
      coordinates: [[w, n], [e, n], [e, s], [w, s]] });
    map.addLayer({ id: "scene-overview", source: "scene-overview", type: "raster",
      paint: { "raster-fade-duration": 0 } }, "outline-line");
    const url = "https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}.png";
    const params = new URLSearchParams({ collection: "sentinel-2-l2a", item: scene.item, assets: "visual" });
    map.addSource("scene-detail", { type: "raster", tiles: [url + "?" + params], tileSize: 256,
      bounds: archive.bbox, minzoom: 12, maxzoom: 14 });
    map.addLayer({ id: "scene-detail", source: "scene-detail", type: "raster", minzoom: 12,
      paint: { "raster-fade-duration": 0 } }, "outline-line");
  }, []);

  const applyToggles = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setLayoutProperty("ghost", "visibility", latest.current.ghost ? "visible" : "none");
    const mode = latest.current.basemap;
    for (const [id, visibility] of baseIds.current) {
      map.setLayoutProperty(id, "visibility", mode === "map" ? visibility : "none");
    }
    for (const id of ["city-overview", "eox"]) {
      map.setLayoutProperty(id, "visibility", mode === "satellite" ? "visible" : "none");
    }
    applyScene();
    applyWaterStyle();
    if (mode === "map" && !streetRequested.current) {
      streetRequested.current = true;
      const url = window.matchMedia("(prefers-color-scheme: dark)").matches ? STYLE_DARK : STYLE_LIGHT;
      void pickStyle(url, cssVar("--bg", "#0b1220")).then((style) => {
        if (map !== mapRef.current) return;
        if (typeof style !== "string" || latest.current.basemap !== "map") {
          streetRequested.current = false;
          return;
        }
        map.setStyle(style, {
          transformStyle: (before, streets) => {
            if (!before) return streets;
            const layers = streets.layers.map((layer) => {
              const visibility = layer.layout?.visibility === "none" ? "none" : "visible";
              baseIds.current.set(layer.id, visibility);
              return latest.current.basemap === "map" ? layer
                : { ...layer, layout: { ...layer.layout, visibility: "none" as const } };
            });
            return { ...streets, sources: { ...streets.sources, ...before.sources },
              layers: [before.layers[0], ...layers, ...before.layers.slice(1)] };
          },
        });
      });
    }
  }, [applyWaterStyle, applyScene]);

  function applyFocus() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { lakes, focus } = latest.current;
    const set = focus === "all" ? lakes : lakes.filter((l) => l.id === focus);
    const other = latest.current.places?.find(p => p.id === focus);
    if (map.getLayer("place-line")) map.setPaintProperty("place-line", "line-width",
      ["case", ["==", ["get", "id"], focus], 3, 1]);
    if (other) {
      const [w, s, e, n] = other.bbox;
      map.fitBounds([[w, s], [e, n]], { padding: 56, maxZoom: 15, duration: 0 });
      return;
    }
    if (!set.length) return;
    const w = Math.min(...set.map((l) => l.bbox[0]));
    const s = Math.min(...set.map((l) => l.bbox[1]));
    const e = Math.max(...set.map((l) => l.bbox[2]));
    const n = Math.max(...set.map((l) => l.bbox[3]));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds([[w, s], [e, n]], { padding: 56, duration: reduce ? 0 : 500, maxZoom: 15 });
  }

  useEffect(() => { applyScene(); }, [month, applyScene]);
  useEffect(() => { applyExtents(); }, [month, series, lakes]);
  useEffect(() => { applyToggles(); }, [ghost, basemap, applyToggles]);
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

  useEffect(() => { applyWaterStyle(); }, [props.highlight, lakes, applyWaterStyle]);

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
