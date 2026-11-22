# Validation (Phase 6)

Tidemark is a research project and **its candidate signals are largely not validated**. This
page reports what was tested, what held up, and what failed. Everything is reproducible:
`tidemark-validate` rereads `validation/ground_truth.csv` and the pipeline outputs and writes
`validation/results.json`.

## Summary

| Question | Result |
| --- | --- |
| Do water extents agree with JRC Global Surface Water? | Broadly yes: IoU 0.73-0.85 at a 25% water-frequency cut, rank correlation 0.87-0.93. Weak for Varthur at stricter cuts (IoU 0.18 at 50%). |
| Do water-level events (drained, dewatered, overflow) show up? | 8 of 10 testable events were observed in time: **5 hits, 3 partial, 0 misses**, 2 not observed. Two of the partials are one unresolved disagreement with the press (Ulsoor, May 2026). |
| Does the foam candidate detect reported foam? | **No.** 0 of 4 foam events that had a usable scene; 4 more had no usable scene. Its one flag is a likely cloud false positive. |
| Are floating-mat and chlorophyll flags validated? | **No.** No usable ground truth (1 vendor-sourced row, not observed). |
| Do events follow rain? | Not testable here; Phase 4 found no association (small samples). |

## Ground truth

`validation/ground_truth.csv`: **26 dated events from 20 distinct source pages**, each row with
a primary `source_url` (https), publisher, publication date, event date with its precision, and
the pipeline signal that could test it. Every page was opened and read; dates come from the
pages, not from search snippets. Rows are for Bellandur (14), Varthur (7) and Ulsoor (5).

| Type | Rows | Testable with |
| --- | --- | --- |
| foam_spill | 8 | foam candidate |
| drained / dry_low / dewatered | 8 | extent low |
| overflow | 2 | extent high |
| hyacinth_cover | 1 | floating-mat candidate |
| fire, encroachment_order | 7 | nothing here (context only) |

Limits of this ground truth: it comes from English-language news and a few reports, so it
over-represents dramatic events (foam spills after heavy rain, fires, floods) and misses quiet
ones. It is **incomplete**, so "unmatched" never means "false". Some rows are states on a
publication date, not episodes with start dates. Only three lakes are covered. Social-media posts
that appeared in searches (for example a post saying Bellandur was desilted in January) were not
used. One source (Aquarius Systems, hyacinth removal) is a vendor page with no publication date
and is marked low confidence. Another row is an OpenStreetMap mapper's note.

## 1. Foam candidates: failed

Pipeline-analysed scene in each window (one best scene per month): only GT07 (Varthur, 19 Dec
2021) had one, and it showed no foam. For context, STAC lists every Sentinel-2 scene in each
window, and a supplementary test applied the same water mask, haze QC and foam rule to **every
scene up to 50% tile cloud**:

| Event | Window | S2 scenes (tile cloud) | Any usable? | Foam found |
| --- | --- | --- | --- | --- |
| GT01 Varthur May 2017 | 22 May-3 Jun | 1 (64%) | no | n/a |
| GT02/03 Aug 2017 | 11-22 Aug | 1 (99%) | no | n/a |
| GT04 Bellandur Sep 2018 | 20-30 Sep | 2 (100%, 78%) | no | n/a |
| GT05 Varthur Sep 2018 | 20 Sep-1 Oct | 3 (100, 78, 28%) | 1 Oct | 0 ha (water mask 0 ha) |
| GT06 Varthur Mar 2019 | 25 Feb-10 Mar | 3 (8, 25, 17%) | all three | 0 ha on each |
| GT07/08 Dec 2021 | 9-19 Dec | 2 (83, 0.5%) | 19 Dec | 0 ha on both lakes |

- Most foam spills follow heavy rain, so the satellite sees cloud: 4 of the 8 events (GT01-04)
  had no usable scene at all.
- **Recall on events with a usable scene: 0 of 4** (GT05, GT06, GT07, GT08), 0 of 8 overall.
- **Precision:** the pipeline raised one foam candidate event (Bellandur, Aug 2022, 6.3 ha). No
  ground-truth foam falls near it, and it is almost certainly thin cloud over the lake (see
  docs/candidates.md). Precision is 0 of 1, a lower bound.
- Possible reasons, **not tested**: Varthur's foam spills over the bund onto the road, outside
  the search region (outline plus 100 m); foam may be thinner or duller than the brightness and
  saturation rule assumes; sub-5-pixel patches are discarded. GT07/GT08 are state reports and may
  not correspond to foam on the water that day.

Conclusion: the foam rule as built is not demonstrated to detect foam. Do not present its
output as foam evidence.

## 2. Water-level events: mostly supported

Each event is scored against the pipeline's monthly series using the **observation date** of
the scene, with a 10-day window around dated events (about two Sentinel-2 revisits). An event
with no observation in its window is "not observed", not a miss. Expected-low events are a hit
if the area is in the lake's lowest quartile **and** at most 0.6 of its median; partial if below
the median. Expected-high mirrors this with 1.25. Short events use the most extreme observation,
long states the mean.

