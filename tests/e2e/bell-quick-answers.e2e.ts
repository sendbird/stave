import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const copy = {
  en: {
    bell: "notifications", short: "Export data", long: "Review export requirements",
    stale: "Ended task", unavailable: "Request unavailable", openTask: "Open task",
    sent: "Answer sent", failed: "Could not answer the request.", allowOnce: "Allow the request in Check settings once",
  },
  ko: {
    bell: "알림", short: "데이터 내보내기", long: "내보내기 설정 검토",
    stale: "종료된 작업", unavailable: "응답할 수 없는 요청", openTask: "작업 열기",
    sent: "응답을 보냈습니다", failed: "요청에 응답하지 못했습니다.", allowOnce: "설정 확인 작업의 요청 한 번 허용",
  },
};

async function openBell(page: Page, params: string, lang: keyof typeof copy) {
  await page.goto(`/?stavePreview=bell-answers&${params}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: copy[lang].bell, exact: true }).click();
  return page.getByRole("dialog");
}

for (const lang of ["en", "ko"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`bell quick answers (${lang}, ${theme})`, async ({ page }) => {
      const labels = copy[lang];
      await page.setViewportSize({ width: theme === "dark" ? 390 : 850, height: 900 });
      const panel = await openBell(page, `lang=${lang}&theme=${theme}&density=${theme === "dark" ? "compact" : "regular"}`, lang);
      const short = panel.getByRole("listitem").filter({ hasText: labels.short });
      const long = panel.getByRole("listitem").filter({ hasText: labels.long });
      const stale = panel.getByRole("listitem").filter({ hasText: labels.stale });
      const choice = short.getByRole("button", { name: "JSON", exact: true });
      const openTask = long.getByRole("button", { name: labels.openTask, exact: true });
      const unavailable = stale.getByRole("button", { name: labels.unavailable, exact: true });
      const allowOnce = panel.getByRole("button", { name: labels.allowOnce, exact: true });

      await expect(choice).toBeEnabled();
      await expect(unavailable).toBeDisabled();
      await expect(stale.getByRole("button", { name: /allow|허용/i })).toHaveCount(0);
      await expect(openTask).toBeEnabled();
      await expect(long.getByRole("button", { name: "JSON", exact: true })).toHaveCount(0);

      await page.evaluate(() => document.fonts.ready);
      for (const control of [choice, openTask, unavailable, allowOnce]) {
        const bounds = await control.evaluate((button) => {
          const control = button.getBoundingClientRect();
          const row = button.closest("li")!.getBoundingClientRect();
          const minimum = parseFloat(getComputedStyle(button).getPropertyValue("--aui-control-height-sm"));
          // The popover scales during its entrance. Measure the control box before that transform.
          return { height: (button as HTMLElement).offsetHeight, width: (button as HTMLElement).offsetWidth, minimum,
            overflow: Math.max(row.left - control.left, control.right - row.right) };
        });
        expect(bounds.height).toBeGreaterThanOrEqual(bounds.minimum);
        expect(bounds.width).toBeGreaterThanOrEqual(bounds.minimum);
        expect(bounds.overflow).toBeLessThanOrEqual(1);
      }

      const screenshots = process.env.STAVE_BELL_SCREENSHOTS;
      if (screenshots) {
        await page.screenshot({ path: `${screenshots}/after-${lang}-${theme}.png`, animations: "disabled" });
      }
      await choice.click();
      await expect(short.getByRole("status")).toHaveText(labels.sent);
      await expect(page.getByTestId("opened-task")).toBeEmpty();
      if (screenshots && lang === "en" && theme === "light") {
        await page.screenshot({ path: `${screenshots}/after-answer.png`, animations: "disabled" });
      }
      await expect(short).toHaveCount(0, { timeout: 6_000 });
      await expect(stale).toHaveCount(0);
      await openTask.click();
      await expect(page.getByTestId("opened-task")).toHaveText("long");
    });
  }
}

test("a delivery error stays visible and opens the task", async ({ page }) => {
  const panel = await openBell(page, "delivery=fail", "en");
  const row = panel.getByRole("listitem").filter({ hasText: copy.en.short });
  await row.getByRole("button", { name: "JSON", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveText(copy.en.failed);
  await expect(row.getByRole("button", { name: "JSON", exact: true })).toHaveCount(0);
  await row.getByRole("button", { name: copy.en.openTask, exact: true }).click();
  await expect(page.getByTestId("opened-task")).toHaveText("short");
});

test("the setting disables both types of shortcut", async ({ page }) => {
  const panel = await openBell(page, "actions=off", "en");
  await expect(panel.getByRole("button", { name: "JSON", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: copy.en.allowOnce, exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: copy.en.openTask, exact: true })).toHaveCount(3);
});

test("the approval shortcut answers once from the bell", async ({ page }) => {
  const panel = await openBell(page, "", "en");
  const allow = panel.getByRole("button", { name: copy.en.allowOnce, exact: true });
  await expect(allow).toBeVisible();
  await expect(panel.getByRole("button", { name: /always allow/i })).toHaveCount(0);
  const row = panel.getByRole("listitem").filter({ hasText: "Check settings" });
  await allow.click();
  await expect(row.getByRole("status")).toHaveText(copy.en.sent);
  await expect(row).toHaveCount(0);
  await expect(page.getByTestId("opened-task")).toBeEmpty();
});
