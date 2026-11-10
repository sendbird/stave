import { expect, test, type Page } from "@playwright/test";

/**
 * The transcript design options the gallery switches between
 * (`recordStyle`, `timeStyle`, `daySeparator`). The default must render as
 * before; each option keeps its rows inside the column, its mark on the first
 * line, and its own geometry: the rail through every dot, the card's inner
 * pad, a day pill that stays at the top while its day scrolls.
 */
test.use({ timezoneId: "Asia/Seoul" });
// The gallery is the heaviest preview, and several cases open it more than once.
test.describe.configure({ timeout: 60_000 });
/** 16:00 in Seoul: the spread gallery's runs land on today, yesterday, two days back and six days back. */
const NOW = new Date("2026-11-10T07:00:00.000Z");

async function openGallery(page: Page, query: string, { width = 1440, theme = "light", lang = "en" } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(NOW);
  await page.goto(`/?stavePreview=tars&gallery=true&theme=${theme}&lang=${lang}${query ? `&${query}` : ""}`);
  await expect(page.locator('[data-tars-message="g-i"]')).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

/** Scrolls the transcript so the message starts at its top. */
async function scrollTo(page: Page, messageId: string, offset = 0) {
  await page.locator(`[data-tars-message="${messageId}"]`).evaluate((node, extra) => {
    const scroller = node.closest("[data-testid='tars-transcript']")!;
    scroller.scrollTop = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + extra;
  }, offset);
}

test("the default transcript has no design option in it", async ({ page }) => {
  await openGallery(page, "");
  const transcript = page.getByTestId("tars-transcript");
  await expect(transcript.locator("[data-tars-record-style]")).toHaveCount(0);
  await expect(transcript.locator("[data-tars-day-separator], [data-tars-run-time]")).toHaveCount(0);
  // The shipped time: one hover-revealed relative time per exchange.
  await expect(transcript.locator('[data-tars-message="g-i"] > [data-tars-message-time]')).toHaveCount(1);
});

for (const [style, name] of [["a", "quiet"], ["b", "card"], ["c", "rail"]] as const) {
  for (const [width, theme, lang] of [[390, "dark", "ko"], [1440, "light", "en"]] as const) {
    test(`record style ${style} keeps rows in the column with the mark on the first line at ${width}px (${theme} ${lang})`, async ({ page }) => {
      await openGallery(page, `recordStyle=${style}`, { width, theme, lang });
      await scrollTo(page, "g-i");
      const rows = page.getByTestId("tars-transcript").locator(`[data-tars-record-style="${name}"][data-tars-record-state]`);
      expect(await rows.count()).toBeGreaterThan(20);
      const geometry = await rows.evaluateAll((nodes) => nodes.slice(0, 40).map((node) => {
        const [slot, body] = [...node.children] as HTMLElement[];
        const main = body!.firstElementChild!.firstElementChild as HTMLElement;
        // The first line's text: the lead (or the only part), which the card style stacks above the title.
        const range = document.createRange();
        range.selectNodeContents(main.firstElementChild ?? main);
        const first = range.getClientRects()[0]!;
        const mark = (slot!.querySelector("svg, [data-status-dot], span span") ?? slot!).getBoundingClientRect();
        const list = node.closest("ul")!.getBoundingClientRect();
        return {
          markOffset: Math.abs((mark.top + mark.bottom) / 2 - (first.top + first.bottom) / 2),
          overflow: node.scrollWidth - node.clientWidth,
          inside: node.getBoundingClientRect().right <= list.right + 0.5,
        };
      }));
      for (const row of geometry) {
        expect(row.markOffset).toBeLessThanOrEqual(1.5);
        expect(row.overflow).toBeLessThanOrEqual(0);
        expect(row.inside).toBe(true);
      }
    });
  }
}

test("record style b pads its card 12px and separates rows without rules", async ({ page }) => {
  await openGallery(page, "recordStyle=b");
  const card = page.locator('[data-tars-message="g-i"]').locator("xpath=following-sibling::ul[1]");
  const box = await card.evaluate((node) => {
    const style = getComputedStyle(node);
    const items = [...node.children].map((item) => getComputedStyle(item).borderTopWidth);
    return { padInline: [style.paddingLeft, style.paddingRight], border: style.borderTopWidth, radius: style.borderTopLeftRadius, itemRules: items };
  });
  expect(box.padInline).toEqual(["12px", "12px"]);
  expect(box.border).toBe("1px");
  expect(box.radius).toBe("12px");
  expect(new Set(box.itemRules)).toEqual(new Set(["0px"]));
});

test("record style c runs one rail through every dot, stopping short of each", async ({ page }) => {
  await openGallery(page, "recordStyle=c");
  const list = page.locator('[data-tars-message="g-i"]').locator("xpath=following-sibling::ul[1]");
  const items = await list.evaluate((node) => [...node.children].map((item) => {
    const segments = [...item.children].filter((child) => child.tagName === "SPAN").map((child) => child.getBoundingClientRect());
    const dot = item.querySelector("[data-tars-record-state] > span")!.firstElementChild!.getBoundingClientRect();
    return { segments: segments.map((segment) => ({ x: segment.left + segment.width / 2, top: segment.top, bottom: segment.bottom })),
      dot: { x: dot.left + dot.width / 2, top: dot.top, bottom: dot.bottom } };
  }));
  expect(items.length).toBeGreaterThan(5);
  expect(items[0]!.segments).toHaveLength(1);
  expect(items.at(-1)!.segments).toHaveLength(1);
  for (const item of items) for (const segment of item.segments) {
    expect(Math.abs(segment.x - item.dot.x)).toBeLessThanOrEqual(1);
    // Each segment ends before the dot or starts after it, with a visible gap.
    expect(segment.bottom <= item.dot.top - 1 || segment.top >= item.dot.bottom + 1).toBe(true);
  }
  // A run's later rows show their time only on hover.
  const times = list.locator("[data-tars-record-time]");
  await expect.poll(() => times.nth(1).evaluate((node) => getComputedStyle(node).opacity)).toBe("0");
  await times.nth(1).locator("xpath=ancestor::*[@data-tars-record-state][1]").hover();
  await expect.poll(() => times.nth(1).evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
});

test("day separators name today, yesterday and older days in both languages", async ({ page }) => {
  for (const [lang, today, yesterday] of [["en", "Today", "Yesterday"], ["ko", "오늘", "어제"]] as const) {
    await openGallery(page, "daySeparator=rule", { lang });
    const separators = page.getByTestId("tars-transcript").locator('[data-tars-day-separator="rule"]');
    await expect(separators).toHaveCount(4);
    const labels = await separators.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
    expect(labels.slice(2)).toEqual([yesterday, today]);
    expect(labels[0]).toMatch(lang === "en" ? /^Wed, Nov 4$/ : /^11월 4일 \(수\)$/);
  }
});

test("the day pill stays at the top of the transcript while its day scrolls", async ({ page }) => {
  await openGallery(page, "daySeparator=pill", { width: 390 });
  await scrollTo(page, "g-j");
  const transcript = page.getByTestId("tars-transcript");
  const today = transcript.locator('[data-tars-day-separator="pill"]', { hasText: "Today" });
  const [pill, top] = await Promise.all([today.boundingBox(), transcript.boundingBox()]);
  expect(pill!.y - top!.y).toBeGreaterThanOrEqual(7);
  expect(pill!.y - top!.y).toBeLessThanOrEqual(9);
  // Only today's pill is at the top; yesterday's scrolled away with its day.
  const yesterday = await transcript.locator('[data-tars-day-separator="pill"]', { hasText: "Yesterday" }).boundingBox();
  expect(yesterday!.y + yesterday!.height).toBeLessThan(top!.y);
});

test("time options: grouped and run times show without hover, edge times appear on hover", async ({ page }) => {
  await openGallery(page, "timeStyle=grouped");
  const transcript = page.getByTestId("tars-transcript");
  // One per run: two runs six days back, two runs two days back, three yesterday, three today.
  await expect(transcript.locator('[data-tars-run-time="grouped"]')).toHaveCount(10);
  await expect(transcript.locator("[data-tars-message-time]")).toHaveCount(0);

  await openGallery(page, "timeStyle=run");
  await expect(transcript.locator('[data-tars-run-time="run"]')).toHaveCount(10);
  await expect(transcript.locator('[data-tars-run-time="run"]').nth(6)).toHaveText(/^Yesterday, \d{1,2}:\d{2}\s[AP]M$/);

  await openGallery(page, "timeStyle=edge");
  await scrollTo(page, "g-h");
  const time = page.locator('[data-tars-message="g-h"] [data-tars-message-time="edge"]');
  await expect(time).toHaveCSS("opacity", "0");
  await page.locator('[data-tars-message="g-h"] [data-tars-user-bubble]').hover();
  await expect(time).toHaveCSS("opacity", "1");
  // It sits on the bubble's leading side, on its last line.
  const [timeBox, bubble] = await Promise.all([time.boundingBox(), page.locator('[data-tars-message="g-h"] [data-tars-user-bubble]').boundingBox()]);
  expect(timeBox!.x + timeBox!.width).toBeLessThanOrEqual(bubble!.x);
  expect(Math.abs(timeBox!.y + timeBox!.height - (bubble!.y + bubble!.height))).toBeLessThanOrEqual(1);
});
