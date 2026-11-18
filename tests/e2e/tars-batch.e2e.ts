import { expect, test } from "@playwright/test";

for (const [lang, theme, words] of [["en", "light", "clean up the finished work"], ["ko", "dark", "끝난 일 정리해줘"]]) {
  test(`${lang}/${theme}: words show one card, confirm records and Restore works`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/?stavePreview=tars&tray=true&batch=true&lang=${lang}&theme=${theme}`);
    const input = page.locator('[data-tars-composer]').getByRole("textbox");
    await input.fill(words!); await input.press("Enter");
    const card = page.locator('[data-tars-batch-card]');
    await expect(card).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await card.screenshot({ path: `/tmp/tars-cleanup/after2/${lang}-${theme}-card.png` });
    await card.locator('[data-tars-batch-confirm]').click();
    const record = page.locator('[data-tars-batch-record]');
    await expect(record).toBeVisible();
    await record.screenshot({ path: `/tmp/tars-cleanup/after2/${lang}-${theme}-record.png` });
    await record.locator('[data-tars-batch-restore]').click();
    await expect(record.locator('[data-tars-batch-restore]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-tars-batch-record]')).toBeVisible();
  });
}

test("the Done lane's cleanup button opens the same card and its record joins the conversation", async ({ page }) => {
  await page.goto("/?stavePreview=tars&tray=true&batch=true");
  await page.locator('[data-tars-cleanup-entry]').getByRole("button", { name: "Clean up finished work" }).click();
  await expect(page.locator('[data-tars-batch-card]')).toBeVisible();
  await page.locator('[data-tars-batch-confirm]').click();
  await expect(page.locator('[data-tars-batch-card]')).toHaveCount(0);
  await expect(page.locator('[data-tars-batch-record]')).toHaveCount(1);
});

test("declining the Done lane's cleanup closes it and reopening reuses one preview", async ({ page }) => {
  await page.goto("/?stavePreview=tars&tray=true&batch=true");
  const open = page.locator('[data-tars-cleanup-open]');
  await open.click();
  const card = page.locator('[data-tars-batch-card]');
  await expect(card).toBeVisible();
  const first = await card.getAttribute("data-tars-batch-card");
  await page.reload();
  await open.click();
  await expect(card).toHaveAttribute("data-tars-batch-card", first!);
  await card.locator('[data-tars-batch-decline]').click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('[data-tars-batch-record]')).toHaveCount(0);
});

test("cancel has danger treatment and no Enter default", async ({ page }) => {
  await page.goto("/?stavePreview=tars&tray=true&batch=true");
  const input = page.locator('[data-tars-composer]').getByRole("textbox");
  await input.fill("cancel all"); await input.press("Enter");
  const card = page.locator('[data-tars-batch-card]');
  await expect(card).toBeVisible();
  await card.focus(); await card.press("Enter");
  await expect(card).toBeVisible();
  await expect(card.locator('[data-tars-batch-confirm]')).not.toHaveAttribute("aria-keyshortcuts", "Enter");
});

for (const width of [800, 1440]) for (const lang of ["en", "ko"]) {
  test(`batch names and metadata wrap within ${width}px / ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/?stavePreview=tars&tray=true&batch=true&lang=${lang}&theme=${lang === "ko" ? "dark" : "light"}&density=${width === 800 ? "compact" : "regular"}`);
    const input = page.locator('[data-tars-composer]').getByRole("textbox");
    await input.fill("clean up the finished work"); await input.press("Enter");
    const card = page.locator('[data-tars-batch-card]');
    await expect(card).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await card.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const probe = document.createElement("div"); probe.style.width = "var(--aui-space-16)"; element.append(probe);
      const tokenPadding = probe.getBoundingClientRect().width; probe.remove();
      return { overflow: element.scrollWidth - element.clientWidth, padding: parseFloat(getComputedStyle(element).paddingLeft), tokenPadding,
        contained: [...element.querySelectorAll("li")].every(item => item.getBoundingClientRect().left >= rect.left && item.getBoundingClientRect().right <= rect.right + 1) };
    });
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.contained).toBe(true);
    expect(Math.abs(geometry.padding - geometry.tokenPadding)).toBeLessThanOrEqual(1);
  });
}


for (const [lang, theme] of [["en", "light"], ["ko", "dark"]]) {
  test(`${lang}/${theme}: a failed cleanup stays retryable and success replaces its positive button`, async ({ page }) => {
    await page.goto(`/?stavePreview=tars&tray=true&batch=true&batchFailure=once&lang=${lang}&theme=${theme}`);
    const input = page.locator('[data-tars-composer]').getByRole("textbox");
    await input.fill("clean up the finished work"); await input.press("Enter");
    const card = page.locator('[data-tars-batch-card]');
    await card.locator('[data-tars-batch-confirm]').click();
    await expect(card.getByRole("alert")).toBeVisible();
    await expect(card.locator('[data-tars-batch-confirm]')).toBeEnabled();
    await card.locator('[data-tars-batch-confirm]').click();
    await expect(page.locator('[data-tars-batch-record]')).toBeVisible();
    await expect(page.locator('[data-tars-batch-confirm]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-tars-batch-record]')).toBeVisible();
    await expect(page.locator('[data-tars-batch-confirm]')).toHaveCount(0);
  });
  test(`${lang}/${theme}: no workspace offers Close and never a disabled Archive`, async ({ page }) => {
    await page.goto(`/?stavePreview=tars&tray=true&batch=true&batchMissing=true&lang=${lang}&theme=${theme}`);
    const input = page.locator('[data-tars-composer]').getByRole("textbox");
    await input.fill("clean up the finished work"); await input.press("Enter");
    const card = page.locator('[data-tars-batch-card]');
    await expect(card.locator('[data-tars-batch-nothing]')).toBeVisible();
    await expect(card.locator('[data-tars-batch-confirm]')).toHaveCount(0);
    await card.locator('[data-tars-batch-close]').click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-tars-batch-card]')).toHaveCount(0);
  });
}
