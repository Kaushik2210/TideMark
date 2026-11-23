import { expect, test } from "@playwright/test";

const readout = (page: import("@playwright/test").Page) => page.locator('p[aria-live="polite"]').filter({ hasText: /\d{4}:/ }).first();

test("lakes: measure, range and lake toggles update the chart and the readout", async ({ page }) => {
  await page.goto("/lakes/");
  await expect(readout(page)).toContainText("Bellandur 9.0 ha");

  await page.getByRole("button", { name: "Share of outline" }).click();
  await expect(readout(page)).toContainText("% of outline");
  await expect(page.locator("svg[role='img'] text").filter({ hasText: /%$/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "Hectares" }).click();
  await page.getByRole("button", { name: "Last 2 years" }).click();
  await expect(page.locator("svg[role='img'] text").filter({ hasText: /^2016$/ })).toHaveCount(0);

  const lakes = page.getByRole("group", { name: "Lakes shown" });
  await lakes.getByRole("button", { name: "Ulsoor" }).click();
  await expect(readout(page)).not.toContainText("Ulsoor");
  await lakes.getByRole("button", { name: "Varthur" }).click();
  await lakes.getByRole("button", { name: "Bellandur" }).click(); // would hide the last lake: ignored
  await expect(lakes.getByRole("button", { name: "Bellandur" })).toHaveAttribute("aria-pressed", "true");
});

test("lakes: arrow keys scrub months and the cards follow", async ({ page }) => {
  await page.goto("/lakes/");
  const chart = page.getByRole("group", { name: /Open water over time/ });
  await chart.focus();
  const before = await readout(page).innerText();
  await page.keyboard.press("ArrowLeft");
  await expect(readout(page)).not.toHaveText(before);
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Home");
  await expect(readout(page)).toContainText("Jan 2016");
  await expect(page.getByText("Open water, Jan 2016").first()).toBeVisible();
  await page.keyboard.press("End");
  await expect(readout(page)).toContainText("Nov 2026");
});

test("lakes: sorting reorders the cards and dragging a card's trend line moves the shared month", async ({ page }) => {
  await page.goto("/lakes/");
  const titles = page.locator("main h3, ul h3");
  await expect(titles.first()).toContainText("Bellandur");
  await page.getByRole("button", { name: "Open water", exact: true }).click();
  await expect(titles.first()).toContainText("Varthur"); // 77.6 ha is the largest right now
  await page.getByRole("button", { name: "Name", exact: true }).click();
  await expect(titles.first()).toContainText("Bellandur");

  const before = await readout(page).innerText();
  const trend = page.locator('svg[viewBox="0 0 240 34"]').first();
  await trend.scrollIntoViewIfNeeded();
  const box = (await trend.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2);
  await expect(readout(page)).not.toHaveText(before);
});

test("lakes: the table alternative lists every month for the visible lakes", async ({ page }) => {
  await page.goto("/lakes/");
  await page.getByText("View this chart as a table").click();
  const rows = page.getByRole("region", { name: "Table (scrolls)" }).locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(120);
});
