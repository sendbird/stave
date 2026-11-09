import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) for (const lang of ["en", "ko"]) for (const density of ["regular", "compact"]) {
  test(`observed queue reasons fit the card ${theme} ${lang} ${density}`, async ({ page }) => {
    await page.goto(`/?stavePreview=tars&tray=true&queued=true&theme=${theme}&lang=${lang}&density=${density}`);
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => [...document.fonts].some((face) => face.family.includes("Geist") && face.status === "loaded"))).toBe(true);
    for (const width of [1440, 600]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width === 600) await page.getByRole("button", { name: lang === "ko" ? "진행 3 · 확인 1 · 끝남 1" : "3 running · 1 needs you · 1 done", exact: true }).click();
      const wait = page.locator('[data-tars-queue-wait="capacity"]').filter({ visible: true });
      await expect(wait).toContainText(lang === "ko" ? "실행 2개 / 한도 2개" : "2 active / 2 allowed");
      const box = await wait.evaluate((node) => {
        const a = node.getBoundingClientRect(), b = node.closest("[data-tars-card]")!.getBoundingClientRect();
        return { left: a.left - b.left, right: b.right - a.right, scroll: node.scrollWidth, client: node.clientWidth };
      });
      // The status sentence must wrap inside the owning card, with only rounding tolerance.
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeGreaterThanOrEqual(-1);
      expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
    }
  });
}
