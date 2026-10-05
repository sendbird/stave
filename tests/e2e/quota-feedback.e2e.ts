import { expect, test } from "@playwright/test";

test("quota refresh explains cached data and failure backoff without changing its observation", async ({ page }) => {
  await page.goto("/?stavePreview=usage&quota=cached", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Quota", exact: true }).click();
  await page.getByRole("button", { name: "Claude · System default", exact: true }).click();
  const quota = page.getByRole("region", { name: "Account quota", exact: true });
  const before = await quota.getByText(/Observed ·/).allTextContents();
  await quota.getByRole("button", { name: "Refresh quota", exact: true }).click();
  await expect(quota.getByRole("status")).toContainText("Showing the last reading.");
  await expect(quota.getByRole("status")).toContainText("You can refresh again at");
  expect(await quota.getByText(/Observed ·/).allTextContents()).toEqual(before);
  await page.getByRole("button", { name: "Fail quota", exact: true }).click();
  await quota.getByRole("button", { name: "Refresh quota", exact: true }).click();
  await expect(quota.getByRole("status")).toContainText("Quota was not read again.");
  await expect(quota.getByRole("status")).toContainText("Automatic reads pause after an error");
  await expect(quota.getByRole("alert")).toContainText("Quota endpoint temporarily unavailable.");
});
