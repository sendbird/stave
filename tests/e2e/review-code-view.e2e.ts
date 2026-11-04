import { expect, test, type Page } from "@playwright/test";

/**
 * Review's code view, clicked and scrolled in the real components: a long diff
 * reads to its end in a narrow pane, Expand keeps the keyboard user's place,
 * and the file header's action keeps its label.
 */
const MODULES = {
  react: "/node_modules/.vite/deps/react.js",
  client: "/node_modules/.vite/deps/react-dom_client.js",
  appStore: "/src/store/app.store.ts",
  reviewMode: "/src/store/task-review-mode-store.ts",
  reviewSurface: "/src/components/review/TaskReviewSurface.tsx",
};

async function openPreview(page: Page) {
  await page.goto("/?stavePreview=composer-frame&case=idle", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
}

/**
 * Mounts Review on a turn that edited a long file (three edits far apart, so
 * unchanged runs collapse) and a short one, in a pane `width` pixels wide.
 */
async function mountReview(page: Page, taskId: string, width: number) {
  await page.evaluate(async ({ modules, taskId, width }) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useAppStore } = await import(modules.appStore);
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    const { TaskReviewSurface } = await import(modules.reviewSurface);
    const turnId = "turn-code";
    const functions = Array.from({ length: 400 }, (_, index) => `export function formatRow${index}(row: Row): string {\n  return String(row.id);\n}`);
    const oldContent = functions.join("\n");
    const newContent = oldContent
      .replace("formatRow40(row: Row)", "formatRow40(row: Row, currency = \"USD\")")
      .replace("formatRow151(row: Row)", "formatRowWithTax151(row: Row)")
      .replace("formatRow360(row: Row)", "formatRowLast360(row: Row)");
    const parts = [
      { type: "code_diff", filePath: "src/components/billing/very/deep/folder/structure/BillingTable.tsx", oldContent: "export const a = 1;\n", newContent: "export const a = 2;\n", status: "accepted" },
      { type: "code_diff", filePath: "src/lib/billing/format.ts", oldContent, newContent, status: "accepted" },
    ];
    useAppStore.setState((state: { tasks: unknown[]; messagesByTask: Record<string, unknown[]>; messageCountByTask: Record<string, number> }) => ({
      tasks: [...state.tasks, { id: taskId, title: taskId, provider: "claude-code", updatedAt: "2026-10-23T00:00:00.000Z", unread: false }],
      messagesByTask: {
        ...state.messagesByTask,
        [taskId]: [
          { id: "question", role: "user", content: "Add currency", parts: [], turnId },
          { id: "answer", role: "assistant", providerId: "claude-code", model: "model", content: "Done.", parts, turnId },
        ],
      },
      // The turn is read from memory only when the task's whole history is resident.
      messageCountByTask: { ...state.messageCountByTask, [taskId]: 2 },
    }));
    useTaskReviewModeStore.getState().openReview(taskId, { kind: "turn", taskId, turnId });
    const host = document.createElement("div");
    host.id = `${taskId}-surface`;
    host.style.cssText = `position: fixed; top: 0; left: 0; bottom: 0; width: ${width}px; z-index: 1; display: flex; flex-direction: column;`;
    document.body.append(host);
    createRoot(host).render(React.createElement(TaskReviewSurface, { taskId }));
  }, { modules: MODULES, taskId, width });
  return page.locator(`#${taskId}-surface`);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPreview(page);
});

