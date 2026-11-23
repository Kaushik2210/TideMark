# Monthly automation

[`.github/workflows/monthly.yml`](../.github/workflows/monthly.yml) runs on the 5th of each month (and on
demand from the Actions tab). It:

1. re-processes the last 3 months (`tidemark-update --months 3`): Sentinel-2 water, Sentinel-1 radar,
   fusion, bloom/foam candidates, rainfall, anomalies, health score, web export;
2. runs ruff and pytest, builds the website and runs the Playwright smoke tests on the new data;
3. opens a **pull request** with the changed `data/` and `web/public/` files. It never pushes to `main`.

## Safety rules built in
- **Cold cache cannot erase history.** Raw per-month caches are not in git. Tables are rebuilt from
  whatever is cached, so the updater merges back every previously published month it did not recompute
  and aborts (no PR) if any table still has fewer months than before.
- **Recent months are recomputed**, older months are left alone.
- **A human merges.** The PR body asks for a skim of the changed months. Nothing is auto-merged.
- Not refreshed monthly: encroachment, ghost lakes, validation (these change by editing data).

## Setup
- Optional repository secret `PC_SDK_SUBSCRIPTION_KEY` (Planetary Computer works without it, with lower rate limits).
- Settings > Actions > General: allow workflows to create pull requests.
- If a month fails halfway the run fails visibly and no PR is opened.

## Known limits
- PRs opened with the default `GITHUB_TOKEN` do not trigger other workflows; that is why the monthly job
  runs the tests itself before opening the PR.
- GitHub disables scheduled workflows after 60 days without repository activity.
- The first run after a long gap re-processes only the window; months in between would stay missing.
  Use the `months` input (for example 12) to backfill.
- Open-Meteo's free tier is non-commercial; see DATA_SOURCES.md.
