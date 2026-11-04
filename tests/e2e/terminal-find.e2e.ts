import { expect, test } from "@playwright/test";
test("terminal find searches the retained buffer, reports no match and restores focus", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/terminal-find.html");
  await expect(page.locator(".xterm-screen")).toBeVisible();
  await page.evaluate(() => {
    const fixture = (window as any).terminalFindFixture;
    fixture.write("alpha needle\r\nbeta needle\r\n");
  });
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.press("Control+f");
  const input = page.getByRole("textbox", { name: "Find in terminal" });
  await input.fill("needle");
  await expect.poll(() => page.evaluate(() => (window as any).terminalFindFixture.terminal.getSelection())).toBe("needle");
  await input.press("Enter"); await input.press("Shift+Enter");
  await input.fill("not-in-buffer");
  await expect(page.getByRole("status")).toHaveText("No matches");
  const search = await page.getByRole("search").boundingBox();
  const terminal = await page.locator(".xterm-screen").boundingBox();
  expect(terminal!.y).toBeGreaterThanOrEqual(search!.y + search!.height);
  await expect.poll(async () => { const box = await page.locator(".xterm-screen").boundingBox(); return box!.y + box!.height; }).toBeLessThanOrEqual(601);
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(page.locator(".xterm-helper-textarea")).toBeFocused();
});
