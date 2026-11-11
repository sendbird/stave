import { expect, test, type Page } from "@playwright/test";

const composer = (page: Page) => page.locator("[data-tars-composer]");
const editor = (page: Page) => composer(page).getByRole("textbox");
async function send(page: Page, text: string) {
  await editor(page).fill(text);
  await editor(page).press("Enter");
}
async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Tars settings", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("tab", { name: "Work", exact: true }).click();
  return sheet;
}
/** The action keys a table row lists, as the page states them. */
const rowActions = async (page: Page, row: string) =>
  ((await page.locator(`[data-tars-autonomy-row="${row}"]`).getAttribute("data-tars-autonomy-actions")) ?? "").split(",").filter(Boolean);

/**
 * The preview's host decides what waits with the same policy function as the
 * desktop host (`tarsActionDisposition`), from the saved settings. `receipt=applied`
 * makes Tars propose one delegation for every message.
 */
test("choosing Careful turns the next delegation into a proposal that starts only on Confirm", async ({ page }, testInfo) => {
  await page.goto("/?stavePreview=tars&receipt=applied");
  // The default level: the delegation is applied at once and reads as its flow.
  await send(page, "Check the review");
  const first = page.locator("[data-tars-message]").first();
  await expect(first.locator('[data-tars-flow="preview-responsibility"]')).toBeVisible();
  await expect(first.locator("[data-tars-decision]")).toHaveCount(0);

  const sheet = await openSettings(page);
  const levels = sheet.getByRole("radiogroup", { name: "How independently Tars acts" });
  await expect(levels.getByRole("radio")).toHaveCount(3);
  await expect(levels.getByRole("radio", { name: /^Balanced/ })).toBeChecked();
  expect(await rowActions(page, "auto")).toContain("delegate");
  await levels.getByRole("radio", { name: /^Careful/ }).click();
  // The table follows the choice before anything is saved.
  await expect(sheet.locator("[data-tars-autonomy]")).toHaveAttribute("data-tars-autonomy", "careful");
  expect(await rowActions(page, "auto")).toEqual(["show", "pause", "takeover", "deny"]);
  expect(await rowActions(page, "confirm")).toEqual(expect.arrayContaining(["delegate", "reprioritize", "startNow"]));
  expect(await rowActions(page, "always")).toEqual(["cancel", "skipStage", "acceptCompletion", "approve", "publish"]);
  await expect(sheet.locator("[data-tars-autonomy-details]")).toBeHidden();
  await sheet.locator("[data-tars-autonomy-details-toggle]").click();
  await expect(sheet.locator("[data-tars-autonomy-details]")).toBeVisible();
  await sheet.locator("[data-tars-autonomy-details]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("tars-autonomy-settings-careful.png") });
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).toHaveCount(0);

  // The next decision is held: a card, no flow, and the receipt is a proposal.
  await send(page, "Check the review again");
  const second = page.locator("[data-tars-message]").nth(1);
  const card = page.locator('[data-tars-decision-dock] [data-tars-decision-kind="confirm"]');
  await expect(card).toHaveAttribute("data-tars-decision-state", "waiting");
  await expect(card).toContainText("Start this work?");
  await expect(card).toContainText("Check the review");
  // It waits: nothing started, and its main action is the card's primary button with the workspace behind Details.
  await expect(card).toHaveAttribute("data-tars-decision-state", "waiting");
  await expect(card.locator("[data-tars-decision-details-toggle]")).toHaveAttribute("aria-expanded", "false");
  await expect(second.locator("[data-tars-flow]")).toHaveCount(0);
  const held = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(held.settings.autonomy).toBe("careful");
  expect(held.receipts.map((receipt: { status: string }) => receipt.status)).toEqual(["applied", "proposed"]);
  await page.screenshot({ path: testInfo.outputPath("tars-autonomy-proposal-card.png") });

  // Confirm applies exactly that proposal: the card folds to its record and the work's flow appears.
  await card.getByRole("button", { name: /^Start work/ }).click();
  await expect(second.locator('[data-tars-decision-kind="confirm"]')).toHaveAttribute("data-tars-decision-state", "answered");
  await expect(second.locator('[data-tars-flow="preview-responsibility"]')).toBeVisible();
  const confirmed = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(confirmed.receipts.map((receipt: { status: string }) => receipt.status)).toEqual(["applied", "applied"]);

  // The level survives a reload and shows as the saved choice.
  await page.reload();
  const reopened = await openSettings(page);
  await expect(reopened.getByRole("radio", { name: /^Careful/ })).toBeChecked();
});

