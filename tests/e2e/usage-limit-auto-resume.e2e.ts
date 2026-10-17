import { expect, test, type Page } from "@playwright/test";
import type {} from "./fixtures/usage-limit-auto-resume";

const MINUTE = 60_000;

async function state(page: Page) {
  return page.evaluate(() => window.resumeProbe.getState());
}

test.beforeEach(async ({ page }) => {
  const now = new Date("2026-01-02T00:00:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  await page.goto("/tests/e2e/fixtures/usage-limit-auto-resume.html");
  await page.waitForFunction(() => Boolean(window.resumeProbe));
});

test("the timer retries at five minutes and continues once after a slow recovery read", async ({ page }) => {
  await page.clock.runFor(MINUTE - 1);
  expect((await state(page)).reads).toBe(0);
  await page.clock.runFor(1);
  await expect.poll(async () => (await state(page)).pause?.unreadableUsageReads).toBe(1);

  await page.clock.runFor(5 * MINUTE - 1);
  expect((await state(page)).reads).toBe(1);
  await page.clock.runFor(1);
  await expect.poll(async () => (await state(page)).reads).toBe(2);
  // Re-renders and elapsed time during the pending read must not start another.
  await page.clock.runFor(2 * MINUTE);
  expect(await state(page)).toMatchObject({ reads: 2, continuations: 0 });
  await page.evaluate(() => window.resumeProbe.recover());
  await expect.poll(async () => (await state(page)).continuations).toBe(1);
  expect((await state(page)).pause).toBeUndefined();
  await page.clock.runFor(5 * MINUTE);
  expect(await state(page)).toMatchObject({ reads: 2, continuations: 1 });
});

test("an overdue timer after sleep retries from wake time without replaying missed ticks", async ({ page }) => {
  await page.clock.fastForward(10 * MINUTE);
  await expect.poll(async () => (await state(page)).pause?.unreadableUsageReads).toBe(1);
  expect(await state(page)).toMatchObject({ reads: 1, continuations: 0 });
  const retryAt = (await state(page)).pause!.autoResumeAt!;
  expect(retryAt).toBe(Date.parse("2026-01-02T00:15:00Z"));
  await page.clock.runFor(5 * MINUTE - 1);
  expect((await state(page)).reads).toBe(1);
  await page.clock.runFor(1);
  await expect.poll(async () => (await state(page)).reads).toBe(2);
  await page.evaluate(() => window.resumeProbe.recover());
  await expect.poll(async () => (await state(page)).continuations).toBe(1);
});

test("cancelling during a retry read prevents a late response from continuing", async ({ page }) => {
  await page.clock.runFor(MINUTE);
  await expect.poll(async () => (await state(page)).pause?.unreadableUsageReads).toBe(1);
  await page.clock.runFor(5 * MINUTE);
  await expect.poll(async () => (await state(page)).reads).toBe(2);
  await page.evaluate(() => {
    window.resumeProbe.cancel();
    window.resumeProbe.recover();
  });
  await page.clock.runFor(10 * MINUTE);
  const cancelled = await state(page);
  expect(cancelled).toMatchObject({ reads: 2, continuations: 0 });
  expect(cancelled.pause).toBeDefined();
  expect(cancelled.pause?.autoResumeAt).toBeUndefined();
  expect(cancelled.pause?.unreadableUsageReads).toBeUndefined();
});
