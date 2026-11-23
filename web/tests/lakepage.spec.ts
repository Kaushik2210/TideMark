import { expect, test } from "@playwright/test";

test("lake page: no sideways page scroll, events are collapsed until expanded", async ({ page }) => {
  await page.goto("/lakes/bellandur/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const rows = page.locator("#events-h ~ div ol > li");
  await expect(rows).toHaveCount(8);
  await page.getByRole("button", { name: /Show all \d+ events/ }).click();
  expect(await rows.count()).toBeGreaterThan(8);
  await page.getByRole("button", { name: "Show fewer" }).click();
  await expect(rows).toHaveCount(8);

  // Filtering resets to the first page of the filtered list.
  await page.getByRole("button", { name: /Foam candidate/ }).click();
  await expect(rows).toHaveCount(1);
});

test("lake page: jump links point at real sections", async ({ page }) => {
  await page.goto("/lakes/ulsoor/");
  for (const a of await page.getByRole("navigation", { name: "On this page" }).getByRole("link").all()) {
    const id = (await a.getAttribute("href"))!.slice(1);
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
});
