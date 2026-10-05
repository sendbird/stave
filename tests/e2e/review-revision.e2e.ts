import { expect, test } from "@playwright/test";

test("review rows and results distinguish later edits, concurrent edits and missing provenance", async ({ page }) => {
  test.setTimeout(90_000);
  for (const state of [
    { query: "changed", label: "Code changed since review", detail: "Code changed since this review." },
    { query: "during", label: "Code changed during review", detail: "Code changed while this review was running." },
    { query: "unknown", label: "Review state unavailable", detail: "The workspace state for this review is unavailable." },
  ]) {
    await page.goto(`/?stavePreview=composer-frame&case=reviews&open=1&revision=${state.query}`, { waitUntil: "domcontentloaded" });
    const ready = page.locator('[data-testid="composer-shelf-review"][data-status="ready"]');
    await expect(ready).toContainText(state.label);
    await ready.getByRole("button", { name: "View", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("note")).toContainText(state.detail);
    await expect(page.getByRole("dialog").getByRole("button", { name: "Run again", exact: true })).toBeVisible();
  }
});

test("an unchanged review reports a failed current check when the app regains focus", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?stavePreview=composer-frame&case=reviews&open=1", { waitUntil: "domcontentloaded" });
  const ready = page.locator('[data-testid="composer-shelf-review"][data-status="ready"]');
  await expect(ready).toBeVisible();
  await expect(ready).not.toContainText("Review state unavailable");
  await page.evaluate(() => {
    window.api!.runs.getReviewRevision = async () => { throw new Error("bridge unavailable"); };
    window.dispatchEvent(new Event("focus"));
  });
  await expect(ready).toContainText("Review state unavailable");
});

test("refreshing an open review checks code changes made after the result was opened", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?stavePreview=composer-frame&case=reviews&open=1", { waitUntil: "domcontentloaded" });
  const ready = page.locator('[data-testid="composer-shelf-review"][data-status="ready"]');
  await ready.getByRole("button", { name: "View", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("note")).toHaveCount(0);
  await page.evaluate(() => {
    window.api!.runs.getReviewRevision = async () => ({
      source: { status: "known", revision: "reviewed" },
      completed: { status: "known", revision: "reviewed" },
      current: { status: "known", revision: "edited" },
    });
  });
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(dialog.getByRole("note")).toContainText("Code changed since this review.");
});
