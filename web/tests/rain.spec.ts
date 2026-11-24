import { expect, test } from "@playwright/test";
import { interpretRain, lagLabel } from "../src/lib/rainwords";
import type { RainResponse } from "../src/lib/types";

const base: RainResponse = {
  lake_id: "x", months: 120, method: "m", block_months: 6, resamples: 2000, best_lag: null, direction: null, caveats: ["c"],
  lags: [0, 1, 2, 3].map((lag) => ({ lag, rho: 0.05, ci: [-0.2, 0.3] as [number, number], n: 120, clear: false })),
};

test.describe("rain wording", () => {
  test("no clear interval means the page says the data cannot tell", () => {
    const r = interpretRain(base, "Ulsoor Lake");
    expect(r.headline).toContain("no clear link");
    expect(r.detail).toContain("includes zero");
  });
  test("a clear positive lag is reported with its numbers and as an association", () => {
    const r = interpretRain({ ...base, best_lag: 1, direction: "more water", lags: base.lags.map((l) => (l.lag === 1 ? { ...l, rho: 0.41, ci: [0.2, 0.6], clear: true } : l)) }, "X");
    expect(r.headline).toContain("more open water one month later");
    expect(r.detail).toContain("0.41");
    expect(r.detail).toContain("not proof");
  });
  test("a negative lag says less water", () => {
    const r = interpretRain({ ...base, best_lag: 0, direction: "less water" }, "X");
    expect(r.headline).toContain("less open water in the same month");
  });
  test("lag labels", () => {
    expect([0, 1, 3].map(lagLabel)).toEqual(["same month", "+1 month", "+3 months"]);
  });
});

test("lake pages show the rain-response chart with its numbers and caveats", async ({ page }) => {
  for (const id of ["bellandur", "varthur", "ulsoor"]) {
    await page.goto(`/lakes/${id}/`);
    await expect(page.getByRole("heading", { name: "Does rain move the lake?" })).toBeVisible();
    await expect(page.locator("#rain-h").locator("..").getByRole("img")).toHaveCount(1);
    await page.locator("#rain-h").locator("..").getByText("View the numbers").click();
    expect(await page.locator("#rain-h").locator("..").locator("tbody tr").count()).toBe(4);
    await page.locator("#rain-h").locator("..").getByText(/what it cannot say/).click();
    await expect(page.getByText(/ERA5 rain on a ~28 km grid/)).toBeVisible();
  }
});
