import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`whole-task find reveals a message outside the resident window in ${theme}`, async ({
    page,
  }) => {
    await page.goto(
      `/tests/e2e/fixtures/conversation-time.html?offWindow=1&theme=${theme}`,
    );
    await page.evaluate(() => document.fonts.ready);
    await expect(
      page.locator('[data-message-id="old-export-retry"]'),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Find in conversation", exact: true })
      .focus();
    await page.keyboard.press("Control+f");
    const field = page.getByRole("textbox", {
      name: "Search all task messages",
    });
    await field.fill("export retry");
    await expect(page.getByRole("search").getByRole("status")).toHaveText(
      "0 / 1",
    );
    await field.press("Enter");
    const match = page.locator('[data-message-id="old-export-retry"]');
    await expect(match).toBeVisible();
    await expect(match).toHaveAttribute("data-content-search-match", "true");
    await expect(match.locator("mark")).toHaveText(["export", "retry"]);
    await expect(
      page.getByRole("button", { name: "Load 2340 newer messages" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to latest" }).click();
    await expect(
      page.locator('[data-message-id="history-2398"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Back to latest" }),
    ).toHaveCount(0);
  });
}

test("opening a content result reveals its message through the task focus action", async ({
  page,
}) => {
  await page.goto(
    "/tests/e2e/fixtures/conversation-time.html?offWindow=1&focusHit=1",
  );
  await page.getByRole("button", { name: "Open matched message" }).click();
  const match = page.locator('[data-message-id="old-export-retry"]');
  await expect(match).toBeVisible();
  await expect(match).toHaveAttribute("data-content-search-match", "true");
  await expect(match.locator("mark")).toHaveText(["export", "retry"]);
});

test("palette Enter opens the highlighted message in the actual transcript", async ({
  page,
}) => {
  await page.goto(
    "/tests/e2e/fixtures/conversation-time.html?offWindow=1&palette=1",
  );
  const field = page.getByRole("combobox");
  await field.fill("export retry");
  await expect(page.locator("[data-content-search-result]")).toHaveCount(1);
  await field.press("Enter");
  await expect(page.getByRole("dialog")).toBeHidden();
  const match = page.locator('[data-message-id="old-export-retry"]');
  await expect(match).toBeVisible();
  await expect(match).toHaveAttribute("data-content-search-match", "true");
  await expect(match.locator("mark")).toHaveText(["export", "retry"]);
});
