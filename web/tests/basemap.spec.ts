import { expect, test } from "@playwright/test";

test("base map selector switches between map, satellite and none", async ({ page }) => {
  const sat: string[] = [];
  await page.route("**/tiles.maps.eox.at/**", (route) => route.abort());
  const overview = page.waitForResponse((r) => r.url().endsWith("/bengaluru-2025.webp") && r.ok());
  page.on("request", (r) => r.url().includes("tiles.maps.eox.at") && sat.push(r.url()));
  await page.goto("/");
  await expect(page.getByTestId("lake-map")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });

  await expect(page.getByTestId("base-monthly")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("base-satellite").click();
  // The local overview stays available when the detailed tiles cannot load.
  await expect(page.getByTestId("base-satellite")).toHaveAttribute("aria-pressed", "true");
  expect((await overview).headers()["content-type"]).toContain("image/webp");
  await expect(page.getByText("2025 satellite mosaic", { exact: true })).toBeVisible();
  await page.getByTestId("base-map").click();
  await expect(page.getByTestId("base-map")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("base-satellite").click();
  await expect(page.getByTestId("base-satellite")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("base-map")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => sat.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.getByText(/Sentinel-2 cloudless/)).toBeVisible();

  await page.getByTestId("base-none").click();
  await expect(page.getByText("2025 satellite mosaic", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("base-none")).toHaveAttribute("aria-pressed", "true");
});

test("Agara opens on two distinct dated scenes and restores from its shared link", async ({ page }) => {
  await page.route("**/api/data/v1/item/tiles/**", route => route.abort());
  await page.goto("/");
  const picker = page.getByLabel("Find a mapped lake");
  const option = picker.locator("option").filter({ hasText: /^Agara (Lake|Kere)/i }).first();
  const id = await option.getAttribute("value");
  expect(id).toBeTruthy();
  await picker.selectOption(id!);
  const caption = page.locator(".scene-caption");
  await expect(caption).toContainText(/Agara/i);
  const original = await caption.getByRole("link").getAttribute("href");
  const response = page.waitForResponse(r => /\/scenes\/S2[^/]+\.webp$/.test(r.url()) && r.ok());
  await page.getByRole("button", { name: "Previous month" }).click();
  await response;
  await expect(caption.getByRole("link")).not.toHaveAttribute("href", original!);
  await page.reload();
  await expect(page.getByLabel("Find a mapped lake")).toHaveValue(id!);
  await page.getByRole("button", { name: "Compare dates" }).click();
  await expect(page.getByLabel("Lake to compare")).toHaveValue(id!);
  await expect(page.getByRole("heading", { name: /Compare two dates: Agara Lake/ })).toBeVisible();
  await expect(page.locator("#cmp-a option:enabled")).not.toHaveCount(0);
});
