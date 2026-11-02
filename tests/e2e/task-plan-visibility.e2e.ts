import { expect, test } from "@playwright/test";

for (const width of [384, 760]) {
  for (const theme of ["light", "dark"]) {
    test(`the run line leads with the plan step and one toggle unfolds the plan once at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: width + 64, height: 900 });
      await page.goto(`/?stavePreview=agent-run&only=plan-visibility&w=${width}&theme=${theme}`);
      await expect(page.getByRole("button", { name: "Write plan", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Write plan", exact: true }).click();
      const shelf = page.getByTestId("composer-shelf");
      const run = page.getByTestId("agent-run-bar");
      // The step leads; the count is said once, by the segment, never as words too.
      await expect(run.locator("p").first()).toHaveText(/^Implement the fix/);
      await expect(run.locator("p").first()).not.toContainText("Plan 1/3");
      await expect(run.getByTestId("composer-shelf-todo-progress")).toContainText("1/3");
      await expect(page.getByTestId("shelf-plan")).toHaveCount(0);
      await expect(shelf.locator("details")).toHaveCount(0);
      const toggle = run.getByRole("button", { name: "Show activity details", exact: true });
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(run.getByRole("button", { name: "Hide activity details", exact: true })).toHaveAttribute("aria-expanded", "true");
      const plan = page.getByTestId("shelf-plan");
      await expect(plan.getByText("Open the pull request", { exact: true })).toBeVisible();
      await expect(plan).not.toContainText("Run focused checks");
      // The finished step folds behind one toggle, and the plan's steps are listed once.
      await expect(plan.getByText(/^Inspect the affected contract/)).toHaveCount(0);
      await plan.getByRole("button", { name: "Show 1 done", exact: true }).click();
      await expect(plan.getByText(/^Inspect the affected contract/)).toBeVisible();
      await expect(shelf.getByText("Open the pull request", { exact: true })).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      const geometry = await plan.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const items = [...element.querySelectorAll("li")].map((row) => {
          const mark = row.children[0].getBoundingClientRect();
          const text = row.children[1].getBoundingClientRect();
          return { left: text.left, markRight: mark.right, right: text.right, top: text.top, markTop: mark.top, markHeight: mark.height, lineHeight: parseFloat(getComputedStyle(row).lineHeight) };
        });
        return { width: bounds.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, items };
      });
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
      for (const row of geometry.items) {
        expect(row.markRight).toBeLessThan(row.left);
        expect(Math.abs((row.markTop + row.markHeight / 2) - (row.top + row.lineHeight / 2))).toBeLessThanOrEqual(1);
      }
      await page.getByRole("button", { name: "Finish worker", exact: true }).click();
      await expect(run.locator("p").first()).toContainText("Review the result and verify every affected surface");
      await page.getByRole("button", { name: "Save between turns", exact: true }).click();
      // Between turns the toggle keeps the plan one click away.
      await expect(run.getByTestId("composer-shelf-todo-progress")).toContainText("1/3");
      await expect(plan.locator("svg.lucide-loader-circle")).toHaveCount(0);
      await expect(plan.locator("svg.lucide-circle-dot")).toHaveCount(1);
      for (const locale of ["en", "ko"]) {
        for (const density of ["regular", "compact"]) {
          await page.evaluate(async ({ locale, density }) => {
            const { applyAppLocale } = await import("/src/i18n/index.ts");
            applyAppLocale(locale);
            document.documentElement.dataset.uiDensity = density;
            await document.fonts.ready;
          }, { locale, density });
          expect(await plan.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
          expect(await shelf.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
          await expect(plan.getByText("Open the pull request", { exact: true })).toBeVisible();
        }
      }
    });
  }
}


test("ordinary tasks expose their latest plan before the flow in Progress", async ({ page }) => {
  await page.goto("/?stavePreview=task-panel&task=plain&tab=progress&panelWidth=384");
  const panel = page.getByRole("tabpanel", { name: "Progress", exact: true });
  await expect(panel.getByRole("group", { name: "Plan", exact: true })).toBeVisible();
  const order = await panel.evaluate((element) => {
    const plan = element.querySelector('[data-ads-component="plan"], [role="group"]');
    const flow = element.querySelector('[aria-label="Flow"]');
    return Boolean(plan && flow && (plan.compareDocumentPosition(flow) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(order).toBe(true);
});
