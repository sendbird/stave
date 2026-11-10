import { expect, test, type Page } from "@playwright/test";

const view = (page: Page) => page.getByTestId("tars-view");
const entry = (page: Page) => view(page).locator("[data-tars-insights]");
const sheet = (page: Page, name: "knows" | "usage") => page.locator(`[data-tars-insights-sheet="${name}"]`);

/** Opens the header menu and picks an item with the keyboard only. */
async function openByKeyboard(page: Page, name: "knows" | "usage") {
  await entry(page).focus();
  await page.keyboard.press("Enter");
  const items = page.getByRole("menuitem");
  await expect(items.first()).toBeFocused();
  if (name === "usage") {
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();
  }
  await page.keyboard.press("Enter");
  await expect(sheet(page, name)).toBeVisible();
}

test.describe("Tars: what it knows and what it spent", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("What Tars knows opens by keyboard, groups by scope, and Escape returns focus to its entry", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true&insights=true");
    await openByKeyboard(page, "knows");
    const knows = sheet(page, "knows");
    await expect(knows.getByRole("heading", { name: "What Tars knows" })).toBeVisible();
    // Everywhere: the saved instructions, whose they are and when they were saved.
    const everywhere = knows.locator('[data-tars-knows-scope="everywhere"]');
    await expect(everywhere.locator('[data-tars-knows-item="instructions"]')).toContainText("Open every pull request as a draft; I merge them myself.");
    await expect(everywhere.locator('[data-tars-knows-item="instructions"]')).toContainText("You wrote this");
    await expect(everywhere.locator('[data-tars-knows-item="instructions"]')).toContainText("Last saved");
    // Per repository: the first repository is open with its rule and its memories, read through the memory bridge.
    const repositories = knows.locator('[data-tars-knows-scope="repositories"]');
    await expect(repositories.locator('[data-tars-knows-item="branchRule"]').first()).toContainText("Start with feat/, fix/ or chore/");
    await expect(repositories.locator('[data-tars-knows-memory="ready"]')).toHaveCount(1);
    await expect(repositories).toContainText("3 memories in use");
    await expect(repositories).toContainText("Never push to a release branch; always merge through a pull request.");
    await expect(repositories).toContainText("Not used yet");
    // What it does not keep.
    await expect(knows.locator('[data-tars-knows-scope="forgets"]')).toContainText("only the last 8 messages of this conversation");
    await page.keyboard.press("Escape");
    await expect(knows).toHaveCount(0);
    await expect(entry(page)).toBeFocused();
  });

  test("a second repository reads its memories only when opened, and says when memory is off there", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true&insights=true");
    await openByKeyboard(page, "knows");
    const repositories = sheet(page, "knows").locator('[data-tars-knows-scope="repositories"]');
    await expect(repositories.locator("[data-tars-knows-memory]")).toHaveCount(1);
    const second = repositories.getByRole("button", { name: /preview-docs/ });
    await second.focus();
    await page.keyboard.press("Enter");
    await expect(repositories.locator("[data-tars-knows-memory]")).toHaveCount(2);
    await expect(repositories.locator("[data-tars-knows-memory-off]")).toContainText("Memory is turned off for this repository");
    // Its branch rule is Stave's default.
    await expect(repositories.locator('[data-tars-knows-item="branchRule"]').nth(1)).toContainText("Stave's default");
  });

  test("a memory is edited and forgotten on its own row, through the memory service", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true&insights=true");
    await openByKeyboard(page, "knows");
    const memories = sheet(page, "knows").locator('[data-tars-knows-item="memory"]').first();
    await expect(memories).toContainText("Staging auth keys rotate every quarter.");
    const rows = memories.locator("[data-memory-row-actions]");
    await expect(rows).toHaveCount(4);
    // Editing: the Memory panel's own row editor, saved through the bridge and read back.
    await memories.getByRole("button", { name: "Edit memory: The search index rebuilds on change, not in the nightly batch." }).focus();
    await page.keyboard.press("Enter");
    const editor = memories.getByRole("textbox");
    await editor.fill("The search index rebuilds on every change.");
    await memories.getByRole("button", { name: "Save" }).click();
    await expect(memories).toContainText("The search index rebuilds on every change.");
    await expect(memories).not.toContainText("not in the nightly batch");
    // Forgetting takes the row out at once; the in-use ones stay.
    await memories.getByRole("button", { name: "Forget memory: Staging auth keys rotate every quarter." }).focus();
    await page.keyboard.press("Enter");
    await expect(memories).not.toContainText("Staging auth keys rotate every quarter.");
    await expect(rows).toHaveCount(3);
    await expect(memories).not.toContainText("Not used yet");
  });

  test("the edit action of the standing instructions opens Tars settings", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true&insights=true");
    await openByKeyboard(page, "knows");
    const edit = sheet(page, "knows").locator('[data-tars-knows-edit="instructions"]');
    await edit.focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page, "knows")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Conversation settings" })).toBeVisible();
    await expect(page.getByLabel("Standing instructions")).toHaveValue(/Open every pull request as a draft/);
  });

  test("Usage opens by keyboard, switches period by keyboard and shows money only for a period with a reported cost", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true&insights=true");
    await openByKeyboard(page, "usage");
    const usage = sheet(page, "usage");
    const body = usage.getByTestId("tars-usage-view");
    await expect(body).toHaveAttribute("data-tars-usage-status", "ready");
    await expect(body).toHaveAttribute("data-tars-usage-window", "sevenDays");
    await expect(usage.locator("[data-tars-usage-work]")).toHaveCount(4);
    // The Codex turns of the last 7 days report tokens only: no cost figure, no currency.
    await expect(usage.locator('[data-tars-usage-total="cost"]')).toHaveCount(0);
    await expect(usage.locator('[data-tars-usage-total="turns"]')).toHaveText("9");
    await expect(usage).toContainText("1 of 9 turns reported no token count.");
    // 30 days includes the Claude turns that reported a cost.
    await usage.getByRole("button", { name: "30 days" }).focus();
    await page.keyboard.press("Enter");
    await expect(body).toHaveAttribute("data-tars-usage-window", "thirtyDays");
    await expect(usage.locator('[data-tars-usage-total="cost"]')).toHaveText("$2.34");
    await expect(usage).toContainText("Cost was reported on 2 of 11 turns");
    await expect(usage.locator("[data-tars-usage-model]")).toHaveCount(2);
    // Today has only the newest turns.
    await usage.getByRole("button", { name: "Today" }).focus();
    await page.keyboard.press("Enter");
    await expect(usage.locator('[data-tars-usage-total="turns"]')).toHaveText("4");
    await expect(usage.locator("[data-tars-usage-notes]")).toContainText("The tokens of its own replies are not recorded.");
    await page.keyboard.press("Escape");
    await expect(usage).toHaveCount(0);
    await expect(entry(page)).toBeFocused();
  });

  test("a usage row opens that work", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true&insights=true");
    await openByKeyboard(page, "usage");
    const row = sheet(page, "usage").locator('[data-tars-usage-work="billing"]').getByRole("button");
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page, "usage")).toHaveCount(0);
    const side = view(page).locator("[data-tars-side-view]");
    await expect(side).toBeVisible();
    await expect(side).toContainText("Fix the billing export on empty invoice lists");
  });

  test("without the usage bridge the view says so instead of showing numbers", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true");
    await openByKeyboard(page, "usage");
    const usage = sheet(page, "usage");
    await expect(usage.getByTestId("tars-usage-view")).toHaveAttribute("data-tars-usage-status", "unavailable");
    await expect(usage).toContainText("Usage cannot be read here.");
    await expect(usage.locator("[data-tars-usage-totals]")).toHaveCount(0);
  });

  test("both views fit a 390px window in Korean and dark without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const name of ["knows", "usage"] as const) {
      await page.goto("/?stavePreview=tars&tray=true&insights=true&lang=ko&theme=dark");
      await openByKeyboard(page, name);
      const body = sheet(page, name).getByTestId(name === "knows" ? "tars-knows-view" : "tars-usage-view");
      if (name === "knows") await expect(body.locator('[data-tars-knows-memory="ready"]')).toHaveCount(1);
      else await expect(body).toHaveAttribute("data-tars-usage-status", "ready");
      const overflow = await body.evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await sheet(page, name).boundingBox();
      // The sheet takes the whole width here; sub-pixel layout rounds to it.
      expect(Math.round(box!.width)).toBe(390);
      await expect(sheet(page, name).getByRole("heading", { name: name === "knows" ? "Tars가 아는 것" : "사용량" })).toBeVisible();
    }
  });
});
