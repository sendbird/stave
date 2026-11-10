import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) for (const lang of ["en", "ko"]) for (const density of ["regular", "compact"]) {
  test(`Tars composer typography, keyboard focus and containment: ${theme} ${lang} ${density}`, async ({ page }) => {
    await page.goto(`/?stavePreview=tars&theme=${theme}&lang=${lang}&density=${density}`);
    const composer = page.locator("[data-tars-composer]");
    const editor = composer.getByRole("textbox");
    await expect(editor).toBeEditable();
    await page.evaluate(() => document.fonts.ready);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // Suggestions (shown above the composer while the message box is empty), then the running-work timeline control, come before the editor in keyboard order.
      await page.locator("[data-tars-guide-toggle]").focus();
      const chips = composer.locator("[data-tars-suggestion]");
      for (let index = 0, count = await chips.count(); index < count; index++) {
        await page.keyboard.press("Tab");
        await expect(chips.nth(index)).toBeFocused();
      }
      await page.keyboard.press("Tab");
      await expect(composer.locator("[data-tars-running-timeline]")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(editor).toBeFocused();
      await editor.fill(lang === "ko" ? "줄바꿈과 포커스를 확인하는 긴 메시지입니다. ".repeat(6) : "Verify wrapping and keyboard focus across the whole composer. ".repeat(6));
      const focusColor = await composer.evaluate((host) => {
        const probe = document.createElement("div"); probe.style.borderColor = "var(--aui-color-border-focus)";
        host.append(probe); const color = getComputedStyle(probe).borderColor; probe.remove(); return color;
      });
      await expect.poll(() => composer.locator("form").evaluate((form) => getComputedStyle(form).borderTopColor)).toBe(focusColor);
      const geometry = await composer.evaluate((host) => {
        const form = host.querySelector("form")!;
        const style = getComputedStyle(form);
        const box = form.getBoundingClientRect();
        const root = host.closest('[data-testid="tars-view"]')!;
        return { font: parseFloat(getComputedStyle(host.querySelector('[contenteditable]')!).fontSize),
          borders: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
          focus: getComputedStyle(document.documentElement).getPropertyValue("--aui-color-border-focus"),
          form: box.toJSON(), host: host.getBoundingClientRect().toJSON(),
          client: root.clientWidth, scroll: root.scrollWidth,
          focused: form.matches(":focus-within"), padding: parseFloat(style.paddingLeft),
          tokenPadding: parseFloat(getComputedStyle(host).getPropertyValue("--aui-space-12")) * parseFloat(getComputedStyle(document.documentElement).fontSize) };
      });
      expect(geometry.focused).toBe(true);
      expect(geometry.borders.every((color) => color === geometry.borders[0])).toBe(true);
      const unfocused = await page.locator("[data-tars-guide-toggle]").evaluate((node) => { (node as HTMLElement).focus(); return getComputedStyle(document.querySelector('[data-tars-composer] form')!).borderTopColor; });
      expect(geometry.borders[0]).not.toBe(unfocused);
      expect(geometry.font).toBeGreaterThanOrEqual(16);
      expect(geometry.padding).toBe(geometry.tokenPadding);
      expect(geometry.form.left).toBeGreaterThan(geometry.host.left);
      expect(geometry.form.right).toBeLessThan(geometry.host.right);
      expect(geometry.form.bottom).toBeLessThan(geometry.host.bottom);
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
      await editor.fill("");
    }
  });
}

