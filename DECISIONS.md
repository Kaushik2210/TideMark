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

## D-007 Commits carry no tool attribution
Commit messages and repository files contain no AI-tool trailers or contributor entries, per
the maintainer's instruction.
