import { expect, test } from "@playwright/test";

test("home: map renders, slider changes the month, no horizontal scroll", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const map = page.getByTestId("lake-map");
  await expect(map).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  const box = await map.boundingBox();
  expect(box!.height).toBeGreaterThan(150); // regression: MapLibre once collapsed it to 0px
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  const before = await page.getByTestId("month-label").innerText();
  await page.getByTestId("month-range").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("month-label")).not.toHaveText(before);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("every lake page renders its health card, charts and method disclosure", async ({ page }) => {
  for (const id of ["bellandur", "varthur", "ulsoor"]) {
    await page.goto(`/lakes/${id}/`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/how is this calculated/i)).toBeVisible();
    expect(await page.locator("svg[role='img']").count()).toBeGreaterThan(0);
  }
});

test("methodology and data pages state the research-not-official disclaimer", async ({ page }) => {
  for (const path of ["/methodology/", "/data/"]) {
    await page.goto(path);
    await expect(page.getByText(/not an official|research/i).first()).toBeVisible();
  }
});

test("data JSON is strictly valid (no NaN tokens)", async ({ request }) => {
  for (const f of ["lakes.json", "events/bellandur.json", "health/bellandur.json", "series/ulsoor.json"]) {
    const res = await request.get(`/data/${f}`);
    expect(res.ok(), f).toBeTruthy();
    const text = await res.text();
    expect(() => JSON.parse(text), f).not.toThrow();
  }
});
