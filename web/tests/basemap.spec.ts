import { expect, test } from "@playwright/test";

test("base map selector switches between map, satellite and none", async ({ page }) => {
  const sat: string[] = [];
  page.on("request", (r) => r.url().includes("tiles.maps.eox.at") && sat.push(r.url()));
  await page.goto("/");
  await expect(page.getByTestId("lake-map")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });

  // Default: vector map, and no satellite tile has been requested yet.
  await expect(page.getByTestId("base-map")).toHaveAttribute("aria-pressed", "true");
  expect(sat).toHaveLength(0);

  await page.getByTestId("base-satellite").click();
  await expect(page.getByTestId("base-satellite")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("base-map")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => sat.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.getByText(/Sentinel-2 cloudless/)).toBeVisible();

  await page.getByTestId("base-none").click();
  await expect(page.getByTestId("base-none")).toHaveAttribute("aria-pressed", "true");
});
