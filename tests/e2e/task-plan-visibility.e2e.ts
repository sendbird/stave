import { expect, test } from "@playwright/test";

for (const width of [384, 760]) {
  for (const theme of ["light", "dark"]) {
    test(`plan stays above the composer and expands at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: width + 64, height: 900 });
      await page.goto(`/?stavePreview=agent-run&only=plan-visibility&w=${width}&theme=${theme}`);
      await expect(page.getByRole("button", { name: "Write plan", exact: true })).toBeVisible();
      await expect(page.getByTestId("shelf-plan")).toHaveCount(0);
      await page.getByRole("button", { name: "Write plan", exact: true }).click();
      const plan = page.getByTestId("shelf-plan");
      await expect(plan.locator("summary")).toContainText("1 of 3 done · Implement the fix");
      await expect(plan).not.toHaveAttribute("open", "");
      await plan.locator("summary").focus();
      await page.keyboard.press("Enter");
      await expect(plan).toHaveAttribute("open", "");
      await expect(plan.getByText("Open the pull request", { exact: true })).toBeVisible();
      await expect(plan).not.toContainText("Run focused checks");
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
      await expect(plan.locator("summary")).toContainText("Review the result and verify every affected surface");
      await page.getByRole("button", { name: "Save between turns", exact: true }).click();
      await expect(plan.locator("summary")).toContainText("1 of 3 done");
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
