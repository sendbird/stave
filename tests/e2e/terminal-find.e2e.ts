import { expect, test } from "@playwright/test";
test("terminal find searches the retained buffer, reports no match and restores focus", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/terminal-find.html");
  await expect(page.locator(".xterm-screen")).toBeVisible();
  await page.evaluate(() => {
    const fixture = (window as any).terminalFindFixture;
    fixture.write("alpha needle\r\nbeta needle\r\n");
  });
  await page.locator(".xterm-helper-textarea").focus();
  const before = await page.locator(".xterm-screen").boundingBox();
  await page.keyboard.press("Control+f");
  const input = page.getByRole("textbox", { name: "Find in terminal" });
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS("font-size", "12px");
  await input.fill("needle");
  await expect.poll(() => page.evaluate(() => (window as any).terminalFindFixture.terminal.getSelection())).toBe("needle");
  await input.press("Enter"); await input.press("Shift+Enter");
  await input.fill("not-in-buffer");
  await expect(page.getByRole("status")).toHaveText("No matches");
  // The widget floats over the terminal's top-end corner; the terminal keeps its size and place.
  const search = await page.getByRole("search").boundingBox();
  const terminal = await page.locator(".xterm-screen").boundingBox();
  expect(terminal).toEqual(before);
  expect(search!.y).toBeLessThan(terminal!.y + 40);
  expect(search!.x + search!.width).toBeGreaterThan(400);
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(page.locator(".xterm-helper-textarea")).toBeFocused();
});
