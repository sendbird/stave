import { expect, test, type Page } from "@playwright/test";

const PREVIEW = "/?stavePreview=composer-frame&case=idle&agent=implementer&w=1000";

/** A second subscription account on each provider, as the account registry would list it. */
async function addSecondAccounts(page: Page) {
  await page.evaluate(async () => {
    const path = "/src/lib/providers/use-provider-accounts.ts";
    const { useProviderAccounts } = await import(path);
    const state = useProviderAccounts.getState();
    useProviderAccounts.setState({ loaded: true, profiles: [...state.profiles,
      { id: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b", providerId: "claude-code", label: "Work", kind: "managed" },
      { id: "7a2e3d4c-5b6f-4071-9b8c-0d1e2f3a4b5c", providerId: "codex", label: "Work", kind: "managed" }] });
  });
}

test("an Agent task has no Auto adjust control, and one account offers no pool", async ({ page }) => {
  await page.goto(`${PREVIEW}&theme=dark`);
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await expect(page.getByTestId("run-auto-tuning-control")).toHaveCount(0);
  await expect(page.getByTestId("run-account-pool-control")).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test(`a second subscription account adds the pool button to the right wing (${theme})`, async ({ page }, testInfo) => {
    await page.goto(`${PREVIEW}&theme=${theme}`);
    await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
    await addSecondAccounts(page);
    const button = page.locator('[data-composer-frame-slot="right"]').getByTestId("run-account-pool-control");
    await expect(button).toBeVisible();
    await expect(button).toHaveAccessibleName("Account pool: Off");
    await button.click();
    await page.getByRole("checkbox", { name: "Continue on my other accounts at a usage limit" }).check();
    await expect(button).toHaveAccessibleName("Account pool: On");
    expect(await page.evaluate(async () => {
      const path = "/src/store/app.store.ts";
      const { useAppStore } = await import(path);
      return useAppStore.getState().promptDraftByTask["preview-task"]?.runtimeOverrides?.agentRunAccountPool?.enabled;
    })).toBe(true);
    await page.getByRole("dialog").screenshot({ path: testInfo.outputPath("account-pool.png") });
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
  });
}

test("the Korean button names the pool and its state", async ({ page }) => {
  await page.goto(`${PREVIEW}&theme=light`);
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await addSecondAccounts(page);
  await page.evaluate(async () => {
    const path = "/src/i18n/runtime.ts";
    const { i18n } = await import(path);
    await i18n.changeLanguage("ko");
  });
  await expect(page.getByRole("button", { name: "계정 풀: 끔", exact: true })).toBeVisible();
});