test("a never-do rule that names the repository makes Stave ask first and shows the rule on the card", async ({ page }, testInfo) => {
  await page.goto("/?stavePreview=tars&receipt=applied");
  const sheet = await openSettings(page);
  const rules = sheet.locator("[data-tars-never-rules]");
  await expect(rules).toContainText("Matching proposals require confirmation; rules do not automatically block actions.");
  await rules.getByRole("textbox", { name: "New rule", exact: true }).fill("Never touch the preview repository");
  // Enter adds the rule and does not save the form.
  await rules.getByRole("textbox", { name: "New rule", exact: true }).press("Enter");
  await expect(sheet).toBeVisible();
  await expect(rules.locator("[data-tars-never-rule]")).toHaveText(/Never touch the preview repository/);
  await rules.getByRole("textbox", { name: "New rule", exact: true }).fill("Never deploy on Fridays");
  await rules.getByRole("button", { name: "Add rule", exact: true }).click();
  await expect(rules.locator("[data-tars-never-rule]")).toHaveCount(2);
  await rules.getByRole("button", { name: "Remove rule: Never deploy on Fridays", exact: true }).click();
  await expect(rules.locator("[data-tars-never-rule]")).toHaveCount(1);
  await rules.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("tars-autonomy-never-rules.png") });
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).toHaveCount(0);

  // Still the default level, but the rule names this repository: the delegation waits, with the rule on its card.
  await send(page, "Check the review");
  const card = page.locator('[data-tars-decision-kind="confirm"]');
  await expect(card).toHaveAttribute("data-tars-decision-state", "waiting");
  const notice = card.locator("[data-tars-never-rule-notice]");
  await expect(notice).toContainText("One of your rules may apply");
  await expect(notice).toContainText("“Never touch the preview repository” names this repository (preview).");
  await expect(notice).toContainText("The rule does not block the action; the choice is yours.");
  // A matched rule makes confirming an explicit choice: Enter on the card does nothing, the button still works.
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("data-tars-decision-state", "waiting");
  await page.screenshot({ path: testInfo.outputPath("tars-autonomy-rule-card.png") });
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(saved.settings.neverDo).toEqual(["Never touch the preview repository"]);
  expect(saved.receipts[0]).toMatchObject({ status: "proposed", matchedRules: [{ why: "repository", value: "preview" }] });
});

for (const theme of ["light", "dark"]) for (const lang of ["en", "ko"]) {
  test(`the autonomy settings fit the sheet in ${theme} ${lang}`, async ({ page }, testInfo) => {
    await page.goto(`/?stavePreview=tars&theme=${theme}&lang=${lang}`);
    await page.getByRole("button", { name: lang === "ko" ? "Tars 설정" : "Tars settings", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("tab", { name: lang === "ko" ? "작업 방식" : "Work", exact: true }).click();
    await sheet.locator("[data-tars-autonomy-details-toggle]").click();
    const block = sheet.locator("[data-tars-autonomy]");
    await expect(block).toBeVisible();
    await sheet.getByRole("radio").nth(2).click();
    await expect(block).toHaveAttribute("data-tars-autonomy", "handsOff");
    await block.scrollIntoViewIfNeeded();
    // Nothing in the block is wider than the sheet's column: the table wraps instead of scrolling sideways.
    const widths = await block.evaluate((node) => {
      const table = node.querySelector("[data-tars-autonomy-details]")!;
      return { block: node.getBoundingClientRect().width, table: table.getBoundingClientRect().width, scroll: table.scrollWidth, client: table.clientWidth };
    });
    expect(widths.table).toBeLessThanOrEqual(widths.block + 1);
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    await page.screenshot({ path: testInfo.outputPath(`tars-autonomy-settings-${theme}-${lang}.png`) });
  });
}
