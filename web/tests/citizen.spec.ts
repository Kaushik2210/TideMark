import { expect, test } from "@playwright/test";

test("lake page: uploads are clearly disabled when no Supabase project is configured", async ({ page }) => {
  await page.goto("/lakes/ulsoor/");
  await expect(page.getByRole("heading", { name: "Citizen photos" })).toBeVisible();
  await expect(page.getByTestId("uploads-disabled")).toBeVisible();
  await expect(page.getByRole("form")).toHaveCount(0);
});

test("report card downloads a real PNG", async ({ page }) => {
  await page.goto("/lakes/bellandur/");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("report-card").click()]);
  expect(dl.suggestedFilename()).toBe("tidemark-bellandur-report-card.png");
  const path = await dl.path();
  const fs = await import("node:fs");
  const buf = fs.readFileSync(path!);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  expect(buf.length).toBeGreaterThan(10_000);
});
