import { expect, test } from "@playwright/test";
import { describeAnomaly, monthlyAnomalies, stripeColor } from "../src/lib/anomaly";
import type { Row } from "../src/lib/types";

const mk = (month: string, area: number | null): Row => ({
  month, source: area === null ? "none" : "optical", area_ha: area, unc_ha: 1, confidence: 1, optical_date: null,
  optical_coverage: 1, optical_ha: area, radar_ha: null, radar_scenes: null, ndci_median: null, fai_frac: null,
  floating_mat: null, foam_ha: null, haze: null, chl_high: null, rain_mm: null,
});

test.describe("anomaly maths", () => {
  // Ten years of a pure seasonal cycle plus small noise, with one dry January.
  const rows: Row[] = [];
  for (let y = 2016; y < 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      const base = 50 + 30 * Math.sin(((m - 1) / 12) * 2 * Math.PI);
      rows.push(mk(`${y}-${String(m).padStart(2, "0")}`, base + ((y * 7 + m * 3) % 5) - 2));
    }
  }
  rows[(2020 - 2016) * 12] = mk("2020-01", 5); // January 2020 is far below the usual January

  test("the normal seasonal cycle is removed; only the unusual month stands out", () => {
    const a = monthlyAnomalies(rows);
    const odd = a[(2020 - 2016) * 12];
    expect(odd.z!).toBeLessThan(-3);
    const typical = a.filter((_, i) => i !== (2020 - 2016) * 12).map((x) => Math.abs(x.z!));
    expect(typical.filter((z) => z > 3).length).toBe(0);
  });

  test("months without a scene stay null and do not distort the others", () => {
    const withGap = rows.map((r, i) => (i === 30 ? mk(r.month, null) : r));
    const a = monthlyAnomalies(withGap);
    expect(a[30].z).toBeNull();
    expect(a[31].z).not.toBeNull();
  });

  test("colours are diverging, clamped, and absent for gaps", () => {
    expect(stripeColor(null)).toBe("transparent");
    expect(stripeColor(-9)).toBe(stripeColor(-2.5));
    expect(stripeColor(0)).toBe("rgb(238, 238, 238)");
    expect(stripeColor(-2)).not.toBe(stripeColor(2));
  });

  test("a z-score is described in words", () => {
    expect(describeAnomaly(0.2)).toBe("close to usual");
    expect(describeAnomaly(-1)).toBe("below usual");
    expect(describeAnomaly(2.2)).toBe("well above usual");
  });
});

test("stripes: keyboard moves through months and lakes, and the image downloads", async ({ page }) => {
  await page.goto("/lakes/");
  const group = page.getByRole("group", { name: /Water stripes/ });
  await group.scrollIntoViewIfNeeded();
  await group.focus();
  const readout = page.locator('[data-testid="stripes"] p[aria-live="polite"]');
  await expect(readout).toContainText("Nov 2026, Bellandur");
  await page.keyboard.press("ArrowDown");
  await expect(readout).toContainText("Varthur");
  await page.keyboard.press("Home");
  await expect(readout).toContainText("Jan 2016");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(readout).toContainText("Jan 2017");

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save as image (PNG)" }).click()]);
  expect(dl.suggestedFilename()).toBe("tidemark-water-stripes.png");
  const fs = await import("node:fs");
  const buf = fs.readFileSync((await dl.path())!);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  expect(buf.length).toBeGreaterThan(20_000);
});
