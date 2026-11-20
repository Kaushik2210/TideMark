# Optical water extent (Sentinel-2), Phase 2

How `tidemark-water` turns Sentinel-2 L2A scenes into a monthly water area per lake.
Code: `pipeline/src/tidemark/{s2,water,runner}.py`. Status: **unvalidated**. Formal accuracy
checks against JRC and ground truth are Phase 6; what is known so far is under "Known limits".

## Steps

1. **Scene search.** STAC search on Microsoft Planetary Computer (`sentinel-2-l2a`),
   intersecting the lake polygon, one calendar month at a time, least scene-level cloud first (no cloud filter, so overcast
   months are reported as `too_cloudy`, not `no_scene`).
2. **Scene choice per month.** For up to 4 candidates the Scene Classification Layer (SCL)
   is read over the lake polygon buffered by 100 m, and the fraction of cloud, cloud shadow,
   cirrus, saturated or no-data pixels is computed. The scene with the lowest fraction wins
   (search stops early below 2%). Scene-level cloud cover alone is not used because a tile
   can be clear overall yet cloudy, or empty, over one lake (this happened: Varthur, Jan 2016).
   If the best scene is more than 50% bad, the month is recorded as `too_cloudy`; if there is
   no scene, `no_scene`. Neither is dropped from the series.
3. **Read.** Only a window around the lake (polygon + 300 m) is read from the cloud-optimised
   GeoTIFFs: B03 (green, 10 m), B11 (SWIR1, 20 m, bilinear to 10 m), SCL (20 m, nearest to 10 m).
4. **Reflectance.** DN to reflectance as `(DN - offset) / 10000`, offset = 1000 for ESA
   processing baseline 04.00 and later (scenes from 2022), else 0. Neither the STAC items nor
   the assets carry this offset (checked 2026-11-20), so it is derived from
   `s2:processing_baseline`.
5. **MNDWI** = (G - SWIR1) / (G + SWIR1).
6. **Threshold.** Otsu on valid pixels in the window. Otsu is accepted only if
   separability (between-class / total variance) >= 0.6 **and** the threshold lies in
   [-0.15, 0.35]. Otherwise the threshold falls back to 0.0 and the row's `threshold_method`
   says why: `fallback_sparse`, `fallback_bimodality` or `fallback_range`.
7. **Clean-up.** Binary opening (3x3 cross), remove blobs under 20 px (0.2 ha), fill holes up
   to 20 px, then keep only water components inside the 100 m buffered polygon that touch
   the polygon.
8. **Outputs.** `data/timeseries/<lake>.parquet` (one row per month, with status),
   `data/extents/<lake>/<date>.geojson` (extent, simplified to 10 m, ~1 m coordinate grid).

## Columns

`water_area_ha`; `water_area_unc_ha` is a geometric bound of half a pixel along the water edge,
**not** a statistical confidence interval; `threshold`, `threshold_method`, `separability`;
`region_bad_fraction`; `confidence` (heuristic 0..1 = (1 - bad fraction) x method factor x
separability factor; a ranking aid, not a probability); `scl_water_ha` (Sen2Cor water class
area, diagnostic only); `mapped_area_ha` (OSM outline area, for context only).

## Known limits (found by inspecting real scenes, 2026-11-20)

- **Otsu splits vegetation when there is little water.** In Feb 2024 Varthur was mostly
  vegetation-covered; unguarded Otsu returned a threshold of -0.39 and reported 31 ha of
  "water". The plausibility range fixes this case. The range was chosen after seeing this
  scene, so treat it as a heuristic, not a validated constant.
- **Dark or turbid water can fall under MNDWI = 0.** In the same scene a dark patch Sen2Cor
  labels as water is missed by the fallback threshold. Expect under-detection in dry seasons.
- **Sen2Cor SCL water is unreliable on old baselines.** For Jan 2016 the MNDWI mask shows a
  clear 59 ha water body while SCL water covers 13 ha. `scl_water_ha` therefore cannot
  validate the mask; JRC and ground truth must (Phase 6).
- **Vegetation-covered water is invisible.** Floating plants (e.g. hyacinth) cover water
  with a vegetation signal; this method reports open water only.
- **Early record is sparse.** Sentinel-2B launched in 2017, so 2016 has fewer scenes.
- **Water area is not lake area.** A month with a low value can mean dry, vegetated or
  cloudy, not necessarily "lost". Encroachment is a separate Phase 5 measurement.

## Results of the first full run (2016-01 to 2026-11, 131 months per lake)

| Lake | Months with extent | Too cloudy | Otsu accepted | Median water ha | Max water ha | OSM outline ha |
| --- | --- | --- | --- | --- | --- | --- |
| bellandur | 99 | 32 | 45 | 44.8 | 158.2 | 315.4 |
| ulsoor | 102 | 29 | 96 | 29.2 | 34.9 | 37.9 |
| varthur | 105 | 26 | 40 | 19.3 | 91.3 | 154.3 |

Roughly 20% of months have no usable optical scene (Phase 3 targets these with Sentinel-1).
November 2026 is a partial month. These are raw outputs: not validated, not smoothed, and a
single month's value should not be read as a trend. Transient download errors (connection
resets, Aug-Nov 2020) were retried until none remained.

Otsu was accepted in only about 45% of Bellandur and 38% of Varthur months (96 of 102 for
Ulsoor); the rest used the MNDWI > 0 fallback. Those lakes spend much of the year with little
open water or heavy vegetation, so their fallback-month values are the least reliable.
