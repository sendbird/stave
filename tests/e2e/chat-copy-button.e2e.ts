import { expect, test } from "@playwright/test";

const FIXTURE = "/tests/e2e/fixtures/chat-copy-button.html";
const FAILED = "Couldn't copy to the clipboard";

test("a copied message is announced politely and raises no error", async ({ page }) => {
  await page.goto(FIXTURE);
  const announcement = page.locator('[role="status"][aria-live="polite"]');
  await expect(announcement).toHaveText("");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(announcement).toHaveText("Copied");
  const written = await page.evaluate(
    () => (window as unknown as { copyFixture: { written: () => string[] } }).copyFixture.written(),
  );
  expect(written).toEqual(["The answer to copy."]);
  await expect(page.getByText(FAILED, { exact: true })).toHaveCount(0);
});

test("a refused clipboard shows one error toast and announces the failure", async ({ page }) => {
  await page.goto(`${FIXTURE}?clipboard=refuse`);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.locator('[role="status"][aria-live="polite"]')).toHaveText(FAILED);
  // The announcement beside the button, and one toast on screen.
  await expect(page.getByText(FAILED, { exact: true })).toHaveCount(2);
  await expect(page.getByText(FAILED, { exact: true }).last()).toBeVisible();
});

test("the Korean announcement and toast follow the app language", async ({ page }) => {
  await page.goto(`${FIXTURE}?clipboard=refuse&locale=ko`);
  await page.getByRole("button", { name: "복사", exact: true }).click();
  await expect(page.locator('[role="status"][aria-live="polite"]')).toHaveText("클립보드에 복사하지 못했습니다");
  await expect(page.getByText("클립보드에 복사하지 못했습니다", { exact: true })).toHaveCount(2);
});