test("select, remove, send attachments only, retry the same snapshot, and replay it", async ({ page }) => {
  await page.goto("/?stavePreview=tars&sendFailure=once&noRepositories=true");
  const composer = page.locator("[data-tars-composer]");
  const picker = composer.locator('input[type="file"]');
  const chosen = page.waitForEvent("filechooser");
  await composer.getByRole("button", { name: "Attach files", exact: true }).click();
  await (await chosen).setFiles([{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Selection snapshot 첨부 내용") },
    { name: "screen.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64") }]);
  await expect(composer.getByRole("button", { name: "Remove attached file notes.txt", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Remove attached file screen.png", exact: true }).click();
  await expect(composer.getByText("screen.png", { exact: true })).toHaveCount(0);
  await picker.setInputFiles({ name: "archive.zip", mimeType: "application/zip", buffer: Buffer.from("not text") });
  await expect(composer.getByRole("alert")).toContainText("Could not attach files");
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Preview message transport failed" })).toBeVisible();
  await expect(composer.getByText("notes.txt", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("[data-tars-message-attachments]")).toContainText("notes.txt");
  await expect(composer.getByText("notes.txt", { exact: true })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(saved.messages).toHaveLength(1);
  expect(saved.messages[0].attachments).toEqual([{ type: "file_context", filePath: "notes.txt", content: "Selection snapshot 첨부 내용", language: "txt" }]);
  await page.reload();
  await expect(page.locator("[data-tars-message-attachments]")).toContainText("notes.txt");
});

test("after a lost acknowledgement, changing only the files makes a new message instead of reusing the request", async ({ page }) => {
  await page.goto("/?stavePreview=tars&sendFailure=once&noRepositories=true");
  const composer = page.locator("[data-tars-composer]");
  await composer.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("First snapshot") });
  await composer.getByRole("textbox").fill("Read the attached notes");
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  // The host saved the message with the file, but its acknowledgement was lost.
  await expect(page.getByRole("alert").filter({ hasText: "Preview message transport failed" })).toBeVisible();
  await composer.getByRole("button", { name: "Remove attached file notes.txt", exact: true }).click();
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("[data-tars-message]")).toHaveCount(2);
  await expect(page.getByText("already names a different message")).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(saved.messages.map((message: { attachments?: unknown[] }) => message.attachments?.length ?? 0)).toEqual([1, 0]);
  expect(saved.messages[0].requestId).not.toBe(saved.messages[1].requestId);
});

test("attached files stay with the draft when Tars is closed and reopened, never in the saved copy, and a restored draft does not reuse their request", async ({ page }) => {
  await page.goto("/?stavePreview=tars&sendFailure=before");
  const composer = page.locator("[data-tars-composer]");
  const savedDraft = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-draft") ?? "null"));
  await composer.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Kept in memory") });
  await composer.getByRole("textbox").fill("Use these notes");
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "refused before it was saved" })).toBeVisible();
  // The saved copy holds the words and marks that their request carried files; the file bytes stay in memory.
  const kept = await savedDraft();
  expect(Object.keys(kept).sort()).toEqual(["includeWorkingChanges", "requestHadAttachments", "requestId", "text"]);
  expect(kept).toMatchObject({ text: "Use these notes", requestHadAttachments: true });
  await page.getByRole("button", { name: "Close Tars", exact: true }).click();
  await page.locator("[data-preview-reopen-tars]").click();
  await expect(composer.getByRole("textbox")).toHaveText("Use these notes");
  await expect(composer.getByRole("button", { name: "Remove attached file notes.txt", exact: true })).toBeVisible();
  // After a restart the words come back without the file, and sending them is a new request, not a retry of the one with the file.
  await page.goto("/?stavePreview=tars");
  await expect(composer.getByRole("textbox")).toHaveText("Use these notes");
  await expect(composer.getByText("notes.txt", { exact: true })).toHaveCount(0);
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("[data-tars-message]")).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(saved.messages[0]).not.toHaveProperty("attachments");
  expect(saved.messages[0].requestId).not.toBe(kept.requestId);
  await expect.poll(savedDraft).toBeNull();
});

test("a send whose request ID cannot be saved with the draft stops and keeps the words, so a restart cannot send them twice", async ({ page }) => {
  // The draft saves, but not with a request ID; the host would also lose the message's response.
  await page.goto("/?stavePreview=tars&noRepositories=true&draftSaveFailure=request&sendFailure=once");
  const composer = page.locator("[data-tars-composer]");
  const conversation = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation") ?? "null"));
  await composer.getByRole("textbox").fill("Fix the export");
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-draft") ?? "null")))
    .toEqual({ text: "Fix the export", includeWorkingChanges: false, requestId: null });
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  // Nothing went out, and the failure is the conversation's own.
  expect((await conversation())?.messages ?? []).toHaveLength(0);
  await expect(page.getByRole("alert").filter({ hasText: "The conversation request failed. Your draft and saved messages are preserved." })).toBeVisible();
  await expect(composer.getByRole("textbox")).toHaveText("Fix the export");
  // Stave quits before any later save lands: after the restart the saved words come back, and sending them makes one message.
  await page.goto("/?stavePreview=tars&noRepositories=true");
  await expect(composer.getByRole("textbox")).toHaveText("Fix the export");
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("[data-tars-message]")).toHaveCount(1);
  expect((await conversation()).messages.map((message: { text: string }) => message.text)).toEqual(["Fix the export"]);
});

