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

## D-021 No official boundary dataset is used (nothing licensed and machine-readable was found)
Searched for Karnataka/KTCDA and related open data. Found lists published as PDFs without
polygons, a crowdmapped masterlist with no stated licence, and a GIS portal not examined (see
DATA_SOURCES.md). The OSM outline therefore stays the boundary, and every encroachment figure says
"relative to the OSM outline". A licensed official dataset, if obtained, would replace it by
changing `pipeline/config/lakes.yaml`.

## D-022 Ghost Lakes are approximate points from Wikipedia, in their own CC BY-SA file
The only open source found with per-lake coordinates and "what is there now" is the Wikipedia
Former reservoirs table. Features are points marked `location_approximate`; no outline is drawn or
implied. WorldCover built-up share within 300 m is added as independent evidence. One row carries an
asterisk that the table does not explain; it is kept and flagged. The file is CC BY-SA 4.0 and kept
separate from the CC BY data.

## D-023 WorldCover is a snapshot; a spectral built-up proxy was tried and dropped
WorldCover 2020 (v100) and 2021 (v200) are different algorithm versions, so they are used as
snapshots only, never as a change signal. I first tried a Sentinel-2 NDBI/NDVI built-up rule
calibrated to WorldCover 2021 (F1 0.76, precision 0.70, recall 0.83 outside the outlines).
Two things sank it: the optimum was a plateau where NDBI contributed nothing (any NDBI cut from
-0.6 to -0.12 gave the same score, so the rule was just "NDVI below about 0.4"), and inside the
outlines it tracked dryness, not construction (Varthur "built-up" jumped from 5 ha in 2020 to
138 ha in 2021 while its wet footprint fell to 1 ha, then fell back as the lake refilled). The
calibration grid is kept as `docs/encroachment_ndbi_calibration_grid.csv`.

## D-024 Encroachment candidate = water lost and now built-up, with a range
A pixel counts when it was usually water in 2016-2018, is almost never water in clean optical months
of 2023-2026, and is built-up according to WorldCover 2021 and/or Microsoft building footprints.
Central estimate uses early wet share >= 25% and recent wet share <= 5%; the range comes from a
3x3 grid of those thresholds and from requiring both references (low) or either (high). It is a
satellite candidate relative to the unofficial OSM outline, not a survey or legal finding. Building
footprints are a 2017-2021 snapshot, not a time series.

## D-025 Ground truth only from pages that were opened and read
`validation/ground_truth.csv` rows cite a primary https source whose date and facts were read from
the page itself, never from a search snippet. Social-media posts, Reddit and unread items were
excluded. Rows that are state reports use the publication date and say so. Fires and court orders
are kept as context but marked `none` because nothing here can observe them.

## D-026 Water-level scoring uses observation dates and a size test, after a flawed first pass
The first scorer used a percentile rank of the month's area and averaged months; it produced a
false Ulsoor hit (27 ha against a 29 ha median, from a scene taken before the draining) and diluted
a real Bellandur overflow. It now uses each scene's own date (10-day window), requires the area to be
both in the lowest/highest quartile and at most 0.6 / at least 1.25 of the lake median, and uses the
most extreme observation for short events. Events with no observation in their window are "not
observed". Both versions are described in VALIDATION.md.

## D-027 Precision of pipeline events is reported only as a lower bound
The ground truth is incomplete and biased towards dramatic news events, so an unmatched pipeline event
is not a false positive.

## D-028 A foam supplementary test uses every low-cloud scene, not just the monthly best
To avoid blaming the method for the monthly best-scene design, foam windows were also tested on all
Sentinel-2 scenes up to 50% tile cloud. It still found no foam.

## D-029 The website uses no tile key: the map is data-first and street tiles are opt-in
The default map draws only our own layers (OSM-derived outlines, satellite extents, ghost-lake points)
on a plain background, so the site works with no account or key. CARTO basemaps need a key that was not
created. OpenStreetMap's public tile server is available behind a "Street map context" switch that is
off by default, so no tile request is made unless a visitor asks. The OSM tile usage policy allows light,
attributed use but not heavy traffic; `NEXT_PUBLIC_BASEMAP_URL` / `NEXT_PUBLIC_BASEMAP_ATTRIBUTION`
let a deployment swap in a provider that permits its load.

