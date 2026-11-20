# Data sources

Every dataset used or planned, with licence and status. "Verified" means the endpoint was
actually called during development; anything else is planned and its docs must be checked
before the phase that uses it.

| Source | Used for | Licence | Access | Status |
| --- | --- | --- | --- | --- |
| OpenStreetMap API (`api.openstreetmap.org`) | Lake polygons (Phase 1), fetched by pinned ID | ODbL 1.0, © OpenStreetMap contributors | `/api/0.6/{way\|relation}/ID/full.json` | Verified 2026-11-20: all three lakes retrieved |
| OpenStreetMap via Overpass API | Finding candidate features (`discover` only) | ODbL 1.0 | `overpass-api.de`, `overpass.kumi.systems`, `overpass.private.coffee` | Unreliable: on 2026-11-19/20 the main instance returned 502/406 and the mirrors timed out or worked only intermittently |
| Microsoft Planetary Computer STAC | Sentinel-2 L2A, Sentinel-1 RTC, ESA WorldCover (Phases 2, 3, 5) | Sentinel: free, full and open (Reg. 1159/2013); WorldCover: CC BY 4.0 | `https://planetarycomputer.microsoft.com/api/stac/v1/` | Root endpoint reachable (HTTP 200) 2026-11-19; collections/assets not yet checked |
| Copernicus Data Space | Fallback for Sentinel data | Copernicus open terms | CDSE STAC | Planned, not checked |
| Open-Meteo Historical Weather API | Daily/hourly rainfall per centroid (Phase 4) | CC BY 4.0 (non-commercial free tier, check terms before launch) | `archive-api.open-meteo.com` | Planned, not checked |
| JRC Global Surface Water | Independent sanity check of water masks (Phase 6) | Copernicus / JRC open data | Via Planetary Computer (`jrc-gsw`) | Planned, not checked |
| Karnataka / Lake Development Authority lake data | Official boundaries, lake list (Phase 5) | Unknown | Unknown | Not yet searched. Do not use unless a reuse licence is confirmed |
| Historical lake inventories, old survey maps, academic datasets | Ghost Lakes (Phase 5) | Per source | Per source | Not yet searched. Without open geometry a lake is omitted or marked "location approximate" |

## Retrieved geometries

Retrieval date and the latest OSM edit time are stored per lake in `data/lakes.geojson`
(`retrieved`, `osm_last_edit`, `source_refs`).

Areas computed from the OSM outlines on 2026-11-20: Bellandur 315.4 ha, Varthur 154.3 ha,
Ulsoor 37.9 ha. These are mapped outlines (some may trace the water edge, some the lake bed or
bund) and are not official or surveyed figures. Do not compare them with published areas until
Phase 5 reconciles the boundary definitions.

## Attribution text

"Contains modified Copernicus Sentinel data. Lake boundaries © OpenStreetMap contributors (ODbL)."
