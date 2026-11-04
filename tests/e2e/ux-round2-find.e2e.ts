import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`conversation find steps and wraps in ${theme}`, async ({ page }) => {
    await page.goto(`/tests/e2e/fixtures/conversation-time.html?theme=${theme}`);
    await page.getByRole("button", { name: "Find in conversation", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Search loaded messages" });
    await input.fill("Check");
    await input.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "1 / 2" })).toBeVisible();
    await input.press("Shift+Enter");
    await expect(page.getByRole("status").filter({ hasText: "2 / 2" })).toBeVisible();
    await expect(page.getByText("Check the dark theme as well.", { exact: true })).toBeVisible();
    await input.fill("no such phrase");
    await expect(page.getByRole("status").filter({ hasText: "No matches" })).toBeVisible();
    await input.press("Escape");
    await expect(input).toHaveCount(0);
    await page.getByRole("button", { name: "Find in conversation", exact: true }).focus();
    await page.keyboard.press("Control+f");
    await expect(input).toBeVisible();
  });
}

test("find opens only in the focused conversation pane", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/conversation-time.html?split=1");
  const open = page.getByRole("button", { name: "Find in conversation", exact: true });
  await expect(open).toHaveCount(2);
  await open.last().focus();
  await page.keyboard.press("Control+f");
  await expect(page.getByRole("textbox", { name: "Search loaded messages" })).toHaveCount(1);
  await expect(open).toHaveCount(1);
});