## D-030 Static export, with the MapLibre worker served as a separate file
The site is a static Next.js export (no server needed, hostable anywhere). MapLibre 6 is ESM-only and
its worker is not bundled, so `scripts/copy-maplibre-worker.mjs` copies the worker to `public/maplibre/`
as `.js` (some static hosts serve `.mjs` as text/plain) and the map registers it with `setWorkerUrl`.
The map container sits inside a wrapper div because MapLibre forces `position: relative` on its own
element, which collapsed an `absolute inset-0` container to zero height (caught by the smoke test).

## D-031 Citizen photos: row-level security, not the website, guarantees moderation
The public (anon) role can only insert `pending` rows and upload to a private bucket; it can read only
`approved` rows and only public columns. Approval needs the service-role key, which is never shipped.
Plain `fetch` against Supabase's REST/Storage endpoints is used instead of `supabase-js` to avoid a
dependency for three calls. The browser generates the row id so no read-back of pending rows is needed.

## D-032 Photos are re-encoded in the browser to strip EXIF and downsized
Canvas re-encoding drops GPS and camera metadata before upload and caps size at 2000 px / 5 MB. Cost:
a lossy re-encode and no server-side check. Uploads stay switched off (with an explanation) when no
project is configured, so a fork never shows a form that cannot work.

## D-033 Report card is drawn on a canvas in the browser
No image service or screenshot dependency. It carries the not-official disclaimer and the health
score's sensitivity range, so a shared PNG keeps its uncertainty.

## D-034 The monthly job re-processes a window and opens a PR, it does not rebuild or auto-merge
A full rebuild takes hours and needs data that is not in git. The job refreshes the last 3 months
(late scenes can change them), merges every older published month back in, aborts if any table shrank,
and opens a pull request for a human to skim. Cost: gaps older than the window need a manual backfill
(`months` input). Tests and the site build run inside the job because PRs created with the default token
do not trigger CI.

## D-035 Basemap: OpenFreeMap vector tiles, on by default (supersedes the opt-in part of D-029)
OpenFreeMap needs no key or sign-up, serves OpenStreetMap data as vector tiles, and has a dark style for
dark mode and Positron for light mode, so the map now shows roads, places and context under the lake
layers. Visitors' browsers request tiles from tiles.openfreemap.org; a "Base map" switch hides it. If the
style cannot be fetched within 6 s the map falls back to a plain background so the data layers still
work. Attribution comes from the style (shown in the map's attribution control). OpenFreeMap is a
donation-funded service with no stated request limit; heavy traffic should self-host or switch provider via
`NEXT_PUBLIC_BASEMAP_STYLE_URL`.

## D-036 Satellite base map: EOX Sentinel-2 cloudless, opt-in, non-commercial terms
A three-way "Base map" choice (Map, Satellite, None) replaces the on/off switch. Satellite uses the EOX
Sentinel-2 cloudless 2025 mosaic (10 m, upsampled beyond zoom 14): the same kind of data Tidemark analyses,
no key needed. EOX's WMTS is free and open for non-commercial applications provided the attribution is
shown; Tidemark is a non-commercial research project, and commercial reuse of this site would need
EOX's terms checked or a different source (`NEXT_PUBLIC_BASEMAP_STYLE_URL` only swaps the vector style,
so a commercial fork must change the tile URL in LakeMap.tsx). Esri World Imagery was rejected because
it requires an ArcGIS licence. Satellite tiles are requested only after a visitor chooses Satellite, and
the UI states that the mosaic is a yearly composite, not the image behind the month being shown.

## D-037 UI pass: compact events, section navigation, readable charts on phones, automated a11y check
The flagged-events list made a lake page about 8,700 px tall. It is now a compact list (date, event, rain
context, evidence chip) showing the 8 most recent with "Show all", and the repeated validation notes moved
into one "What do the evidence labels mean?" disclosure. Lake pages gained a header action row (report
card, CSV) and an "On this page" jump list. Charts keep a 640 px minimum width and scroll sideways on small
screens instead of shrinking to unreadable text. Lake list cards show a sparkline and the health score
range; the methodology table uses colour-coded status chips (the status word is always present, colour is
supplementary). An axe-core scan (WCAG 2.2 AA) over every page in dark and light mode now runs in the test
suite; it excludes MapLibre's own canvas and controls.

