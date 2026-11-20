# Encroachment candidates and Ghost Lakes (Phase 5)

Code: `pipeline/src/tidemark/{encroachment,buildings,worldcover,ghost}.py`.
Status: **candidates only, unvalidated.** Boundaries are the OpenStreetMap outlines; **no
official boundary was available** (D-021), so nothing here says a structure is illegal or that a
boundary was breached. Figures: `docs/media/<lake>/encroachment.png`.

## Main result: no evidence of water turned into buildings

A pixel is an *encroachment candidate* if it was usually water in 2016-2018, is almost never water
in clean optical months of 2023-2026 (both periods need at least 3-4 clean observations), and is
built-up now according to ESA WorldCover 2021 and/or Microsoft building footprints (D-024).
Water-level swings do not count (a refilled lake is water again), and dry bare lakebed is not
built-up in either reference. Search area: the OSM outline plus 100 m.

| Lake | Early wet footprint (ha) | Recent wet footprint (ha) | Lost water (ha), range | Lost water now built-up (ha) |
| --- | --- | --- | --- | --- |
| Bellandur | 136 | 106 | 40 (27 to 66), 30% of early | 0.0 (0.0 to 0.0) |
| Varthur | 81 | 79 | 1.5 (0.07 to 14), 2% | 0.0 (0.0 to 0.0) |
| Ulsoor | 30 | 32 | 0.03 (0 to 0.3), 0.1% | 0.0 (0.0 to 0.01) |

Ranges come from a 3x3 grid of thresholds (early wet share 10/25/50%, recent wet share
0/5/15%); the built-up "range" additionally requires both references (low) or either (high).
Clean months used: Bellandur 23 early / 30 recent, Varthur 23 / 33, Ulsoor 20 / 30.

What Bellandur's 40 ha of lost water looks like now (WorldCover 2021): cropland 59%, shrubland
22%, tree cover 18%, no building footprints. The figure shows it as a band along the shoreline of
the eastern cell, where the early water edge has pulled back. That is consistent with vegetation or
marsh encroaching on water (including floating plants, which hide water from optical indices), a
retreating shoreline, or classification noise at the edge; it is **not** consistent with
construction. These data cannot say which.

## Snapshot: how built-up are the outlines and their surroundings?

| Lake | WorldCover 2021 built-up, inside outline | ... in 100-300 m ring | Building footprints, inside outline | ... in ring |
| --- | --- | --- | --- | --- |
| Bellandur | 0.0% | 30% | 0.0% | 11% |
| Varthur | 0.0% | 33% | 0.0% | 3.8% |
| Ulsoor | 0.1% | 68% | 0.1% | 26% |

Footprints are a 2017-2021 snapshot (Bing imagery 2017-03-30 to 2021-07-25), not dated per
building, and cover only roofs, so they are lower than WorldCover's built-up class. WorldCover
2020 gives similar shares. Both snapshots show lakes ringed by development with essentially nothing
built inside the OSM outline.

WorldCover also shows its limits here: inside the Bellandur and Varthur outlines it maps mostly
cropland, tree and shrub cover and under 2% water, even though Sentinel-2 finds 50-100 ha of
water, so it cannot see these lakes as water.

## A negative result, kept on record

The first approach was a Sentinel-2 NDBI/NDVI built-up rule calibrated to WorldCover 2021
(`docs/encroachment_ndbi_calibration_grid.csv`). Outside the outlines it reached F1 0.76
(precision 0.70, recall 0.83), but the optimum was a plateau in which NDBI added nothing, and
inside the outlines it tracked dryness: Varthur "built-up" rose from 5 ha (2020) to 138 ha (2021)
while its wet footprint fell to 1 ha, then fell back as the lake refilled. Bare lakebed looks like
roofs to these indices, so the approach was dropped (D-023).

## Limits

- **The outline is OSM's, not an official boundary.** If the true lake boundary is larger than
  the mapped water edge, encroachment on the difference is invisible here. A licensed official or
  crowdmapped boundary (the CSEI masterlist, if its authors license it) would test that.
- **Building footprints are undated** (2017-2021), so construction after 2021 is seen only
  through WorldCover 2021 and the footprints' own coverage, not through new imagery.
- **WorldCover 2020 and 2021 are different algorithm versions** and were never differenced.
- **"Lost water" is not "lost lake".** It can be vegetation, marsh, shore retreat or noise at the
  water edge; haze-contaminated months are excluded (D-018), but residual error remains.
- **Bellandur's range is wide** (27-66 ha) because the result depends on how strictly "usually
  wet" and "almost never wet" are defined.
- No validation against dated ground truth yet (Phase 6).

## Ghost Lakes (`data/ghost_lakes.geojson`, CC BY-SA 4.0)

24 lakes and tanks that have been built over, from the Wikipedia "Lakes in Bengaluru" Former
reservoirs table (revision id stored per feature), for example Dharmambudhi (Majestic bus stand),
Sampangi (Kanteerava Stadium) and Koramangala (buildings, residential, a national dairy
institute). Each is a **point marked `location_approximate`**: no outline is drawn or implied, and
the table says it is not exhaustive. Citation numbers refer to that article's reference list.
WorldCover adds independent evidence: the median built-up share within 300 m is about 80%
(range 29% at the Challaghatta golf-course site to 97%). One row (Jaraganahalli) carries an
asterisk in the table that is not explained there, so the lake may partly survive; it is flagged
`wikipedia_asterisk_unexplained`. See D-022 and the licence exception in `LICENSE-DATA.md`.

## Official-data search

No licensed, machine-readable official boundary set was found (details and URLs in
DATA_SOURCES.md and D-021).
