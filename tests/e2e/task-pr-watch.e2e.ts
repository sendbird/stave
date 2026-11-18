import { expect, test } from "@playwright/test";

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  for (const width of [1440, 1024]) {
    test(`task watch record stops an automatic watch (${lang}, ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?stavePreview=transcript-rows&lang=${lang}&theme=${theme}&prWatch=1`);
      await expect(page.getByText("Plan the next settings pass.", { exact: true })).toBeVisible();
      const notice = page.getByTestId("task-pr-watch-notice");
      await expect(notice).toBeVisible();
      await expect(notice).toContainText("PR #17");
      await expect(notice).toContainText(lang === "ko" ? "검사 실패와 충돌을 감시하는 중" : "Watching for failing checks and conflicts");
      await page.evaluate(() => document.fonts.ready);
      const icon = notice.locator("svg");
      const text = notice.locator("p").first();
      const iconBox = await icon.boundingBox();
      const textBox = await text.boundingBox();
      expect(Math.abs(iconBox!.y + iconBox!.height / 2 - textBox!.y - textBox!.height / 2)).toBeLessThanOrEqual(1);
      expect(await notice.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await notice.getByRole("button", { name: lang === "ko" ? "감시 중지" : "Stop watching", exact: true }).click();
      await expect(notice).toHaveCount(0);
    });
  }
}

test("a watch the user scheduled links to Schedules and offers no stop", async ({ page }) => {
  await page.goto("/?stavePreview=transcript-rows&lang=en&theme=light&prWatch=user");
  const notice = page.getByTestId("task-pr-watch-notice");
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("button", { name: "Stop watching" })).toHaveCount(0);
  await expect(notice.getByRole("button", { name: "Open in Schedules", exact: true })).toBeVisible();
});

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  for (const width of [1440, 1024]) {
    test(`repository watch setting overrides and returns to the global switch (${lang}, ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?stavePreview=transcript-rows&lang=${lang}&theme=${theme}&watchSettings=1`);
      const toggle = page.getByRole("switch", { name: lang === "ko" ? "이 저장소의 PR 감시" : "Watch pull requests in this repository", exact: true });
      const useGlobal = page.getByRole("button", { name: lang === "ko" ? "전체 설정 사용" : "Use the global setting", exact: true });
      await expect(toggle).toBeChecked();
      await expect(useGlobal).toHaveCount(0);
      await toggle.click();
      await expect(toggle).not.toBeChecked();
      await expect(useGlobal).toBeVisible();
      await useGlobal.click();
      await expect(toggle).toBeChecked();
      await expect(useGlobal).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
    });
  }
}
