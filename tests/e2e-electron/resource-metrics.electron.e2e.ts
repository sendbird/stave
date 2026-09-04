import { expect, test } from "@playwright/test";
import { launchStave, type StaveApp } from "./harness/stave-app";

test.describe("runtime resource metrics", () => {
  let stave: StaveApp;

  test.beforeEach(async () => {
    stave = await launchStave();
  });

  test.afterEach(async () => {
    await stave.close();
  });

  test("attributes processes and renders the extended resource summary", async () => {
    await expect
      .poll(
        async () => {
          const result = await stave.page.evaluate(() =>
            window.api.metrics?.getAppMetrics?.(),
          );
          return result?.hostService?.pid ?? 0;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    const metrics = await stave.page.evaluate(() =>
      window.api.metrics?.getAppMetrics?.(),
    );
    const rendererMemory = await stave.page.evaluate(() =>
      window.api.metrics?.getRendererMemory?.(),
    );

    expect(metrics?.hostRendererPid).toBeGreaterThan(0);
    expect(
      metrics?.processes.some((process) => process.role === "host-renderer"),
    ).toBe(true);
    expect(rendererMemory?.heap.usedHeapSize).toBeGreaterThan(0);

    await stave.page.getByLabel("memory-usage").click();
    await expect(stave.page.getByText("Renderer heap")).toBeVisible();
    await expect(stave.page.getByText("Host service")).toBeVisible();
    await expect(stave.page.getByText("Lens resources")).toBeVisible();
    await expect(stave.page.locator("body")).not.toContainText("NaN");
  });
});
