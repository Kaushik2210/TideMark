# Does rain move the lakes? (rain response)

`tidemark-rain-response` writes `data/rain_response/<lake>.json`; the website shows it on each lake page.

**Question.** Are wetter-than-usual months followed by more (or less) open water, and after how many months?

**Method** ([`rain_response.py`](../pipeline/src/tidemark/rain_response.py)).
1. Monthly ERA5 rain (from the daily Open-Meteo series) and monthly open-water area are each turned into a
   *seasonal anomaly*: the month minus that lake's median for the same calendar month. This stops the shared
   monsoon cycle from creating a correlation on its own.
2. For lags of 0 to 3 months, the Spearman rank correlation between the rain anomaly in month *t* and the area
   anomaly in month *t + lag*, over months where both exist (optical, fused or radar months; haze-contaminated
   optical months excluded, as in the anomaly flags).
3. A 95% interval from a moving-block bootstrap (6-month blocks, 2000 resamples, fixed seed), because
   neighbouring months resemble each other and a plain bootstrap would be too optimistic.
4. A lag is called "clear" only if its interval excludes zero and at least 30 months are paired.

**Result (this data, 2016 to 2026).** No lake shows a clear link at any lag: every interval includes zero.
Correlations are small (about -0.12 to +0.19). The method is tested on synthetic data where it finds a built-in
one-month lag and finds nothing in unrelated series (`pipeline/tests/test_rain_response.py`), so the null result
is not the method failing to see an effect that is there at that size.

**Limits.** The rain is regional (about 28 km grid); Bellandur and Varthur are fed largely by sewage that does not
depend on rain; a month hides the order of events within it; radar and optical define water slightly differently;
and this is association, never proof of cause. A null at monthly resolution does not mean rain never matters at
shorter timescales or for single storms.
