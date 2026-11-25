import { expect, test, type Page } from "@playwright/test";

async function createWorkspace(page: Page, lang: string) {
  await page.getByTestId("preview-start").click();
  // Named, so a toast the preview shows is never taken for the dialog.
  const dialog = page.getByRole("dialog", { name: lang === "ko" ? "새 워크스페이스" : "New workspace" });
  await dialog.getByRole("textbox", { name: lang === "ko" ? "워크스페이스 브랜치 이름" : "Workspace Branch Name" }).fill("feature/review");
  await dialog.getByRole("button", { name: lang === "ko" ? "만들기" : "Create", exact: true }).click();
  return dialog;
}

// Release a simulated backend step while the actual modal owns pointer input.
const release = (page: Page, step: string) =>
  page.getByTestId(`preview-${step}`).evaluate((button: HTMLButtonElement) => button.click());

for (const lang of ["en", "ko"]) {
  for (const theme of ["light", "dark"]) {
    test(`workspace preparation stays in the dialog and retries in ${lang} / ${theme}`, async ({ page }) => {
      const ko = lang === "ko";
      await page.setViewportSize({ width: ko ? 560 : 1200, height: 800 });
      await page.goto(`/?stavePreview=workspace-creation&lang=${lang}&theme=${theme}`);
      const dialog = await createWorkspace(page, lang);
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b).*$/);
      const active = page.getByTestId("preview-active-workspace");
      const progress = dialog.getByRole("region", { name: ko ? "워크스페이스 준비 중" : "Preparing workspace" });
      const dock = page.getByTestId("workspace-pane-host");
      await expect(progress.getByRole("status")).toContainText(ko ? "worktree 만들기" : "Create worktree");
      const header = await dialog.getByRole("heading").boundingBox();
      const status = await progress.getByRole("status").boundingBox();
      // Both align to the dialog's content edge, including fractional pixels.
      expect(Math.abs(header!.x - status!.x)).toBeLessThanOrEqual(1);
      await expect(dock).toBeVisible();
      await expect(active).toHaveAttribute("data-workspace-id", "preview-existing");
      await release(page, "checkout");
      await expect(progress.getByRole("status")).toContainText(ko ? "재사용할 파일 복사" : "Copy reusable files");
      await release(page, "copy");
      await expect(progress.getByRole("status")).toContainText(ko ? "설정 실행" : "Run setup");
      await expect(active).toHaveAttribute("data-workspace-id", "preview-existing");
      await release(page, "setup");
      await expect(progress.getByText("fixture: dependency install failed", { exact: false })).toBeVisible();
      // The status region's words change, so a screen reader announces the failure.
      await expect(progress.getByRole("status")).toContainText(ko ? "3단계 실패: 설정 실행" : "Step 3 of 4 failed: Run setup");
      await expect(active).toHaveAttribute("data-workspace-id", "preview-existing");
      const logs = progress.getByRole("button", { name: ko ? "로그 열기" : "Open logs" });
      await expect(logs).toBeInViewport();
      await logs.click();
      await expect(progress.locator("pre")).toContainText("fixture: dependency install failed");
      await progress.getByRole("button", { name: ko ? "다시 시도" : "Retry" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(active).toHaveAttribute("data-workspace-id", /^worktree:/);
      await expect(dock.getByRole("tab", { name: ko ? /변경 검토/ : /Review changes/ })).toBeVisible();
    });
  }
}

test("a failed optional copy opens the new task after preparation", async ({ page }) => {
  await page.goto("/?stavePreview=workspace-creation&copy=fallback");
  const dialog = await createWorkspace(page, "en");
  await release(page, "checkout");
  await expect(dialog.getByRole("status")).toContainText("Copy reusable files");
  await release(page, "copy");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("workspace-pane-host").getByRole("tab", { name: /Review changes/ })).toBeVisible();
});

