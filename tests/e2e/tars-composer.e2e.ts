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
      // Tab from the welcome disclosure enters the actual editor.
      await page.locator("[data-tars-guide-toggle]").focus();
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

test("Tars body, supporting copy, report and settings remain readable across layouts", async ({ page }) => {
  test.setTimeout(60_000);
  for (const lang of ["en", "ko"]) for (const theme of ["light", "dark"]) {
    await page.goto(`/?stavePreview=tars&outputs=true&lang=${lang}&theme=${theme}`);
    await expect(page.locator('[data-tars-composer] [contenteditable]')).toBeEditable();
    await page.evaluate(() => document.fonts.ready);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width === 390) await page.getByRole('button', { name: lang === 'ko' ? '확인 1 · 끝남 1 · 산출물 6' : '1 needs you · 1 done · 6 outputs', exact: true }).click();
      await page.locator('[data-tars-output="report"]').filter({ hasText: 'saved card' }).getByRole('button').click();
      const report = page.locator('[data-tars-side-view="report"]');
      await expect(report).toBeVisible();
      const typography = await page.locator('[data-testid="tars-view"]').evaluate(root => {
        return [...root.querySelectorAll('[data-tars-message] article, [data-tars-side-view] p')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ font: parseFloat(getComputedStyle(e).fontSize), horizontal: e.scrollWidth - e.clientWidth, vertical: getComputedStyle(e).overflowY === 'hidden' ? e.scrollHeight - e.clientHeight : 0 }));
      });
      expect(typography.length).toBeGreaterThan(4);
      for (const item of typography) { expect(item.font).toBeGreaterThanOrEqual(13); expect(item.horizontal).toBeLessThanOrEqual(1); expect(item.vertical).toBeLessThanOrEqual(1); }
      await page.screenshot({ path: `.stave/artifacts/tars/report-main-${lang}-${theme}-${width}.png` });
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
      await page.screenshot({ path: `.stave/artifacts/tars/settings-main-${lang}-${theme}-${width}.png` });
    }
  }
});
