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

## D-012 Commits carry no tool attribution
Commit messages and repository files contain no AI-tool trailers or contributor entries, per
the maintainer's instruction.
