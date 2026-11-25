import { expect, test } from "@playwright/test";

test("base map selector switches between map, satellite and none", async ({ page }) => {
  const sat: string[] = [];
  await page.route("**/tiles.maps.eox.at/**", (route) => route.abort());
  const overview = page.waitForResponse((r) => r.url().endsWith("/bengaluru-2025.webp") && r.ok());
  page.on("request", (r) => r.url().includes("tiles.maps.eox.at") && sat.push(r.url()));
  await page.goto("/");
  await expect(page.getByTestId("lake-map")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });

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
