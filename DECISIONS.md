# Decisions

Short log of non-obvious choices. Newest last.

## D-001 Project name: Tidemark
Chosen by the maintainer. Python package `tidemark`; repository `Kaushik2210/TideMark`.

## D-002 Python 3.11 via uv
The brief specifies Python 3.11. The dev machine has 3.12/3.13, so `uv` provisions 3.11
in `pipeline/.venv`. CI pins 3.11.

## D-003 Lake boundaries: OSM first, official data later
Phase 1 uses OpenStreetMap (ODbL) via Overpass. A search for an official Karnataka / Lake
Development Authority machine-readable boundary set with a reuse licence is scheduled
for Phase 5 (it feeds encroachment). Until a licensed source is confirmed, OSM is the boundary
and encroachment results will say so. Not yet verified: whether any official dataset is reusable.

## D-004 Registry pins explicit OSM IDs
Lakes are defined in `pipeline/config/lakes.yaml` with explicit `way/ID` / `relation/ID` refs
(unioned into one polygon). IDs are discovered with `tidemark-registry discover` and pinned by
hand, rather than auto-picked by name, because OSM names are ambiguous (e.g. "Chikka Bellanduru"
is a different, smaller lake from Bellandur). Lakes with no verified ID stay `status: pending`
and are skipped, never guessed.

## D-005 Areas computed in UTM 43N (EPSG:32643)
Equal-enough area for lake-sized polygons around 77.6 E; avoids geodesic dependencies.

## D-006 Registry build uses the OSM API; Overpass only for discovery
The public Overpass instances were unreliable during setup (502, 406 and timeouts on all three
mirrors). Pinned lakes are therefore fetched by exact ID from the OSM API
(`/api/0.6/{way|relation}/ID/full.json`, `osm_api.py`), one small cached request per feature.
Overpass (`overpass.py`, with mirror rotation, backoff and an on-disk cache) is kept only for
`tidemark-registry discover`. Both clients use a generic User-Agent. Because the OSM API has no
database timestamp, `lakes.geojson` records each feature's latest edit time (`osm_last_edit`).

## D-008 Per-scene Otsu needs a plausibility guard
Plain per-scene Otsu on MNDWI split vegetation classes into fake "water" when a lake was
mostly vegetated or dry (Varthur, Feb 2024). Otsu is now accepted only when bimodal and
inside [-0.15, 0.35]; otherwise MNDWI > 0 is used and the row is flagged. Chosen after
looking at real scenes, so it is a heuristic to be tested in Phase 6.

## D-009 Scene choice by lake-level cloud, via SCL
Months are resolved by the cloud/no-data fraction over the lake polygon, not by scene-level
`eo:cloud_cover`, after finding a 0.08%-cloud scene with no data over Varthur.

## D-010 Months without a usable scene stay in the series
Rows carry `status` (`ok`, `no_scene`, `too_cloudy`, `error`). Gaps are data, not omissions;
Phase 3 fills cloudy months with Sentinel-1.

## D-011 Reflectance offset derived from processing baseline
Items and assets expose no offset, so DN -> reflectance subtracts 1000 for baseline >= 04.00.
This follows ESA's processing-baseline convention; there is a unit test for both eras.

## D-012 Radar threshold is a fixed -14 dB, calibrated against optical
The textbook -18 dB and per-scene Otsu both under-performed against clean optical masks (mean IoU
0.38 and 0.53); a fixed -14 dB reached 0.71 (leave-one-out 0.71). Evidence and caveats in
docs/fusion.md. The Phase 2 "plausible Otsu range" idea was not carried over to radar.

## D-013 Fusion is pixel-level with optical priority
Optical pixels win where valid, radar fills cloud gaps, and months are labelled optical, fused or
radar. Pixel masks are cached (`.cache/s2_masks`, `.cache/s1_months`) so fusion can be rerun
without refetching imagery. Unknown pixels are excluded rather than assumed dry.

## D-014 Images and videos are generated from pipeline outputs only
Per-lake before/after image, trend chart and time-lapse video are rendered by `tidemark-media`
from the same files the site will use; map colour shows the sensor behind each month. Output
goes to `docs/media/`.

## D-015 Commits carry no tool attribution
Commit messages and repository files contain no AI-tool trailers or contributor entries, per
the maintainer's instruction.

## D-016 Rainfall is regional ERA5 via Open-Meteo, events are 3-day totals >= 40 mm
`models=era5` is pinned (era5_land returned only nulls for precipitation; "best match" mixes
models). The ~28 km grid means rainfall is regional (Bellandur and Varthur share a cell). A rain
event is a run of days whose trailing 3-day total is >= 40 mm (heuristic; about 5 per year).
The free API is non-commercial only (CC BY 4.0, verified 2026-11-20): Tidemark must stay
ad-free and subscription-free or move to a paid plan.

## D-017 Bloom signals: FAI absolute, NDCI relative
NDCI is 0.3-0.6 in nearly every month on all three lakes, so no absolute NDCI "bloom" threshold
discriminates. NDCI is reported as a statistic and flagged only as top-decile for the lake's own
record. FAI > 0.02 on at least 25% of water-core pixels gives the floating-mat candidate.

## D-018 Haze QC from SWIR over "water", plus a cloud buffer for foam
Sen2Cor's SCL misses thin cloud and haze: it labelled hazy pixels as water, and cloud edges
looked like 6 ha of foam on Bellandur. Water absorbs SWIR (B11 ~0.01-0.03 in every clean month
seen), so a median B11 over water above 0.04 marks the month contaminated (seen: 0.057, 0.219).
Contaminated months are excluded from all optical-derived candidates and extent anomalies, and
foam candidates within 50 m of masked cloud are dropped. The 0.04 cut and 50 m buffer rest on a
handful of inspected scenes. This also means some Phase 2 optical water areas are less reliable.

## D-019 SAR texture is not used for foam (deviation from the brief)
The brief suggests SAR texture as a foam cue. The radar cache stores masks, not backscatter, and
there is no calibration data for how foam looks in VV for these lakes, so a texture rule would be
invented. Revisit after Phase 6 ground truth.

## D-020 Inflow/outflow points come from OSM waterways, direction unverified
Waterway lines (drain, stream, river, canal, ditch) ending within 40 m of a lake are labelled
inflow or outflow from OSM digitising direction, which is usually downstream but not checked on
the ground. Foam within 150 m of such a point is tagged `near_inlet`.
