import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/lakes/", "/lakes/bellandur/", "/methodology/", "/data/", "/updates/", "/contribute/", "/embed/bellandur/", "/story/"];

for (const scheme of ["dark", "light"] as const) {
  test(`axe: WCAG 2.2 AA, ${scheme} mode`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      if (path === "/") await expect(page.getByTestId("lake-map")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
      const res = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        // The map canvas and third-party attribution control are not ours to restyle.
        .exclude(".maplibregl-canvas-container, .maplibregl-ctrl")
        .analyze();
      const summary = res.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(" ")}`);
      expect(summary, `${path} [${scheme}]`).toEqual([]);
    }
    await ctx.close();
  });
}
