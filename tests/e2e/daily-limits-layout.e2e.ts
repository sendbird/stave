import { expect, test } from "@playwright/test";

for (const scenario of [
  { lang: "en", theme: "light", density: "regular", width: 1340, narrow: false,
    quota: "Account quota", history: "History", quotaTab: "Quota", title: "Today's daily limits",
    edit: "Change daily limit", providerTabs: "Provider settings",
    unit: "Claude daily limit unit", tokens: "Tokens", amount: "Claude daily limit amount", save: "Save" },
  { lang: "ko", theme: "dark", density: "compact", width: 690, narrow: true,
    quota: "계정 할당량", history: "기록", quotaTab: "할당량", title: "오늘의 일일 한도",
    edit: "일일 한도 변경", providerTabs: "프로바이더 설정",
    unit: "Claude 일일 한도 단위", tokens: "토큰", amount: "Claude 일일 한도 값", save: "저장" },
] as const) {
  test(`daily limits follow the primary content and fit the editor in ${scenario.lang} ${scenario.density}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: 920 });
    await page.goto("/");
    await expect(page.getByTestId("top-bar")).toBeVisible();
    await page.evaluate(async ({ lang, theme, density }) => {
      const { installUsagePreviewBridge } = await import("/src/dev/usage-preview/fixtures.ts");
      const { useAppStore } = await import("/src/store/app.store.ts");
      installUsagePreviewBridge(200);
      const app = useAppStore.getState();
      app.updateSettings({ patch: { language: lang, themeMode: theme, uiDensity: density } });
      app.openUsage();
    }, scenario);

    const quota = page.getByRole("region", { name: scenario.quota, exact: true });
    const disclosure = page.getByRole("button", { name: scenario.title, exact: true });
    const edit = page.getByRole("button", { name: scenario.edit, exact: true });
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await expect(quota).toBeVisible();
    await expect(edit).not.toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const quotaBounds = (await quota.boundingBox())!;
    expect((await disclosure.boundingBox())!.y).toBeGreaterThan(quotaBounds.y + quotaBounds.height);

    await page.getByRole("tab", { name: scenario.history, exact: true }).click();
    await expect(disclosure).toHaveCount(0);
    await page.getByRole("tab", { name: scenario.quotaTab, exact: true }).click();
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await edit.press("Enter");

    const settings = page.getByRole("dialog");
    // Let the lazy-loaded Settings dialog mount before checking focus.
    await settings.waitFor({ state: "visible" });
    const section = settings.getByRole("region", { name: scenario.title, exact: true });
    const unit = section.getByRole("combobox", { name: scenario.unit, exact: true });
    await expect(section).toBeFocused();
    await expect(unit).toBeVisible();
    await expect(section).toBeInViewport({ ratio: 1 });
    const providerTabs = settings.getByRole("tablist", { name: scenario.providerTabs, exact: true });
    const tabsBounds = (await providerTabs.boundingBox())!;
    expect((await section.boundingBox())!.y).toBeGreaterThan(tabsBounds.y + tabsBounds.height);

    const save = unit.locator("xpath=ancestor::form").getByRole("button", { name: scenario.save, exact: true });
    await expect(save).toBeDisabled();
    await unit.click();
    await page.getByRole("option", { name: scenario.tokens, exact: true }).click();
    const amount = section.getByRole("spinbutton", { name: scenario.amount, exact: true });
    await amount.fill("8000000");

    const usage = section.getByText(/6,610,456/);
    const bounds = (await section.boundingBox())!;
    const usageBounds = (await usage.boundingBox())!;
    const unitBounds = (await unit.boundingBox())!;
    const amountBounds = (await amount.boundingBox())!;
    const saveBounds = (await save.boundingBox())!;
    // In narrow settings the form wraps below the summary. Its three controls
    // remain center-aligned and keep the design system's 8px gap.
    if (scenario.narrow) expect(unitBounds.y).toBeGreaterThan(usageBounds.y + usageBounds.height);
    else expect(unitBounds.x).toBeGreaterThan(usageBounds.x + usageBounds.width);
    const center = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(center(unitBounds) - center(amountBounds))).toBeLessThanOrEqual(1);
    expect(Math.abs(center(unitBounds) - center(saveBounds))).toBeLessThanOrEqual(1);
    const gap = await amount.evaluate((element) =>
      parseFloat(getComputedStyle(element).getPropertyValue("--aui-space-8")) * parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(Math.abs(amountBounds.x - unitBounds.x - unitBounds.width - gap)).toBeLessThanOrEqual(1);
    expect(saveBounds.x + saveBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width);

    await save.click();
    await expect(usage).toContainText("8,000,000");
    await expect(save).toBeDisabled();
  });
}
