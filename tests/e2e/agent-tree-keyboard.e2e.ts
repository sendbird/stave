import { expect, test, type Page } from "@playwright/test";

/**
 * The agent tree as a keyboard tree, on the real component in the AUI
 * regression preview: one running parent ("aui-trace-polish-v2") with one
 * running child, and one finished agent folded behind "1 done".
 */

async function openTree(page: Page) {
  await page.goto("/?stavePreview=aui-regressions");
  const tree = page.getByRole("tree", { name: "Agent tree" });
  await expect(tree).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return tree;
}

function item(page: Page, name: RegExp) {
  return page.getByRole("treeitem", { name });
}

test("arrow keys move one tab stop through the tree and fold each branch", async ({ page }) => {
  const tree = await openTree(page);
  const parent = item(page, /^aui-trace-polish-v2/);
  const child = item(page, /^Inspect the model selector/);

  await expect(parent).toHaveAttribute("aria-level", "1");
  await expect(parent).toHaveAttribute("aria-expanded", "true");
  await expect(child).toHaveAttribute("aria-level", "2");
  await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);

  await parent.focus();
  await page.keyboard.press("ArrowDown");
  await expect(child).toBeFocused();
  await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  await expect(child).toHaveAttribute("tabindex", "0");

  // Left on a leaf goes to its parent; Left on an open branch folds it.
  await page.keyboard.press("ArrowLeft");
  await expect(parent).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(parent).toHaveAttribute("aria-expanded", "false");
  await expect(child).toHaveCount(0);
  // The fold says what it hides.
  await expect(parent.getByText("Show 1 subagent of aui-trace-polish-v2")).toBeVisible();

  // Right opens it again, then enters it.
  await page.keyboard.press("ArrowRight");
  await expect(parent).toHaveAttribute("aria-expanded", "true");
  await expect(child).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(child).toBeFocused();

  await page.keyboard.press("Home");
  await expect(parent).toBeFocused();
  await page.keyboard.press("End");
  await expect(child).toBeFocused();
});

test("pressing a fold hint or the chevron folds and opens the branch", async ({ page }) => {
  await openTree(page);
  const parent = item(page, /^aui-trace-polish-v2/);
  await parent.locator('[data-work-graph-disclosure="true"]').click();
  await expect(parent).toHaveAttribute("aria-expanded", "false");
  await parent.locator('[data-work-graph-fold-hint="true"]').click();
  await expect(parent).toHaveAttribute("aria-expanded", "true");
  await expect(item(page, /^Inspect the model selector/)).toBeVisible();
});

test("Enter runs the row's action, and the finished agent returns to its place when shown", async ({ page }) => {
  const tree = await openTree(page);
  const parent = item(page, /^aui-trace-polish-v2/);
  await parent.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("output").filter({ hasText: "Reveal: preview-spawn" })).toBeVisible();
  // Enter opened the row rather than folding it.
  await expect(parent).toHaveAttribute("aria-expanded", "true");

  await expect(item(page, /^Review the completed task activity ordering/)).toHaveCount(0);
  await page.getByTestId("work-graph-completed-toggle").first().click();
  const finished = item(page, /^Review the completed task activity ordering/);
  await expect(finished).toBeVisible();
  // It started first, so it leads the tree.
  await expect(tree.locator('[role="treeitem"]').first()).toHaveAccessibleName(/^Review the completed task activity ordering/);
});

test("a branch's chevron and status mark share the first line's centre", async ({ page }) => {
  await openTree(page);
  const parent = item(page, /^aui-trace-polish-v2/);
  const offsets = await parent.evaluate((row) => {
    const chevron = row.querySelector('[data-work-graph-disclosure="true"]')!.getBoundingClientRect();
    const mark = row.querySelector("[data-state]")!.getBoundingClientRect();
    const label = row.querySelector("p span")!.getBoundingClientRect();
    const centre = (box: DOMRect) => box.y + box.height / 2;
    return {
      chevronToMark: Math.abs(centre(chevron) - centre(mark)),
      markToLabel: Math.abs(centre(mark) - centre(label)),
    };
  });
  expect(offsets.chevronToMark).toBeLessThanOrEqual(1);
  expect(offsets.markToLabel).toBeLessThanOrEqual(1.5);
});
