import { expect, test, type Page } from "@playwright/test";

const composer = (page: Page) => page.locator("[data-tars-composer]");
const editor = (page: Page) => composer(page).getByRole("textbox");
async function send(page: Page, text: string) {
  await editor(page).fill(text);
  await editor(page).press("Enter");
}

for (const theme of ["light", "dark"]) for (const lang of ["en", "ko"]) for (const density of ["regular", "compact"]) {
  test(`global conversation fits ${theme} ${lang} ${density} at narrow and wide widths`, async ({ page }) => {
    await page.goto(`/?stavePreview=tars&theme=${theme}&lang=${lang}&density=${density}&activity=true`);
    const view = page.getByTestId("tars-view");
    await expect(editor(page)).toBeEditable();
    await expect(view.getByRole("spinbutton")).toHaveCount(0);
    await expect(view.getByRole("combobox")).toHaveCount(0);
    await expect(view.getByRole("radio")).toHaveCount(0);
    await expect(composer(page).getByRole("button", { name: lang === "ko" ? "파일 첨부" : "Attach files", exact: true })).toBeVisible();
    await send(page, "Check the shared plan. " + "longword".repeat(30));
    await expect(view.locator("[data-tars-message]")).toBeVisible();
    // Live progress stays in the tray; only the block that needs the user reads as a transcript notice.
    await expect(view.locator("[data-tars-activity]")).toHaveCount(1);
    await expect(view.locator("[data-tars-activity]")).toContainText("Verify the release candidate");
    await page.evaluate(() => document.fonts.ready);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const geometry = await view.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
      const composerBox = await composer(page).boundingBox();
      expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(1001);
      expect(composerBox!.y + composerBox!.height).toBeGreaterThan(990);
      const message = await view.locator("[data-tars-message]").evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
      expect(message.scroll).toBeLessThanOrEqual(message.client + 1);
      // The indicator: a popover anchored under it when narrow, the pinned tray beside the conversation when wide.
      const indicator = view.getByRole("button", { name: lang === "ko" ? "실행 1" : "1 running", exact: true });
      if (width < 1088) {
        await indicator.click();
        await expect(page.getByRole("dialog").locator("[data-tars-card]").first()).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(indicator).toBeFocused();
      } else {
        await expect(page.getByRole("complementary").locator("[data-tars-card]").first()).toBeVisible();
        const conversation = await view.locator("[data-tars-composer]").evaluate((node) => node.parentElement!.getBoundingClientRect().width);
        expect(conversation).toBeGreaterThanOrEqual(440);
        await indicator.click();
        await expect(page.getByRole("complementary")).toHaveCount(0);
        await indicator.click();
      }
    }
  });
}

test("zero repositories still permits global conversation, retries one lost acknowledgement and restores in another workspace", async ({ page }) => {
  await page.goto("/?stavePreview=tars&sendFailure=once&noRepositories=true");
  await send(page, "Help me decide the next step");
  await expect(page.getByRole("alert")).toContainText("Preview message transport failed");
  await expect(editor(page)).toHaveText("Help me decide the next step");
  await editor(page).press("Enter");
  await expect(page.locator("[data-tars-message]")).toHaveCount(1);
  await expect(editor(page)).toHaveText("");
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(saved.messages).toHaveLength(1);
  expect(saved.messages[0]).not.toHaveProperty("mode");
  expect(saved.messages[0]).not.toHaveProperty("workspaceId");
  expect(saved.settings.model).toBeTruthy();
  await page.goto("/?stavePreview=tars&workspace=another-workspace");
  await expect(page.locator("[data-tars-message]")).toContainText("Help me decide the next step");
  await expect(page.locator("[data-tars-message]")).toContainText("saved conversation continues");
});

test("reasoning leaves composer available for follow-ups and cancellation survives reload", async ({ page }) => {
  await page.goto("/?stavePreview=tars&conversationPending=true");
  await send(page, "Implement the agreed plan");
  await expect(page.locator("[data-tars-message]").first()).toContainText("Thinking");
  await expect(editor(page)).toBeEditable();
  await send(page, "Prioritize the failing check");
  await expect(page.locator("[data-tars-message]")).toHaveCount(2);
  await expect(page.locator("[data-tars-message]").last()).toContainText("Queued");
  await page.locator("[data-tars-message]").first().getByRole("button", { name: "Cancel message", exact: true }).click();
  await expect(page.locator("[data-tars-message]").first()).toContainText("Cancelled");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.reload();
  await expect(page.locator("[data-tars-message]").first()).toContainText("Cancelled");
  await expect(page.locator("[data-tars-message]").last()).toContainText("Queued");
});

test("global settings save once, survive reload and do not appear in the composer", async ({ page }) => {
  await page.goto("/?stavePreview=tars");
  await page.getByRole("button", { name: "Conversation settings", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: "Name", exact: true }).fill("My representative");
  await sheet.getByRole("textbox", { name: "Standing instructions", exact: true }).fill("Keep status reports concise.");
  await expect(sheet.getByRole("spinbutton", { name: "Concurrent responsibilities", exact: true })).toHaveValue("0");
  await sheet.getByRole("spinbutton", { name: "Concurrent responsibilities", exact: true }).fill("48");
  await sheet.getByRole("spinbutton", { name: "Turn limit per work unit" }).fill("12");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await send(page, "What needs attention?");
  await page.reload();
  await expect(page.getByRole("heading", { name: "My representative", exact: true })).toBeVisible();
  await expect(composer(page).getByRole("spinbutton")).toHaveCount(0);
  await page.getByRole("button", { name: "Conversation settings", exact: true }).click();
  await expect(sheet.getByRole("spinbutton", { name: "Concurrent responsibilities", exact: true })).toHaveValue("48");
  await expect(sheet.getByRole("spinbutton", { name: "Turn limit per work unit" })).toHaveValue("12");
  await expect(sheet.getByRole("textbox", { name: "Standing instructions", exact: true })).toHaveValue("Keep status reports concise.");
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(saved.messages[0].maxTurns).toBe(12);
});

test("receipts are accepted actions, not a claim that work is completed", async ({ page }) => {
  await page.goto("/?stavePreview=tars&receipt=applied");
  await send(page, "Check the review");
  const message = page.locator("[data-tars-message]");
  // An applied delegation reads as its flow, which states the work's own state, never "Completed" on acceptance.
  await expect(message.locator('[data-tars-flow="preview-responsibility"] [data-tars-flow-summary]')).toHaveText("Running");
  await expect(message).not.toContainText("Completed");
});

test("global reply paths cannot open a file from the active workspace", async ({ page }) => {
  await page.goto("/?stavePreview=tars&fileLinks=true");
  await send(page, "Explain the source");
  const message = page.locator("[data-tars-message]");
  await expect(message).toContainText("src/example.ts");
  await expect(message.locator("[data-message-file-link]")).toHaveCount(0);
  await expect(message.locator('a[href="src/example.ts"]')).toHaveCount(0);
  await expect(message.locator('a[href="https://example.com/docs"]')).toHaveCount(1);
  await message.getByText("Source", { exact: true }).click();
  await message.getByText("src/example.ts", { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.previewOpenedFile)).toBeUndefined();
  await expect(page).toHaveURL(/stavePreview=tars&fileLinks=true/);
});

test("plain conversation sends task-like syntax as text without palettes or chips", async ({ page }) => {
  await page.goto("/?stavePreview=tars");
  await expect(composer(page)).not.toContainText("Use / for commands");
  for (const text of ["!", "!Assign", "@Information", "/help", "$review"]) {
    await editor(page).fill(text);
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.locator("[data-palette-index]")).toHaveCount(0);
    await expect(editor(page).locator('[contenteditable="false"]')).toHaveCount(0);
    await editor(page).press("Enter");
    await expect(editor(page)).toHaveText("");
  }
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(saved.messages.map((message: { text: string }) => message.text)).toEqual(["!", "!Assign", "@Information", "/help", "$review"]);
});

