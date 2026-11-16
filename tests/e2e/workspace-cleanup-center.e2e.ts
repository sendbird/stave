import { expect, test } from "@playwright/test";

// The actual palette and cleanup components run against a simulated host API.
// Git, SQLite and runtime guards are covered by the host integration tests.
test("palette opens cleanup, archive can be undone and archived work restored", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette&cleanupPreview=1");
  await page.getByPlaceholder("Find a command, task, workspace, or setting").fill("Clean up workspaces");
  await page.getByText("Clean up workspaces", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clean up workspaces" })).toBeVisible();
  const row = page.getByTestId("cleanup-row-cleanup-one");
  await row.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Archive (1)", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("tasks, messages and history");
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(row).toContainText("Archived");
  await page.getByRole("button", { name: "Undo archive" }).click();
  await expect(row).not.toContainText("Archived");
  await page.getByTestId("cleanup-row-cleanup-archived").getByRole("checkbox").click();
  await page.getByRole("button", { name: "Restore (1)", exact: true }).click();
  await expect(page.getByTestId("cleanup-row-cleanup-archived")).not.toContainText("Archived");
  await page.getByRole("button", { name: "Select all ready" }).click();
  await expect(page.getByTestId("cleanup-row-cleanup-dirty").getByRole("checkbox")).not.toBeChecked();
});

for (const width of [1440, 1024]) for (const [lang, theme] of [["en", "light"], ["ko", "dark"]]) {
  test(`cleanup contains wrapping labels at ${width} ${lang} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?stavePreview=command-palette&cleanupPreview=1&lang=${lang}&theme=${theme}`);
    const label = lang === "en" ? "Clean up workspaces" : "워크스페이스 정리";
    await page.locator("input[data-slot=command-input]").fill(label);
    await page.getByText(label, { exact: true }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog).toContainText(lang === "en" ? "Clean up workspaces" : "워크스페이스 정리");
    await expect(page.getByTestId("cleanup-row-cleanup-one")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const row = element.querySelector('[data-testid="cleanup-row-cleanup-one"]')!;
      const checkbox = row.querySelector('[role="checkbox"]')!.getBoundingClientRect();
      const text = row.querySelector('button[aria-pressed]')!.getBoundingClientRect();
      return { right: box.right, width: box.width, overflow: element.scrollWidth > element.clientWidth, checkboxHeight: checkbox.height, centerDifference: Math.abs((checkbox.top + checkbox.bottom) / 2 - (text.top + text.bottom) / 2) };
    });
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.overflow).toBe(false);
    expect(geometry.checkboxHeight).toBeGreaterThanOrEqual(24);
    expect(geometry.centerDifference).toBeLessThan(1);
  });
}

test("mixed selection reports a blocked item and long lists virtualize", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette&cleanupPreview=1&many=1");
  await page.getByPlaceholder("Find a command, task, workspace, or setting").fill("Clean up workspaces");
  await page.getByText("Clean up workspaces", { exact: true }).click();
  const first = page.getByTestId("cleanup-row-cleanup-one");
  await expect(first).toBeVisible();
  await first.getByRole("button").click();
  await page.getByTestId("cleanup-row-cleanup-dirty").getByRole("button").click({ modifiers: ["Shift"] });
  await expect(page.getByRole("button", { name: "Archive (2)", exact: true })).toBeEnabled();
  expect(await page.locator('[data-testid^="cleanup-row-"]').count()).toBeLessThan(80);
  await page.getByRole("button", { name: "Archive (2)", exact: true }).click();
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByRole("status")).toContainText("Completed 1; skipped 1.");
  await expect(page.getByTestId("cleanup-row-cleanup-dirty")).toContainText("Changed files");
});