test("a file still being read when Tars is closed and reopened stays with its draft: Send waits for it and the first message carries it", async ({ page }) => {
  await page.goto("/?stavePreview=tars&noRepositories=true");
  const composer = page.locator("[data-tars-composer]");
  const send = composer.getByRole("button", { name: "Send", exact: true });
  // The composer's controls follow its disabled state; Send's own guard does the same while a read runs.
  const toggle = composer.locator("[data-tars-working-changes-toggle]");
  await expect(composer.getByRole("textbox")).toBeEditable();
  // Hold the file read until the test lets it finish.
  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = function (this: File) {
      if (this.name !== "slow.txt") return read.call(this);
      return new Promise<string>((resolve) => { (window as unknown as { finishRead: () => void }).finishRead = () => resolve(read.call(this)); });
    };
  });
  await composer.getByRole("textbox").fill("Read the slow notes");
  await composer.locator('input[type="file"]').setInputFiles({ name: "slow.txt", mimeType: "text/plain", buffer: Buffer.from("Slow snapshot") });
  await expect(toggle).toBeDisabled();
  await page.getByRole("button", { name: "Close Tars", exact: true }).click();
  await page.locator("[data-preview-reopen-tars]").click();
  await expect(composer.getByRole("textbox")).toHaveText("Read the slow notes");
  // The reopened view still waits for the read its draft started: Send does nothing yet.
  await expect(toggle).toBeDisabled();
  await send.click();
  await page.evaluate(() => (window as unknown as { finishRead: () => void }).finishRead());
  await expect(composer.getByRole("button", { name: "Remove attached file slow.txt", exact: true })).toBeVisible();
  await expect(composer.getByRole("textbox")).toHaveText("Read the slow notes");
  await expect(toggle).toBeEnabled();
  await send.click();
  await expect(page.locator("[data-tars-message-attachments]")).toContainText("slow.txt");
  await expect(composer.getByText("slow.txt", { exact: true })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!));
  expect(saved.messages.map((message: { text: string }) => message.text)).toEqual(["Read the slow notes"]);
  expect(saved.messages[0].attachments).toEqual([{ type: "file_context", filePath: "slow.txt", content: "Slow snapshot", language: "txt" }]);
});

for (const inputEvent of ["paste", "drop"]) {
  test(`Tars ${inputEvent} uses the common file pipeline for text and images`, async ({ page }) => {
    await page.goto("/?stavePreview=tars");
    const composer = page.locator("[data-tars-composer]");
    const editor = composer.getByRole("textbox");
    await expect(editor).toBeEditable();
    await editor.evaluate((node, eventType) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(["Pasted source content"], "source.txt", { type: "text/plain" }));
      transfer.items.add(new File([new Uint8Array([1, 2, 3])], "pasted.png", { type: "image/png" }));
      const event = eventType === "paste" ? new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true })
        : new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true });
      node.dispatchEvent(event);
    }, inputEvent);
    await expect(composer.getByRole("button", { name: "Remove attached file source.txt", exact: true })).toBeVisible();
    await expect(composer.getByRole("button", { name: "Remove attached file pasted.png", exact: true })).toBeVisible();
    await composer.getByRole("button", { name: "Send", exact: true }).click();
    const parts = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!).messages[0].attachments);
    expect(parts).toEqual([
      { type: "file_context", filePath: "source.txt", content: "Pasted source content", language: "txt" },
      { type: "image_context", label: "pasted.png", dataUrl: "data:image/png;base64,AQID", mimeType: "image/png" },
    ]);
  });
}

