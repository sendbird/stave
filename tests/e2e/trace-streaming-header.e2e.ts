import { expect, test, type Page } from "@playwright/test";

/**
 * The running turn's header on the real `AssistantMessageBody` (agent trace
 * preview): status phrase · newest in-progress step · elapsed time, on one
 * line. When the column is short the activity ellipsizes first; the phrase
 * keeps its words while there is room for them and the clock is never cut.
 * Measured in English and Korean, light and dark, wide and narrow.
 */

async function open(page: Page, args: { locale: "en" | "ko"; dark: boolean }) {
  // One fixed phrase, so a 3s rotation cannot change the width mid-measure.
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await page.goto("/?stavePreview=agent-messages");
  const label = page.locator("[data-trace-streaming-label]");
  await expect(label).toBeVisible();
  // The preview opens dark; the toggle names the current theme.
  if (!args.dark) {
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  }
  await page.evaluate(async (locale) => {
    const path = "/src/i18n/runtime.ts";
    const { i18n } = await import(path);
    await i18n.changeLanguage(locale);
    await document.fonts.ready;
  }, args.locale);
  await expect(label.locator('[data-trace-streaming-part="activity"]')).toBeVisible();
  await expect(label.locator('[data-trace-streaming-part="elapsed"]')).toBeVisible();
}

async function setColumnWidth(page: Page, width: number | null) {
  await page.locator("[data-trace-streaming-label]").evaluate((label, value) => {
    const column = label.closest("section")!;
    column.style.width = value === null ? "" : `${value}px`;
    column.style.maxWidth = value === null ? "" : `${value}px`;
  }, width);
}

async function measure(page: Page) {
  return page.locator("[data-trace-streaming-label]").evaluate((label) => {
    const part = (name: string) =>
      label.querySelector<HTMLElement>(`[data-trace-streaming-part="${name}"]`)!;
    const box = (element: Element) => element.getBoundingClientRect();
    const trigger = label.closest("button")!;
    const phrase = part("phrase");
    const activity = part("activity");
    const elapsed = part("elapsed");
    const centre = (rect: DOMRect) => rect.top + rect.height / 2;
    const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight) ||
      Number.parseFloat(getComputedStyle(label).fontSize) * 1.5;
    return {
      triggerRight: box(trigger).right,
      labelHeight: box(label).height,
      lineHeight,
      phrase: { centre: centre(box(phrase)), width: box(phrase).width, truncated: phrase.scrollWidth > phrase.clientWidth + 1 },
      activity: { centre: centre(box(activity)), width: box(activity).width, truncated: activity.scrollWidth > activity.clientWidth + 1 },
      elapsed: {
        centre: centre(box(elapsed)),
        right: box(elapsed).right,
        truncated: elapsed.scrollWidth > elapsed.clientWidth + 1,
        text: elapsed.textContent ?? "",
      },
      ellipsis: getComputedStyle(activity).textOverflow,
    };
  });
}

for (const locale of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    test(`streaming header keeps phrase, activity and clock on one line (${locale}, ${dark ? "dark" : "light"})`, async ({ page }) => {
      await open(page, { locale, dark });

      // Wide: every part is whole and they share one line.
      const wide = await measure(page);
      expect(wide.phrase.truncated).toBe(false);
      expect(wide.activity.truncated).toBe(false);
      expect(wide.elapsed.truncated).toBe(false);
      expect(wide.elapsed.text).toMatch(/\d/);
      expect(wide.labelHeight).toBeLessThanOrEqual(wide.lineHeight * 1.5);
      for (const centre of [wide.activity.centre, wide.elapsed.centre]) {
        expect(Math.abs(centre - wide.phrase.centre)).toBeLessThanOrEqual(1);
      }

      // Narrow: the activity ellipsizes first. The phrase stays whole and the
      // clock stays inside the header.
      await setColumnWidth(page, 320);
      const narrow = await measure(page);
      expect(narrow.ellipsis).toBe("ellipsis");
      expect(narrow.activity.truncated || narrow.activity.width === 0).toBe(true);
      expect(narrow.phrase.truncated).toBe(false);
      expect(narrow.elapsed.truncated).toBe(false);
      expect(narrow.elapsed.right).toBeLessThanOrEqual(narrow.triggerRight + 0.5);
      expect(narrow.labelHeight).toBeLessThanOrEqual(narrow.lineHeight * 1.5);
      expect(Math.abs(narrow.elapsed.centre - narrow.phrase.centre)).toBeLessThanOrEqual(1);
    });
  }
}
