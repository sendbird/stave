import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchStave, type StaveApp } from "./harness/stave-app";

const MARKER_FILE = "renderer-origin-migration.json";

/**
 * The app document, not a page the one-time origin migration opens: an
 * upgraded profile briefly has hidden windows of its own before the app loads.
 */
async function appPage(
  stave: StaveApp,
  protocol: "stave-app:" | "file:",
): Promise<Page> {
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

async function flushAndClose(stave: StaveApp) {
  // The harness kills the process; persist localStorage the way a normal quit would.
  await stave.app.evaluate(({ session }) =>
    session.defaultSession.flushStorageData(),
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  await stave.close();
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
        const page = await appPage(stave, "stave-app:");
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
    expect(existsSync(path.join(userDataDir, MARKER_FILE))).toBe(true);
    const reportPath = testInfo.outputPath("renderer-origin-launches.json");
    await writeFile(reportPath, JSON.stringify({ launches }, null, 2));
    await testInfo.attach("renderer-origin-launches", {
      path: reportPath,
      contentType: "application/json",
    });
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test("a profile written at file:// keeps its localStorage when the renderer moves origin", async () => {
  test.setTimeout(120_000);
  const userDataDir = await mkdtemp(path.join(tmpdir(), "stave-renderer-origin-upgrade-"));
  // A directory where the marker's temp file goes makes the marker write fail,
  // which is how a launch that cannot finish the copy behaves.
  const markerBlocker = path.join(userDataDir, `${MARKER_FILE}.tmp`);
  const value = "kept across origins — ✓ 한글";
  try {
    await mkdir(markerBlocker);
    let stave = await launchStave({ userDataDir });
    try {
      const page = await appPage(stave, "file:");
      await page.evaluate((stored) => {
        localStorage.setItem("stave-e2e:origin-probe", stored);
      }, value);
    } finally {
      await flushAndClose(stave);
    }
    expect(existsSync(path.join(userDataDir, MARKER_FILE))).toBe(false);

    await rm(markerBlocker, { recursive: true, force: true });
    stave = await launchStave({ userDataDir });
    try {
      const page = await appPage(stave, "stave-app:");
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem("stave-e2e:origin-probe"),
          ),
        )
        .toBe(value);
      expect(existsSync(path.join(userDataDir, MARKER_FILE))).toBe(true);
    } finally {
      await stave.close();
    }
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
});
