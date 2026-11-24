import type { RainResponse } from "./types";

const LAG_WORDS = ["in the same month", "one month later", "two months later", "three months later"];

/**
 * One honest sentence for the result. A clear link is only claimed when the bootstrap interval excludes zero;
 * otherwise the sentence says the data cannot tell, which is a finding in itself, not a gap to be filled.
 */
export function interpretRain(r: RainResponse, lake: string): { headline: string; detail: string } {
  if (r.best_lag !== null && r.direction) {
    const t = r.lags.find((l) => l.lag === r.best_lag)!;
    const sign = r.direction === "more water" ? "more" : "less";
    return {
      headline: `Rainier-than-usual months tend to be followed by ${sign} open water ${LAG_WORDS[r.best_lag]}.`,
      detail: `Strongest at ${LAG_WORDS[r.best_lag]}: rank correlation ${(t.rho ?? 0).toFixed(2)}, 95% interval ${(t.ci[0] ?? 0).toFixed(2)} to ${(t.ci[1] ?? 0).toFixed(2)}, from ${t.n} months. This is an association, not proof that rain caused it.`,
    };
  }
  return {
    headline: `At monthly resolution, ${lake}'s water area shows no clear link to regional rain.`,
    detail: "Every interval below includes zero, so the data cannot separate a real effect from chance. Possible reasons, not tested here: inflow and management that rain alone does not explain, rain that is regional rather than local, and a month being too coarse to see a quick response.",
  };
}

export function lagLabel(lag: number): string {
  return lag === 0 ? "same month" : `+${lag} month${lag > 1 ? "s" : ""}`;
}
