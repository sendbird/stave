import { expect, test, type Page } from "@playwright/test";

async function createWorkspace(page: Page, lang: string) {
  await page.getByTestId("preview-start").click();
  const dialog = page.getByRole("dialog");
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
