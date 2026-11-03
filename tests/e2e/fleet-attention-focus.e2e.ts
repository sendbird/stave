import { expect, test, type Page } from "@playwright/test";

const FIXTURE = "/tests/e2e/fixtures/fleet-attention-inbox.html";
const trigger = (page: Page, id: string) => page.locator(`#fleet-attention-trigger-${id}`);
const row = (page: Page, id: string) => page.locator(`li:has(#fleet-attention-trigger-${id})`);

test("snoozing a focused row hands focus to the next row and the count says so", async ({ page }) => {
  await page.goto(FIXTURE);
  const count = page.getByTestId("fleet-attention-count");
  await expect(count).toHaveText("3 waiting on you");

  await trigger(page, "one").focus();
  await row(page, "one").getByRole("button", { name: "Snooze approval for Ship the release in deploy" }).click();
  await page.getByRole("menuitem", { name: "1 hour" }).click();

  await expect(trigger(page, "one")).toHaveCount(0);
  await expect(trigger(page, "two")).toBeFocused();
  await expect(count).toHaveText("2 waiting on you");
});

test("dismissing and marking read hand focus on, and the last row hands it back", async ({ page }) => {
  await page.goto(FIXTURE);

  // The last row has no row after it, so focus goes to the one before.
  await row(page, "three").getByRole("button", { name: "Dismiss approval for Rotate the deploy key in deploy" }).click();
  await expect(trigger(page, "three")).toHaveCount(0);
  await expect(trigger(page, "two")).toBeFocused();

  await row(page, "two").getByRole("button", { name: "Mark read" }).click();
  await expect(trigger(page, "two")).toHaveCount(0);
  await expect(trigger(page, "one")).toBeFocused();
  await expect(page.getByTestId("fleet-attention-count")).toHaveText("1 waiting on you");
});

test("focus stays where the user moved it while a row leaves", async ({ page }) => {
  await page.goto(FIXTURE);
  await page.evaluate(() => {
    const outside = document.createElement("button");
    outside.id = "outside";
    outside.textContent = "Elsewhere";
    document.body.append(outside);
  });
  await row(page, "one").getByRole("button", { name: "Dismiss approval for Ship the release in deploy" }).click();
  await page.locator("#outside").focus();
  await expect(trigger(page, "one")).toHaveCount(0);
  await expect(page.locator("#outside")).toBeFocused();
});

test("the Korean row snooze menu and live region have no English", async ({ page }) => {
  await page.goto(`${FIXTURE}?locale=ko`);
  await expect(page.getByTestId("fleet-attention-count")).toHaveText("3개가 기다리는 중");
  await row(page, "one").getByRole("button", { name: /미루기/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const items = await menu.getByRole("menuitem").allTextContents();
  expect(items).toEqual(["1시간", "4시간", "1일", "1주일"]);
  for (const text of items) expect(text).not.toMatch(/[A-Za-z]/);
});

test("J and K move between rows like Down and Up, and wrap at the ends", async ({ page }) => {
  await page.goto(FIXTURE);
  await trigger(page, "one").focus();
  await page.keyboard.press("j");
  await expect(trigger(page, "two")).toBeFocused();
  await page.keyboard.press("j");
  await expect(trigger(page, "three")).toBeFocused();
  await page.keyboard.press("j");
  await expect(trigger(page, "one")).toBeFocused();
  await page.keyboard.press("k");
  await expect(trigger(page, "three")).toBeFocused();
  // A modified letter is not a move.
  await page.keyboard.press("Shift+K");
  await expect(trigger(page, "three")).toBeFocused();
});

test("a wait's age turns warning after an hour and danger after a day", async ({ page }) => {
  await page.goto(FIXTURE);
  const age = (id: string) => row(page, id).locator("[data-wait-tone]");
  await expect(age("one")).toHaveAttribute("data-wait-tone", "neutral");
  await expect(age("two")).toHaveAttribute("data-wait-tone", "warning");
  await expect(age("three")).toHaveAttribute("data-wait-tone", "danger");
  const color = (id: string) => age(id).evaluate((element) => getComputedStyle(element).color);
  // Three tones, three different inks.
  expect(new Set([await color("one"), await color("two"), await color("three")]).size).toBe(3);
});