for (const lang of ["en", "ko"]) {
  test(`every preparation step is listed with its state, time and the running setup command in ${lang}`, async ({ page }) => {
    const ko = lang === "ko";
    await page.setViewportSize({ width: ko ? 560 : 1200, height: 800 });
    await page.goto(`/?stavePreview=workspace-creation&lang=${lang}&theme=light`);
    const dialog = await createWorkspace(page, lang);
    const progress = dialog.getByRole("region", { name: ko ? "워크스페이스 준비 중" : "Preparing workspace" });
    const steps = progress.getByRole("listitem");
    await expect(steps).toHaveCount(4);
    const row = (step: string) => progress.locator(`[data-step="${step}"]`);
    await expect(row("worktree")).toHaveAttribute("data-status", "running");
    await expect(row("task")).toHaveAttribute("data-status", "waiting");
    await expect(progress.getByRole("status")).toContainText(ko ? "4단계 중 1단계" : "Step 1 of 4");
    await expect(progress.getByRole("status")).toContainText("feature/review");
    // Before the worktree exists there is no workspace to come back to.
    await expect(progress.getByRole("button", { name: ko ? "백그라운드에서 계속" : "Continue in background" })).toHaveCount(0);
    await release(page, "checkout");
    await release(page, "copy");
    await expect(row("worktree")).toHaveAttribute("data-status", "complete");
    await expect(row("setup")).toHaveAttribute("data-status", "running");
    await expect(row("setup").locator("code")).toHaveText("bun install");
    // A finished step shows how long it took; the running one counts up.
    await expect(row("worktree")).toContainText(ko ? /초/ : /s$/);
    await expect(row("setup")).toContainText(ko ? /초/ : /\ds/, { timeout: 3_000 });
    // Step labels, marks and times share one row height and the marks one column.
    const geometry = await steps.evaluateAll((items) => items.map((item) => {
      const mark = item.querySelector("[data-state]")!.getBoundingClientRect();
      const label = item.querySelector("[data-aui-slot='body'] span")!.getBoundingClientRect();
      return { left: mark.left, offset: (mark.top + mark.height / 2) - (label.top + label.height / 2) };
    }));
    expect(Math.max(...geometry.map((row) => row.left)) - Math.min(...geometry.map((row) => row.left))).toBeLessThanOrEqual(0.5);
    // Each mark is centred on its label's first line.
    for (const row of geometry) expect(Math.abs(row.offset)).toBeLessThanOrEqual(1);
    await page.evaluate(() => document.fonts.ready);
    await dialog.screenshot({ path: `test-results/workspace-creation-checklist-${lang}.png` });
  });
}

test("continuing in the background closes the dialog, keeps preparing and reports a failure", async ({ page }) => {
  await page.goto("/?stavePreview=workspace-creation&lang=en&theme=dark");
  const dialog = await createWorkspace(page, "en");
  await release(page, "checkout");
  const background = dialog.getByRole("button", { name: "Continue in background" });
  await expect(background).toBeVisible();
  await expect(dialog.getByText("Preparation continues after you close this window.")).toBeVisible();
  await background.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("preview-active-workspace")).toHaveAttribute("data-workspace-id", "preview-existing");
  // Preparation goes on without the dialog; the fixture's first setup run fails.
  await release(page, "copy");
  await release(page, "setup");
  await expect(page.locator('[data-aui-slot="title"]', { hasText: "Preparing feature/review failed" })).toBeVisible();
  await expect(page.getByText("fixture: dependency install failed", { exact: false }).first()).toBeVisible();
  // The failed step keeps its retry for the workspace's own page (`WorkspacePaneHost`).
  const kept = await page.evaluate(async () => {
    const { useWorkspaceCreationStore } = await import("/src/store/workspace-creation-progress.ts");
    return Object.values(useWorkspaceCreationStore.getState().byId).map((progress) => ({
      status: progress?.steps.setup.status, retry: typeof progress?.steps.setup.retry,
    }));
  });
  expect(kept).toEqual([{ status: "failed", retry: "function" }]);
});

test("a workspace created after another went to the background still reports the first one's failure", async ({ page }) => {
  await page.goto("/?stavePreview=workspace-creation&lang=en&theme=light");
  const dialog = await createWorkspace(page, "en");
  await release(page, "checkout");
  await dialog.getByRole("button", { name: "Continue in background" }).click();
  await expect(dialog).toHaveCount(0);
  // A second workspace while the first keeps preparing.
  await page.getByTestId("preview-start").click();
  await dialog.getByRole("textbox", { name: "Workspace Branch Name" }).fill("feature/other");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Preparing workspace" })).toBeVisible();
  // Both setups run once and fail; only the backgrounded one reports through a notification.
  await release(page, "copy");
  await release(page, "setup");
  const title = (name: string) => page.locator('[data-aui-slot="title"]', { hasText: `Preparing ${name} failed` });
  await expect(title("feature/review")).toBeVisible();
  await expect(dialog.getByText("fixture: dependency install failed", { exact: false })).toBeVisible();
  await expect(title("feature/other")).toHaveCount(0);
});
