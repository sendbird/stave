import { expect, test } from "@playwright/test";

test("quota refresh explains cached data and failure backoff without changing its observation", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?stavePreview=usage&quota=cached", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "Quota", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Claude · System default", exact: true }).click();
  const quota = page.getByRole("region", { name: "Account quota", exact: true });
  const before = await quota.getByText(/^(Read |Older reading)/).allTextContents();
  await quota.getByRole("button", { name: "Refresh quota", exact: true }).click();
  await expect(quota.getByRole("status")).toContainText("Showing the last reading.");
  await expect(quota.getByRole("status")).toContainText("You can refresh again at");
  expect(await quota.getByText(/^(Read |Older reading)/).allTextContents()).toEqual(before);
  await page.getByRole("button", { name: "Fail quota", exact: true }).click();
  await quota.getByRole("button", { name: "Refresh quota", exact: true }).click();
  await expect(quota.getByRole("status")).toContainText("Quota was not read again.");
  await expect(quota.getByRole("status")).toContainText("Automatic reads pause after an error");
  await expect(quota.getByRole("alert")).toContainText("Quota endpoint temporarily unavailable.");
});

test("quota opens first and leads with the limit that stops work first", async ({ page }) => {
  await page.goto("/?stavePreview=usage", { waitUntil: "domcontentloaded" });
  const tabs = page.getByRole("tab");
  await expect(tabs.first()).toHaveText("Quota");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("combobox", { name: "Group by" })).toHaveCount(0);
  const headline = page.getByRole("region", { name: "Limit you reach first", exact: true });
  await expect(headline).toContainText("Claude · System default · 5-hour limit");
  await expect(headline).toContainText("12% remaining");
  await expect(headline).toContainText("60% of the window passed");
  await expect(headline).toContainText(/At this pace it runs out around \d\d:\d\d, 1h before the reset\./);
  // Codex stores no window length, so it shows time left without a pace guess.
  const codex = page.getByRole("region", { name: "Account quota", exact: true }).getByRole("meter", { name: "Codex · Personal · 5-hour limit" });
  await expect(codex.locator("div")).toHaveCount(1);
  // The period only drives quota history, and the background notes stay one click away.
  await expect(page.getByText(/the period applies to quota history only; current limits always show the latest reading/)).toBeVisible();
  await expect(page.getByText(/Percentages are never pooled/)).toHaveCount(0);
  await page.getByRole("button", { name: "About account quota", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Percentages are never pooled across accounts.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("tab", { name: "Tokens & cost", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Group by" })).toHaveCount(1);
  await expect(page.getByText(/filters only change this report/)).toBeVisible();
  await expect(page.getByText(/Token totals exclude cache reads/)).toHaveCount(0);
  await page.getByRole("button", { name: "How tokens are counted", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Token totals exclude cache reads");
  await page.keyboard.press("Escape");
  // Missing measurements read as a dash in tables, never as 0, and keep their words for hover and screen readers.
  const unattributed = page.getByRole("region", { name: "Usage by account" }).getByRole("row").filter({ hasText: "Unattributed history" });
  await expect(unattributed.getByTitle("Not reported", { exact: true })).toHaveCount(2);
  await expect(unattributed.getByTitle("Not reported", { exact: true }).first()).toHaveText("–Not reported");
  await expect(unattributed.getByText("–", { exact: true }).first()).toBeVisible();
  const totals = page.getByLabel("Usage totals");
  await expect(totals).toContainText("6.8M");
  await expect(totals.getByTitle("6,765,372", { exact: true })).toHaveText("6.8M");
  await expect(totals).toContainText("$125.90");
});
