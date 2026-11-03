import { expect, test, type Page } from "@playwright/test";

/**
 * Review's Diff comments with two pending comments and two sent ones
 * (`comments=1`): on the table, one sent comment's lines still read as sent
 * and the other's changed since.
 */
async function open(page: Page, args: { scope?: "branch" | "turn"; lang?: "en" | "ko"; width?: number } = {}) {
  await page.setViewportSize({ width: args.width ?? 1440, height: 900 });
  await page.goto(`/?stavePreview=review&comments=1&scope=${args.scope ?? "branch"}&lang=${args.lang ?? "en"}`);
  await expect(page.getByTestId("review-comments")).toBeVisible();
}

const pending = (page: Page) => page.getByTestId("review-comments-pending").locator(":scope > li");
const sent = (page: Page) => page.getByTestId("review-comments-sent").locator(":scope > li");

test("a pending comment can be removed before it is sent", async ({ page }) => {
  await open(page);
  await expect(pending(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Remove the comment on src/billing/billing-table.test.tsx:2" }).click();
  await expect(pending(page)).toHaveCount(1);
  await expect(page.getByTestId("review-comments")).toContainText("Not sent (1)");
});

test("a sent comment says whether its lines changed, keeps its time, and can be resolved", async ({ page }) => {
  await open(page);
  // The table's working-tree text is read when its diff shows.
  await expect(sent(page)).toHaveCount(2);
  await expect(sent(page).nth(0)).toHaveAttribute("data-sent-state", "unchanged");
  await expect(sent(page).nth(0)).toContainText("Sent · not changed yet");
  await expect(sent(page).nth(1)).toHaveAttribute("data-sent-state", "changed");
  await expect(sent(page).nth(1)).toContainText("Sent · lines changed since");
  await expect(sent(page).nth(0).locator("time")).toHaveAttribute("datetime", "2026-10-22T09:12:00.000Z");

  await page.getByRole("button", { name: "Resolve the sent comment on src/billing/BillingTable.tsx:4" }).click();
  await expect(sent(page)).toHaveCount(1);
  await expect(page.getByTestId("review-comments")).toContainText("Sent (1)");
});

test("without the file's current text a sent comment only says it was sent", async ({ page }) => {
  // A turn's diff is that turn's snapshot, not the file now.
  await open(page, { scope: "turn" });
  await expect(sent(page).nth(0)).toHaveAttribute("data-sent-state", "unknown");
  await expect(sent(page).nth(0)).toContainText(/Sent\s*Resolve/);
});

test("a comment row opens its file and lands on its line", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Show src/billing/billing-table.test.tsx:2 in the diff" }).click();
  await expect(page.getByRole("group", { name: /billing-table\.test\.tsx/ })).toBeVisible();
  const focusedLine = () => page.evaluate(() => {
    const cells = document.activeElement?.querySelectorAll(":scope > [data-ads-slot='line-number']");
    return cells?.[1]?.textContent ?? null;
  });
  await expect.poll(focusedLine).toBe("2");
});

for (const lang of ["en", "ko"] as const) {
  test(`a long path stays on one line inside the inspector (${lang})`, async ({ page }) => {
    await open(page, { lang, width: 1100 });
    await page.evaluate(() => document.fonts.ready);
    const where = pending(page).first().locator("[title]").first();
    const fits = await where.evaluate((element) => {
      const row = element.closest("li")!.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { nowrap: style.whiteSpace === "nowrap", ellipsis: style.textOverflow === "ellipsis", inside: box.right <= row.right + 0.5 };
    });
    expect(fits).toEqual({ nowrap: true, ellipsis: true, inside: true });
  });
}

/** The colour a token resolves to on this page, for comparing computed colours. */
function tokenColor(page: Page, token: string) {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.querySelector('[data-testid="review-comments"]')!.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

for (const lang of ["en", "ko"] as const) {
  test(`in a narrow inspector a sent comment's time wraps under its whole path (${lang})`, async ({ page }, testInfo) => {
    await open(page, { lang, width: 1100 });
    await page.evaluate(() => document.fonts.ready);
    for (let index = 0; index < 2; index += 1) {
      const row = sent(page).nth(index);
      const where = row.locator("[data-review-comment-where]");
      const time = row.locator("[data-review-comment-sent-at]");
      // The whole path is painted: nothing is cut by an ellipsis.
      expect(await where.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      const [whereBox, timeBox, rowBox] = await Promise.all([where.boundingBox(), time.boundingBox(), row.boundingBox()]);
      // The time wrapped below the path rather than taking its room.
      expect(timeBox!.y).toBeGreaterThanOrEqual(whereBox!.y + whereBox!.height - 1);
      expect(timeBox!.x + timeBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1);
    }
    await page.getByTestId("review-comments").screenshot({ path: testInfo.outputPath(`review-comments-narrow-${lang}.png`) });
  });
}

test("the jump mark shows on the hovered or focused row only", async ({ page }) => {
  await open(page);
  const icons = page.getByTestId("review-comments").locator("[data-review-comment-jump-icon]");
  const opacities = () => icons.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).opacity));
  await page.mouse.move(0, 0);
  await expect.poll(opacities).toEqual(["0", "0", "0", "0"]);
  await pending(page).first().getByRole("button", { name: /^Show / }).hover();
  await expect.poll(opacities).toEqual(["1", "0", "0", "0"]);
  // Keyboard focus shows it too.
  await page.mouse.move(0, 0);
  await sent(page).nth(0).getByRole("button", { name: /^Resolve / }).focus();
  await page.keyboard.press("Tab");
  await expect(sent(page).nth(1).getByRole("button", { name: /^Show / })).toBeFocused();
  await expect.poll(opacities).toEqual(["0", "0", "0", "1"]);
});

test("delete turns to the danger tone under the pointer, and changed lines read in the success tone", async ({ page }) => {
  await open(page);
  const remove = pending(page).first().locator("[data-review-comment-remove]");
  const danger = await tokenColor(page, "--ads-color-danger");
  await page.mouse.move(0, 0);
  expect(await remove.evaluate((element) => getComputedStyle(element).color)).not.toBe(danger);
  await remove.hover();
  await expect.poll(() => remove.evaluate((element) => getComputedStyle(element).color)).toBe(danger);
  const changed = sent(page).nth(1).getByText("Sent · lines changed since");
  expect(await changed.evaluate((element) => getComputedStyle(element).color)).toBe(await tokenColor(page, "--ads-color-success-text"));
});