test("same-name selections and repeated image pastes keep separate snapshots", async ({ page }) => {
  await page.goto("/?stavePreview=tars");
  const composer = page.locator("[data-tars-composer]");
  const editor = composer.getByRole("textbox");
  await expect(editor).toBeEditable();
  for (const byte of [1, 2]) {
    await editor.evaluate((node, value) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([value])], "image.png", { type: "image/png" }));
      node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, byte);
    await expect(composer.getByRole("button", { name: `Remove attached file ${byte === 1 ? "image.png" : "image (2).png"}`, exact: true })).toBeVisible();
  }
  const picker = composer.locator('input[type="file"]');
  for (const content of ["first note", "second note"]) {
    await picker.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from(content) });
    await expect(composer.getByRole("button", { name: `Remove attached file ${content === "first note" ? "notes.txt" : "notes (2).txt"}`, exact: true })).toBeVisible();
  }
  await picker.setInputFiles({ name: " notes.txt ", mimeType: "text/plain", buffer: Buffer.from("third note") });
  await expect(composer.getByRole("button", { name: "Remove attached file notes (3).txt", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Remove attached file notes.txt", exact: true }).click();
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  const parts = await page.evaluate(() => JSON.parse(sessionStorage.getItem("stave-preview-conversation")!).messages[0].attachments);
  expect(parts).toEqual([
    { type: "image_context", label: "image.png", dataUrl: "data:image/png;base64,AQ==", mimeType: "image/png" },
    { type: "image_context", label: "image (2).png", dataUrl: "data:image/png;base64,Ag==", mimeType: "image/png" },
    { type: "file_context", filePath: "notes (2).txt", content: "second note", language: "txt" },
    { type: "file_context", filePath: "notes (3).txt", content: "third note", language: "txt" },
  ]);
  await page.reload();
  await expect(page.locator("[data-tars-message-attachments]")).toContainText("image (2).png");
});

test("Tars body, supporting copy, report and settings remain readable across layouts", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  for (const lang of ["en", "ko"]) for (const theme of ["light", "dark"]) {
    await page.goto(`/?stavePreview=tars&outputs=true&lang=${lang}&theme=${theme}`);
    await expect(page.locator('[data-tars-composer] [contenteditable]')).toBeEditable();
    await page.evaluate(() => document.fonts.ready);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width === 390) await page.getByRole('button', { name: lang === 'ko' ? '확인 필요 1 · 끝남 1 · 산출물 6' : '1 needs you · 1 done · 6 outputs', exact: true }).click();
      await page.locator('[data-tars-output="report"]').filter({ hasText: 'saved card' }).getByRole('button').click();
      const report = page.locator('[data-tars-side-view="report"]');
      await expect(report).toBeVisible();
      await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
      const typography = await page.locator('[data-testid="tars-view"]').evaluate(root => {
        return [...root.querySelectorAll('[data-tars-message] article, [data-tars-side-view] p')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ font: parseFloat(getComputedStyle(e).fontSize), horizontal: e.scrollWidth - e.clientWidth, vertical: getComputedStyle(e).overflowY === 'hidden' ? e.scrollHeight - e.clientHeight : 0 }));
      });
      expect(typography.length).toBeGreaterThan(4);
      for (const item of typography) { expect(item.font).toBeGreaterThanOrEqual(13); expect(item.horizontal).toBeLessThanOrEqual(1); expect(item.vertical).toBeLessThanOrEqual(1); }
      await page.screenshot({ path: testInfo.outputPath(`report-${lang}-${theme}-${width}.png`) });
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: lang === 'ko' ? '대화 설정' : 'Conversation settings', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const items = await dialog.locator('label, p, input, textarea').evaluateAll(nodes => nodes.filter(e => e.getBoundingClientRect().width > 0 && e.getAttribute("aria-hidden") !== "true").map(e => ({tag: e.tagName, text: e.textContent?.slice(0,80), font: parseFloat(getComputedStyle(e).fontSize), overflow: e.scrollWidth - e.clientWidth})));
      expect(items.length).toBeGreaterThan(5);
      for (const item of items) { expect(item.font).toBeGreaterThanOrEqual(13); expect(item.overflow, JSON.stringify(item)).toBeLessThanOrEqual(1); }
      await page.screenshot({ path: testInfo.outputPath(`settings-${lang}-${theme}-${width}.png`) });
    }
  }
});

for (const theme of ["light", "dark"]) {
  test(`Tars invalid composer keeps all four danger edges through focus and hover: ${theme}`, async ({ page }, testInfo) => {
    await page.goto(`/?stavePreview=tars&theme=${theme}`);
    const composer = page.locator("[data-tars-composer]");
    const editor = composer.getByRole("textbox");
    const form = composer.locator("form");
    await expect(editor).toBeEditable();
    await page.evaluate(() => document.fonts.ready);
    await editor.fill("x".repeat(32_001));
    await expect(composer.locator('[data-tars-composer-error="tooLong"]')).toBeVisible();
    const danger = await form.evaluate(node => {
      const probe = document.createElement("div"); probe.style.borderColor = "var(--aui-color-danger-border)";
      node.append(probe); const color = getComputedStyle(probe).borderColor; probe.remove(); return color;
    });
    const checkEdges = async () => expect.poll(() => form.evaluate(node => {
      const style = getComputedStyle(node);
      return [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor];
    })).toEqual([danger, danger, danger, danger]);
    await expect(editor).toHaveAttribute("aria-invalid", "true");
    await checkEdges();
    await page.locator("[data-tars-guide-toggle]").focus();
    await page.mouse.move(0, 0);
    await checkEdges();
    await form.hover();
    await checkEdges();
    await editor.focus();
    await checkEdges();
    await page.screenshot({ path: testInfo.outputPath(`invalid-composer-${theme}.png`) });
    await editor.fill("Recovered draft");
    await expect(composer.locator('[data-tars-composer-error="tooLong"]')).toHaveCount(0);
    await expect.poll(() => form.evaluate(node => getComputedStyle(node).borderTopColor)).not.toBe(danger);
  });
}

