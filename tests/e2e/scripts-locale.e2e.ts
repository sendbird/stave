import { expect, test } from "@playwright/test";

test("changing display language retains an unsaved script and never reloads its file", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/scripts-locale.html");
  await page.getByRole("button", { name: /User service/ }).click();
  const label = page.getByRole("textbox").first();
  await expect(label).toHaveValue("User service");
  await label.fill("Unsaved user edit");
  const reads = await page.evaluate(() => (window as any).scriptsFixture.reads());
  expect(reads).toBe(1);
  await page.evaluate(() => (window as any).scriptsFixture.locale("ko"));
  await expect(page.locator("html")).toHaveAttribute("lang", "ko-KR");
  await expect(label).toHaveValue("Unsaved user edit");
  await expect(page.getByRole("combobox")).toContainText("워크스페이스 설정");
  await expect(page.getByRole("button", { name: "변경 사항 저장", exact: true })).toBeEnabled();
  await page.evaluate(() => (window as any).scriptsFixture.locale("en"));
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
  await expect(label).toHaveValue("Unsaved user edit");
  expect(await page.evaluate(() => (window as any).scriptsFixture.reads())).toBe(reads);
});
