import { expect, test } from "@playwright/test";

const viewportMatrix = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const viewport of viewportMatrix) {
  test(`shell smoke: ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");

    await expect(page.getByTestId("top-bar")).toBeVisible();
    await expect(page.getByTestId("workspace-pane-host")).toBeVisible();
    await expect(page.getByTestId("pane-watermark")).toBeVisible();

    await expect(page.locator("[data-pane-tab-chip]")).toHaveCount(0);

    const safeName = testInfo.title.replace(/[^a-z0-9-]/gi, "_").toLowerCase();
    await page.screenshot({
      path: `tests/artifacts/${safeName}.png`,
      fullPage: true,
    });
  });
}