test("new messages preserve the reading position until the reader jumps to the latest", async ({ page }) => {
  await page.goto("/?stavePreview=tars");
  await send(page, "Start the global conversation");
  await expect(page.locator("[data-tars-message]")).toHaveCount(1);
  await page.evaluate(async () => {
    for (let index = 0; index < 20; index++) await window.api.tars!.sendMessage!({ requestId: `history-${index}`, text: `Saved message ${index}. ${"Review the current plan. ".repeat(20)}` });
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.locator("[data-tars-message]")).toHaveCount(21);
  const transcript = page.getByTestId("tars-transcript");
  await transcript.hover();
  await page.mouse.wheel(0, -100000);
  await expect.poll(() => transcript.evaluate((node) => node.scrollTop)).toBeLessThan(10);
  await expect(page.getByRole("button", { name: "Scroll to bottom", exact: true })).toBeVisible();
  await send(page, "A follow-up while reading the first message");
  await expect(page.locator("[data-tars-message]")).toHaveCount(22);
  await expect.poll(() => transcript.evaluate((node) => node.scrollTop)).toBeLessThan(10);
  await page.getByRole("button", { name: "Scroll to bottom", exact: true }).click();
  await expect.poll(() => transcript.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(32);
});

test("a click in the tray appends a one-line action record, never a user message", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars");
  const view = page.getByTestId("tars-view");
  await expect(editor(page)).toBeEditable();
  // Wide enough to pin: the tray is already open beside the conversation.
  const panel = page.getByRole("complementary");
  // Take over sits in the card's "More actions" menu; the same host path records it.
  await panel.getByRole("button", { name: "More actions for Verify the release candidate across two repositories", exact: true }).click();
  await page.getByRole("menuitem", { name: "Take over", exact: true }).click();
  await expect(view.locator("[data-tars-action-record]")).toContainText(/Take over.*click.*Applied/);
  await expect(panel.getByRole("button", { name: "Hand back", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Hand back", exact: true }).click();
  await expect(view.locator("[data-tars-action-record]")).toHaveCount(2);
  await expect(view.locator("[data-tars-action-record]").last()).toContainText(/Hand back.*click.*Applied/);
  await expect(view.locator("[data-tars-message]")).toHaveCount(0);
});

test("include my working changes is off by default, travels with one message and resets after it is sent", async ({ page }) => {
  await page.goto("/?stavePreview=tars");
  const toggle = composer(page).getByRole("button", { name: "Include my working changes", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // What it does is its description, not part of its name.
  await expect(toggle).toHaveAccessibleDescription(/uncommitted changes/);
  // Keyboard first: Tab from the message box reaches it, and Space turns it on.
  await editor(page).focus();
  await page.keyboard.press("Tab");
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // Then Attach files, then Send: the composer's controls keep their order.
  await page.keyboard.press("Tab");
  await expect(composer(page).getByRole("button", { name: "Attach files", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(composer(page).getByRole("button", { name: "Send", exact: true })).toBeFocused();
  await send(page, "Fix the export on top of my edits");
  await expect(page.locator("[data-tars-message]")).toHaveCount(1);
  await expect(page.locator("[data-tars-message-working-changes]")).toHaveText("Includes working changes");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await send(page, "And tell me what is running");
  await expect(page.locator("[data-tars-message]")).toHaveCount(2);
  await expect(page.locator("[data-tars-message-working-changes]")).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(saved.messages[0].includeWorkingChanges).toBe(true);
  expect(saved.messages[1]).not.toHaveProperty("includeWorkingChanges");
});

const savedDraft = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-draft") ?? "null"));

test("a draft and its working-changes choice survive leaving Tars and a restart, and a successful send clears them", async ({ page }) => {
  await page.goto("/?stavePreview=tars");
  const toggle = composer(page).getByRole("button", { name: "Include my working changes", exact: true });
  await editor(page).fill("Draft that must survive");
  await toggle.click();
  // Leaving Tars unmounts the view; coming back shows the same draft at once.
  await page.getByRole("button", { name: "Close Tars", exact: true }).click();
  await expect(page.getByTestId("tars-view")).toHaveCount(0);
  await page.locator("[data-preview-reopen-tars]").click();
  await expect(editor(page)).toHaveText("Draft that must survive");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // A restart reads the saved draft back.
  await expect.poll(() => savedDraft(page)).toEqual({ text: "Draft that must survive", includeWorkingChanges: true, requestId: null });
  await page.reload();
  await expect(editor(page)).toHaveText("Draft that must survive");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await editor(page).press("Enter");
  await expect(page.locator("[data-tars-message]")).toHaveCount(1);
  await expect(page.locator("[data-tars-message-working-changes]")).toHaveCount(1);
  await expect(editor(page)).toHaveText("");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => savedDraft(page)).toBeNull();
  // The sent message is not restored as a draft after a restart.
  await page.reload();
  await expect(page.locator("[data-tars-message]")).toHaveCount(1);
  await expect(editor(page)).toHaveText("");
});

test("a message with surrounding spaces is cleared after it is sent (the composer sends it trimmed), and stays cleared after a restart", async ({ page }) => {
  await page.goto("/?stavePreview=tars");
  await editor(page).click();
  await page.keyboard.type("   Padded words   ");
  await expect.poll(() => savedDraft(page).then((draft) => draft?.text)).toBe("   Padded words   ");
  await editor(page).press("Enter");
  await expect(page.locator("[data-tars-message]")).toHaveCount(1);
  await expect(editor(page)).toHaveText("");
  await expect.poll(() => savedDraft(page)).toBeNull();
  await page.reload();
  await expect(page.locator("[data-tars-message]")).toHaveCount(1);
  await expect(editor(page)).toHaveText("");
});

test("a send refused before it was saved keeps the draft through a restart, and the retry sends it once with the same request", async ({ page }) => {
  await page.goto("/?stavePreview=tars&sendFailure=before");
  await send(page, "Keep this if sending fails");
  await expect(page.getByRole("alert")).toContainText("refused before it was saved");
  await expect(editor(page)).toHaveText("Keep this if sending fails");
  await expect(page.locator("[data-tars-message]")).toHaveCount(0);
  const kept = await savedDraft(page);
  expect(kept).toMatchObject({ text: "Keep this if sending fails", includeWorkingChanges: false });
  expect(kept.requestId).toBeTruthy();
  await page.goto("/?stavePreview=tars");
  await expect(editor(page)).toHaveText("Keep this if sending fails");
  await editor(page).press("Enter");
  await expect(page.locator("[data-tars-message]")).toHaveCount(1);
  await expect(editor(page)).toHaveText("");
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(saved.messages).toHaveLength(1);
  expect(saved.messages[0].requestId).toBe(kept.requestId);
  await expect.poll(() => savedDraft(page)).toBeNull();
});

test("a send saved by the host but not acknowledged is not restored as a draft after a restart", async ({ page }) => {
  await page.goto("/?stavePreview=tars&sendFailure=once");
  await send(page, "Saved but not acknowledged");
  await expect(page.getByRole("alert")).toContainText("Preview message transport failed");
  // The words stay in this window, so the user sees what did not come back.
  await expect(editor(page)).toHaveText("Saved but not acknowledged");
  await expect.poll(() => savedDraft(page)).toBeNull();
  await page.goto("/?stavePreview=tars");
  await expect(page.locator("[data-tars-message]")).toHaveCount(1);
  await expect(editor(page)).toHaveText("");
});

for (const width of [390, 1440]) for (const lang of ["en", "ko"]) {
  test(`your messages and Tars's replies read apart, and long replies stay readable at ${width}px (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/?stavePreview=tars&richReply=true&lang=${lang}`);
    const view = page.getByTestId("tars-view");
    await send(page, "Why is the nightly billing export late? " + "Look at the retry path and suggest a fix. ".repeat(6));
    const user = view.locator("[data-tars-user-message]");
    const reply = view.locator("[data-tars-reply]");
    await expect(reply).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(user).toHaveAccessibleName(lang === "ko" ? "내 메시지" : "Your message");
    await expect(reply).toHaveAccessibleName(lang === "ko" ? "Tars의 답변" : "Reply from Tars");
    // No name line over the reply: its side and its accessible name say it is Tars's.
    await expect(reply.locator("[data-tars-mark]")).toHaveCount(0);
    // The time waits out of sight until the exchange is hovered or focused, and showing it moves nothing.
    const time = view.locator("[data-tars-message-time]");
    const offset = () => reply.evaluate((node) => node.getBoundingClientRect().top - node.closest("[data-tars-message]")!.getBoundingClientRect().top);
    await user.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect.poll(() => time.evaluate((node) => parseFloat(getComputedStyle(node).opacity))).toBe(0);
    const before = await offset();
    await user.hover();
    await expect.poll(() => time.evaluate((node) => parseFloat(getComputedStyle(node).opacity))).toBeGreaterThan(0.99);
    expect(await offset()).toBe(before);
    const geometry = await view.evaluate((node) => {
      const box = (selector: string) => node.querySelector(selector)!.getBoundingClientRect();
      const row = box("[data-tars-user-message]");
      const bubble = box("[data-tars-user-bubble]");
      const meta = box("[data-tars-message-time]");
      const reply = box("[data-tars-reply]");
      const pre = node.querySelector<HTMLElement>("[data-tars-reply] pre")!;
      const table = box("[data-tars-reply] table");
      const paragraph = box("[data-tars-reply] p:not(:first-child)");
      // The table's own scroll box: the nearest ancestor that clips it horizontally.
      let scroller = node.querySelector<HTMLElement>("[data-tars-reply] table")!.parentElement!;
      while (getComputedStyle(scroller).overflowX === "visible") scroller = scroller.parentElement!;
      const tableBox = scroller.getBoundingClientRect();
      return { tableScroll: [scroller.clientWidth, scroller.scrollWidth, tableBox.left, tableBox.right], view: [node.clientWidth, node.scrollWidth], row: [row.left, row.right, row.width], bubble: [bubble.left, bubble.right, bubble.width], metaRight: meta.right,
        metaBottom: meta.bottom, bubbleTop: bubble.top,
        reply: [reply.left, reply.right], pre: [pre.clientWidth, pre.scrollWidth, getComputedStyle(pre).overflowX], table: [table.left, table.right], paragraph: [paragraph.left, paragraph.right] };
    });
    // Nothing widens the view; the code block scrolls inside itself instead.
    expect(geometry.view[1]).toBeLessThanOrEqual(geometry.view[0] + 1);
    expect(geometry.pre[1]).toBeGreaterThan(geometry.pre[0]);
    expect(geometry.pre[2]).toBe("auto");
    // Your words end on the trailing edge in a bubble that leaves the leading side open; their time sits above them there.
    expect(Math.abs(geometry.bubble[1] - geometry.row[1])).toBeLessThanOrEqual(1);
    expect(geometry.bubble[2]).toBeLessThanOrEqual(geometry.row[2] * 0.88 + 1);
    expect(geometry.bubble[0]).toBeGreaterThan(geometry.row[0] + 8);
    expect(Math.abs(geometry.metaRight - geometry.row[1])).toBeLessThanOrEqual(1);
    expect(geometry.metaBottom).toBeLessThanOrEqual(geometry.bubbleTop + 1);
    // Tars's reply starts on the leading edge of the same column.
    expect(Math.abs(geometry.reply[0] - geometry.row[0])).toBeLessThanOrEqual(1);
    // Prose keeps the reading column; a table may take the wider measure only as far as its columns need, centred on the same axis.
    expect(geometry.paragraph[1]).toBeLessThanOrEqual(geometry.reply[1] + 1);
    if (width < 1088) {
      // Narrow, a table wider than the column scrolls inside its own box, which stays within the column.
      expect(geometry.tableScroll[1]).toBeGreaterThan(geometry.tableScroll[0]);
      expect(geometry.tableScroll[2]).toBeGreaterThanOrEqual(geometry.reply[0] - 1);
      expect(geometry.tableScroll[3]).toBeLessThanOrEqual(geometry.reply[1] + 1);
    }
    if (width >= 1088) {
      // This table's columns fit the column, so it ends on the column's edges (`transcript-width.e2e.ts` covers one that grows).
      expect(geometry.table[1] - geometry.table[0]).toBeGreaterThanOrEqual(geometry.reply[1] - geometry.reply[0] - 1);
      expect(Math.abs((geometry.table[0] + geometry.table[1]) / 2 - (geometry.reply[0] + geometry.reply[1]) / 2)).toBeLessThanOrEqual(1);
    }
    // The composer's one choice is icon-only at every width, like Attach and Send: its full name is its accessible name,
    // and the tooltip leads with that same name, then what it does.
    const name = lang === "ko" ? "작업 중인 변경 포함" : "Include my working changes";
    const toggle = composer(page).getByRole("button", { name, exact: true });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAccessibleDescription(lang === "ko" ? /커밋하지 않은 변경/ : /uncommitted changes/);
    const toggleBox = await toggle.boundingBox();
    const sendBox = await composer(page).getByRole("button", { name: lang === "ko" ? "보내기" : "Send", exact: true }).boundingBox();
    expect(Math.abs(toggleBox!.width - toggleBox!.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(toggleBox!.height - sendBox!.height)).toBeLessThanOrEqual(1);
    expect(await toggle.evaluate((node) => [...node.querySelectorAll("span")].some((span) => span.textContent && span.getBoundingClientRect().width > 1))).toBe(false);
    expect(toggleBox!.x + toggleBox!.width).toBeLessThanOrEqual(sendBox!.x);
    expect(Math.abs((toggleBox!.y + toggleBox!.height / 2) - (sendBox!.y + sendBox!.height / 2))).toBeLessThanOrEqual(1);
    await toggle.hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    expect((await page.getByRole("tooltip").innerText()).trim().startsWith(name)).toBe(true);
  });
}

test("tray cards say when work starts from the user's working changes, with the short commit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&tray=true&queued=true&workingChanges=true&lang=ko");
  const panel = page.getByRole("complementary");
  await expect(panel.locator('[data-tars-card="billing"] [data-tars-working-changes="snapshot"]')).toHaveText("작업 중인 변경에서 시작 · 3fa9c1d");
  await expect(panel.locator('[data-tars-card="search-index"] [data-tars-working-changes="clean"]')).toHaveText("포함할 작업 중인 변경 없음 · 브랜치에서 시작");
});

test("queued work moves with Do first, from its grip's keys and by dragging; each move is one record line and is announced", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&tray=true&queue=true");
  const view = page.getByTestId("tars-view");
  const panel = page.getByRole("complementary");
  const order = () => panel.locator("[data-tars-queue-item]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-tars-queue-item")));
  const docs = "Refresh the API reference examples with the new pagination parameters";
  const notice = page.locator("[data-tars-queue-notice]");
  await expect.poll(order).toEqual(["queue-auth", "queue-search", "queue-docs"]);

  // The last card offers Do first only; choosing it moves the card ahead of the one before it.
  await panel.getByRole("button", { name: `More actions for ${docs}`, exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Do later", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Do first", exact: true }).click();
  await expect.poll(order).toEqual(["queue-auth", "queue-docs", "queue-search"]);
  await expect(view.locator('[data-tars-record-kind="move"]').last()).toContainText(/Do first.*click · Priority \d+.*Applied/);
  await expect(view.locator("[data-tars-message]")).toHaveCount(1);
  await expect(notice).toHaveText(`${docs} is now 2 of 3 in the queue.`);
  await expect(panel.getByRole("button", { name: `More actions for ${docs}`, exact: true })).toBeFocused();

  // From the keyboard: Alt+ArrowUp on the grip moves it again, and the grip keeps focus.
  const grip = panel.getByRole("button", { name: `Reorder ${docs}`, exact: true });
  await grip.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(order).toEqual(["queue-docs", "queue-auth", "queue-search"]);
  await expect(notice).toHaveText(`${docs} is now 1 of 3 in the queue.`);
  await expect(grip).toBeFocused();
  // At the front there is nowhere earlier to go.
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(order).toEqual(["queue-docs", "queue-auth", "queue-search"]);

  // By dragging the grip below the last card.
  const last = panel.locator('[data-tars-queue-item="queue-search"]');
  const box = (await last.boundingBox())!;
  await grip.dragTo(last, { targetPosition: { x: box.width / 2, y: box.height - 4 } });
  await expect.poll(order).toEqual(["queue-auth", "queue-search", "queue-docs"]);
  await expect(view.locator('[data-tars-record-kind="move"]').last()).toContainText(/Move later.*drag · Priority \d+.*Applied/);
  await expect(view.locator('[data-tars-record-kind="move"]')).toHaveCount(3);
});

test("a proposed cancel waits as a decision card, and the confirmed proposal folds to its record without another Confirm", async ({ page }) => {
  await page.goto("/?stavePreview=tars&proposal=cancel");
  const view = page.getByTestId("tars-view");
  await send(page, "Cancel the release check");
  const message = view.locator("[data-tars-message]");
  const card = message.locator('[data-tars-decision-state="waiting"]');
  await expect(card).toContainText("Awaiting your confirmation");
  await card.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(message.locator('[data-tars-decision-state="answered"]')).toContainText(/Cancel Verify the release candidate across two repositories.*click.*Confirmed/);
  await expect(message.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
  // The confirmation's own record shows on its card, not twice.
  await expect(view.locator("[data-tars-action-record]")).toHaveCount(0);
});

test("a decision card answered by click leaves one record line and Tars's reply, never a user message", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&decision=ask");
  const view = page.getByTestId("tars-view");
  await send(page, "What should happen with the release check?");
  const card = view.locator('[data-tars-decision-state="waiting"]');
  await expect(card).toContainText("Should I pause the release check until the staging deploy finishes?");
  // The question waits in Fleet's projection, so the tray counts it like a proposed control; the work itself still runs.
  await expect(view.getByRole("button", { name: "1 running · 1 needs you", exact: true })).toBeVisible();
  // The options are a radio group: the recommended one starts chosen, a click chooses another, and Answer sends the choice.
  const keep = card.getByRole("radio", { name: /^Keep it running/ });
  await expect(keep).toBeChecked();
  await card.getByText("Pause it now", { exact: true }).click();
  await expect(card.getByRole("radio", { name: /^Pause it now/ })).toBeChecked();
  await expect(keep).not.toBeChecked();
  await card.getByText("Keep it running", { exact: true }).click();
  await card.getByRole("button", { name: "Answer", exact: true }).click();
  await expect(view.locator('[data-tars-decision-state="answered"]')).toContainText(/Keep it running.*click.*Answered/);
  const answer = view.locator('[data-tars-message-origin="answer"]');
  await expect(answer).toContainText("Understood.");
  await expect(answer.locator('[data-role="user"], .is-user')).toHaveCount(0);
  await expect(view.getByRole("button", { name: "1 running", exact: true })).toBeVisible();
});

test("decision keys answer only while the card has focus; the composer keeps its keys", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&decision=ask");
  const view = page.getByTestId("tars-view");
  await send(page, "What should happen with the release check?");
  const card = view.locator('[data-tars-decision-state="waiting"]');
  await expect(card).toBeVisible();
  // A number typed in the composer is text, not an answer: the card never takes focus by itself.
  await editor(page).click();
  await page.keyboard.press("1");
  await expect(editor(page)).toHaveText("1");
  await expect(card).toBeVisible();
  await editor(page).fill("");
  await card.focus();
  // 1 only chooses the first option (focus moves to it); Enter answers the choice.
  await page.keyboard.press("1");
  await expect(card.getByRole("radio", { name: /^Pause it now/ })).toBeChecked();
  await expect(card.getByRole("radio", { name: /^Pause it now/ })).toBeFocused();
  await expect(card).toBeVisible();
  await page.keyboard.press("Enter");
  const answered = view.locator('[data-tars-decision-state="answered"]');
  await expect(answered).toContainText(/Pause it now.*key.*Answered/);
  // The pause went through the host's control path: the work is paused now.
  await expect(page.getByRole("complementary")).toContainText("Paused");
  // Focus stays on the folded record instead of falling to the page.
  await expect(answered.locator('[data-tars-record-state][tabindex="-1"]')).toBeFocused();
});

test("a short answer in words binds to the one waiting decision's recommended option", async ({ page }) => {
  await page.goto("/?stavePreview=tars&decision=ask&lang=ko");
  const view = page.getByTestId("tars-view");
  await send(page, "릴리스 확인 어떻게 할까?");
  await expect(view.locator('[data-tars-decision-state="waiting"]')).toBeVisible();
  await send(page, "응");
  await expect(view.locator('[data-tars-decision-state="answered"]')).toContainText(/계속 실행.*대화.*답함/);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  // The bound word was an answer, not another message to Tars.
  expect(saved.messages.map((message: { text: string }) => message.text)).not.toContain("응");
});

test("a short answer whose control is refused keeps the words in the composer", async ({ page }) => {
  await page.goto("/?stavePreview=tars&decision=ask&controlRefusal=true");
  const view = page.getByTestId("tars-view");
  await send(page, "What should happen with the release check?");
  await expect(view.locator('[data-tars-decision-state="waiting"]')).toBeVisible();
  // "1" binds to "Pause it now"; the host records the answer but refuses the pause, without a refusal code.
  await send(page, "1");
  await expect(view.locator('[data-tars-decision-attempt="rejected"]')).toContainText("Pause it now");
  await expect(editor(page)).toHaveText("1");
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(saved.answers.map((answer: { status: string }) => answer.status)).toEqual(["rejected"]);
});

test("an unverified completion is a decision card: verification work goes to the composer, Accept applies by click", async ({ page }) => {
  await page.goto("/?stavePreview=tars&decision=unverified");
  const view = page.getByTestId("tars-view");
  const card = view.locator('[data-tars-decision-kind="unverifiedCompletion"][data-tars-decision-state="waiting"]');
  await expect(card).toContainText("Stave could not verify");
  // Nothing is recommended, so Answer waits for a choice.
  const submit = card.getByRole("button", { name: "Answer", exact: true });
  await expect(submit).toBeDisabled();
  await card.getByText("Ask Tars for new verification work", { exact: true }).click();
  await submit.click();
  // It only drafts the request: nothing is answered or sent.
  await expect(editor(page)).toContainText("Start new work to verify");
  await expect(card).toBeVisible();
  // Accepting and cancelling cannot be undone, so either keeps Answer out of the filled primary; asking for verification does not.
  await expect(submit).toHaveAttribute("data-variant", "primary");
  await card.getByText("Cancel responsibility", { exact: true }).click();
  await expect(submit).toHaveAttribute("data-tone", "danger");
  await expect(submit).not.toHaveAttribute("data-variant", "primary");
  await card.getByText("Accept as done", { exact: true }).click();
  await expect(submit).toHaveAttribute("data-tone", "danger");
  await submit.click();
  await expect(view.locator('[data-tars-decision-state="answered"]')).toContainText(/Accept as done.*click.*Answered/);
});

test("the tray and a delegated flow show where work stands without adding transcript rows", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&tray=true");
  const view = page.getByTestId("tars-view");
  const tray = page.getByRole("complementary");
  // Only the fix runs; the work the user took over is theirs, not running.
  await expect(view.getByRole("button", { name: "1 running · 1 yours · 1 needs you · 1 done", exact: true })).toBeVisible();
  await expect(tray.locator('[data-tars-card="billing"]')).toContainText("18 turns left · 2 helpers working");
  const flow = view.locator('[data-tars-flow="billing"]');
  await expect(flow).toContainText("1 of 3 stages done · Running");
  await flow.getByRole("button", { expanded: false }).click();
  const stage = flow.locator('[data-tars-flow-stage="cause"]');
  await stage.focus();
  await page.keyboard.press("Enter");
  // A stage node opens its place on the run timeline; Fleet stays in the node's menu.
  await expect(view.locator('[data-tars-side-view="timeline"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(view.locator("[data-tars-side-view]")).toHaveCount(0);
  await expect(stage).toBeFocused();
  await flow.getByRole("button", { name: "More for Cause", exact: true }).click();
  await page.getByRole("menuitem", { name: "Show in Fleet", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-preview-fleet-focus", "exec-billing/task-billing");
  const release = tray.locator('[data-tars-card="release"]');
  // Confirm takes Resume's place instead of sitting beside it.
  await expect(release.getByRole("button", { name: "Resume", exact: true })).toHaveCount(0);
  await release.getByRole("button", { name: "Confirm resume", exact: true }).click();
  await expect(view.locator("[data-tars-action-record]")).toContainText(/Resume.*click.*Applied/);
  // Resumed work waits for the one active slot behind the running fix: it is waiting, never counted as running.
  await expect(view.getByRole("button", { name: "1 running · 1 waiting · 1 yours · 1 done", exact: true })).toBeVisible();
});

for (const lang of ["en", "ko"]) for (const width of [1280, 420]) {
  test(`card actions keep to one line in the ${width < 1088 ? "popover" : "pinned"} tray (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?stavePreview=tars&tray=true&lang=${lang}`);
    const view = page.getByTestId("tars-view");
    await page.evaluate(() => document.fonts.ready);
    if (width < 1088) await view.locator("[data-tars-tray-indicator]").click();
    const rows = page.locator("[data-tars-card-actions]");
    await expect(rows.first()).toBeVisible();
    for (const row of await rows.all()) {
      if (!(await row.isVisible())) continue;
      const geometry = await row.evaluate((node) => ({ height: node.getBoundingClientRect().height,
        control: Math.max(...[...node.querySelectorAll("button")].map((button) => button.getBoundingClientRect().height)),
        buttons: node.querySelectorAll("button").length }));
      expect(geometry.buttons).toBeLessThanOrEqual(3);
      expect(geometry.height).toBeLessThanOrEqual(geometry.control + 1);
    }
  });
}

test("an approval cut to fit says so under its request and offers its task, in both languages", async ({ page }) => {
  for (const [lang, note] of [["en", "Only the start is shown; open its task to read the whole request."], ["ko", "앞부분만 보이므로 전체 요청은 작업에서 확인하세요."]] as const) {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?stavePreview=tars&proposal=approve&approval=cut&lang=${lang}`);
      const view = page.getByTestId("tars-view");
      await send(page, "Approve the release script");
      const request = view.locator('[data-tars-decision-row="request"]');
      await expect(request).toBeVisible();
      // The text ends in the mark and keeps its line break; the note and the task sit under it, inside the card.
      await expect(request.locator("dd")).toContainText("set -euo pipefail");
      await expect(request.locator("[data-tars-decision-truncated]")).toContainText(note);
      await expect(request.locator("[data-tars-decision-open-task]")).toBeVisible();
      const geometry = await request.evaluate((row) => {
        const value = row.querySelector("dd")!;
        const text = [...value.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join("");
        const card = row.closest("[data-tars-decision]")!.getBoundingClientRect();
        const note = row.querySelector("[data-tars-decision-truncated]")!.getBoundingClientRect();
        return { endsWithMark: text.endsWith("…"), lines: getComputedStyle(value).whiteSpace, inside: note.left >= card.left && note.right <= card.right + 0.5 };
      });
      expect(geometry).toEqual({ endsWithMark: true, lines: "pre-wrap", inside: true });
    }
  }
});

const sideView = (page: Page) => page.getByTestId("tars-view").locator("[data-tars-side-view]");

test("an output in the tray opens the frozen report beside the conversation; Esc closes it and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&outputs=true");
  const view = page.getByTestId("tars-view");
  // The indicator counts outputs only because there are some; needs you keeps Fleet's rule.
  await expect(view.getByRole("button", { name: "1 needs you · 1 done · 6 outputs", exact: true })).toBeVisible();
  const tray = page.getByRole("complementary");
  const output = tray.locator('[data-tars-output="report"]').filter({ hasText: "saved card" }).getByRole("button");
  await output.click();
  const side = sideView(page);
  await expect(side).toHaveAttribute("data-tars-side-view", "report");
  await expect(side.locator("[data-tars-report-frozen]")).toContainText("when the run ended");
  await expect(side.locator('[data-tars-criterion="met"]')).toHaveCount(2);
  // Each criterion names what decided it; evidence is shown once, under the stage that reported it.
  await expect(side.locator('[data-tars-criterion-source="agent"]').first()).toContainText("Reported by the agent in Verify");
  await expect(side.locator('[data-tars-evidence-group="verify"] [data-evidence-revision]')).toContainText("the final revision");
  await expect(side.locator('[data-tars-evidence-group="work"] [data-evidence-revision]')).toContainText("not the final revision");
  await expect(side.locator('[data-tars-report-blocked]')).toHaveCount(0);
  // The side view takes the tray's column at the tray's width: the conversation does not move.
  await expect(tray).toHaveCount(0);
  const widths = await view.evaluate((node) => ({ conversation: node.querySelector("[data-tars-composer]")!.parentElement!.getBoundingClientRect().width,
    side: node.querySelector("[data-tars-side-view]")!.getBoundingClientRect().width }));
  expect(widths.conversation).toBe(1280 - 416);
  expect(widths.side).toBe(416);
  // The view names itself in its own title bar: the kind, then the work it is about.
  await expect(side.getByRole("heading", { level: 2 })).toHaveText("Result report");
  await expect(side.locator("[data-tars-side-subject]")).not.toBeEmpty();
  // Opening is view-only: nothing is added to the conversation.
  await expect(view.locator("[data-tars-action-record]")).toHaveCount(0);
  await expect(view.locator("[data-tars-message]")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(side).toHaveCount(0);
  await expect(page.getByRole("complementary")).toBeVisible();
  await expect(page.getByRole("complementary").locator('[data-tars-output="report"]').filter({ hasText: "saved card" }).getByRole("button")).toBeFocused();
});

test("selected diff lines are quoted into the composer as context and nothing is sent", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&outputs=true");
  const view = page.getByTestId("tars-view");
  await page.getByRole("complementary").locator('[data-tars-output="changes"]').filter({ hasText: "saved card" }).getByRole("button").click();
  const side = sideView(page);
  await expect(side).toHaveAttribute("data-tars-side-view", "changes");
  // The diff is the workspace now, not frozen with the report, and can be read again.
  await expect(side.locator("[data-tars-changes-live]")).toContainText("read live");
  await side.locator("[data-tars-changes-refresh]").click();
  const diff = side.locator('[data-tars-diff="src/checkout/cards.ts"]');
  await expect(diff.getByRole("group")).toBeVisible();
  const ask = diff.locator("[data-tars-ask-lines]");
  await expect(ask).toBeDisabled();
  // Select the two added lines that pick the saved card (new lines 2 and 3).
  await diff.evaluate((node) => {
    const rows = [...node.querySelectorAll("div:has(> [data-aui-slot='line-number'])")]
      .filter((row) => row.children[2]?.textContent === "+");
    const range = document.createRange();
    range.setStart(rows[1]!, 0);
    range.setEnd(rows[2]!, rows[2]!.childNodes.length);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await expect(ask).toHaveAttribute("data-tars-ask-lines", "2");
  await ask.click();
  await expect(editor(page)).toContainText("About src/checkout/cards.ts, lines 2–3:");
  await expect(editor(page)).toContainText("+ const saved = cards.find((card) => card.id === savedId);");
  await expect(editor(page)).toBeFocused();
  await expect(view.locator("[data-tars-message]")).toHaveCount(2);
});

test("a flow's review node opens the review and its completion node the report", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&outputs=true&lang=ko");
  const flow = page.getByTestId("tars-view").locator('[data-tars-flow="checkout"]');
  await flow.getByRole("button", { expanded: false }).click();
  await flow.locator('[data-tars-flow-stage="review"]').click();
  await expect(sideView(page)).toHaveAttribute("data-tars-side-view", "review");
  await expect(sideView(page)).toContainText("리뷰 통과");
  await expect(sideView(page).locator("[data-tars-finding]")).toHaveCount(2);
  await flow.locator("[data-tars-flow-completion]").click();
  await expect(sideView(page)).toHaveAttribute("data-tars-side-view", "report");
  await sideView(page).getByRole("button", { name: "기록", exact: true }).click();
  await expect(sideView(page)).toHaveAttribute("data-tars-side-view", "timeline");
});

test("a blocked card opens the report on its unmet criteria, inline under 40% of a narrow view, with its admitted controls", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/?stavePreview=tars&outputs=true");
  const view = page.getByTestId("tars-view");
  const indicator = view.locator("[data-tars-tray-indicator]");
  await indicator.click();
  await page.getByRole("dialog").locator('[data-tars-open-report="search"]').click();
  const side = sideView(page);
  await expect(side).toHaveAttribute("data-tars-side-placement", "inline");
  await expect(side.locator("[data-tars-report-unmet]")).toContainText("1 criterion not met");
  await expect(side.locator("[data-tars-next-steps]").getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  const box = await side.boundingBox();
  const viewBox = await view.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(viewBox!.height * 0.4 + 1);
  // The composer stays below it, in view.
  const composerBox = await composer(page).boundingBox();
  expect(composerBox!.y).toBeGreaterThanOrEqual(box!.y + box!.height - 1);
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(901);
  await page.keyboard.press("Escape");
  await expect(side).toHaveCount(0);
  // The popover that held the opener closed with it, so focus returns to its indicator.
  await expect(indicator.locator("xpath=ancestor::button[1]")).toBeFocused();
});

test("asking for the report in words opens it beside the conversation as a view-only action", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&outputs=true");
  await send(page, "Show me the report for the checkout work");
  await expect(sideView(page)).toHaveAttribute("data-tars-side-view", "report");
  await expect(sideView(page)).toContainText("Show the saved card first at checkout");
  await expect(page.getByTestId("tars-view").locator("[data-tars-message]").filter({ hasText: "Show me the report" }))
    .toContainText(/Open the result report.*Show the saved card first at checkout.*Accepted for execution/);
  // Focus stays in the composer, and nothing was pressed to open it, so Esc leaves focus there.
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sideView(page)).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
  // A reload does not open it again.
  await send(page, "Show me the report once more");
  await expect(sideView(page)).toHaveAttribute("data-tars-side-view", "report");
  await page.reload();
  await expect(page.getByTestId("tars-view").locator("[data-tars-message]")).toHaveCount(4);
  await expect(sideView(page)).toHaveCount(0);
});

for (const lang of ["en", "ko"] as const) {
  test(`an automatic follow-up is marked with its reason, and the tray says when Tars looks next (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/?stavePreview=tars&followUp=true&lang=${lang}`);
    const view = page.getByTestId("tars-view");
    const korean = lang === "ko";
    // Marked as Tars's own follow-up with its reason, never shown as the user's words.
    await expect(view.locator('[data-tars-follow-up="blocked"]')).toContainText(korean ? "자동 후속 · 막힘: Fix the flaky upload test"
      : "Automatic follow-up · Blocked: Fix the flaky upload test");
    await expect(view.getByText("Judge what it needs next", { exact: false })).toHaveCount(0);
    await expect(view.locator('[data-tars-message="message-follow-up"]')).toContainText(korean ? "업로드 테스트가 CI에서 계속 실패해" : "The upload test still fails on CI");
    // A change past the turn limit says so once, in the conversation.
    await expect(view.locator('[data-tars-follow-up-exhausted="follow-exhausted"]')).toContainText(korean
      ? "자동 후속이 턴 한도에 닿아 Refresh the API reference에 대한 후속을 하지 않았습니다." : "No automatic follow-up for Refresh the API reference: automatic turns reached the turn limit.");
    // The tray card says when Tars looks next, or that it stopped.
    const tray = page.getByRole("complementary");
    await expect(tray.locator('[data-tars-card="follow-waiting"] [data-tars-follow-up-state="nextCheck"]')).toContainText(korean ? "다음 확인:" : "Next check:");
    await expect(tray.locator('[data-tars-card="follow-exhausted"] [data-tars-follow-up-state="exhausted"]')).toContainText(korean
      ? "자동 후속이 턴 한도에 닿아 멈췄습니다." : "No automatic follow-up: automatic turns reached the turn limit.");
  });
}

test("a running card is a run monitor: current stage with a live clock, one segment per stage, the step count and its timeline", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&tray=true");
  const view = page.getByTestId("tars-view");
  const monitor = page.getByRole("complementary").locator('[data-tars-monitor="billing"]');
  await expect(monitor).toContainText("Now: Cause, attempt 2");
  const segments = monitor.locator("[data-run-segments] > li");
  await expect(monitor.locator("[data-run-segments]")).toHaveAttribute("data-run-segments", "done,now,pending");
  await expect(segments).toHaveCount(3);
  await expect(monitor.locator("[data-tars-monitor-count]")).toHaveText("2/3");
  const clock = monitor.getByRole("timer");
  await expect(clock).toHaveText(/^\d+m/);
  // Segments share one row and never wrap.
  const rows = await segments.evaluateAll((items) => new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size);
  expect(rows).toBe(1);
  const timeline = monitor.getByRole("button", { name: "Open the timeline for Fix the billing export on empty invoice lists", exact: true });
  await timeline.click();
  await expect(view.locator('[data-tars-side-view="timeline"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(view.locator("[data-tars-side-view]")).toHaveCount(0);
  await expect(timeline).toBeFocused();
});

for (const width of [1280, 420]) {
  test(`after time away the tray opens with a recap that links into the side view and can be dismissed (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?stavePreview=tars&tray=true&recap=true");
    const view = page.getByTestId("tars-view");
    if (width < 1088) await view.locator("[data-tars-tray-indicator]").click();
    const recap = page.locator("[data-tars-recap]");
    await expect(recap).toContainText("While you were away");
    await expect(recap.locator("[data-tars-recap-counts]")).toContainText("1 needs you");
    await expect(recap.locator("[data-tars-recap-counts]")).toContainText("1 failed");
    await expect(recap.locator("[data-tars-recap-counts]")).toContainText("1 done");
    await expect(recap.locator("[data-tars-recap-item]")).toHaveCount(3);
    const geometry = await recap.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
    await recap.getByRole("button", { name: "Open Update the setup guide: Done", exact: true }).click();
    await expect(view.locator('[data-tars-side-view="report"]')).toBeVisible();
    await page.keyboard.press("Escape");
    if (width < 1088) await view.locator("[data-tars-tray-indicator]").click();
    await page.locator("[data-tars-recap-dismiss]").click();
    await expect(page.locator("[data-tars-recap]")).toHaveCount(0);
  });
}

test("the recap is hidden on a first visit and when nothing changed since the last one", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&tray=true");
  await expect(page.getByRole("complementary").locator("[data-tars-card]").first()).toBeVisible();
  await expect(page.locator("[data-tars-recap]")).toHaveCount(0);
  // The view was visible until now, and the fixtures changed before that.
  expect(await page.evaluate(() => localStorage.getItem("stave:tars:lastVisibleAt"))).not.toBeNull();
  await page.reload();
  await expect(page.getByRole("complementary").locator("[data-tars-card]").first()).toBeVisible();
  await expect(page.locator("[data-tars-recap]")).toHaveCount(0);
});

test("a confirmation card names its effect, marks what cannot be undone, and Esc leaves it waiting for the message box", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&proposal=cancel");
  const view = page.getByTestId("tars-view");
  await send(page, "Cancel the release check");
  const card = view.locator('[data-tars-decision-kind="confirm"][data-tars-decision-state="waiting"]');
  await expect(card).toContainText("Cancel this work?");
  await expect(card).toContainText("Can't be undone");
  await expect(card.locator("[data-tars-decision-rows]")).toHaveAttribute("data-tars-decision-rows", "repository,workspace,revision,effect");
  await expect(card.locator('[data-tars-decision-row="workspace"]')).toContainText("Release check");
  await expect(card.getByRole("button", { name: "Not now", exact: true })).toHaveAttribute("aria-keyshortcuts", "Escape");
  // The tray offers the same confirmation without inviting it: not filled primary, with the same cue.
  const trayConfirm = page.getByRole("complementary").getByRole("button", { name: "Confirm cancel", exact: true });
  await expect(trayConfirm).toHaveAttribute("data-tone", "danger");
  await expect(trayConfirm).not.toHaveAttribute("data-variant", "primary");
  await expect(page.getByRole("complementary").locator("[data-tars-decision-risk-tag]")).toHaveText("Can't be undone");
  await card.focus();
  await page.keyboard.press("Escape");
  await expect(editor(page)).toBeFocused();
  await expect(card).toBeVisible();
  // Enter does not apply an irreversible effect; 1 does, once the card has focus.
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(card).toBeVisible();
  await page.keyboard.press("1");
  await expect(view.locator('[data-tars-decision-state="answered"]')).toContainText(/Cancel Verify the release candidate across two repositories.*key.*Confirmed/);
});

test("Korean decision text wraps between words, not inside one", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/?stavePreview=tars&decision=unverified&lang=ko");
  const card = page.getByTestId("tars-view").locator('[data-tars-decision-kind="unverifiedCompletion"][data-tars-decision-state="waiting"]');
  await expect(card).toContainText("Stave가 완료를 확인하지 못했습니다");
  expect(await card.evaluate((node) => getComputedStyle(node).wordBreak)).toBe("keep-all");
  await expect(card.locator('[data-tars-decision-risk-tag]')).toHaveText("되돌릴 수 없음");
  const geometry = await card.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
});

// The publish card: every theme and language at a narrow and a wide width, with no horizontal overflow; then Enter publishes and Esc declines.
for (const theme of ["light", "dark"]) for (const lang of ["en", "ko"]) {
  test(`publish card fits ${theme} ${lang} at 420px and 1280px, publishes on Enter and declines on Esc`, async ({ page }, testInfo) => {
    await page.goto(`/?stavePreview=tars&publish=true&theme=${theme}&lang=${lang}`);
    const view = page.getByTestId("tars-view");
    const card = view.locator("[data-tars-publish-card^='publish:']");
    await expect(card).toHaveAttribute("data-tars-publish-state", "waiting");
    await expect(card.locator("[data-tars-publish-row='head']")).toContainText("tars/checkout");
    await expect(card.locator("[data-tars-publish-message]")).toHaveValue("feat: show the saved card first at checkout");
    await page.evaluate(() => document.fonts.ready);
    for (const width of [420, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await card.scrollIntoViewIfNeeded();
      for (const target of [view, card, card.locator("[data-tars-publish-body]")]) {
        const geometry = await target.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
        expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
      }
      const box = await card.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      await card.screenshot({ path: testInfo.outputPath(`publish-card-${theme}-${lang}-${width}.png`) });
      if (process.env.STAVE_PUBLISH_SCREENSHOTS) await card.screenshot({ path: `${process.env.STAVE_PUBLISH_SCREENSHOTS}/publish-card-${theme}-${lang}-${width}.png` });
    }
    // The words are editable and the type is a choice; Enter in a field publishes what the card shows.
    await card.locator("[data-tars-publish-type]").selectOption("fix");
    await expect(card.locator("[data-tars-publish-message]")).toHaveValue("fix: show the saved card first at checkout");
    await card.locator("[data-tars-publish-message]").fill("fix(checkout): show the saved card first");
    await card.locator("[data-tars-publish-message]").press("Enter");
    const line = view.locator("[data-tars-publish-record='applied']");
    await expect(line).toContainText(lang === "ko" ? /Draft PR #12 열림.*키/ : /Draft PR #12 opened.*key/);
    await expect(view.locator("[data-tars-publish-card^='publish:']")).toHaveCount(0);
    // The pull request is an output of the work: the pinned tray lists it beside the conversation.
    await expect(view.locator("[data-tars-output='pullRequest']")).toContainText(lang === "ko" ? "Draft PR #12 보기" : "Draft PR #12");
    if (process.env.STAVE_PUBLISH_SCREENSHOTS) await view.screenshot({ path: `${process.env.STAVE_PUBLISH_SCREENSHOTS}/published-view-${theme}-${lang}-1280.png` });
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
    expect(saved.publications[0]).toMatchObject({ commitMessage: "fix(checkout): show the saved card first", source: "key", status: "applied" });
    // Esc declines a proposal; the report's Create draft PR then opens the same card, and Esc closes it without closing the report.
    // The preview keeps its conversation in session storage across loads; start this one fresh.
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`/?stavePreview=tars&publish=failed&theme=${theme}&lang=${lang}`);
    await page.setViewportSize({ width: 1280, height: 1000 });
    const proposal = view.locator("[data-tars-publish-card^='publish:']");
    await expect(proposal).toHaveAttribute("data-tars-publish-state", "waiting");
    await proposal.locator("[data-tars-publish-title]").focus();
    await page.keyboard.press("Escape");
    await expect(view.locator("[data-tars-publish-proposal='declined']")).toBeVisible();
    await view.locator("[data-tars-output='report']").filter({ hasText: "Show the saved card first at checkout" }).getByRole("button").click();
    await view.locator("[data-tars-report-publish] [data-tars-publish-open]").click();
    const opened = view.locator("[data-tars-publish-card^='publish-click:']");
    await expect(opened).toHaveAttribute("data-tars-publish-state", "waiting");
    await expect(opened.locator("[data-tars-publish-message]")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(opened).toHaveCount(0);
    await expect(view.locator("[data-tars-report-publish]")).toBeVisible();
    // Nothing was published, so the preview never even saved a publish record.
    expect((await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation") ?? "null")))?.publications ?? []).toHaveLength(0);
  });
}

test("a failed publish folds to its reason with Retry, which reopens the card and continues", async ({ page }) => {
  await page.goto("/?stavePreview=tars&publish=failed");
  await page.setViewportSize({ width: 1280, height: 1000 });
  const view = page.getByTestId("tars-view");
  const card = view.locator("[data-tars-publish-card^='publish:']");
  await expect(card).toHaveAttribute("data-tars-publish-state", "waiting");
  await card.locator("[data-tars-publish-confirm]").click();
  const failed = view.locator("[data-tars-publish-record='rejected']");
  await expect(failed).toContainText(/Not published.*click/);
  await expect(failed).toContainText("Stopped at: Push");
  await failed.locator("[data-tars-publish-retry]").click();
  const retry = view.locator("[data-tars-publish-card^='publish-click:']");
  await expect(retry).toHaveAttribute("data-tars-publish-state", "waiting");
  await expect(retry.locator("[data-tars-publish-message]")).toBeFocused();
  await expect(retry.locator("[data-tars-publish-row='resume']")).toContainText("Push");
  await page.keyboard.press("Enter");
  await expect(view.locator("[data-tars-publish-record='applied']")).toContainText(/Draft PR #12 opened.*key/);
  await expect(view.locator("[data-tars-publish-card]")).toHaveCount(0);
});

test("queued work without a run shows the user's message, Tars's instruction and the criteria whole; older work says its message was not saved", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&tray=true&queue=true&briefFailure=once");
  const view = page.getByTestId("tars-view");
  const tray = page.getByRole("complementary");
  const queued = tray.locator('[data-tars-card="queue-auth"]');
  await expect(queued).toHaveAttribute("data-tars-lane", "running");
  // Queued: no task, no run and no timeline yet, but its request opens.
  await expect(queued.getByRole("button", { name: "Open task" })).toHaveCount(0);
  await expect(queued.locator("[data-tars-monitor-timeline]")).toHaveCount(0);
  await queued.getByRole("button", { name: "Open the request and instruction for Rotate the staging auth keys" }).click();
  const side = sideView(page);
  await expect(side).toHaveAttribute("data-tars-side-view", "brief");
  await expect(side.getByRole("button", { name: "Request", exact: true })).toHaveAttribute("aria-pressed", "true");
  // A failed read keeps the criteria in view and offers Retry.
  await expect(side.locator('[data-tars-brief-status="failed"]')).toContainText("The saved request could not be loaded.");
  await expect(side.locator("[data-tars-brief-criterion]")).toHaveCount(2);
  await side.getByRole("button", { name: "Retry" }).click();
  // Retry leaves with the failure; focus stays in the side view, so Esc still closes it.
  await expect(side.locator("h2")).toBeFocused();
  const message = side.locator('[data-tars-brief-text="request"]');
  const instruction = side.locator('[data-tars-brief-text="instruction-delegated"]');
  // Every line of the message survives, the code block's indentation included; nothing scrolls sideways or is cut.
  const text = await message.innerText();
  expect(text.split("\n")).toHaveLength(18);
  expect(text).toContain("auth:\n  signingKey: ${AUTH_SIGNING_KEY}\n  previousKeys:\n    - ${AUTH_SIGNING_KEY_PREVIOUS}");
  expect(text).toContain("reason=friday-release-preparation-2026-11");
  await expect(instruction).toContainText("Never change production.");
  for (const block of [message, instruction]) {
    const box = await block.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth, height: node.scrollHeight, shown: node.clientHeight }));
    expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
    expect(box.height).toBeLessThanOrEqual(box.shown + 1);
  }
  await expect(side.locator('[data-tars-brief-part="criteria"]')).toContainText("2 completion criteria");
  // Opening is view-only: nothing is added to the conversation.
  await expect(view.locator("[data-tars-action-record]")).toHaveCount(0);

  // Other work never shows this one's texts: older work says its message was not saved and shows its whole saved instruction.
  await page.keyboard.press("Escape");
  await expect(side).toHaveCount(0);
  await tray.locator('[data-tars-card="queue-docs"]').getByRole("button", { name: /^Open the request and instruction for/ }).click();
  await expect(side.locator('[data-tars-brief-missing="request"]')).toContainText("This older work did not save your original message.");
  await expect(side.locator('[data-tars-brief-text="instruction-assignment"]')).toContainText("Update every example in docs/api/*.md");
  await expect(side.locator('[data-tars-brief-text="request"]')).toHaveCount(0);
  await expect(side).not.toContainText("Rotate the staging auth keys before Friday's release.");

  // Switching kinds and back keeps to the work shown.
  await side.getByRole("button", { name: "Report", exact: true }).click();
  await expect(side).toHaveAttribute("data-tars-side-view", "report");
  await side.getByRole("button", { name: "Request", exact: true }).click();
  await expect(side.locator('[data-tars-brief-missing="request"]')).toBeVisible();
});

test("running work says what Stave observed in the tray, the flow, the composer band and the timeline", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&tray=true&live=true");
  const view = page.getByTestId("tars-view");
  const band = view.locator('[data-tars-running="billing"]');
  // The composer band: only the running fix, its stage and the turn's current step, from the relayed turn.
  await expect(view.locator("[data-tars-running]")).toHaveCount(1);
  await expect(band).toContainText("Fix the billing export on empty invoice lists");
  await expect(band).toContainText(/Stage 2 of 3 · .+, attempt 2/);
  await expect(band.locator('[data-tars-live-freshness="live"]')).toContainText("Running the tests");
  // The folded flow under the delegating message and the tray card say the same observation.
  await expect(view.locator('[data-tars-flow="billing"] [data-tars-flow-live]')).toContainText("Running the tests");
  const card = page.getByRole("complementary").locator('[data-tars-card="billing"]');
  await expect(card.locator('[data-tars-live-freshness="live"]')).toContainText("Running the tests");
  await expect(card.locator("[data-tars-recent-entry]")).toHaveCount(3);
  // Paused and taken-over work gets no live line and no place in the band.
  await expect(page.getByRole("complementary").locator('[data-tars-card="migration"] [data-tars-live-line]')).toHaveCount(0);
  // The band's mark sits on its first line, and the band never overflows the composer.
  await page.evaluate(() => document.fonts.ready);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await band.evaluate((node) => {
      const mark = node.querySelector("[data-state]")!.getBoundingClientRect();
      const title = node.querySelector("p")!.getBoundingClientRect();
      const composer = node.closest("[data-tars-composer]")!;
      return { markCenter: mark.top + mark.height / 2, titleTop: title.top, titleBottom: title.bottom, scroll: composer.scrollWidth, client: composer.clientWidth };
    });
    expect(geometry.markCenter).toBeGreaterThanOrEqual(geometry.titleTop);
    expect(geometry.markCenter).toBeLessThanOrEqual(geometry.titleBottom);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
  }
  // Its Timeline opens the side view on "Now", then the stage it is on, expanded.
  await page.setViewportSize({ width: 1280, height: 900 });
  await band.getByRole("button", { name: "Open the timeline for Fix the billing export on empty invoice lists" }).click();
  const now = view.locator("[data-tars-timeline-now]");
  await expect(now).toContainText("Running the tests");
  await expect(now.locator('[data-tars-state="running"]')).toBeVisible();
  await expect(now).toContainText("retried, attempt 2");
  await expect(view.locator('[aria-controls="agent-run-stage-cause"]')).toHaveAttribute("aria-expanded", "true");
});

test("running work Stave has not observed for a while is marked out of date everywhere it shows", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars&tray=true&live=stale&lang=ko");
  const view = page.getByTestId("tars-view");
  for (const scope of ['[data-tars-running="billing"]', '[data-tars-flow="billing"] [data-tars-flow-live]', '[data-tars-card="billing"]']) {
    const stale = view.locator(`${scope} [data-tars-live-freshness="stale"]`).or(page.locator(`${scope} [data-tars-live-freshness="stale"]`)).first();
    await expect(stale).toContainText("14분 동안 관측 없음 · 진행 정보가 오래됐을 수 있습니다");
    await expect(stale).not.toContainText("테스트 실행 중");
  }
});
