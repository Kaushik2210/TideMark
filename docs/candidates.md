# Rainfall, bloom and foam candidates, and anomaly flags (Phase 4)

Code: `pipeline/src/tidemark/{rainfall,indices,waterways,candidates,anomalies}.py`.
Status: **candidates only, unvalidated.** Nothing here is a detected bloom, foam event or
pollution event. Precision and recall against dated ground truth come in Phase 6.

## Rainfall

Open-Meteo Historical Weather API, ERA5 reanalysis (`models=era5`), daily precipitation,
2015-12 to 2026-11-13, one call per lake. Grid cells: 13.0N 77.75E (Bellandur, Varthur) and
13.0N 77.5E (Ulsoor); the ~28 km grid means this is regional rain, not what fell on a lake.
No missing days. Annual totals 740-1,270 mm with a clear May-Oct monsoon, consistent with
Bengaluru's climate. A **rain event** is a run of days whose trailing 3-day total is at least
40 mm (heuristic): 58 per lake in 2016-2026. The largest 3-day spells are Sep 2017 and Nov 2021,
which I recall as reported Bengaluru heavy-rain spells; to be sourced in Phase 6.
Terms: free API is non-commercial only, CC BY 4.0 (see D-016).

Outputs: `data/rainfall/<lake>.parquet` (daily + 3/7/14/30-day rolling totals),
`<lake>_events.parquet`, `<lake>.meta.json`.

## Optical indicators (Sentinel-2, months with an optical scene)

For each month the Phase 2 scene is re-read with extra bands and the Phase 2 water mask is
reused. Statistics use water-core pixels (water mask eroded by one pixel).

- **NDCI** = (B05 - B04) / (B05 + B04). It is 0.3-0.6 in almost every month on all three lakes,
  so these lakes are persistently chlorophyll-rich and no fixed NDCI cut-off discriminates
  (D-017). NDCI is reported as a statistic and flagged only as `chlorophyll_high_candidate`:
  the month's median NDCI is in the lake's own top decile (a ranking, so about 10% of clean
  months are flagged by construction).
- **FAI** = NIR - baseline interpolated from red to SWIR1 (Hu 2009). `floating_mat_candidate`
  = at least 25% of water-core pixels have FAI > 0.02. Floating algae mats and floating
  vegetation both raise FAI, so this cannot tell them apart.
- **Foam candidates**: pixels with mean visible reflectance >= 0.20, saturation <= 0.15,
  NDVI <= 0.10, valid in the SCL, within 30 m of water, in patches of at least 5 pixels
  (0.05 ha). A white region that lies mostly off the water zone is rejected (cloud, roof or sand
  touching the shore), as are pixels within 50 m of masked cloud. Patches within 150 m of an
  OSM waterway end are tagged near an inflow/outflow (direction from OSM digitising order,
  unverified, D-020).

## Contamination QC (important)

Sen2Cor's scene classification misses thin cloud and haze. Inspecting images showed hazy
scenes whose "water" pixels were really haze: they had SWIR (B11) reflectance of 0.057-0.219,
while water over clean months is 0.007-0.026. A month is marked **contaminated** when the
median B11 over its water-core pixels exceeds 0.04 (`qc_contaminated`, D-018). Result:

| Lake | Optical months | Contaminated | Floating-mat months | Chlorophyll top-decile | Foam months |
| --- | --- | --- | --- | --- | --- |
| Bellandur | 99 | 12 | 16 | 9 | 1 |
| Ulsoor | 102 | 21 | 18 | 8 | 0 |
| Varthur | 105 | 16 | 19 | 8 | 0 |

(Flag counts are over clean months only.) Contaminated months are excluded from all
optical-derived flags **and from the extent anomalies**. Their Phase 2 water areas and the
fused monthly areas built on them should be read with caution; the 0.04 cut rests on a handful
of inspected scenes.

## Anomaly flags

`data/events/<lake>.parquet` and `.json` (plus `.summary.json`). Event types and rules are in
the `anomalies.py` header. Extent anomalies use a robust z-score of the month's area against the
lake's own median for that calendar month (|z| >= 3 and at least 5 ha), because a dry-season low
is normal. `rapid_change` (month-to-month change over 3x the lake's usual change) is counted only
when both months come from the same single sensor; across a radar/optical switch the jump is
mostly a definition difference and was removed after it produced false jumps (Bellandur Jun 2019,
+90 ha). Every event carries the rain that fell before it and whether a rain event ended within
the previous 14 days (`follows_rain`).

Counts: 96 events in total, 0 with approximate dates.

| Type | Bellandur | Ulsoor | Varthur |
| --- | --- | --- | --- |
| floating_mat_candidate | 16 | 18 | 19 |
| chlorophyll_high_candidate | 9 | 8 | 8 |
| rapid_change | 7 | 1 | 5 |
| extent_low | 0 | 2 | 0 |
| extent_high | 0 | 0 | 2 |
| foam_candidate | 1 | 0 | 0 |

Things worth a look (not conclusions): Ulsoor March and April 2026 are about 30 ha below its
usual (z about -16); OpenStreetMap's own note on that lake reads "Rejuvenation and desilting
ongoing as of 2026 April", so this is a Phase 6 ground-truth candidate. Varthur Feb and Mar 2026
are about 75 ha above usual (the lake is much fuller).

### Do events follow rain? Not demonstrably.

Share of events with a qualifying rain event in the previous 14 days, against the share for all
months (base rate): Bellandur base 0.22, rapid_change 0.14 (n=7), floating-mat 0.25 (n=16);
Varthur base 0.21, rapid_change 0.20 (n=5), floating-mat 0.16 (n=19); Ulsoor base 0.18,
floating-mat 0.11 (n=18). With samples this small and values this close to the base rate there is
no evidence either way. Do not present `follows_rain` as causation.

## Known limits

- **Known false positive:** Bellandur Aug 2022 "foam" (6.3 ha) is almost certainly a thin cloud
  over the lake that the SCL did not mask. Its spectrum is flat and bright from visible to SWIR
  (B02 0.58, B11 0.53). The remaining foam candidates have similar flat spectra, so spectra alone
  cannot separate foam from cloud, roofs or sand. A cloud sitting mostly over water defeats the
  on-water test. Treat every foam candidate as needing visual review.
- Only one foam candidate survives QC, against the several dated foam reports that the brief
  expects; low recall is likely, since foam can be thin, dull or short-lived and a 5-day revisit
  can miss it. Phase 6 measures this.
- Radar texture was not used for foam (D-019).
- Floating-mat months (about a fifth of clean months on every lake) are a persistent condition
  here, not rare events. The flag marks a *level*, not an episode.
- ERA5 rain is coarse and regional; it can miss localised cloudbursts that matter for runoff.
- Events from radar-only months carry mid-month dates (`date_is_approx`); none occurred in this run
  because every optical-derived flag has an acquisition date.
- Thresholds (FAI 0.02, 25% area, foam brightness and saturation, SWIR 0.04, z 3, 40 mm) are
  heuristics tuned by inspection and not validated.
