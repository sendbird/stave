import { expect, test, type Page } from "@playwright/test";

/**
 * The transcript's one layout: records on a timeline rail, a message's time
 * beside the user's bubble on hover or focus, and a thin rule naming each
 * day. Record text follows the chat font size; who did each action shows as
 * a glyph with its sentence; only values that open something act.
 */
test.use({ timezoneId: "Asia/Seoul" });
// The gallery is the heaviest preview, and several cases open it more than once.
test.describe.configure({ timeout: 60_000 });
/** 16:00 in Seoul: the spread gallery's cases land on today, yesterday, two days back and six days back. */
const NOW = new Date("2026-11-10T07:00:00.000Z");

async function openGallery(page: Page, query: string, { width = 1440, theme = "light", lang = "en" } = {}) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(NOW);
  await page.goto(`/?stavePreview=tars&gallery=true&theme=${theme}&lang=${lang}${query ? `&${query}` : ""}`);
  await expect(page.locator('[data-tars-message="g-i"]')).toBeAttached({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Scrolls the transcript so the message starts at its top. */
async function scrollTo(page: Page, messageId: string, offset = 0) {
  await page.locator(`[data-tars-message="${messageId}"]`).evaluate((node, extra) => {
    const scroller = node.closest("[data-testid='tars-transcript']")!;
    scroller.scrollTop = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + extra;
  }, offset);
}

for (const [width, theme, lang] of [[390, "dark", "ko"], [1440, "light", "en"]] as const) {
  test(`records keep to the column with their mark on the first line at ${width}px (${theme} ${lang})`, async ({ page }) => {
    await openGallery(page, "", { width, theme, lang });
    await scrollTo(page, "g-i");
    const rows = page.getByTestId("tars-transcript").locator("[data-tars-records] [data-tars-record-state]");
    expect(await rows.count()).toBeGreaterThan(20);
    const geometry = await rows.evaluateAll((nodes) => nodes.slice(0, 60).map((node) => {
      const [slot, body] = [...node.children] as HTMLElement[];
      const main = body!.firstElementChild!.firstElementChild as HTMLElement;
      // The first line's text: the lead (or the only part).
      const range = document.createRange();
      range.selectNodeContents(main.firstElementChild ?? main);
      const first = [...range.getClientRects()].find((rect) => rect.height > 4)!;
      const mark = slot!.querySelector("svg")!.getBoundingClientRect();
      const list = node.closest("ul")!.getBoundingClientRect();
      return {
        markOffset: Math.abs((mark.top + mark.bottom) / 2 - (first.top + first.bottom) / 2),
        overflow: node.scrollWidth - node.clientWidth,
        inside: node.getBoundingClientRect().right <= list.right + 0.5,
        wash: getComputedStyle(node.closest("ul")!).backgroundColor,
      };
    }));
    for (const row of geometry) {
      expect(row.markOffset).toBeLessThanOrEqual(2);
      expect(row.overflow).toBeLessThanOrEqual(0);
      expect(row.inside).toBe(true);
      // The rail is the structure; there is no wash behind a run.
      expect(row.wash).toBe("rgba(0, 0, 0, 0)");
    }
  });
}

test("one rail runs through every mark of a run, stopping short of each, and later times wait for hover", async ({ page }) => {
  await openGallery(page, "");
  const list = page.locator('[data-tars-message="g-i"]').locator("xpath=following-sibling::ul[1]");
  await list.scrollIntoViewIfNeeded();
  const items = await list.evaluate((node) => [...node.children].map((item) => {
    const segments = [...item.children].filter((child) => child.tagName === "SPAN").map((child) => child.getBoundingClientRect());
    const mark = item.querySelector("[data-tars-record-state] > span svg")!.getBoundingClientRect();
    return { segments: segments.map((segment) => ({ x: segment.left + segment.width / 2, top: segment.top, bottom: segment.bottom })),
      mark: { x: mark.left + mark.width / 2, top: mark.top, bottom: mark.bottom } };
  }));
  expect(items.length).toBeGreaterThan(5);
  expect(items[0]!.segments).toHaveLength(1);
  expect(items.at(-1)!.segments).toHaveLength(1);
  for (const item of items) for (const segment of item.segments) {
    expect(Math.abs(segment.x - item.mark.x)).toBeLessThanOrEqual(1);
    expect(segment.bottom <= item.mark.top - 1 || segment.top >= item.mark.bottom + 1).toBe(true);
  }
  const times = list.locator("[data-tars-record-time]");
  await page.mouse.move(0, 0);
  await expect.poll(() => times.nth(1).evaluate((node) => getComputedStyle(node).opacity)).toBe("0");
  await times.nth(1).locator("xpath=ancestor::*[@data-tars-record-state][1]").hover();
  await expect.poll(() => times.nth(1).evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
});

test("a thin rule names each day: today, yesterday and older days, in both languages", async ({ page }) => {
  for (const [lang, today, yesterday] of [["en", "Today", "Yesterday"], ["ko", "오늘", "어제"]] as const) {
    await openGallery(page, "days=true", { lang });
    const separators = page.getByTestId("tars-transcript").locator('[data-tars-day-separator="rule"]');
    await expect(separators).toHaveCount(4);
    const labels = await separators.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
    expect(labels.slice(2)).toEqual([yesterday, today]);
    expect(labels[0]).toMatch(lang === "en" ? /^Wed, Nov 4$/ : /^11월 4일 \(수\)$/);
  }
  // Without spread, the gallery is all today: one rule.
  await openGallery(page, "");
  await expect(page.getByTestId("tars-transcript").locator("[data-tars-day-separator]")).toHaveCount(1);
});

test("a message's clock time sits beside the bubble on its last line and shows on hover", async ({ page }) => {
  await openGallery(page, "");
  await scrollTo(page, "g-h");
  const exchange = page.locator('[data-tars-message="g-a1"]');
  await exchange.scrollIntoViewIfNeeded();
  const time = exchange.locator('[data-tars-message-time="edge"]');
  await page.mouse.move(0, 0);
  await expect(time).toHaveCSS("opacity", "0");
  const before = await exchange.locator("[data-tars-user-bubble]").boundingBox();
  await exchange.locator("[data-tars-user-bubble]").hover();
  await expect(time).toHaveCSS("opacity", "1");
  await expect(time).toHaveText(/^\d{1,2}:\d{2}\s[AP]M$/);
  // Showing it moves nothing; it sits on the bubble's leading side, on its last line.
  const [timeBox, bubble] = await Promise.all([time.boundingBox(), exchange.locator("[data-tars-user-bubble]").boundingBox()]);
  expect(bubble).toEqual(before);
  expect(timeBox!.x + timeBox!.width).toBeLessThanOrEqual(bubble!.x);
  expect(Math.abs(timeBox!.y + timeBox!.height - (bubble!.y + bubble!.height))).toBeLessThanOrEqual(5);
  // No other time over a message.
  await expect(page.locator("[data-tars-message-time]:not([data-tars-message-time='edge'])")).toHaveCount(0);
});

test("record text follows the chat font size, one step under the messages", async ({ page }) => {
  for (const size of [16, 20]) {
    await openGallery(page, size === 16 ? "" : `messageFontSize=${size}`);
    const sizes = await page.evaluate(() => {
      const font = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
      const transcript = "[data-testid='tars-transcript'] ";
      return {
        lead: font(`${transcript}[data-tars-action-record] [data-tars-record-actor]`),
        status: font(`${transcript}[data-tars-record-status]`),
        chip: font(`${transcript}[data-tars-record-work]`),
        reason: font(`${transcript}[data-tars-receipt] [data-tars-reason]`),
        sub: font(`${transcript}[data-tars-delivery]`),
        day: font(`${transcript}[data-tars-day-label]`),
        time: font(`${transcript}[data-tars-record-time]`),
      };
    });
    for (const key of ["lead", "status", "chip", "reason", "sub"] as const) expect(sizes[key], key).toBe(Math.round(size * 0.875));
    expect(sizes.time).toBe(Math.round(size * 0.75));
    expect(sizes.day).toBe(Math.round(size * 0.75));
  }
});

test("who did it is a glyph with its sentence, and only values that open something look like controls", async ({ page }) => {
  await openGallery(page, "");
  const transcript = page.getByTestId("tars-transcript");
  // No source word ("click", "Fleet", "words") is printed in a record.
  await expect(transcript.locator("[data-tars-records]").getByText(/^(click|key|words|drag|task view)$/)).toHaveCount(0);
  const yours = transcript.locator('[data-tars-action-record] [data-tars-record-actor="you"]').first();
  await yours.scrollIntoViewIfNeeded();
  await expect(yours).toHaveAccessibleName(/^You (did this|answered|dragged)/);
  await yours.hover();
  await expect(page.getByRole("tooltip")).toHaveText(/^You (did this|answered|dragged)/);
  const tars = transcript.locator('[data-tars-receipt] [data-tars-record-actor="tars"]').first();
  await expect(tars).toHaveAccessibleName("Tars did this from your message");
  // Values that do nothing have no pointer, underline or hover fill.
  for (const chip of await transcript.locator("[data-tars-record-priority-value], [data-tars-delegate-agent], [data-tars-publish-branch]").all()) {
    const style = await chip.evaluate((node) => ({ cursor: getComputedStyle(node).cursor, line: getComputedStyle(node).textDecorationLine, tag: node.tagName }));
    expect(style).toEqual({ cursor: "auto", line: "none", tag: "SPAN" });
  }
  // A work chip opens the work's brief in the side view.
  const work = transcript.locator("[data-tars-action-record] button[data-tars-record-open]").first();
  await work.scrollIntoViewIfNeeded();
  await expect(work).toHaveCSS("cursor", "pointer");
  const id = await work.getAttribute("data-tars-record-open");
  await work.click();
  await expect(page.locator('[data-tars-side-view="brief"]')).toBeVisible();
  expect(id).toBeTruthy();
});