| Event | Observation | Area (ha) vs lake median | Outcome |
| --- | --- | --- | --- |
| GT15 Bellandur dewatering, 2021 | 12 monthly obs, mean | 13.8 vs 61 (ratio 0.23) | hit |
| GT16 Bellandur overflow, Aug-Sep 2022 | 5 Sep 2022 | 133.7 vs 61 (ratio 2.2, 95th percentile) | hit |
| GT17 Varthur overflow, Aug-Sep 2022 | 16 Aug and 20 Sep only | 11.8 and 13.4 | **not observed in time** |
| GT18 Bellandur "playground", Mar 2024 | 13 Mar 2024 | 43.8 vs 61 (0.71) | partial |
| GT19 Varthur cut off, Mar 2024 (low confidence) | 13 Mar 2024 | 5.7 vs 25 (0.23) | hit |
| GT20 Ulsoor almost dry, 16 Feb 2026 | 1 Feb and 3 Mar | 27.2 and 0.6 | **not observed in time** |
| GT21 Ulsoor drained, 27 Feb 2026 | 3 Mar 2026 | 0.6 vs 29 (0.02) | hit |
| GT22 Ulsoor desilting, Apr 2026 | 22 Apr 2026 | 0.0 vs 29 | hit |
| GT23 Ulsoor drained, 7 May 2026 | 12 May 2026 | 20.3 vs 29 (0.7) | partial |
| GT24 Ulsoor lakebed exposed, 12 May 2026 | 12 May 2026 | 20.3 vs 29 (0.7) | partial |

What stands out:

- Ulsoor's drained state is captured (0.6 ha on 3 Mar, 0.0 ha on 22 Apr, versus about 29 ha
  normally), and Bellandur's dewatering and 2022 overflow are clearly visible.
- **Unresolved disagreement (GT23/24).** On 22 Apr the Ulsoor bed is bare soil (0 ha), but on 12
  May the same bed holds dark green water with strongly positive MNDWI (about 17 ha optical, 20
  ha fused): `docs/media/ulsoor/validation_apr_vs_may_2026.png`. The articles of 7 and 12 May
  describe a drained lake. Either the lake partly refilled by early May and the articles lag, or
  the water is something else (for example turbid pooled water or algae-covered pools). These data
  cannot say which; the imagery is unambiguous that open water is present on 12 May.
- Varthur's 2022 overflow is not visible: neighbouring observations (16 Aug, 20 Sep) show
  11.8 and 13.4 ha, below its median of 24.6, while radar reads 40-44 ha for those months.
  Optical and radar disagree by a factor of three there, and floating vegetation over Varthur's
  water would hide it from optical indices.

### Scoring rules were changed after a first pass (and why)

The first version scored by the percentile of the month's area and averaged months. That gave
7 hits, 2 partials and 1 miss and was **wrong in two ways**: Ulsoor's Feb 2026 "hit" was an area
of 27 ha against a 29 ha median (low only because the lake barely varies, and the scene predates
the draining), and Bellandur's 2022 overflow was diluted by averaging in a pre-event scene. The
rules were changed to the ones above on those grounds, not to improve scores; the revised result
is *less* flattering (two events become "not observed").

## 3. Pipeline events vs ground truth (precision is a lower bound)

| Event type | Pipeline events | Matched to a compatible ground-truth row | Note |
| --- | --- | --- | --- |
| extent_low | 2 | 2 | Ulsoor Mar and Apr 2026 |
| extent_high | 2 | 0 | Varthur Feb and Mar 2026: no ground truth either way |
| rapid_change | 13 | 2 | |
| foam_candidate | 1 | 0 | likely cloud |
| floating_mat_candidate | 53 | 0 | one ground-truth row, not observed: unvalidated |
| chlorophyll_high_candidate | 25 | 0 | no ground-truth type exists: unvalidated |

"Matched" means within 5 days (foam), 15 (floating), or 45 (water level) of a compatible row.
Because the ground truth is incomplete, unmatched events may be real. The two extent_low events
are the only strong positive.

## 4. Water-mask agreement with JRC

JRC Global Surface Water v1.3 (Landsat, 30 m, 1984-2020; free, via Planetary Computer). Compared
on our 10 m grid within the outline plus 100 m, using our Sentinel-2 water frequency (clean
months, 2016-2020) against JRC **occurrence** (share of observations that were water) and our
2020 months against JRC **seasonality** (months with water in 2020). Different sensors,
resolutions and periods, so this is a sanity check, not an accuracy figure.

| Lake | Occurrence IoU at 25% | at 50% | Rank corr. | Seasonality 2020 IoU at 25% | at 50% |
| --- | --- | --- | --- | --- | --- |
| Bellandur | 0.73 | 0.79 | 0.88 | 0.77 | 0.45 |
| Varthur | 0.74 | **0.18** | 0.93 | 0.45 | **0.00** |
| Ulsoor | 0.85 | 0.76 | 0.87 | 0.84 | 0.82 |

Water area at the 50% cut: Bellandur 78 ha (ours) vs 79 ha (JRC); Varthur 15 vs 8 ha; Ulsoor
29 vs 23 ha. Failures: Varthur's persistent-water area is small and JRC sees almost none of it
at 50%, so IoU collapses (a few hectares of disagreement); JRC occurrence never reaches 75% for
any of these lakes, so the strictest cut has no overlap to measure; only 6-8 clean months fall in
2020, so seasonality is noisy. Both products miss water hidden under floating vegetation.

## What this does and does not show

- Supported: open-water extent (broad agreement with JRC; Ulsoor's 2026 draining; Bellandur's
  2021 dewatering and 2022 overflow).
- **Not supported:** foam candidates, floating-mat flags, chlorophyll flags, anomaly "follows rain"
  links, and encroachment (the two court orders are catchment matters outside the OSM outline plus
  100 m, so they are not testable here; Phase 5 found no water replaced by buildings).
- Next steps that would strengthen it: more dated sources per lake (including non-English and
  citizen photos), a foam search region that includes outlet roads, analysis of every low-cloud
  scene instead of one per month, and field-checked polygons.
