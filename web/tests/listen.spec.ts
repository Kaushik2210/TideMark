import { expect, test } from "@playwright/test";
import { notePlan } from "../src/lib/sonify";
import type { Row } from "../src/lib/types";

const mk = (month: string, area: number | null, source: Row["source"] = "optical"): Row => ({
  month, source: area === null ? "none" : source, area_ha: area, unc_ha: 1, confidence: 1, optical_date: null,
  optical_coverage: 1, optical_ha: area, radar_ha: null, radar_scenes: null, ndci_median: null, fai_frac: null,
  floating_mat: null, foam_ha: null, haze: null, chl_high: null, rain_mm: null,
});

test.describe("note plan", () => {
  const rows = [mk("2020-01", 10), mk("2020-02", null), mk("2020-03", 50, "radar"), mk("2020-04", 100, "fused")];
  const plan = notePlan(rows);

  test("more water is a higher pitch, scaled to the lake's own maximum", () => {
    expect(plan[3].freq!).toBeGreaterThan(plan[2].freq!);
    expect(plan[2].freq!).toBeGreaterThan(plan[0].freq!);
    expect(plan[3].freq! / plan[0].freq!).toBeGreaterThan(5); // 10% to 100% of the range spans about 2.5 octaves
  });
  test("no usable scene is silence, never an invented value", () => {
    expect(plan[1].freq).toBeNull();
    expect(plan[1].areaHa).toBeNull();
  });
  test("timbre follows the data source and January is marked", () => {
    expect(plan.map((n) => n.wave)).toEqual(["sine", "sine", "square", "triangle"]);
    expect(plan[0].newYear).toBe(true);
    expect(plan[1].newYear).toBe(false);
  });
});

test("listen: no audio is created until Play is pressed, and Stop ends it", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __ac: number; AudioContext: typeof AudioContext };
    w.__ac = 0;
    const Orig = w.AudioContext;
    w.AudioContext = class extends Orig { constructor(...a: ConstructorParameters<typeof AudioContext>) { super(...a); w.__ac++; } } as typeof AudioContext;
  });
  await page.goto("/lakes/ulsoor/");
  const section = page.getByTestId("listen");
  await section.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => (window as unknown as { __ac: number }).__ac)).toBe(0);

  await section.getByRole("button", { name: "Play the record" }).click();
  expect(await page.evaluate(() => (window as unknown as { __ac: number }).__ac)).toBe(1);
  await expect(section.getByRole("button", { name: "Stop" })).toHaveAttribute("aria-pressed", "true");
  await expect(section.getByText(/\d{4}: /).first()).toBeVisible();
  await expect(section.getByRole("status")).toHaveText("Playing");

  await section.getByRole("button", { name: "Stop" }).click();
  await expect(section.getByRole("button", { name: "Play the record" })).toBeVisible();
});
