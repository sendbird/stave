import { expect, test, type Page } from "@playwright/test";

/**
 * The Subagents tab with delegated children that ask a question and that
 * failed, and in-turn subagents that wait on an approval and that failed
 * (`stuck=1` on the task panel preview).
 */
function open(page: Page, args: { lang?: "en" | "ko"; theme?: "light" | "dark"; width?: number } = {}) {
  return page.goto(
    `/?stavePreview=task-panel&task=agent-run&tab=team&stuck=1&panelWidth=${args.width ?? 384}&lang=${args.lang ?? "en"}&theme=${args.theme ?? "light"}`,
  );
}

test("a subagent waiting on the user reads as needing you, and the tray filters by state", async ({ page }) => {
  await open(page);
  const list = page.getByTestId("subagents-list");
  await expect(list.locator("li")).toHaveCount(6);
  // The delegated child with an open question and the in-turn subagent with an
  // open approval both need the user; neither reads as running.
  const asking = list.locator('li[data-subagent-state="needs-you"]');
  await expect(asking).toHaveCount(2);
  await expect(asking.filter({ hasText: "Plan the users rollout" }).locator("[data-exchange-status]")).toHaveText(/^Needs you/);
  await expect(asking.locator('[data-exchange-status="running"]')).toHaveCount(0);

  const filters = page.getByRole("group", { name: "Show subagents" });
  await expect(filters.getByRole("button")).toHaveText([/^All\s*6$/, /^Needs you\s*2$/, /^Failed\s*2$/, /^Running\s*1$/, /^Done\s*1$/]);
  await expect(filters.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");

  await filters.getByRole("button", { name: /^Failed/ }).click();
  await expect(filters.getByRole("button", { name: /^Failed/ })).toHaveAttribute("aria-pressed", "true");
  await expect(list.locator("li")).toHaveCount(2);
  await expect(list.locator('li[data-subagent-state="failed"]')).toHaveCount(2);
  // Pressing the pressed filter again shows every row.
  await filters.getByRole("button", { name: /^Failed/ }).click();
  await expect(list.locator("li")).toHaveCount(6);
  await expect(filters.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");

  await filters.getByRole("button", { name: /^Needs you/ }).click();
  await expect(list.locator("li")).toHaveCount(2);
  await expect(list.locator('li:not([data-subagent-state="needs-you"])')).toHaveCount(0);
});

test("Retry failed retries each failed delegated task once and leaves the in-turn one to its turn", async ({ page }) => {
  await open(page);
  const retry = page.getByTestId("subagents-retry-failed");
  // Two rows failed; only one is a delegated task the user may retry.
  await expect(retry).toHaveText("Retry failed (1)");
  await expect(retry).toHaveAttribute("aria-expanded", "false");
  await retry.click();
  await expect(retry).toHaveAttribute("aria-expanded", "true");
  const instructions = page.getByRole("textbox", { name: "Retry instructions" });
  await expect(instructions).toBeFocused();
  const submit = page.getByRole("button", { name: "Retry 1 task", exact: true });
  await expect(submit).toBeDisabled();
  await instructions.fill("Default a missing offset to 0, then rerun the migration test.");
  await submit.click();
  await expect(page.getByRole("status").filter({ hasText: "Retrying 1 failed task." })).toHaveCount(1);
  await expect(instructions).toHaveCount(0);
  const calls = await page.evaluate(() => (window as unknown as { __staveSubagentRetries?: unknown[] }).__staveSubagentRetries ?? []);
  expect(calls).toEqual([{ delegationKey: "migrate-users-table", prompt: "Default a missing offset to 0, then rerun the migration test." }]);
});

test("a refused retry is said once, and its reason stays on the task's row", async ({ page }) => {
  await page.goto("/?stavePreview=task-panel&task=agent-run&tab=team&stuck=1&panelWidth=384&retry=refuse");
  await page.getByTestId("subagents-retry-failed").click();
  await page.getByRole("textbox", { name: "Retry instructions" }).fill("Try the migration again.");
  await page.getByRole("button", { name: "Retry 1 task", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 could not be retried; its row says why." })).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: "Retrying" })).toHaveCount(0);
  const row = page.getByTestId("subagents-list").locator('li[data-subagent-kind="delegated-task"][data-subagent-state="failed"]');
  await expect(row.getByRole("alert")).toHaveText("The child is not in a state where this action applies.");
});

for (const lang of ["en", "ko"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`the tray and the row marks stay inside a narrow rail (${lang}, ${theme}, 320px)`, async ({ page }, testInfo) => {
      // The preview frame takes the page's width; the page is sized so the frame is a 320px rail.
      await page.setViewportSize({ width: 352, height: 900 });
      await open(page, { lang, theme, width: 320 });
      await page.evaluate(() => document.fonts.ready);
      const list = page.getByTestId("subagents-list");
      await expect(list.locator("li")).toHaveCount(6);
      const frame = page.getByTestId("task-panel-frame");
      expect((await frame.boundingBox())!.width).toBeLessThanOrEqual(322);
      expect(await frame.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      const group = page.getByTestId("subagents-filter");
      const listBox = (await list.boundingBox())!;
      const groupBox = (await group.boundingBox())!;
      // The filter wraps inside the list column rather than pushing it wider.
      expect(groupBox.x).toBeGreaterThanOrEqual(listBox.x - 1);
      expect(groupBox.x + groupBox.width).toBeLessThanOrEqual(listBox.x + listBox.width + 1);
      // Each row's state glyph is centered on its word, and the word on the name line.
      for (const row of await list.locator("li").all()) {
        const glyph = (await row.locator("[data-exchange-status] [data-state] svg").first().boundingBox())!;
        const word = (await row.locator("[data-exchange-status] [data-state] > span").first().boundingBox())!;
        const name = (await row.locator("div > span").first().boundingBox())!;
        expect(Math.abs(glyph.y + glyph.height / 2 - (word.y + word.height / 2))).toBeLessThanOrEqual(1.5);
        expect(Math.abs(word.y + word.height / 2 - (name.y + name.height / 2))).toBeLessThanOrEqual(2);
      }
      await page.screenshot({ path: testInfo.outputPath(`subagents-tray-${lang}-${theme}.png`), fullPage: true, animations: "disabled" });
    });
  }
}
