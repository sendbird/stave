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
    await expect(dialog).toContainText("Hide 2 messages from this view");
    await dialog.getByRole("button", { name: "Not now" }).click();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(2);

    await view(page).locator("[data-tars-clear-conversation]").click();
    await page.getByRole("dialog").getByRole("button", { name: "Clear conversation" }).click();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(0);
    await expect(view(page).locator("[data-tars-welcome]")).toBeVisible();
    await expect(view(page).locator('[data-tars-clear-scopes="conversation"]')).toContainText("2 messages");
    // Work is still in the tray, so Clear stays available for a Work reset.
    await expect(view(page).locator("[data-tars-clear-conversation]")).toBeEnabled();
    // The tray's work is not part of the conversation.
    await expect(laneCount(page, "running")).toHaveText("2");

    await page.reload();
    await expect(view(page).locator("[data-tars-welcome]")).toBeVisible();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(0);
    await view(page).locator("[data-tars-clear-undo]").click();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(2);
    await expect(view(page).locator("[data-tars-welcome]")).toHaveCount(0);
  });

  test("resetting Work says what it cancels and keeps, cancels Tars's work, keeps paused and taken-over work, and stays after a reload", async ({ page }) => {
    await page.goto("/?stavePreview=tars&tray=true");
    await view(page).locator("[data-tars-clear-conversation]").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Also reset Work" }).click();
    const plan = dialog.locator("[data-tars-clear-work-plan]");
    await expect(plan).toContainText("Cancels 1 unfinished work item through the normal Cancel; its run stops.");
    await expect(plan).toContainText("Hides 1 ended work item and its outputs.");
    await expect(plan).toContainText("Keeps 2 items you took over, paused or that are publishing.");
    await expect(plan).toContainText("Restore brings back the cards, not cancelled runs.");
    await dialog.getByRole("button", { name: "Clear and reset Work" }).click();
    const record = view(page).locator('[data-tars-clear-scopes="conversation,done,outputs,work"]');
    await expect(record).toContainText("1 unfinished work item cancelled");
    await expect(record).toContainText("2 kept (taken over, paused or publishing)");
    await expect(record.locator("[data-tars-clear-cancelled-stays]")).toBeVisible();
    await expect(laneCount(page, "running")).toHaveText("1");
    await expect(laneCount(page, "needsYou")).toHaveText("1");
    await expect(laneCount(page, "done")).toHaveText("0");
    await page.reload();
    await expect(laneCount(page, "running")).toHaveText("1");
    await expect(laneCount(page, "done")).toHaveText("0");
    await expect(view(page).locator('[data-tars-clear-scopes="conversation,done,outputs,work"]')).toContainText("1 unfinished work item cancelled");
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
    await page.reload();
    await expect(view(page).locator('[data-tars-clear-proposal="declined"]')).toContainText("정리하지 않음");
    await expect(view(page).locator("[data-tars-clear-card]")).toHaveCount(0);

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
    await view(page).getByRole("button", { name: "Tars settings" }).click();
    const retention = page.getByLabel("Keep ended work in the panel");
    await expect(retention).toContainText("7 days");
    await retention.click();
    await page.getByRole("option", { name: "Until I clear it", exact: true }).click();
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
    await editor(page).press("ControlOrMeta+A");
    await editor(page).press("Backspace");
    await expect(editor(page)).toHaveText("");
    await expect(chips).toHaveCount(3);
    const overflow = await composer(page).locator("[data-tars-suggestions]").evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await chips.first().click();
    await expect(editor(page)).toHaveText("What needs me right now, and what do you recommend for each?");
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(before);
  });

  test("new and existing empty profiles show default instructions, custom edits can be saved or reset", async ({ page }) => {
    await page.goto("/?stavePreview=tars&newProfile=true");
    await view(page).getByRole("button", { name: "Tars settings" }).click();
    const instructions = page.getByLabel("Standing instructions");
    await expect(instructions).toHaveValue(/^- Lead with the answer or the decision you need from me/);
    await expect(page.locator("[data-tars-instructions-default]")).toHaveCount(0);

    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/?stavePreview=tars");
    await view(page).getByRole("button", { name: "Tars settings" }).click();
    await expect(page.locator("[data-tars-instructions-default]")).toHaveCount(0);
    await expect(page.getByLabel("Standing instructions")).toHaveValue(/^- Lead with the answer/);
    await page.getByLabel("Standing instructions").fill("Answer in one line.");
    await expect(page.getByRole("button", { name: "Reset to default" })).toBeVisible();
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await page.getByRole("tab", { name: "General", exact: true }).click();
    await expect(page.getByLabel("Standing instructions")).toHaveValue("Answer in one line.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await view(page).getByRole("button", { name: "Tars settings" }).click();
    await expect(page.getByLabel("Standing instructions")).toHaveValue("Answer in one line.");
    await page.getByRole("button", { name: "Reset to default" }).click();
    await expect(page.getByLabel("Standing instructions")).toHaveValue(/^- Lead with the answer/);
    await page.getByLabel("Standing instructions").fill("");
    await expect(page.getByRole("button", { name: "Use default" })).toBeVisible();
    await page.getByRole("button", { name: "Use default" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.reload();
    await view(page).getByRole("button", { name: "Tars settings" }).click();
    await expect(page.getByLabel("Standing instructions")).toHaveValue(/^- Lead with the answer/);
  });
});

for (const width of [800, 1440]) for (const lang of ["en", "ko"]) {
  test(`Work reset dialog contains its plan and uses token spacing at ${width}px / ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?stavePreview=tars&tray=true&lang=${lang}&theme=${lang === "ko" ? "dark" : "light"}&density=${width === 800 ? "compact" : "regular"}`);
    await view(page).locator("[data-tars-clear-conversation]").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox").click();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await dialog.evaluate((element) => {
      const plan = element.querySelector<HTMLElement>("[data-tars-clear-work-plan]")!;
      const work = element.querySelector<HTMLElement>("[data-tars-clear-work]")!;
      const rect = element.getBoundingClientRect();
      const token = (name: string) => {
        const probe = document.createElement("div"); probe.style.width = `var(${name})`; element.append(probe);
        const value = probe.getBoundingClientRect().width; probe.remove(); return value;
      };
      return { overflow: element.scrollWidth - element.clientWidth, gap: parseFloat(getComputedStyle(work).rowGap), expectedGap: token("--aui-space-8"),
        indent: parseFloat(getComputedStyle(plan).paddingInlineStart), expectedIndent: token("--aui-space-16"),
        contained: [...plan.children].every((item) => { const r = item.getBoundingClientRect(); return r.left >= rect.left && r.right <= rect.right + 1; }) };
    });
    // One CSS pixel allows fractional font/layout rounding while preserving containment and token spacing.
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.contained).toBe(true);
    expect(Math.abs(geometry.gap - geometry.expectedGap)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.indent - geometry.expectedIndent)).toBeLessThanOrEqual(1);
    // Selecting Work moves default focus to Not now; Enter dismisses without cancelling work.
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    // The narrow viewport folds the tray; its always-visible indicator still reports the unchanged work.
    await expect(view(page).locator("[data-tars-tray-indicator]")).toContainText(lang === "en" ? "2 in progress" : "진행 중 2");
    await expect(view(page).locator('[data-tars-clear-scopes="conversation,done,outputs,work"]')).toHaveCount(0);
  });
}
