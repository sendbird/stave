import { expect, test } from "@playwright/test";

for (const lang of ["en", "ko"]) {
  for (const theme of ["light", "dark"]) {
    test(`opens a pull request from the workspace dialog in ${lang} / ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: lang === "ko" ? 620 : 1200, height: 800 });
      await page.goto(`/?stavePreview=workspace-pr&lang=${lang}&theme=${theme}`);
      const dialog = page.getByRole("dialog");
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b).*$/);
      await dialog.getByRole("button", { name: lang === "ko" ? "PR에서 열기" : "Open From Pull Request" }).click();
      const input = dialog.getByRole("textbox", { name: lang === "ko" ? "PR URL 또는 번호" : "Pull request URL or number" });
      await expect(input).toBeInViewport();
      const create = dialog.getByRole("button", { name: lang === "ko" ? "만들기" : "Create", exact: true });
      await input.fill("https://example.com/a/b/pull/123");
      await create.click();
      await expect(dialog.getByRole("alert")).toBeVisible();
      const reference = theme === "dark" ? "#123" : "https://github.com/a/b/pull/123";
      await input.fill(reference);
      await create.click();
      await expect(page.getByTestId("submitted-reference")).toHaveText(reference);
      await expect(dialog).toBeHidden();
    });
  }
}