test("a narrow Review scrolls to the end of a long diff, with the file header in view", async ({ page }) => {
  const surface = await mountReview(page, "narrow-review", 893);
  await surface.getByRole("button", { name: /format\.ts/ }).click();
  const diff = surface.getByRole("group", { name: "Changes in src/lib/billing/format.ts" });
  // Every unchanged run open: the diff is thousands of pixels taller than the pane.
  while (await diff.getByRole("button", { name: /^Expand/ }).count()) {
    await diff.getByRole("button", { name: /^Expand/ }).first().click();
  }
  const lastLine = diff.getByText("export function formatRow399(row: Row): string {");
  await expect(lastLine).not.toBeInViewport();

  await diff.hover();
  for (let step = 0; step < 40 && !(await lastLine.evaluate((line) => line.getBoundingClientRect().bottom <= window.innerHeight)); step += 1) {
    await page.mouse.wheel(0, 2000);
  }
  await expect(lastLine).toBeInViewport();
  await expect(surface.getByRole("button", { name: "Comment in editor" })).toBeInViewport();
});

test("Expand moves keyboard focus to the first line it revealed", async ({ page }) => {
  const surface = await mountReview(page, "expand-focus", 1280);
  await surface.getByRole("button", { name: /format\.ts/ }).click();
  const diff = surface.getByRole("group", { name: "Changes in src/lib/billing/format.ts" });
  await diff.getByRole("button", { name: "Expand 117 unchanged lines" }).focus();
  await page.keyboard.press("Enter");

  const focused = page.locator(":focus");
  await expect(focused).toContainText("export function formatRow0(row: Row): string {");
  await expect(diff.locator(":focus")).toHaveCount(1);
});

/** Each diff row's line-number layout: 2 cells in a unified row, 1 per half in a split row. */
const lineNumberCellsPerHolder = (diff: ReturnType<Page["locator"]>) =>
  diff.evaluate((root) => [...new Set(
    [...root.querySelectorAll("div:has(> [data-ads-slot='line-number'])")]
      .map((holder) => holder.querySelectorAll(":scope > [data-ads-slot='line-number']").length),
  )]);

test("Review draws the split layout from Settings, and unified when the pane is narrow", async ({ page }) => {
  await page.evaluate(async (modules) => {
    const { useAppStore } = await import(modules.appStore);
    useAppStore.getState().updateSettings({ patch: { diffViewMode: "split" } });
  }, MODULES);
  // Review's diff column is about half the surface, so split needs a wide window.
  await page.setViewportSize({ width: 1920, height: 900 });
  const wide = await mountReview(page, "split-wide", 1920);
  await wide.getByRole("button", { name: /format\.ts/ }).click();
  const wideDiff = wide.getByRole("group", { name: "Changes in src/lib/billing/format.ts" });
  await expect(wideDiff).toBeVisible();
  expect(await lineNumberCellsPerHolder(wideDiff)).toEqual([1]);

  // A commented line is found on either side of a split row.
  const found = await wideDiff.evaluate(async (root, modules) => {
    const { findReviewDiffRow } = await import(modules.reviewDiffPane);
    const original = findReviewDiffRow(root, 121, "original");
    const modified = findReviewDiffRow(root, 121, "modified");
    return { original: original?.children[0]?.textContent ?? "", modified: modified?.children[1]?.textContent ?? "" };
  }, { reviewDiffPane: "/src/components/review/ReviewDiffPane.tsx" });
  expect(found.original).toContain("121");
  expect(found.original).toContain("formatRow40(row: Row): string");
  expect(found.modified).toContain("121");
  expect(found.modified).toContain("currency = \"USD\"");

  const narrow = await mountReview(page, "split-narrow", 480);
  await narrow.getByRole("button", { name: /format\.ts/ }).click();
  const narrowDiff = narrow.getByRole("group", { name: "Changes in src/lib/billing/format.ts" });
  await expect(narrowDiff).toBeVisible();
  expect(await lineNumberCellsPerHolder(narrowDiff)).toEqual([2]);
});

test("the file header keeps its comment action's full label in a narrow pane", async ({ page }) => {
  const surface = await mountReview(page, "narrow-header", 420);
  const comment = surface.getByRole("button", { name: "Comment in editor" });
  await expect(comment).toBeVisible();
  const clipped = await comment.evaluate((button) => [...button.querySelectorAll("*"), button].some((element) => element.scrollWidth > element.clientWidth + 1));
  expect(clipped).toBe(false);
});
