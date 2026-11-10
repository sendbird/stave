import { expect, test } from "@playwright/test";

for (const [theme, lang, density] of [["light", "en", "regular"], ["dark", "ko", "compact"]] as const) {
  for (const width of [390, 1440]) {
    test(`Undo restores queue order without overflow at ${width}px (${theme} ${lang} ${density})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?stavePreview=tars&tray=true&queue=true&theme=${theme}&lang=${lang}&density=${density}`);
      const toggle = page.getByTestId("tars-view").locator("button:has([data-tars-tray-indicator])");
      if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
      const unpinned = await page.getByTestId("tars-view").getAttribute("data-tars-tray-pinned") === "false";
      const order = () => page.locator("[data-tars-queue-item]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-tars-queue-item")));
      const before = ["queue-auth", "queue-search", "queue-docs"];
      await expect.poll(order).toEqual(before);
      await page.locator('[data-tars-queue-grip="queue-docs"]').focus();
      await page.keyboard.press("Alt+ArrowUp");
      await expect.poll(order).toEqual(["queue-auth", "queue-docs", "queue-search"]);
      if (unpinned) await toggle.click();
      const record = page.getByTestId("tars-transcript").locator('[data-tars-record-kind="move"]').last();
      const undo = record.locator("[data-tars-record-undo]");
      await expect(undo).toHaveText(lang === "en" ? "Undo" : "되돌리기");
      await undo.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      // The row owns wrapping; its action remains contained and the mark stays on the first text line.
      const geometry = await record.evaluate((node) => {
        const box = node.getBoundingClientRect(), button = node.querySelector("button[data-tars-record-undo]")!.getBoundingClientRect();
        const words = node.querySelector("[data-tars-record-lead]")!;
        const text = document.createRange(); text.selectNodeContents(words);
        const first = [...text.getClientRects()].find((rect) => rect.width > 0)!;
        const mark = node.querySelector(":scope > span svg")!.getBoundingClientRect();
        return { overflow: node.scrollWidth - node.clientWidth, contained: button.left >= box.left && button.right <= box.right + 1,
          markOffset: Math.abs((mark.top + mark.bottom - first.top - first.bottom) / 2) };
      });
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.contained).toBe(true);
      // The record's established first-line alignment tolerance is one CSS pixel.
      expect(geometry.markOffset).toBeLessThanOrEqual(1);
      await undo.focus(); await page.keyboard.press("Enter");
      if (unpinned) await toggle.click();
      await expect.poll(order).toEqual(before);
      if (unpinned) await toggle.click();
      await expect(record).toContainText(lang === "en" ? "Undone" : "되돌림");
      await expect(record.locator("[data-tars-record-undo]")).toHaveCount(0);
    });
  }
}

test("stale Undo preserves newer work; a durable receipt resolves a lost acknowledgement", async ({ page }) => {
  await page.goto("/?stavePreview=tars&tray=true&queue=true");
  const grip = page.locator('[data-tars-queue-grip="queue-docs"]');
  await grip.focus(); await page.keyboard.press("Alt+ArrowUp");
  await expect(page.locator('[data-tars-record-undo]')).toHaveCount(1);
  await grip.focus(); await page.keyboard.press("Alt+ArrowUp");
  const records = page.getByTestId("tars-transcript").locator('[data-tars-record-kind="move"]');
  await expect(records).toHaveCount(2);
  await records.first().locator("[data-tars-record-undo]").click();
  await expect(records.first()).toContainText("The work or queue changed.");
  // Simulate a successful host effect followed by transport loss, then read the durable outcome through the conversation change event.
  await page.evaluate(() => {
    const api = window.api.tars!, actual = api.undoAction!;
    let once = true;
    api.undoAction = async (input) => { const result = await actual(input); if (once) { once = false; throw new Error("Disconnected"); } return result; };
  });
  await records.last().locator("[data-tars-record-undo]").click();
  await expect(records.last()).toContainText("Undone");
  await expect(records.last()).not.toContainText("Undo could not be confirmed.");
  await expect(records.last().locator("[data-tars-record-undo]")).toHaveCount(0);
});