for (const theme of ["light", "dark"]) for (const lang of ["en", "ko"]) {
  test(`opening a run timeline keeps the tray's column and its titled bar: ${theme} ${lang}`, async ({ page }) => {
    await page.goto(`/?stavePreview=tars&tray=true&live=true&theme=${theme}&lang=${lang}`);
    const view = page.getByTestId("tars-view");
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1088, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const tray = view.locator("[data-tars-tray-panel]");
      await expect(tray).toBeVisible();
      const before = await view.evaluate((root) => {
        const tray = root.querySelector("[data-tars-tray-panel]")!;
        const bar = tray.firstElementChild!.getBoundingClientRect();
        return { tray: tray.getBoundingClientRect().width, conversation: root.querySelector("[data-tars-composer]")!.parentElement!.getBoundingClientRect().width,
          bar: { top: bar.top, height: bar.height }, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) };
      });
      expect(before.tray).toBe(26 * before.rem);
      await view.locator("[data-tars-running-timeline]").first().click();
      const side = view.locator('[data-tars-side-view="timeline"]');
      await expect(side).toHaveAttribute("data-tars-side-placement", "column");
      const after = await side.evaluate((node) => {
        const bar = node.querySelector("[data-tars-side-bar]")!.getBoundingClientRect();
        const heading = node.querySelector("h2")!;
        const switcher = node.querySelector("[data-tars-side-subject]")!.nextElementSibling!.getBoundingClientRect();
        return { side: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right, switcherRight: switcher.right,
          conversation: node.ownerDocument.querySelector("[data-tars-composer]")!.parentElement!.getBoundingClientRect().width,
          bar: { top: bar.top, height: bar.height }, title: heading.textContent, titleSize: parseFloat(getComputedStyle(heading).fontSize),
          subject: parseFloat(getComputedStyle(node.querySelector("[data-tars-side-subject]")!).fontSize) };
      });
      // Same column, same width, same bar: switching between the tray and a view never moves the conversation.
      expect(after.side).toBe(before.tray);
      expect(after.conversation).toBe(before.conversation);
      expect(after.bar).toEqual(before.bar);
      expect(after.title).toBe(lang === "ko" ? "실행 기록" : "Run timeline");
      expect(after.titleSize).toBe(16);
      expect(after.subject).toBe(13);
      expect(after.switcherRight).toBeLessThanOrEqual(after.right);
      // Live progress reads at the 13px interface row, in the composer band and in the timeline.
      const sizes = await view.evaluate((root) => [...root.querySelectorAll("[data-tars-running-strip] p, [data-tars-live-line], [data-tars-recent-entry]")]
        .map((element) => parseFloat(getComputedStyle(element).fontSize)));
      expect(sizes.length).toBeGreaterThan(2);
      expect(new Set(sizes)).toEqual(new Set([13]));
      await page.keyboard.press("Escape");
      await expect(side).toHaveCount(0);
    }
    // Narrow: the view sits above the composer under its own bar, and the page itself never scrolls to show it.
    await page.setViewportSize({ width: 390, height: 900 });
    await view.locator("[data-tars-running-timeline]").first().click();
    const inline = view.locator('[data-tars-side-view="timeline"]');
    await expect(inline).toHaveAttribute("data-tars-side-placement", "inline");
    const narrow = await inline.evaluate((node) => {
      const root = node.closest('[data-testid="tars-view"]')!;
      return { pageScroll: document.scrollingElement!.scrollTop + document.body.scrollTop, rootTop: root.getBoundingClientRect().top,
        bodyFits: document.body.scrollHeight <= window.innerHeight, overflowX: root.scrollWidth - root.clientWidth,
        width: node.getBoundingClientRect().width, barHeight: node.querySelector("[data-tars-side-bar]")!.getBoundingClientRect().height,
        switcherRight: node.querySelector("[data-tars-side-subject]")!.nextElementSibling!.getBoundingClientRect().right, right: node.getBoundingClientRect().right };
    });
    expect(narrow).toMatchObject({ pageScroll: 0, rootTop: 0, bodyFits: true, overflowX: 0, width: 390, barHeight: 46 });
    expect(narrow.switcherRight).toBeLessThanOrEqual(narrow.right);
  });
}
