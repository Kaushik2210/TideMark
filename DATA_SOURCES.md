# Data sources

Every dataset used or planned, with licence and status. "Verified" means the endpoint was
actually called during development; anything else is planned and its docs must be checked
before the phase that uses it.

| Source | Used for | Licence | Access | Status |
| --- | --- | --- | --- | --- |
| OpenStreetMap API (`api.openstreetmap.org`) | Lake polygons (Phase 1), fetched by pinned ID | ODbL 1.0, © OpenStreetMap contributors | `/api/0.6/{way\|relation}/ID/full.json` | Verified 2026-11-20: all three lakes retrieved |
| OpenStreetMap via Overpass API | Finding candidate features (`discover` only) | ODbL 1.0 | `overpass-api.de`, `overpass.kumi.systems`, `overpass.private.coffee` | Unreliable: on 2026-11-19/20 the main instance returned 502/406 and the mirrors timed out or worked only intermittently |
| Microsoft Planetary Computer STAC | Sentinel-2 L2A, Sentinel-1 RTC, ESA WorldCover (Phases 2, 3, 5) | Sentinel: free, full and open (Reg. 1159/2013); WorldCover: CC BY 4.0 | `https://planetarycomputer.microsoft.com/api/stac/v1/` | Verified 2026-11-20: `sentinel-2-l2a` collection starts 2015-06-27; B03/B11/SCL are COGs; items carry `eo:cloud_cover`, `s2:processing_baseline`, `proj:code`. No reflectance offset in metadata (see D-011). Sentinel-1 RTC verified 2026-11-20 (see next row); WorldCover not yet checked |
| Planetary Computer `sentinel-1-rtc` | Radar water masks for cloudy months (Phase 3) | Sentinel: free, full and open | Same STAC API; COG assets `vv`, `vh` | Verified 2026-11-20: 10 m, float32 linear gamma-0 power, no-data -32768, about 24-36 scenes/year over Bengaluru, mostly descending VV+VH |
| Microsoft Building Footprints, Planetary Computer `ms-buildings` | Buildings inside and around each outline; second built-up reference (Phase 5) | ODbL 1.0 | GeoParquet on Azure (`abfs://footprints/delta/2023-04-25/.../RegionName=India/quadkey=123303312`), read with adlfs | Verified 2026-11-20: partition has about 1.10 million buildings (base release 2022-07-06 has 1.105 million, so the delta is the same data lightly updated), imagery 2017-03-30 to 2021-07-25. Not dated per building. Footprints stay in the local cache; only aggregates are published |
| Copernicus Data Space | Fallback for Sentinel data | Copernicus open terms | CDSE STAC | Planned, not checked |
| Open-Meteo Historical Weather API | Daily rainfall per lake centroid, ERA5 model (Phase 4) | CC BY 4.0; free tier is non-commercial use only, under 10,000 calls/day (terms read 2026-11-20) | `archive-api.open-meteo.com/v1/archive`, `models=era5` | Verified 2026-11-20: 4,001 daily values per lake, no missing days; grid cells 13.0N/77.75E (Bellandur, Varthur) and 13.0N/77.5E (Ulsoor). Hourly data not used |
| OpenStreetMap waterways (`/api/0.6/map.json`) | Inflow/outflow points for foam context (Phase 4) | ODbL 1.0, © OpenStreetMap contributors | OSM API bbox query around each lake | Verified 2026-11-20: 5-10 candidate points per lake; direction unverified |
| JRC Global Surface Water v1.3, Planetary Computer `jrc-gsw` | Independent sanity check of water masks (Phase 6) | Free (STAC lists the licence as proprietary; JRC/Copernicus open access) | COG assets `occurrence`, `seasonality`, `extent`, `recurrence`, `change`, `transitions`; 10x10 degree tile `70E_20Nv1_3_2020`, 30 m, 1984-2020 | Verified 2026-11-22; occurrence and seasonality used, see VALIDATION.md |
| Karnataka Tank Conservation and Development Authority (KTCDA, formerly KLCDA) lake lists | Official boundaries / lake list (Phase 5) | Not stated | `ktcda.karnataka.gov.in` "List of lakes in Bengaluru" (per search listing: separate downloads for BBMP, BDA and other agencies); OpenCity (`data.opencity.in`) republishes government lake lists as PDF | Searched 2026-11-20. **Not used.** The KTCDA page itself could not be fetched (proxy error; I did not pursue a workaround). Lists appear to be PDFs of names, with no boundary polygons, and no reuse licence found. CSEI (2022) reports the KLCDA list covered about 210 lakes inside BBMP limits with many wrongly located |
| CSEI/ATREE "Bengaluru Lakes Masterlist" (crowdmapped) | Possible lake boundaries (Phase 5) | Not stated | Google Drive folder linked from the CSEI post "Crowdmapping Bengaluru's Lakes" (2022-02-28) | Found 2026-11-20, **not used**: described as open-access but no licence is stated, and it was built partly from Survey of India toposheets and Google Earth, whose reuse terms are unclear. Worth asking the authors (the post gives a contact) whether it can be licensed for reuse |
| Bengaluru GIS portal (`kgis.ksrsac.in/bengalurugis`) | Possible official layers | Unknown | Web portal | Appeared in searches; not examined and not used |
| ESA WorldCover 2020 (v100) and 2021 (v200), Planetary Computer `esa-worldcover` | Built-up context around lakes and calibration target for the built-up rule (Phase 5) | CC BY 4.0 | Same STAC API; one 3x3 degree tile (N12E075) covers Bengaluru | Verified 2026-11-20: 10 m classes, both years present. The two years are different algorithm versions and are not used as a change signal |
| Wikipedia, "Lakes in Bengaluru", Former reservoirs table | Ghost Lakes: names, what occupies each site today, approximate points (Phase 5) | CC BY-SA 4.0 (Wikipedia text) | MediaWiki API `action=parse`, revision id stored in the output | Verified 2026-11-20: 24 rows with coordinates, all inside Bengaluru. The table says it is "not exhaustive". Points only, marked `location_approximate`; no outlines. Other historical inventories (IISc, Survey of India toposheets) were not used: no open geometry confirmed |

## Retrieved geometries

Retrieval date and the latest OSM edit time are stored per lake in `data/lakes.geojson`
(`retrieved`, `osm_last_edit`, `source_refs`).

Areas computed from the OSM outlines on 2026-11-20: Bellandur 315.4 ha, Varthur 154.3 ha,
Ulsoor 37.9 ha. These are mapped outlines (some may trace the water edge, some the lake bed or
bund) and are not official or surveyed figures. Do not compare them with published areas until
Phase 5 reconciles the boundary definitions.

## Attribution text

"Contains modified Copernicus Sentinel data. Lake boundaries © OpenStreetMap contributors (ODbL)."

## Basemap (website)
OpenFreeMap vector tiles and styles (`tiles.openfreemap.org`), © OpenMapTiles, data from OpenStreetMap
(ODbL). No key. Loaded by visitors' browsers at view time; not stored in this repository.

OpenFreeMap is the default basemap above. The optional **Satellite** basemap is EOxCloudless 2025 by EOX IT
Services GmbH (`tiles.maps.eox.at`; contains modified Copernicus Sentinel data 2025), free for
non-commercial use with attribution. Loaded by visitors' browsers only when Satellite is selected.
