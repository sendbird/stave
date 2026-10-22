import { expect, test } from "@playwright/test";

/**
 * Queued messages move from the keyboard: Alt+ArrowUp/Down on a row's grip or
 * any of its actions moves it one place, focus stays on the moved row's grip
 * after the list re-renders, and the new position is announced.
 */
test("a queued message moves from the keyboard, keeps focus and is announced", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?stavePreview=composer-frame&case=queued&theme=light", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Show queued messages" }).click();
  const rows = page.locator("[data-queued-turn-id]");
  await expect(rows).toHaveCount(3);
  const text = (index: number) => rows.nth(index).locator("p").first();
  const first = await text(0).innerText();
  const second = await text(1).innerText();
  const announcement = page.getByRole("status").filter({ hasText: /^Moved to position/ });

  // The second message moves to the front.
  await page.getByRole("button", { name: "Move queued message 2 of 3" }).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(text(0)).toHaveText(second);
  await expect(text(1)).toHaveText(first);
  await expect(page.getByRole("button", { name: "Move queued message 1 of 3" })).toBeFocused();
  await expect(announcement).toHaveText("Moved to position 1 of 3");

  // From a row action, the row moves back down and the grip takes focus.
  await page.getByRole("button", { name: "Edit queued prompt 1" }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(text(0)).toHaveText(first);
  await expect(text(1)).toHaveText(second);
  await expect(page.getByRole("button", { name: "Move queued message 2 of 3" })).toBeFocused();
  await expect(announcement).toHaveText("Moved to position 2 of 3");

  // At the end of the queue there is nowhere to go: nothing moves.
  await page.getByRole("button", { name: "Move queued message 3 of 3" }).focus();
  const last = await text(2).innerText();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(text(2)).toHaveText(last);
  await expect(page.getByRole("button", { name: "Move queued message 3 of 3" })).toBeFocused();
});
