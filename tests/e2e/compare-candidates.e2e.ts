import { expect, test, type Page } from "@playwright/test";

const FIXTURE = "/tests/e2e/fixtures/compare-run-panel.html";

async function open(page: Page, query = "") {
  await page.goto(`${FIXTURE}${query}`);
  await expect(page.getByRole("radiogroup")).toBeVisible();
}

const column = (page: Page, title: string) => page.locator("section").filter({ has: page.getByRole("heading", { name: title }) });

test("each candidate says its state, time, spend and, while it runs, what it is doing", async ({ page }) => {
  await open(page);
  const claude = column(page, "Scroll container");
  const codex = column(page, "Responsive columns");
  await expect(claude.locator("[data-state]").first()).toHaveAttribute("data-state", "ready");
  await expect(claude.locator("[data-state]").first()).toHaveText("Ready");
  await expect(codex.locator("[data-state]").first()).toHaveAttribute("data-state", "working");
  // Claude reports dollars; Codex reports tokens only, never a dollar amount.
  await expect(claude.getByTestId("compare-variant-progress")).toHaveText("18m · $1.92");
  await expect(codex.getByTestId("compare-variant-progress")).toHaveText(/^12m so far · 88k tokens$/);
  await expect(codex.getByTestId("compare-variant-progress")).not.toContainText("$");
  await expect(codex.getByTestId("compare-variant-now")).toHaveText("Now: Run command · bun test tests/billing");
  await expect(claude.getByTestId("compare-variant-now")).toHaveCount(0);
});

test("Keep is one radiogroup: an unfinished candidate cannot be chosen and arrows move between the rest", async ({ page }) => {
  await open(page, "?judged=1");
  const group = page.getByRole("radiogroup", { name: "Keep one candidate" });
  const radios = group.getByRole("radio");
  await expect(radios).toHaveCount(2);
  // After judging, each radio is named with the candidate and its score.
  await expect(radios.nth(0)).toHaveAccessibleName("Keep this one: Scroll container, score 8.4");
  await expect(radios.nth(1)).toHaveAccessibleName("Keep this one: Responsive columns, score 7.1");
  await expect(radios.nth(0)).toHaveAttribute("aria-checked", "false");

  await radios.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(radios.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(radios.nth(0)).toBeFocused();
  // Moving does not choose: choosing keeps one and discards the other, so it asks first.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog", { name: "Keep this candidate?" })).toBeVisible();
});

test("while a candidate runs its Keep waits, and a kept candidate is the checked radio", async ({ page }) => {
  await open(page);
  const radios = page.getByRole("radiogroup", { name: "Keep one candidate" }).getByRole("radio");
  await expect(radios.nth(1)).toHaveAccessibleName("Keep when finished: Responsive columns");
  await expect(radios.nth(1)).toBeDisabled();

  await open(page, "?judged=1&kept=1");
  const kept = page.getByRole("radiogroup", { name: "Keep one candidate" }).getByRole("radio");
  await expect(kept.nth(0)).toHaveAttribute("aria-checked", "true");
  await expect(kept.nth(1)).toHaveAttribute("aria-checked", "false");
  await expect(kept.nth(1)).toBeDisabled();
  await expect(column(page, "Responsive columns").locator("[data-state]").first()).toHaveAttribute("data-state", "skipped");
});

for (const theme of ["light", "dark"] as const) {
  test(`the meta line and the radios stay inside a narrow column (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 800 });
    await open(page, `?theme=${theme}&locale=ko`);
    await page.evaluate(() => document.fonts.ready);
    for (const title of ["Scroll container", "Responsive columns"]) {
      const section = column(page, title);
      const box = (await section.boundingBox())!;
      for (const part of [section.getByRole("radio"), section.getByTestId("compare-variant-progress")]) {
        const inner = (await part.boundingBox())!;
        expect(inner.x).toBeGreaterThanOrEqual(box.x - 0.5);
        expect(inner.x + inner.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      }
    }
  });
}
