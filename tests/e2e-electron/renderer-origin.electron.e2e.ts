import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchStave, type StaveApp } from "./harness/stave-app";

/** The window showing the app document from the renderer scheme. */
async function appPage(stave: StaveApp): Promise<Page> {
  const protocol = "stave-app:";
  const deadline = Date.now() + 30_000;
  for (;;) {
    const page = stave.app.windows().find((candidate) => {
      try {
        const url = new URL(candidate.url());
        return url.protocol === protocol && url.pathname.endsWith("/index.html");
      } catch {
        return false;
      }
    });
    if (page) {
      await page.waitForLoadState("domcontentloaded");
      return page;
    }
    if (Date.now() > deadline) {
      throw new Error(`no ${protocol} app window: ${stave.app.windows().map((w) => w.url()).join(", ")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * A killed Electron leaves helper processes flushing into the profile for a
 * moment, so remove it with the same brief retry the harness uses for its own
 * profiles instead of failing the test on ENOTEMPTY.
 */
async function removeProfile(directory: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

// Timings are evidence, not a hardware-independent promise. The origin is the
// enforced part: only the renderer scheme lets Chromium reuse compiled code.
test("the built renderer starts from the code-cached origin on every launch", async ({}, testInfo) => {
  test.setTimeout(120_000);
  const userDataDir = await mkdtemp(path.join(tmpdir(), "stave-renderer-origin-"));
  const launches: Array<{
    protocol: string;
    launchToDomContentLoadedMs: number;
    domContentLoadedMs: number;
    firstContentfulPaintMs: number | null;
  }> = [];
  try {
    for (let launch = 0; launch < 4; launch += 1) {
      const startedAt = Date.now();
      const stave = await launchStave({ userDataDir });
      try {
        const page = await appPage(stave);
        const timing = await page.evaluate(() => {
          const navigation = performance.getEntriesByType(
            "navigation",
          )[0] as PerformanceNavigationTiming;
          return {
            protocol: location.protocol,
            timeOrigin: performance.timeOrigin,
            domContentLoadedMs: navigation.domContentLoadedEventEnd,
            firstContentfulPaintMs:
              performance.getEntriesByName("first-contentful-paint")[0]
                ?.startTime ?? null,
          };
        });
        launches.push({
          protocol: timing.protocol,
          launchToDomContentLoadedMs: Math.round(
            timing.timeOrigin - startedAt + timing.domContentLoadedMs,
          ),
          domContentLoadedMs: Math.round(timing.domContentLoadedMs),
          firstContentfulPaintMs:
            timing.firstContentfulPaintMs === null
              ? null
              : Math.round(timing.firstContentfulPaintMs),
        });
        // Chromium writes the code cache after the second load; let it land.
        await page.waitForTimeout(1_500);
      } finally {
        await stave.close();
      }
    }
    expect(launches.map((launch) => launch.protocol)).toEqual(
      Array(4).fill("stave-app:"),
    );
    const reportPath = testInfo.outputPath("renderer-origin-launches.json");
    await writeFile(reportPath, JSON.stringify({ launches }, null, 2));
    await testInfo.attach("renderer-origin-launches", {
      path: reportPath,
      contentType: "application/json",
    });
  } finally {
    await removeProfile(userDataDir);
  }
});
