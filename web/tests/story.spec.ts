import { expect, test } from "@playwright/test";
import { parseCsv } from "../src/lib/csv";
import { buildStory } from "../src/lib/story";

test.describe("csv reader", () => {
  test("handles quotes, escaped quotes, commas and newlines inside fields", () => {
    const rows = parseCsv('a,b,c\r\n1,"x, y",3\r\n2,"say ""hi""","line1\nline2"\r\n');
    expect(rows).toEqual([
      { a: "1", b: "x, y", c: "3" },
      { a: "2", b: 'say "hi"', c: "line1\nline2" },
    ]);
  });
  test("tolerates a BOM, a missing final newline and short rows", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([{ a: "1", b: "2" }]);
    expect(parseCsv("a,b\n1")).toEqual([{ a: "1", b: "" }]);
  });
});

test.describe("story content", () => {
  const chapters = buildStory();

  test("starts with the whole record and ends today, with a stable set of chapters", () => {
    expect(chapters[0].focus).toBe("all");
    expect(chapters[0].month).toBe("2016-01");
    expect(chapters[chapters.length - 1].id).toBe("today");
    expect(new Set(chapters.map((c) => c.id)).size).toBe(chapters.length);
    expect(chapters.length).toBeGreaterThanOrEqual(7);
  });

  test("every reported-event chapter cites a public source and says how well the record matched", () => {
    const events = chapters.filter((c) => c.id.startsWith("ev-"));
    expect(events.length).toBeGreaterThanOrEqual(4);
    for (const c of events) {
      expect(c.evidence.sources.length, c.id).toBeGreaterThan(0);
      for (const s of c.evidence.sources) expect(s.url).toMatch(/^https?:\/\//);
      expect(c.evidence.label).toMatch(/matched/);
    }
  });

  test("a partial match is never titled as if the satellites saw a clear event", () => {
    for (const c of chapters.filter((x) => x.evidence.tone === "weak")) {
      expect(c.title).toContain("only partly seen");
      expect(c.body.join(" ")).toContain("only partial");
    }
  });

  test("the failure is told as plainly as the successes", () => {
    const foam = chapters.find((c) => c.id === "foam")!;
    expect(foam.evidence.tone).toBe("fail");
    expect(foam.body.join(" ")).toContain("should not be read as foam");
  });

  test("no number is invented: figures in the text come from the series (no NaN, no undefined)", () => {
    for (const c of chapters) expect(c.body.join(" "), c.id).not.toMatch(/NaN|undefined|null/);
  });
});

test("story page: the pinned map follows the chapter in view", async ({ page }) => {
  await page.goto("/story/");
  await expect(page.getByTestId("lake-map")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  const month = page.getByTestId("story-month");
  await expect(month).toHaveText("Jan 2016");
  await page.locator("#today").scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 150);
  await expect(month).toHaveText("Nov 2026", { timeout: 8000 });
  await page.locator("#bellandur-peak").scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 150);
  await expect(month).not.toHaveText("Nov 2026", { timeout: 8000 });
});

test("story page: reads fully without the map, and source links are safe external links", async ({ page }) => {
  await page.goto("/story/");
  expect(await page.getByRole("heading", { level: 2 }).count()).toBeGreaterThanOrEqual(7);
  const links = page.locator('a[href^="http"][target="_blank"]');
  expect(await links.count()).toBeGreaterThan(3);
  for (const a of await links.all()) await expect(a).toHaveAttribute("rel", /noopener/);
  await expect(page.getByRole("link", { name: "Go straight to the map" })).toBeVisible();
});

test("home links to the story", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("lake-map")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.getByRole("link", { name: /guided story/ })).toHaveAttribute("href", /story\//);
});
