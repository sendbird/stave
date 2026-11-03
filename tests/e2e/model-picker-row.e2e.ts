import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * A model row's price must never take the room of the model's name: the name
 * owns its line, and the price ends the id line, dropping below the id when
 * both do not fit. Measured on the rendered boxes, not on DOM text that an
 * ellipsis can hide.
 */

const LOCALES = {
  en: { edit: (label: string) => `Edit ${label}`, model: /^Model/, search: "Search models" },
  ko: { edit: (label: string) => `${label} 항목 편집`, model: /^모델/, search: "모델 검색" },
} as const;

/** Every task preset in the fixture: Claude, Codex, Cursor, Kiro, OpenCode. */
const PRESETS = [
  "Planning",
  "Implementation",
  "길이가 긴 사용자 지정 프리셋 이름 Long custom preset label",
  "Investigation",
  "Default effort",
] as const;

async function openPresetModelPicker(page: Page, locale: keyof typeof LOCALES, preset: string) {
  const copy = LOCALES[locale];
  await page.getByRole("button", { name: copy.edit(preset), exact: true }).click();
  const trigger = page.locator("form").getByRole("combobox", { name: copy.model });
  await trigger.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox.getByRole("option").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return { trigger, listbox };
}

/** Overflow of the element's own text past its box, in CSS pixels. */
function textOverflow(locator: Locator) {
  return locator.evaluate((element) => element.scrollWidth - element.clientWidth);
}

async function expectPricedRowsKeepTheirNames(listbox: Locator) {
  const rows = listbox.getByRole("option");
  const count = await rows.count();
  let priced = 0;
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    await row.scrollIntoViewIfNeeded();
    const meta = row.locator("[data-option-meta]");
    if ((await meta.count()) === 0) continue;
    priced += 1;
    const label = row.locator("[data-option-label]");
    const detail = row.locator("[data-option-detail]");
    // fractional font metrics can round by one CSS pixel
    expect(await textOverflow(label), await row.innerText()).toBeLessThanOrEqual(1);
    expect(await textOverflow(detail), await row.innerText()).toBeLessThanOrEqual(1);
    const [labelBox, detailBox, metaBox, rowBox] = await Promise.all([
      label.boundingBox(),
      detail.boundingBox(),
      meta.boundingBox(),
      row.boundingBox(),
    ]);
    // The price sits below the name, never beside it, and stays inside the row.
    expect(metaBox!.y).toBeGreaterThanOrEqual(labelBox!.y + labelBox!.height - 1);
    expect(metaBox!.y).toBeGreaterThanOrEqual(detailBox!.y - 1);
    expect(metaBox!.x + metaBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1);
    expect(metaBox!.y + metaBox!.height).toBeLessThanOrEqual(rowBox!.y + rowBox!.height + 1);
  }
  return priced;
}

for (const locale of ["en", "ko"] as const) {
  test(`model rows keep the full name and id beside a price (${locale})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 800, height: 760 });
    await page.goto(`/tests/e2e/fixtures/task-presets.html?theme=dark&locale=${locale}`);
    let pricedRows = 0;
    for (const preset of PRESETS) {
      const { listbox } = await openPresetModelPicker(page, locale, preset);
      pricedRows += await expectPricedRowsKeepTheirNames(listbox);
      if (preset === "Planning") {
        await page.screenshot({ path: testInfo.outputPath(`model-picker-${locale}.png`) });
      }
      await page.keyboard.press("Escape");
      await expect(listbox).toBeHidden();
      await page.getByRole("button", { name: locale === "ko" ? "취소" : "Cancel", exact: true }).click();
      await expect(page.locator("form")).toHaveCount(0);
    }
    // Claude and Codex publish prices; the runtime-catalog providers do not.
    expect(pricedRows).toBeGreaterThan(4);
  });
}

test("the chosen model reads as chosen, like every other ADS picker", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/task-presets.html?theme=dark");
  const { listbox } = await openPresetModelPicker(page, "en", "Planning");
  const chosen = listbox.getByRole("option", { selected: true });
  await expect(chosen).toHaveCount(1);
  await expect(chosen).toContainText("Claude Opus 5.5");
  const other = listbox.getByRole("option", { selected: false }).first();
  const ink = (row: Locator) => row.locator("[data-option-label]").evaluate((element) => getComputedStyle(element).color);
  const accent = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--ads-color-accent, var(--primary))";
    document.querySelector("[role=listbox]")!.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  expect(await ink(chosen)).toBe(accent);
  expect(await ink(other)).not.toBe(accent);
});

test("the list opens below a picker that has room and never covers its own field", async ({ page }) => {
  // Room below for the search and a few rows: the list opens below and
  // scrolls, rather than flipping over the Type and Provider fields.
  await page.setViewportSize({ width: 800, height: 760 });
  await page.goto("/tests/e2e/fixtures/task-presets.html?theme=dark");
  let { trigger, listbox } = await openPresetModelPicker(page, "en", "Planning");
  let triggerBox = (await trigger.boundingBox())!;
  let popupBox = (await listbox.locator("xpath=ancestor::*[@data-side][1]").boundingBox())!;
  expect(await listbox.locator("xpath=ancestor::*[@data-side][1]").getAttribute("data-side")).toBe("bottom");
  expect(popupBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height);
  expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(760);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("form")).toHaveCount(0);

  // Too little room below for a usable list: it opens above, clear of the
  // field it belongs to.
  await page.setViewportSize({ width: 800, height: 560 });
  ({ trigger, listbox } = await openPresetModelPicker(page, "en", "Planning"));
  triggerBox = (await trigger.boundingBox())!;
  popupBox = (await listbox.locator("xpath=ancestor::*[@data-side][1]").boundingBox())!;
  expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(triggerBox.y);
});

test("the dialog model selector keeps the name's line and moves the price to the id line", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=ads-regressions");
  await page.getByRole("button", { name: "Claude Opus 5", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const priced = dialog.getByRole("option").filter({ has: page.locator("[data-model-price]") });
  const count = await priced.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const row = priced.nth(index);
    const label = row.locator("[data-model-option-label]").first();
    const price = row.locator("[data-model-price]");
    const rowBox = (await row.boundingBox())!;
    const labelBox = (await label.boundingBox())!;
    const priceBox = (await price.boundingBox())!;
    expect(await textOverflow(label), await label.innerText()).toBeLessThanOrEqual(1);
    // The whole name is painted inside the row, not clipped by the title line.
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
    expect(priceBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height - 1);
    expect(priceBox.x + priceBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
  }
});
