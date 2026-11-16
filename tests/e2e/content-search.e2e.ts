import { expect, test } from "@playwright/test";

for (const [locale, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  test(`palette message results support keyboard opening and highlighted text in ${locale}/${theme}`, async ({ page }) => {
    await page.goto(`/?stavePreview=command-palette&lang=${locale}&theme=${theme}`, { waitUntil: "domcontentloaded" });
    const input = page.getByRole("combobox");
    await input.fill("export retry");
    const result = page.locator("[data-content-search-result]");
    await expect(result).toHaveCount(1);
    await expect(result.locator("mark").first()).toBeVisible();
    await expect(result).toContainText(locale === "en" ? "Archived" : "보관됨");
    await expect(result).toContainText(locale === "en" ? "Delegated" : "위임된 작업");
    await page.evaluate(() => document.fonts.ready);
    const geometry = await result.evaluate((node) => {
      const snippet = node.querySelector<HTMLElement>("[data-content-search-snippet]")!;
      const details = snippet.parentElement!;
      const row = node.getBoundingClientRect();
      const mark = snippet.querySelector("mark")!.getBoundingClientRect();
      return { gap: getComputedStyle(details).gap, padding: getComputedStyle(node).paddingBlockStart,
        overflow: node.scrollWidth > node.clientWidth, contained: mark.left >= row.left && mark.right <= row.right };
    });
    expect(geometry.gap).toBe("4px");
    expect(geometry.padding).toBe("8px");
    expect(geometry.overflow).toBe(false);
    expect(geometry.contained).toBe(true);
    await page.screenshot({ path: `/tmp/content-search/after/palette-${locale}-${theme}.png` });
    await page.setViewportSize({ width: 480, height: 800 });
    await page.evaluate(() => document.fonts.ready);
    expect(await result.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await input.press("Enter");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __stavePalettePreview: { openedMessages: string[] } }).__stavePalettePreview.openedMessages)).toEqual(["m-export-retry"]);
  });

  test(`Fleet includes message matches with snippets only when enabled in ${locale}/${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/tests/e2e/fixtures/content-search.html?lang=${locale}&theme=${theme}`, { waitUntil: "domcontentloaded" });
    const query = page.locator("[data-fleet-filter-input]");
    await query.fill(locale === "en" ? "export retry" : "내보내기");
    await expect(page.locator("[data-fleet-content-results]")).toHaveCount(0);
    await page.getByTestId("fleet-include-message-text").click();
    const results = page.locator("[data-fleet-content-results]");
    await expect(results).toContainText("Investigate delivery");
    await expect(page.getByText(locale === "en" ? "No tasks match this filter." : "이 필터에 맞는 작업이 없습니다.", { exact: true })).toHaveCount(0);
    await expect(results.locator("mark").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `/tmp/content-search/after/fleet-${locale}-${theme}.png` });
    await results.getByRole("button").first().click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __contentSearchOpened: Array<{ messageId: string }> }).__contentSearchOpened[0]?.messageId)).toBe("message-export-retry");
    await page.getByTestId("fleet-include-message-text").click();
    await expect(results).toHaveCount(0);
  });
}

test("new palette queries invalidate old message results", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette&searchDelay=500", { waitUntil: "domcontentloaded" });
  const input = page.getByRole("combobox");
  await input.fill("export");
  await input.fill("not-found");
  await expect(page.locator("[data-content-search-result]")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "No matching messages." })).toBeVisible();
});
