import { expect, test } from "@playwright/test";
import { describeChange } from "../src/lib/digest";
import type { Row } from "../src/lib/types";

const row = (over: Partial<Row>): Row => ({
  month: "2026-11", source: "optical", area_ha: 10, unc_ha: 1, confidence: 1, optical_date: null, optical_coverage: 1,
  optical_ha: 10, radar_ha: null, radar_scenes: null, ndci_median: null, fai_frac: null, floating_mat: null,
  foam_ha: null, haze: null, chl_high: null, rain_mm: null, ...over,
});

test.describe("digest wording", () => {
  test("a change inside the combined uncertainty is not reported as news", () => {
    const text = describeChange(row({ area_ha: 10.5 }), row({ area_ha: 10, month: "2026-10" }), "Oct 2026");
    expect(text).toContain("within the measurement uncertainty");
    expect(text).not.toMatch(/^(Up|Down)/);
  });
  test("a clear change says up or down and gives the size", () => {
    expect(describeChange(row({ area_ha: 30 }), row({ area_ha: 10, month: "2026-10" }), "Oct 2026")).toMatch(/^Up 20\.0 ha/);
    expect(describeChange(row({ area_ha: 5 }), row({ area_ha: 20, month: "2026-10" }), "Oct 2026")).toMatch(/^Down 15\.0 ha/);
  });
  test("comparing across sensors, or with a missing month, is stated plainly", () => {
    expect(describeChange(row({ area_ha: 30, source: "radar" }), row({ area_ha: 10, month: "2026-10" }), "Oct 2026")).toContain("different sensors");
    expect(describeChange(row({}), row({ source: "none", area_ha: null, month: "2026-10" }), "Oct 2026")).toContain("no usable scene");
  });
});

test("home: the URL hash restores a shared view and follows later changes", async ({ page }) => {
  await page.goto("/#m=2021-03&lake=ulsoor&base=none");
  await expect(page.getByTestId("lake-map")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.getByTestId("month-label")).toHaveText("Mar 2021");
  await expect(page.getByRole("group", { name: "Focus the map" }).getByRole("button", { name: /Ulsoor/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("base-none")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("base-map").click();
  await page.getByRole("button", { name: "Next month" }).click().catch(() => page.getByRole("button", { name: "›" }).click());
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash).toContain("m=2021-04");
  expect(hash).not.toContain("base=");
});

test("share: copies the link when the share sheet is unavailable", async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
  await page.goto("/lakes/ulsoor/");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("/lakes/ulsoor/");
  await ctx.close();
});

test("updates: plain-language digest, and an Atom feed with real entries", async ({ page, request }) => {
  await page.goto("/updates/");
  await expect(page.getByRole("heading", { level: 1, name: "Monthly updates" })).toBeVisible();
  await expect(page.getByText(/ha of open water/).first()).toBeVisible();
  await expect(page.getByText(/within the measurement uncertainty|Up \d|Down \d/).first()).toBeVisible();

  const res = await request.get("/feed.xml");
  expect(res.headers()["content-type"]).toMatch(/xml/);
  const xml = await res.text();
  expect(xml.match(/<entry>/g)?.length).toBe(12);
  expect(xml).toContain("<feed xmlns=\"http://www.w3.org/2005/Atom\">");
  expect(xml).not.toMatch(/undefined|NaN/);
});

test("contribute: each route opens a prefilled GitHub issue form", async ({ page }) => {
  await page.goto("/contribute/");
  for (const [name, tpl] of [["Report an event", "ground-truth.yml"], ["Share an observation", "observation.yml"], ["Report a problem", "data-problem.yml"]] as const) {
    const href = await page.getByRole("link", { name }).getAttribute("href");
    expect(href).toContain("/issues/new?template=" + tpl);
  }
  await expect(page.getByText(/will not be accepted/i)).toBeVisible();
});

test("embed: a bare panel with the figure, credit and a way back, no site chrome", async ({ page }) => {
  await page.goto("/embed/ulsoor/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ulsoor");
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByText(/not an official assessment/)).toBeVisible();
  await expect(page.getByRole("link", { name: /full record on Tidemark/ })).toHaveAttribute("href", /\/lakes\/ulsoor\//);
});

test("lake page: embed snippet is a real iframe pointing at the panel", async ({ page }) => {
  await page.goto("/lakes/bellandur/");
  await page.getByText("Embed this lake on your own page").click();
  const code = await page.getByLabel("HTML to paste").inputValue();
  expect(code).toMatch(/^<iframe src="https:\/\/kaushik2210\.github\.io\/.*embed\/bellandur\/"/);
  expect(code).toContain("title=");
});

test("link previews: every lake has a real PNG card and the meta tags point at it", async ({ page, request }) => {
  for (const id of ["bellandur", "varthur", "ulsoor"]) {
    const png = await request.get(`/lakes/${id}/og.png`);
    expect(png.headers()["content-type"]).toBe("image/png");
    expect((await png.body()).length).toBeGreaterThan(8000);
  }
  await page.goto("/lakes/varthur/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /lakes\/varthur\/og\.png$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
});
