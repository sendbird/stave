import { expect, test } from "@playwright/test";

test("dismissing a finished review survives a renderer reload while other reviews remain", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?stavePreview=composer-frame&case=reviews&open=1", { waitUntil: "domcontentloaded" });
  const ready = page.locator('[data-testid="composer-shelf-review"][data-status="ready"]');
  await expect(ready).toBeVisible();
  await ready.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(ready).toHaveCount(0);
  await expect(page.locator('[data-testid="composer-shelf-review"][data-status="running"]')).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await expect(ready).toHaveCount(0);
  await expect(page.locator('[data-testid="composer-shelf-review"][data-status="running"]')).toBeVisible();
  const persisted = await page.evaluate(() => window.localStorage.getItem("stave:review-dismissals"));
  expect(persisted).toContain("stave-review-preview-ready");
});
