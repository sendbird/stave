import { expect, test } from "@playwright/test";
import { workspaceConversationFixture } from "../tars-workspace-ui-fixture";

for (const [theme, lang, density] of [["light", "en", "regular"], ["dark", "ko", "compact"]] as const) {
  for (const width of [390, 1440]) {
    test(`workspace receipt and Undo at ${width}px (${theme}, ${lang}, ${density})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(conversation => sessionStorage.setItem("stave-preview-conversation", JSON.stringify(conversation)), workspaceConversationFixture(lang === "ko"));
      await page.goto(`/?stavePreview=tars&theme=${theme}&lang=${lang}&density=${density}`);
      const row = page.locator('[data-tars-receipt-kind="workspace"]');
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(lang === "en" ? "Added a todo to Release" : "릴리스에 할 일 추가");
      const undo = row.locator('[data-tars-record-undo="workspace"]');
      await expect(undo).toHaveText(lang === "en" ? "Undo" : "되돌리기");
      await page.evaluate(() => document.fonts.ready);
      const geometry = await row.evaluate(node => {
        const box = node.getBoundingClientRect(), action = node.querySelector("button")!.getBoundingClientRect();
        return { overflow: node.scrollWidth - node.clientWidth, contained: action.left >= box.left && action.right <= box.right + 1 };
      });
      expect(geometry.overflow).toBeLessThanOrEqual(1); expect(geometry.contained).toBe(true);
      // UI port fixture only: the real SQLite effect/rollback/Undo are tested in tars-workspace.test.ts.
      await page.evaluate(async () => {
        const api = window.api.tars!, conversation = await api.getConversation({});
        api.undoAction = async () => ({ record: { ...conversation.records[0]!, revision: 2,
          undo: { ...conversation.records[0]!.undo!, undoneAt: new Date().toISOString() } }, refusal: null });
      });
      await undo.focus(); await page.keyboard.press("Enter");
      await expect(row).toContainText(lang === "en" ? "Undone" : "되돌림"); await expect(undo).toHaveCount(0);
    });
  }
}
