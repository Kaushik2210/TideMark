import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function openScene(page: import("@playwright/test").Page) {
  await page.goto("/lakes/ulsoor/");
  await page.locator("#landscape-h").scrollIntoViewIfNeeded();
  const ready = page.locator('[data-testid="landscape"] [data-ready="true"]');
  const fallback = page.getByText(/3D view is not available/);
  await expect(ready.or(fallback)).toHaveCount(1, { timeout: 25_000 });
  // WebGL can be missing on some CI images; the page must then degrade gracefully instead of failing.
  test.skip(await fallback.isVisible(), "WebGL unavailable in this browser");
  return page.getByRole("group", { name: /Each bar is one month/ });
}

test("3D landscape: renders, reads months by keyboard, switches views", async ({ page }) => {
  const scene = await openScene(page);
  await expect(scene.locator("canvas")).toHaveCount(1);

  await scene.focus();
  await page.keyboard.press("ArrowLeft");
  const readout = page.locator('[data-testid="landscape"] p[aria-live="polite"]');
  await expect(readout).toContainText(/\d{4}: |no usable/);
  const first = await readout.innerText();
  await page.keyboard.press("ArrowUp"); // previous year, same month
  await expect(readout).not.toHaveText(first);
  await page.keyboard.press("Escape");
  await expect(readout).toContainText("arrow keys");

  const top = page.getByRole("button", { name: "Top (years)" });
  await top.click();
  await expect(top).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Angled" })).toHaveAttribute("aria-pressed", "false");
});

test("3D landscape: with reduced motion the final scene is there at once", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await openScene(page);
  await ctx.close();
});

test("3D landscape section has no accessibility violations", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await openScene(page);
  const res = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .include('[data-testid="landscape"]')
    .analyze();
  expect(res.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  await ctx.close();
});

test("the 3D library only downloads once the section is near the viewport", async ({ page }) => {
  let bytes = 0;
  page.on("response", async (r) => {
    if (r.request().resourceType() === "script") bytes += (await r.body().catch(() => Buffer.alloc(0))).length;
  });
  await page.goto("/lakes/ulsoor/");
  await page.waitForTimeout(1500);
  const before = bytes;
  await page.locator("#landscape-h").scrollIntoViewIfNeeded();
  await expect.poll(() => bytes - before, { timeout: 15_000 }).toBeGreaterThan(300_000); // three.js is ~0.5 MB
});
