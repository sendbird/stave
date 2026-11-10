import { expect, test, type Page } from "@playwright/test";

/**
 * The "while you were away" summary on the real Tars view, in the preview.
 * `away=live` starts with the user present; the fixtures' changes arrive as
 * the page clock moves, so leaving, time passing and coming back are the real
 * events the view listens to. `away=true` opens the page as a return after 45
 * minutes. A reload is a restart: the preview keeps its state in session
 * storage as the host keeps it in its database.
 */

const MINUTE = 60_000;
const card = (page: Page) => page.locator("[data-tars-away]");
const transcript = (page: Page) => page.getByTestId("tars-transcript");

/** The window is hidden (the user switched away) or visible again, as the document reports it. */
async function setWindowVisible(page: Page, visible: boolean) {
  await page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visible ? "visible" : "hidden");
}

const savedAway = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-away-state") ?? "null") as
  { lastSeenAt: string | null; summary: { since: string; until: string } | null } | null);

async function openLive(page: Page) {
  await page.clock.install({ time: new Date("2026-11-10T09:00:00.000Z") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?stavePreview=tars&away=live");
  await expect(transcript(page).locator("[data-tars-message='away-message-request']")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Leaves for `minutes`, then comes back. Leaving saves when the end was last seen. */
async function stepAway(page: Page, minutes: number) {
  await setWindowVisible(page, false);
  await expect.poll(async () => (await savedAway(page))?.lastSeenAt ?? null).not.toBeNull();
  await page.clock.fastForward(minutes * MINUTE);
  await setWindowVisible(page, true);
}

test("leaving, work going on and coming back shows one summary where the user left; jump and links work by keyboard; dismissing survives a restart", async ({ page }) => {
  await openLive(page);
  // A profile that has just seen the conversation for the first time has nothing to summarize.
  await expect(card(page)).toHaveCount(0);

  await stepAway(page, 30);
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toHaveCount(1);
  for (const [kind, count] of [["waiting", 1], ["blocked", 2], ["finished", 4], ["pullRequests", 1]] as const)
    await expect(card(page).locator(`[data-tars-away-group="${kind}"]`)).toHaveAttribute("data-tars-away-count", String(count));
  await expect(card(page)).toContainText("1 decision is waiting for you");
  await expect(card(page)).toContainText("4 pieces of work finished");
  await expect(card(page).locator("[data-tars-away-more]")).toHaveText("And 1 more");
  // It sits where the user left: after what they had seen, before the first thing they had not; the records themselves are all still there.
  const order = await transcript(page).evaluate((root) => {
    const position = (selector: string) => root.querySelector(selector)!.getBoundingClientRect().top + root.scrollTop;
    return { request: position("[data-tars-message='away-message-request']"), card: position("[data-tars-away]"),
      firstNew: position("[data-tars-record-open='away-export']"), ask: position("[data-tars-message='away-message-ask']"),
      completed: root.querySelectorAll("[data-tars-activity='completed']").length, blocked: root.querySelectorAll("[data-tars-activity='blocked']").length };
  });
  expect(order.request).toBeLessThan(order.card);
  expect(order.card).toBeLessThan(order.firstNew);
  expect(order.firstNew).toBeLessThan(order.ask);
  expect([order.completed, order.blocked]).toEqual([5, 1]);
  // Coming back brings the card into view instead of leaving it above the newest records.
  await expect(card(page).locator("h3")).toBeInViewport();
  expect((await savedAway(page))?.summary).not.toBeNull();

  // Keyboard: Jump to first new item moves focus to the first record the user has not seen and brings it into view.
  await card(page).locator("[data-tars-away-dismiss]").focus();
  for (let presses = 0; presses < 40 && !(await card(page).locator("[data-tars-away-jump]").evaluate((node) => node === document.activeElement)); presses++) await page.keyboard.press("Tab");
  await expect(card(page).locator("[data-tars-away-jump]")).toBeFocused();
  await page.keyboard.press("Enter");
  const firstNew = transcript(page).locator("[data-tars-records]", { has: page.locator("[data-tars-record-open='away-export']") });
  await expect(firstNew).toBeFocused();
  await expect(firstNew).toBeInViewport();
  // The keyboard goes on from there: the next stop is that record's own work chip.
  await page.keyboard.press("Tab");
  await expect(transcript(page).locator("[data-tars-record-open='away-export']").first()).toBeFocused();

  // A waiting decision's link goes to its card; a finished item's link opens its report beside the conversation.
  await card(page).locator("[data-tars-away-link='decision']").focus();
  await page.keyboard.press("Enter");
  await expect(transcript(page).locator("[data-tars-decision='ask:away-message-ask:0']")).toBeFocused();
  await card(page).locator("[data-tars-away-group='finished'] [data-tars-away-link='report']").first().click();
  await expect(page.locator("[data-tars-side-view]")).toBeVisible();
  await page.keyboard.press("Escape");
  // The work chip is the record rail's own: it opens the work's request.
  await card(page).locator("[data-tars-record-open='away-upload']").click();
  await expect(page.locator("[data-tars-side-view]")).toBeVisible();
  await page.keyboard.press("Escape");

  // A restart keeps a summary that was not dismissed.
  await page.reload();
  await expect(card(page)).toBeVisible();
  await card(page).locator("[data-tars-away-dismiss]").focus();
  await page.keyboard.press("Enter");
  await expect(card(page)).toHaveCount(0);
  await expect(transcript(page).locator("[data-tars-activity='completed']")).toHaveCount(5);
  await expect.poll(async () => (await savedAway(page))?.summary ?? null).toBeNull();
  // Dismissed stays dismissed after a restart, and after another long absence in which nothing happened.
  await page.reload();
  await expect(transcript(page).locator("[data-tars-activity='completed']")).toHaveCount(5);
  await expect(card(page)).toHaveCount(0);
  await stepAway(page, 45);
  await expect(transcript(page).locator("[data-tars-activity='completed']")).toHaveCount(5);
  await expect(card(page)).toHaveCount(0);
});

test("a short absence shows no summary even though work finished meanwhile", async ({ page }) => {
  await openLive(page);
  await stepAway(page, 8);
  // The change arrived (its record is in the transcript), but eight minutes is not being away.
  await expect(transcript(page).locator("[data-tars-record-open='away-export']")).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  expect((await savedAway(page))?.summary ?? null).toBeNull();
});

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  test(`the summary fits its column and follows the chat font size: ${lang} ${theme}`, async ({ page }) => {
    for (const width of [1440, 390]) for (const fontSize of [16, 20]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?stavePreview=tars&away=true&lang=${lang}&theme=${theme}&messageFontSize=${fontSize}`);
      await expect(card(page)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const geometry = await card(page).evaluate((node) => {
        const box = node.getBoundingClientRect();
        // The record list beside it spans the transcript's reading column.
        const column = node.parentElement!.querySelector(":scope > [data-tars-records]")!.getBoundingClientRect();
        const px = (selector: string) => Number.parseFloat(getComputedStyle(node.querySelector(selector)!).fontSize);
        const inside = [...node.querySelectorAll("button, [data-tars-record-work]")].every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5;
        });
        // Each group's mark is centred on its count's first line.
        const marks = [...node.querySelectorAll("[data-tars-away-group]")].map((group) => {
          const mark = group.firstElementChild!.getBoundingClientRect();
          const text = group.children[1]!;
          const range = document.createRange();
          range.selectNodeContents(text);
          const line = range.getClientRects()[0]!;
          return Math.abs((mark.top + mark.bottom) / 2 - (line.top + line.bottom) / 2);
        });
        return { overflow: node.scrollWidth - node.clientWidth, left: box.left - column.left, right: column.right - box.right, inside, marks,
          title: px("h3"), count: px("[data-tars-away-group] > p"), time: px("time"),
          record: Number.parseFloat(getComputedStyle(node.parentElement!.querySelector("[data-tars-records]")!).fontSize) };
      });
      expect(geometry.overflow).toBe(0);
      expect(geometry.inside).toBe(true);
      expect(Math.abs(geometry.left)).toBeLessThan(1);
      expect(Math.abs(geometry.right)).toBeLessThan(1);
      for (const offset of geometry.marks) expect(offset).toBeLessThan(1.5);
      // The title at the message size, the lines one step under it (the record rail's size), the time at the meta step (the conversation's type scale, whole pixels).
      expect(geometry.title).toBeCloseTo(fontSize, 1);
      expect(geometry.count).toBe(Math.round(fontSize * 0.875));
      expect(geometry.count).toBeCloseTo(geometry.record, 1);
      expect(geometry.time).toBe(Math.round(fontSize * 0.75));
      // Each load is a new session for the next size.
      await page.evaluate(() => sessionStorage.clear());
    }
  });
}