## D-038 Three.js and GSAP: a 3D seasonal landscape and scroll motion, both optional enhancements
**3D:** each lake page has a "seasonal landscape": one bar per month, laid out by calendar month (left to
right) and year (back to front), height = open-water area, colour = data source. It shows the monsoon
cycle and the long decline at a glance, which a line chart shows less directly. It is a view of the same
numbers (not new data), scaled to each lake's own maximum and labelled as such, so lakes cannot be compared
by eye. Built with Three.js (one instanced mesh, render-on-demand, paused off-screen, fully disposed on
unmount). The library (~0.5 MB) is only fetched when the section nears the viewport. It is operable
without a pointer (arrow keys read months, buttons set the camera view), announces readings through an
aria-live line, and degrades to a message pointing at the chart and table when WebGL is unavailable.
**GSAP:** scroll-triggered reveals and number count-ups. Every animation runs inside a
`prefers-reduced-motion: no-preference` match, so with reduced motion (or before JS runs) content is simply
shown in its final state; the count-up exposes only the final number to screen readers. GSAP is not MIT:
it uses GSAP's own licence (free to use, see gsap.com/community-license); check it before any commercial
fork. Three.js is MIT.

## D-039 Home page interactivity: linked map and table, scrubbable trends, jump-to-event
Hovering or tapping a lake's water on the map shows its figure for the month in a card, and emphasises the
matching table row (and hovering a row emphasises the lake on the map). Each row has a trend line with a
marker at the selected month that can be dragged to change the month (pointer only; the slider remains the
keyboard and screen-reader control, so the trend is aria-hidden). Figures tween between months with GSAP and
expose only the final value to assistive technology. "Jump to a reported event" buttons are generated from
the validation set (events the satellite record hit or partly matched), and open the month with the lowest
or highest area inside the reported window, so they point at evidence rather than at hand-picked dates. The
side panel enters with a short staggered GSAP animation, skipped with reduced motion. No 3D on the home page:
the map is the main object and a second WebGL scene would cost load time without adding information.

## D-040 Lakes page: one shared-axis comparison chart, linked cards, GSAP Flip sorting
The three lakes differ hugely in size, so the page now leads with a comparison chart: hectares or share of
the (unofficial) OpenStreetMap outline, 2016-on / 5 years / 2 years, lakes toggled on and off (at least one
stays on). Lines differ by colour and dash pattern. The chart scrubs by pointer and by keyboard (arrows,
Shift for a year, Home/End), with a live text readout and a full table alternative. The cards share the
selected month with the chart, can be re-sorted (GSAP Flip glides them; skipped with reduced motion), and
each card's trend line is also a scrubber. The share-of-outline view carries a caveat that a small share can
mean a dry bed or built edge inside the outline, not only low water.

## D-041 "Social" without a backend: shareable state, previews, feed, embeds, and reports through GitHub
Tidemark has no server or user accounts, so social features use the web's own plumbing. **Shareable views:**
the home page keeps its state (month, lake, base map, lost lakes) in the URL hash and restores it on load; a
Share button uses the native share sheet and falls back to copying the link. **Link previews:** every lake and
the site get a 1200x630 PNG card drawn at build time from the real series (explicit `.png` routes, because
extensionless static files can be served with the wrong content type). **Monthly digest and Atom feed:**
plain-language updates per lake where every change is compared with the combined measurement uncertainty and a
change inside it is labelled "not a clear change"; sensor switches are flagged; flags are called candidates.
Feed dates come from the data month, not the build time. **Embeds:** `/embed/<lake>/` is a bare panel for an
iframe (no site chrome, not indexed) with a copyable snippet on each lake page. **Contributions:** GitHub issue
forms for dated, sourced events, observations and data problems; accepted events join the validation set with
their source link, so the community can strengthen (or weaken) the project's own checks. The page states what is
not accepted (unsourced claims, accusations beyond a source, personal data). Reports are public on GitHub and
need a free account; that is the cost of having no backend. The Supabase photo upload from Phase 8 remains the
richer path when a project is configured.
