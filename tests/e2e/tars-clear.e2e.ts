import { expect, test, type Page } from "@playwright/test";

const composer = (page: Page) => page.locator("[data-tars-composer]");
const editor = (page: Page) => composer(page).getByRole("textbox");
const view = (page: Page) => page.getByTestId("tars-view");
const tray = (page: Page) => view(page).locator("[data-tars-tray-panel]");
const lane = (page: Page, name: string) => tray(page).locator(`[data-tars-tray-lane="${name}"]`);
const laneCount = (page: Page, name: string) => lane(page, name).locator("[data-tars-lane-count]").first();
async function send(page: Page, text: string) {
  await editor(page).fill(text);
  await editor(page).press("Enter");
}
async function openLane(page: Page, name: string) {
  const trigger = lane(page, name).getByRole("button", { name: new RegExp(`^${name === "done" ? "Done" : "Outputs"}`) }).first();
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
}

test.describe("Tars clear, retention and suggestions", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("clearing Done hides only ended work, keeps running, waiting and held work, survives a reload and undoes", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true");
    await expect(laneCount(page, "done")).toHaveText("1");
    await expect(laneCount(page, "needsYou")).toHaveText("1");
    await expect(laneCount(page, "running")).toHaveText("2");
    await openLane(page, "done");
    await lane(page, "done").locator('[data-tars-lane-clear="done"]').click();
    await expect(laneCount(page, "done")).toHaveText("0");
    await expect(lane(page, "done").locator("[data-tars-lane-hidden]")).toHaveText(/1 ended work item hidden/);
    // Paused, running and taken-over work is untouched.
    await expect(laneCount(page, "needsYou")).toHaveText("1");
    await expect(laneCount(page, "running")).toHaveText("2");
    // The clear is recorded where it happened, with its Undo.
    const record = view(page).locator('[data-testid="tars-transcript"] [data-tars-clear-scopes="done"]');
    await expect(record).toContainText("Cleared");
    await expect(record).toContainText("1 ended work item");

    await page.reload();
    await expect(laneCount(page, "done")).toHaveText("0");
    await openLane(page, "done");
    await lane(page, "done").locator('[data-tars-lane-undo="done"]').click();
    await expect(laneCount(page, "done")).toHaveText("1");
    await expect(view(page).locator('[data-tars-clear-scopes="done"]')).toHaveAttribute("data-tars-clear-status", "undone");
  });

  test("clearing the conversation asks first, leaves the welcome and a Restore, keeps after a reload, and restores", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true");
    await send(page, "Keep an eye on the billing export.");
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(2);
    await view(page).locator("[data-tars-clear-conversation]").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Clear the conversation?");
    await expect(dialog).toContainText("2 messages leave this view");
    await dialog.getByRole("button", { name: "Not now" }).click();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(2);

    await view(page).locator("[data-tars-clear-conversation]").click();
    await page.getByRole("dialog").getByRole("button", { name: "Clear conversation" }).click();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(0);
    await expect(view(page).locator("[data-tars-welcome]")).toBeVisible();
    await expect(view(page).locator('[data-tars-clear-scopes="conversation"]')).toContainText("2 messages");
    await expect(view(page).locator("[data-tars-clear-conversation]")).toBeDisabled();
    // The tray's work is not part of the conversation.
    await expect(laneCount(page, "running")).toHaveText("2");

    await page.reload();
    await expect(view(page).locator("[data-tars-welcome]")).toBeVisible();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(0);
    await view(page).locator("[data-tars-clear-undo]").click();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(2);
    await expect(view(page).locator("[data-tars-welcome]")).toHaveCount(0);
  });

  test("asking Tars to clear shows a card; Esc leaves everything, Enter clears through the same path", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true&lang=ko");
    await send(page, "끝난 작업 정리해줘");
    const first = view(page).locator("[data-tars-clear-card]");
    await expect(first).toContainText("화면에서 정리하시겠습니까?");
    await expect(first.locator('[data-tars-clear-row="done"]')).toContainText("끝난 작업 1개");
    await first.focus();
    await page.keyboard.press("Escape");
    await expect(view(page).locator('[data-tars-clear-proposal="declined"]')).toContainText("정리하지 않음");
    await expect(laneCount(page, "done")).toHaveText("1");

    await send(page, "끝난 작업만 정리해줘");
    const second = view(page).locator("[data-tars-clear-card]");
    await second.focus();
    await page.keyboard.press("Enter");
    await expect(laneCount(page, "done")).toHaveText("0");
    await expect(view(page).locator('[data-tars-clear-scopes="done"]')).toContainText("Tars 제안");
    await expect(laneCount(page, "needsYou")).toHaveText("1");
  });

  test("a clear card still waiting for its confirmation stays when only the conversation is cleared", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true");
    await send(page, "Clear finished work");
    await expect(view(page).locator("[data-tars-clear-card]")).toBeVisible();
    await view(page).locator("[data-tars-clear-conversation]").click();
    await page.getByRole("dialog").getByRole("button", { name: "Clear conversation" }).click();
    await expect(view(page).locator('[data-tars-clear-scopes="conversation"]')).toBeVisible();
    const card = view(page).locator("[data-tars-clear-card]");
    await expect(card).toBeVisible();
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(laneCount(page, "done")).toHaveText("0");
  });

  test("clearing the conversation after Done keeps the Done lane's Undo, and that Undo leaves the conversation cleared", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true");
    await send(page, "Keep an eye on the billing export.");
    await openLane(page, "done");
    await lane(page, "done").locator('[data-tars-lane-clear="done"]').click();
    await expect(laneCount(page, "done")).toHaveText("0");
    await view(page).locator("[data-tars-clear-conversation]").click();
    await page.getByRole("dialog").getByRole("button", { name: "Clear conversation" }).click();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(0);
    await lane(page, "done").locator('[data-tars-lane-undo="done"]').click();
    await expect(laneCount(page, "done")).toHaveText("1");
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(0);
    await expect(view(page).locator("[data-tars-clear-undo]")).toBeVisible();
  });

  test("retention hides old ended work by itself, and Until I clear it brings it back", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true&endedDaysAgo=10");
    await expect(laneCount(page, "done")).toHaveText("0");
    await openLane(page, "done");
    await expect(lane(page, "done").locator("[data-tars-lane-hidden]")).toHaveText(/1 ended work item hidden \(cleared or past the retention period\)/);
    await view(page).getByRole("button", { name: "Conversation settings" }).click();
    const retention = page.getByLabel("Keep ended work in the panel");
    await expect(retention).toHaveValue("7");
    await retention.selectOption("0");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(laneCount(page, "done")).toHaveText("1");
    await page.reload();
    await expect(laneCount(page, "done")).toHaveText("1");
  });

  test("suggestions come from the work, fill the message box on a press or a key and never send", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true");
    const chips = composer(page).locator("[data-tars-suggestion]");
    await expect(chips).toHaveCount(3);
    await expect(composer(page).getByRole("list", { name: "Suggested requests" })).toBeVisible();
    await expect(chips.nth(0)).toHaveText("What needs me?");
    await expect(composer(page).locator('[data-tars-suggestion="resume"]')).toHaveText("Resume Verify the release candidate");
    const before = await view(page).locator("[data-tars-message]").count();
    await composer(page).locator('[data-tars-suggestion="resume"]').focus();
    await page.keyboard.press("Enter");
    await expect(editor(page)).toHaveText("Resume “Verify the release candidate”.");
    await expect(editor(page)).toBeFocused();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(before);
    // While the box holds words the chips step aside.
    await expect(chips).toHaveCount(0);
    // The chip row stays inside the composer's column.
    await editor(page).fill("");
    const overflow = await composer(page).locator("[data-tars-suggestions]").evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("a new profile starts with the default standing instructions; an existing empty one is offered them", async ({ page }) => {
    await page.goto("/?stavePreview=tars&newProfile=true");
    await view(page).getByRole("button", { name: "Conversation settings" }).click();
    const instructions = page.getByLabel("Standing instructions");
    await expect(instructions).toHaveValue(/^- Lead with the answer or the decision you need from me/);
    await expect(page.locator("[data-tars-instructions-default]")).toHaveCount(0);

    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/?stavePreview=tars");
    await view(page).getByRole("button", { name: "Conversation settings" }).click();
    await expect(page.getByLabel("Standing instructions")).toHaveValue("");
    await expect(page.getByLabel("Standing instructions")).toHaveAttribute("placeholder", /Lead with the answer/);
    await page.getByRole("button", { name: "Use default" }).click();
    await expect(page.getByLabel("Standing instructions")).toHaveValue(/^- Lead with the answer/);
    await page.getByLabel("Standing instructions").fill("Answer in one line.");
    await expect(page.getByRole("button", { name: "Reset to default" })).toBeVisible();
  });
});
