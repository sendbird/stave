import { expect, test, type Locator } from "@playwright/test";

const copy = {
  en: { settings: "Tars settings", general: "General", models: "Models", work: "Work", save: "Save", instructions: "Standing instructions", retention: "Keep ended work in the panel", never: "Until I clear it", model: "Conversation model" },
  ko: { settings: "Tars 설정", general: "기본", models: "모델", work: "작업 방식", save: "저장", instructions: "상시 지침", retention: "끝난 작업을 패널에 두는 기간", never: "직접 정리할 때까지", model: "대화 모델" },
} as const;

async function expectContained(panel: Locator) {
  const measures = await panel.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return { width: node.scrollWidth - node.clientWidth, top: bounds.top, bottom: bounds.bottom, height: innerHeight };
  });
  expect(measures.width).toBeLessThanOrEqual(1);
  expect(measures.top).toBeGreaterThanOrEqual(0);
  expect(measures.bottom).toBeLessThanOrEqual(measures.height + 1);
}

async function expectActiveIndicator(sheet: Locator) {
  await expect.poll(() => sheet.getByRole("tablist").evaluate((list) => {
    const tab = list.querySelector('[role=tab][aria-selected=true]')!.getBoundingClientRect();
    const mark = list.querySelector('[role=presentation]')!.getBoundingClientRect();
    return Math.max(Math.abs(mark.x + mark.width / 2 - tab.x - tab.width / 2), Math.abs(mark.width - tab.width));
  })).toBeLessThanOrEqual(1);
}

test("invalid fields reveal their category, and closing does not save a draft", async ({ page }) => {
  await page.goto("/?stavePreview=tars");
  const open = page.getByRole("button", { name: "Tars settings", exact: true });
  await open.click();
  const sheet = page.getByRole("dialog");
  const work = sheet.getByRole("tab", { name: "Work", exact: true });
  const models = sheet.getByRole("tab", { name: "Models", exact: true });
  const limit = sheet.getByRole("spinbutton", { name: "Turn limit per task, including helpers", exact: true });
  await work.click();
  await limit.fill("0");
  await models.click();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(work).toHaveAttribute("aria-selected", "true");
  await expect(limit).toBeFocused();
  await expect(sheet).toBeVisible();
  await limit.fill("12");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await open.click();
  const instructions = sheet.getByLabel("Standing instructions", { exact: true });
  const saved = await instructions.inputValue();
  await instructions.fill("Do not persist this draft.");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await open.click();
  await expect(instructions).toHaveValue(saved);
  await work.click();
  await expect(limit).toHaveValue("12");
});

for (const lang of ["en", "ko"] as const) for (const theme of ["light", "dark"] as const) for (const density of ["regular", "compact"] as const) {
  test(`Tars settings categories keep controls and Save reachable (${lang} ${theme} ${density})`, async ({ page }, testInfo) => {
    const text = copy[lang];
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/?stavePreview=tars&lang=${lang}&theme=${theme}&density=${density}`);
    await page.getByRole("button", { name: text.settings, exact: true }).click();
    const sheet = page.getByRole("dialog");
    await page.evaluate(() => document.fonts.ready);
    await expect(sheet.getByRole("tab", { name: text.general, exact: true })).toHaveAttribute("aria-selected", "true");
    const instructions = sheet.getByLabel(text.instructions, { exact: true });
    const defaults = await instructions.inputValue();
    expect(defaults.length).toBeGreaterThan(30);
    await expectActiveIndicator(sheet);
    await page.screenshot({ path: testInfo.outputPath("settings-general-default-390.png") });
    await instructions.fill("Preserve this draft.");
    const retention = sheet.getByRole("combobox", { name: text.retention, exact: true });
    await retention.click();
    await page.getByRole("option", { name: text.never, exact: true }).click();
    await expect(retention).toContainText(text.never);

    // Arrow keys move between the categories; hidden forms preserve their drafts.
    const general = sheet.getByRole("tab", { name: text.general, exact: true });
    await general.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(sheet.getByRole("button", { name: text.model, exact: true })).toBeVisible();
    await sheet.getByRole("tab", { name: text.work, exact: true }).click();
    const details = sheet.locator("[data-tars-autonomy-details]");
    const toggle = sheet.locator("[data-tars-autonomy-details-toggle]");
    await expect(details).toBeHidden();
    await expectActiveIndicator(sheet);
    await page.screenshot({ path: testInfo.outputPath("settings-work-overview-390.png") });
    await toggle.click();
    await expect(details).toBeVisible();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await expectActiveIndicator(sheet);
      await expectContained(sheet.getByRole("tabpanel"));
      await details.scrollIntoViewIfNeeded();
      expect(await details.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      const save = sheet.getByRole("button", { name: text.save, exact: true });
      await expect(save).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`settings-work-${width}.png`) });
    }
    await toggle.click();
    await expect(details).toBeHidden();
    await sheet.getByRole("tab", { name: text.models, exact: true }).click();
    await expectActiveIndicator(sheet);
    await expectContained(sheet.getByRole("tabpanel"));
    await page.screenshot({ path: testInfo.outputPath("settings-models.png") });
    await general.click();
    await expect(instructions).toHaveValue("Preserve this draft.");
    await expect(retention).toContainText(text.never);
    await expectActiveIndicator(sheet);
    await expectContained(sheet.getByRole("tabpanel"));
    await page.screenshot({ path: testInfo.outputPath("settings-general.png") });
    await sheet.getByRole("button", { name: text.save, exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: text.settings, exact: true }).click();
    await expect(instructions).toHaveValue("Preserve this draft.");
    await expect(retention).toContainText(text.never);
  });
}
