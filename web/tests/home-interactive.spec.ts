import { expect, test } from "@playwright/test";

test("home: jump to a reported event moves the slider and focuses the lake", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("lake-map")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  const chips = page.getByTestId("moments").getByRole("button");
  await expect(chips.first()).toBeVisible();
  const labels = await chips.allInnerTexts();
  expect(new Set(labels).size).toBe(labels.length); // no duplicate shortcuts

  const before = await page.getByTestId("month-label").innerText();
  const first = chips.first();
  const text = await first.innerText();
  await first.click();
  await expect(page.getByTestId("month-label")).not.toHaveText(before);
  const lake = text.split(":")[0];
  await expect(page.getByRole("group", { name: "Focus the map" }).getByRole("button", { name: new RegExp(lake) })).toHaveAttribute("aria-pressed", "true");
});

test("home: scrubbing a lake's trend line changes the month, and figures settle on the real value", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("lake-map")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  const label = page.getByTestId("month-label");
  const before = await label.innerText();
  const svg = page.locator('[data-testid="readout"] svg[viewBox="0 0 240 34"]').first();
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  await expect(label).not.toHaveText(before);
  // After the number tween finishes, the visible figure equals the screen-reader figure.
  const row = page.locator('[data-testid="readout"] tbody tr').first();
  await expect.poll(async () => {
    const vis = await row.locator('td span[aria-hidden="true"]').first().innerText();
    const sr = await row.locator("td span.sr-only").first().innerText();
    return vis === sr;
  }, { timeout: 4000 }).toBe(true);
});

test("home: hovering a table row emphasises that lake without breaking the page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("lake-map")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  const row = page.locator('[data-testid="readout"] tbody tr').first();
  await row.hover();
  await expect(row).toHaveClass(/bg-surface-2/);
  await page.mouse.move(5, 5);
  await expect(row).not.toHaveClass(/bg-surface-2/);
  expect(errors).toEqual([]);
});
