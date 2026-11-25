import { expect, test } from "@playwright/test";

test.describe("command palette", () => {
  test("Ctrl+K opens it, typing filters, Enter navigates, Escape closes", async ({ page }) => {
    await page.goto("/lakes/");
    await page.keyboard.press("Control+k");
    const dlg = page.getByTestId("palette");
    await expect(dlg).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Search pages and lakes" })).toBeFocused();
    await page.keyboard.type("varthur");
    await expect(dlg.getByRole("option", { name: /Varthur Lake/ }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/lakes\/varthur\/$/);
    await page.keyboard.press("Control+k");
    await expect(dlg).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
  });
  test("the header button opens it, and a no-match query says so", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Search pages and lakes" }).click();
    await page.getByRole("combobox", { name: "Search pages and lakes" }).fill("zzzz");
    await expect(page.getByText("Nothing matches")).toBeVisible();
  });
});

test.describe("then and now", () => {
  test("two months, a divider, and an uncertainty-aware sentence", async ({ page }) => {
    await page.goto("/lakes/bellandur/");
    const box = page.getByTestId("thennow");
    await box.scrollIntoViewIfNeeded();
    await expect(box.locator("svg path").first()).toHaveAttribute("d", /M\d/, { timeout: 10_000 });
    await expect(page.getByTestId("thennow-words")).toContainText(/ha/);
    await page.locator("#tn-b").selectOption({ index: 0 });
    await expect(page.getByTestId("thennow-words")).toHaveText("Both sides show the same month.");
    await page.locator("#tn-pos").fill("20");
    await expect(box.getByRole("img")).toHaveAttribute("aria-label", /split at 20 percent/);
  });
});
