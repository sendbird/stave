import { expect, test } from "@playwright/test";

for (const lang of ["en", "ko"]) {
  for (const theme of ["light", "dark"]) {
    test(`workspace preparation is visible before Git and recovers in place in ${lang} / ${theme}`, async ({ page }) => {
      const ko = lang === "ko";
      await page.setViewportSize({ width: ko ? 560 : 1200, height: 800 });
      await page.goto(`/?stavePreview=workspace-creation&lang=${lang}&theme=${theme}`);
      await page.getByTestId("preview-start").click();
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b).*$/);
      const row = page.getByTestId("preview-workspace-row");
      const progress = page.getByRole("region", { name: ko ? "워크스페이스 준비 중" : "Preparing workspace" });
      await expect(row.getByRole("status")).toHaveText(ko ? "worktree 만들기" : "Create worktree");
      const id = await row.getAttribute("data-workspace-id");
      expect(id).toMatch(/^worktree:/);
      await expect(progress.getByText(ko ? "변경 내용을 확인하고 테스트를 추가하세요." : "Review the changes and add a test.")).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await expect(progress.getByRole("status")).toHaveCount(1);
      const layout = await progress.evaluate((panel) => {
        const content = panel.firstElementChild!.getBoundingClientRect();
        const bounds = panel.getBoundingClientRect();
        const padding = parseFloat(getComputedStyle(panel).paddingInlineStart);
        return {
          offsetX: (content.left + content.right - bounds.left - bounds.right) / 2,
          offsetY: (content.top + content.bottom - bounds.top - bounds.bottom) / 2,
          inlineInset: content.left - bounds.left,
          padding,
        };
      });
      // Centering across fractional pixel grid tracks can round by one pixel.
      expect(Math.abs(layout.offsetX)).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.offsetY)).toBeLessThanOrEqual(1);
      expect(layout.inlineInset).toBeGreaterThanOrEqual(layout.padding - 1);
      await page.getByTestId("preview-checkout").click();
      await expect(row.getByRole("status")).toHaveText(ko ? "재사용할 파일 복사" : "Copy reusable files");
      await page.getByTestId("preview-copy").click();
      await expect(row.getByRole("status")).toHaveText(ko ? "설정 실행" : "Run setup");
      await page.getByTestId("preview-setup").click();
      await expect(row.getByRole("status")).toHaveText(ko ? "설정 실행 실패" : "Failed to finish: Run setup");
      await expect(progress.getByText("fixture: dependency install failed", { exact: false })).toBeVisible();
      const logs = progress.getByRole("button", { name: ko ? "로그 열기" : "Open logs" });
      await expect(logs).toBeInViewport();
      await logs.click();
      await expect(progress.locator("pre")).toContainText("fixture: dependency install failed");
      await progress.getByRole("button", { name: ko ? "다시 시도" : "Retry" }).click();
      await expect(progress).toBeHidden();
      await expect(page.getByTestId("workspace-pane-host")).toBeVisible();
      await expect(row).toHaveAttribute("data-workspace-id", id!);
      await expect(row.getByRole("status")).toHaveCount(0);
    });
  }
}

test("a failed optional copy opens the task without a preparation banner", async ({ page }) => {
  await page.goto("/?stavePreview=workspace-creation&copy=fallback");
  await page.getByTestId("preview-start").click();
  await page.getByTestId("preview-checkout").click();
  const row = page.getByTestId("preview-workspace-row");
  await expect(row.getByRole("status")).toHaveText("Copy reusable files");
  await page.getByTestId("preview-copy").click();
  const dock = page.getByTestId("workspace-pane-host");
  await expect(dock).toBeVisible();
  await expect(dock.getByRole("tab", { name: /Review changes/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Preparing workspace" })).toHaveCount(0);
  await expect(row.getByRole("status")).toHaveCount(0);
});
