# Radar (Sentinel-1) and optical/radar fusion, Phase 3

Why: optical imagery is blocked by cloud, and in Phase 2 about 20% of lake-months had no
usable optical scene (mostly the monsoon). Radar sees through cloud, so it fills those months.
Code: `pipeline/src/tidemark/{sar,fusion,monthly}.py`. Status: **unvalidated**; see "Evidence"
and "Known limits".

## Radar water mask

1. Sentinel-1 RTC (Planetary Computer `sentinel-1-rtc`): 10 m, VV and VH, **linear gamma-0
   power**, no-data -32768. Units confirmed on real pixels (in-lake 5th percentile -19 dB,
   surrounding land median about -6 dB). About 24-36 scenes per year over Bengaluru, almost all
   descending, so 2-3 per month.
2. Per scene: Lee speckle filter (5x5, ENL 4.4 from the product metadata), convert to dB.
3. Water = VV below **-14 dB** (fixed). See "Evidence" for why not Otsu and why not -18 dB.
4. Cleanup as for optical (opening, tiny blobs removed, tiny holes filled).
5. Scenes covering under 90% of the lake region are skipped. Per month, scenes are combined by
   per-pixel majority vote (ties count as water), which damps wind and speckle noise.

## Fusion rule (per lake-month, per pixel)

- Optical-valid pixels (not cloud, shadow, cirrus or no-data in the SCL) keep the optical answer.
- Pixels hidden by cloud are filled from radar where radar is valid.
- Source label: `optical` if optical covers at least 98% of the lake region; `radar` if it
  covers under 50% or is missing; otherwise `fused`. Pixels with no valid sensor are unknown and
  excluded from the area (`known_fraction` reports how much of the region has an answer).
- Water is kept only in the 100 m buffered lake region, in components touching the lake outline.
- `confidence` is a heuristic ranking aid, not a probability: optical rows reuse the Phase 2
  confidence; radar rows use 0.7 (the calibrated mean agreement, below) times 0.8 if only one
  scene; fused rows mix the two by area.
- For months where optical is clean and radar is also available, `optical_radar_iou` records
  their agreement.

Outputs: `data/monthly/<lake>.parquet` (one row per month) and
`data/monthly/<lake>/<YYYY-MM>.geojson` (fused extent).

## Evidence for the -14 dB threshold

`pipeline/scripts/calibrate_radar.py` compares radar masks with clean optical masks (optical
covers at least 98% of the lake region, at least 5 ha of water), using the radar scene closest in
date to the optical one. 41 lake-months (14 each for Bellandur and Varthur, 13 for Ulsoor).
Raw numbers: `docs/radar_calibration.csv`. Mean IoU (intersection over union) against optical:

| Radar rule | Mean IoU |
| --- | --- |
| Fixed -18 dB (common textbook value) | 0.38 |
| Per-scene Otsu | 0.53 |
| Otsu when plausible, else fixed -14 dB | 0.70 |
| **Fixed -14 dB** | **0.71** (leave-one-out 0.71) |
| Best threshold chosen per scene (oracle, unattainable) | 0.73 |

By lake at -14 dB: Bellandur 0.74, Ulsoor 0.79, Varthur 0.60.

What went wrong with the first design: I assumed the usual "water is below -18 dB". Bellandur
(and to a lesser degree Varthur) shows up as a clear dark area at about -12 dB, because its
surface is not smooth open water (floating vegetation, froth, sewage). A -18 dB cut caught only
fragments and gave areas swinging between 13 and 65 ha across three July 2023 scenes. Per-scene
Otsu also failed when it split land classes (threshold near -6 dB, IoU about 0.05).

## Known limits

- **The reference is optical, which is itself unvalidated.** Agreement of 0.7 means the two
  sensors broadly see the same lake, not that either is right. Phase 6 compares against JRC and
  dated ground truth.
- **One fixed threshold was chosen on the same 41 months it is evaluated on.** Leave-one-out
  suggests little overfitting (one parameter), but it is not an independent test.
- **Varthur agreement is lower (0.60).** Radar and optical define "water" differently over
  vegetated or partly covered water.
- **Dark is not always water.** Smooth tarmac, wet bare soil or radar shadow can be dark in VV;
  restricting to the buffered lake region limits but does not remove this.
- **Wind and rain roughen water**, making it brighter, so radar can under-detect on windy dates.
- **Rain-soaked and flooded land** can look like water; no flood masking is done.
- **Mixed-sensor months.** In `fused` months part of the lake is optical and part radar, so
  their definitions of water are blended along the cloud boundary.

## Results of the first full run (2016-01 to 2026-11, 131 months per lake)

| Lake | Optical | Fused | Radar | No data | Phase 2 optical-only months |
| --- | --- | --- | --- | --- | --- |
| Bellandur | 74 | 25 | 31 | 1 | 99 |
| Ulsoor | 74 | 28 | 28 | 1 | 102 |
| Varthur | 73 | 32 | 25 | 1 | 105 |

Months with an extent rose from 99-105 to 130 per lake. The one month with nothing is March 2016
(all optical scenes cloudy and no Sentinel-1 scene in the archive for that month).

Radar vs optical on the 211 months where both are available and optical is clean (not the same
set as the 41-month calibration):

| Lake | Median radar / optical area | Correlation | Median IoU, months >= 5 ha of water |
| --- | --- | --- | --- |
| Bellandur | 1.12 | 0.87 | 0.68 |
| Ulsoor | 0.92 | 0.83 | 0.83 |
| Varthur | 1.03 | 0.89 | 0.58 |

Radar is not strongly biased in area (within about 12% at the median) and tracks optical well
over time, but pixel-level overlap is moderate, especially for Varthur. Months with under 5 ha of
water have near-zero overlap (IoU is unstable for tiny areas) and should not be read as precise.

Radar-only months average larger areas than optical-only months (Bellandur 90 vs 54 ha). That is
expected, since radar-only months are the cloudy monsoon months when lakes are fuller; it should
not be read as a sensor bias. Still, a series that changes sensor can show small artificial steps,
so the `source` column must travel with every plotted value.
