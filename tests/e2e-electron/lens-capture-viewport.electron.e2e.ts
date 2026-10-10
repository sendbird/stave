import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  E2E_WORKSPACE_ID,
  launchStave,
  seedRepository,
  type StaveApp,
} from "./harness/stave-app";
import {
  callStaveMcpTool,
  readScreenshotBase64,
  waitForStaveMcpEndpoint,
  type McpToolResult,
  type StaveMcpEndpoint,
} from "./harness/stave-mcp";
import { decodePng, formatRgb, pixelAtFraction } from "./harness/png";

/**
 * A screenshot must not change how a Lens page is drawn, and must show what
 * the page is showing.
 *
 * Chromium serves a clipped or full-page `Page.captureScreenshot` by giving the
 * page a temporary viewport and restoring "whatever was in force when the
 * capture started" once it completes. Two captures in flight on one page
 * therefore leave the page in the first capture's temporary viewport: laid out
 * at a stale size, scrolled to an old clip origin, painting only part of its
 * pane — and since that state lives on the DevTools session, a reload keeps
 * it. `browser-capture-lane.ts` keeps captures of one page from overlapping.
 *
 * The overlap itself is covered by `tests/lens-capture-lane.test.ts`: under
 * this harness the guest answers every capture within a frame, so parallel
 * calls do not stay in flight together the way they do on a page that stopped
 * drawing while its user was elsewhere. What this spec holds the product to is
 * the integrated path: parallel agent screenshots of every kind succeed, the
 * page still follows its element afterwards and across a reload, and an
 * element screenshot of a scrolled page shows the element.
 *
 * Requires `bun run build:desktop`.
 */

const SESSION_ID = "agent-capture";
const TARGET = { r: 255, g: 0, b: 128 };

let stave: StaveApp;
let endpoint: StaveMcpEndpoint;
let repositoryDir: string;
let server: Server;
let origin: string;

const TALL_PAGE = `<!doctype html>
<html>
  <head><title>tall</title></head>
  <body style="margin:0;padding:24px;background:#fafafa;font:14px system-ui">
    ${Array.from(
      { length: 60 },
      (_, index) =>
        `<div id="row-${index}" style="height:40px;border-bottom:1px solid #ccc">row ${index}</div>`,
    ).join("")}
    <div id="target" style="width:240px;height:120px;background:rgb(${TARGET.r}, ${TARGET.g}, ${TARGET.b})"></div>
    <div style="height:1200px"></div>
  </body>
</html>`;

async function startFixtureServer(): Promise<void> {
  server = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(TALL_PAGE);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("fixture server did not bind a port");
  }
  origin = `http://127.0.0.1:${address.port}`;
}

function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  return callStaveMcpTool(endpoint, name, {
    workspaceId: E2E_WORKSPACE_ID,
    lensSessionId: SESSION_ID,
    ...args,
  });
}

function findGuestPage(): Page | undefined {
  return stave.app.windows().find((window) => window.url().startsWith(origin));
}

function guestPage(): Page {
  const page = findGuestPage();
  if (!page) {
    throw new Error("the Lens guest page is gone");
  }
  return page;
}

/** What the page believes its viewport is. */
function guestViewport() {
  return guestPage().evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    offsetLeft: window.visualViewport?.offsetLeft ?? 0,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  }));
}

test.beforeAll(async () => {
  repositoryDir = await mkdtemp(path.join(tmpdir(), "stave-e2e-project-"));
  execFileSync("git", ["init", "--initial-branch=main", repositoryDir], {
    stdio: "ignore",
  });
  execFileSync(
    "git",
    [
      "-C",
      repositoryDir,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.test",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-m",
      "test: fixture",
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "git",
    [
      "-C",
      repositoryDir,
      "worktree",
      "add",
      "-b",
      "away",
      path.join(repositoryDir, "away"),
    ],
    { stdio: "ignore" },
  );
  await startFixtureServer();

  stave = await launchStave();
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({
    timeout: 30_000,
  });
  await seedRepository(stave.page, {
    repositoryPath: repositoryDir,
    settings: {
      lensCdpApprovedHosts: ["127.0.0.1"],
      lensDeveloperModeCdp: true,
      lensAgentPresentationMode: "agent-decides",
    },
  });
  await stave.page.evaluate(async (repositoryPath) => {
    const store = JSON.parse(localStorage.getItem("stave-store")!);
    const metadata = [
      { id: "ws-e2e", name: "e2e", updatedAt: new Date().toISOString() },
      {
        id: "ws-away",
        name: "Capture away",
        updatedAt: new Date().toISOString(),
      },
    ];
    await window.api.persistence!.upsertWorkspace!({
      id: "ws-away",
      name: "Capture away",
      snapshot: { activeTaskId: null, tasks: [], messagesByTask: {} },
    });
    const entry = {
      projectPath: repositoryPath,
      repositoryName: "stave-e2e",
      lastOpenedAt: new Date().toISOString(),
      defaultBranch: "main",
      workspaces: metadata,
      activeWorkspaceId: "ws-e2e",
      workspaceBranchById: { "ws-e2e": "main", "ws-away": "away" },
      workspacePathById: {
        "ws-e2e": repositoryPath,
        "ws-away": `${repositoryPath}/away`,
      },
      workspaceDefaultById: { "ws-e2e": true, "ws-away": false },
    };
    store.state = { ...store.state, ...entry, recentRepositories: [entry] };
    localStorage.setItem("stave-store", JSON.stringify(store));
    const saved = await window.api.persistence!.saveRepositoryRegistry!({
      repositories: [entry],
      activeRepositoryPath: repositoryPath,
    });
    if (!saved.ok) throw new Error("fixture registry failed");
  }, repositoryDir);
  await stave.page.reload({ waitUntil: "domcontentloaded" });
  endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);

  await expect
    .poll(
      async () => {
        const result = await callTool("stave_lens_navigate", {
          url: `${origin}/tall`,
        });
        return result.isError ? result.text : "ok";
      },
      { timeout: 60_000 },
    )
    .toBe("ok");
  await expect
    .poll(() => Boolean(findGuestPage()), { timeout: 30_000 })
    .toBe(true);
});

test.afterAll(async () => {
  await stave?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (repositoryDir) {
    await rm(repositoryDir, { recursive: true, force: true });
  }
});

test("parallel screenshots leave the page following its element", async () => {
  const presented = await callTool("stave_lens_present_session", {});
  expect(presented.isError, presented.text).toBe(false);
  await expect(
    stave.page.locator(`webview[data-lens-session-id="${SESSION_ID}"]`),
  ).toHaveCSS("opacity", "1");
  // Presenting a session can still be settling a guest adoption/navigation.
  // Exercise capture concurrency only after that separate lifecycle is stable.
  let previousDocument = "";
  let stableSamples = 0;
  await expect
    .poll(
      async () => {
        const state = await stave.app.evaluate(({ webContents }, url) => {
          const guest = webContents
            .getAllWebContents()
            .find((wc) => wc.getURL().startsWith(url));
          return guest
            ? `${guest.id}:${guest.mainFrame.routingId}:${guest.getURL()}`
            : "";
        }, origin);
        stableSamples =
          state && state === previousDocument ? stableSamples + 1 : 0;
        previousDocument = state ?? "";
        return stableSamples >= 2;
      },
      { timeout: 10000, intervals: [100] },
    )
    .toBe(true);
  const before = await guestViewport();

  const results = await Promise.all([
    callTool("stave_lens_screenshot", { selector: "#row-3" }),
    callTool("stave_lens_screenshot", { fullPage: true }),
    callTool("stave_lens_screenshot", { selector: "#row-8" }),
    callTool("stave_lens_screenshot", {}),
  ]);
  for (const result of results) {
    expect(result.isError, result.text).toBe(false);
  }

  await stave.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((w) => w.isVisible())!;
    const [width, height] = window.getContentSize();
    window.setContentSize(width - 137, height - 91);
  });
  await expect
    .poll(async () => JSON.stringify(await guestViewport()))
    .not.toBe(JSON.stringify(before));
  const resized = await guestViewport();
  expect(resized.offsetLeft).toBe(0);
  expect(resized.offsetTop).toBe(0);

  // A reload keeps DevTools-session emulation, so it is checked separately.
  const reloaded = await callTool("stave_lens_reload", {});
  expect(reloaded.isError, reloaded.text).toBe(false);
  await expect
    .poll(() => guestViewport().catch(() => null), { timeout: 10_000 })
    .toEqual(resized);
});

test("a selector screenshot of a scrolled page shows the element", async () => {
  await guestPage().evaluate(() => {
    document.getElementById("target")?.scrollIntoView({ block: "center" });
  });
  await expect
    .poll(() => guestPage().evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  const result = await callTool("stave_lens_screenshot", {
    selector: "#target",
  });
  expect(result.isError, result.text).toBe(false);
  const image = decodePng(Buffer.from(readScreenshotBase64(result), "base64"));
  const center = pixelAtFraction(image, 0.5, 0.5);
  expect(
    { r: center.r, g: center.g, b: center.b },
    `centre of the element capture: got ${formatRgb(center)}`,
  ).toEqual(TARGET);
});

for (const zoom of [1, 1.25]) {
  test(`a full-page image at ${zoom * 100}% contains content below the viewport`, async () => {
    const setZoom = (factor: number) =>
      stave.app.evaluate(
        ({ webContents }, args) => {
          const guest = webContents
            .getAllWebContents()
            .find((wc) => wc.getURL().startsWith(args.url));
          if (!guest) throw new Error("fixture guest missing");
          guest.setZoomFactor(args.factor);
        },
        { url: origin, factor },
      );
    await setZoom(zoom);
    try {
      await guestPage().evaluate(() => window.scrollTo(0, 0));
      const before = await guestViewport();
      const geometry = await guestPage().evaluate(() => {
        const rect = document.getElementById("target")!.getBoundingClientRect();
        return {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        };
      });
      expect(geometry.y).toBeGreaterThan(before.height * 2);
      const result = await callTool("stave_lens_screenshot", {
        fullPage: true,
      });
      expect(result.isError, result.text).toBe(false);
      const buffer = Buffer.from(readScreenshotBase64(result), "base64");
      const image = decodePng(buffer);
      const imagePath = test.info().outputPath("full-page.png");
      await writeFile(imagePath, buffer);
      await test
        .info()
        .attach("full-page.png", { path: imagePath, contentType: "image/png" });
      await expect.poll(() => guestViewport()).toEqual(before);
      const pixel = pixelAtFraction(
        image,
        geometry.x / geometry.width,
        geometry.y / geometry.height,
      );
      expect(
        { r: pixel.r, g: pixel.g, b: pixel.b },
        "full-page lower content must not repeat the initial viewport",
      ).toEqual(TARGET);
    } finally {
      await setZoom(1);
    }
  });
}

test("repeated hidden-workspace captures preserve page state and recover on return", async () => {
  const guest = stave.page.locator(
    `webview[data-lens-session-id="${SESSION_ID}"]`,
  );
  await guestPage().evaluate(() => {
    (window as unknown as { captureMarker: string }).captureMarker = "retained";
    window.scrollTo(0, 0);
  });
  await callTool("stave_lens_present_session", {});
  const expand = stave.page.getByRole("button", {
    name: "Expand project list",
    exact: true,
  });
  if (await expand.isVisible()) await expand.click();
  await stave.page
    .getByRole("button", { name: /^Open workspace (?:Capture away|away)$/i })
    .click({ timeout: 5000 });
  await expect(guest).toHaveCSS("opacity", "0");
  for (const dark of [false, true]) {
    await stave.page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    );
    for (let i = 0; i < 3; i++) {
      const expected = i % 2 === 0 ? TARGET : { r: 0, g: 128, b: 255 };
      const point = await guestPage().evaluate((color) => {
        const row = document.getElementById("row-0")!;
        row.style.backgroundColor = `rgb(${color.r},${color.g},${color.b})`;
        const rect = row.getBoundingClientRect();
        return {
          x: (rect.x + 100) / innerWidth,
          y: (rect.y + 20) / innerHeight,
        };
      }, expected);
      const result = await callTool("stave_lens_screenshot", {});
      expect(result.isError, result.text).toBe(false);
      const image = decodePng(
        Buffer.from(readScreenshotBase64(result), "base64"),
      );
      const pixel = pixelAtFraction(image, point.x, point.y);
      expect({ r: pixel.r, g: pixel.g, b: pixel.b }).toEqual(expected);
      await expect(guest).toHaveCSS("opacity", "0");
      await expect(guest).toHaveCSS("filter", "none");
      await expect(guest).toHaveCSS("pointer-events", "none");
    }
  }
  await stave.page
    .getByRole("button", { name: "Open workspace Default", exact: true })
    .click();
  await expect(guest).toHaveCSS("opacity", "1");
  expect(
    await guestPage().evaluate(
      () => (window as unknown as { captureMarker: string }).captureMarker,
    ),
  ).toBe("retained");
  const viewport = await guestViewport();
  const rect = await guest.boundingBox();
  expect(viewport.width).toBe(Math.round(rect!.width));
  expect(viewport.height).toBe(Math.round(rect!.height));
  await stave.page.screenshot({
    path: test.info().outputPath("returned-workspace.png"),
  });
});

test("full-page failure restores scroll and page styles", async () => {
  await guestPage().evaluate(() => window.scrollTo(0, 350));
  const before = await guestPage().evaluate(() => ({
    y: scrollY,
    style: document.documentElement.getAttribute("style"),
  }));
  await guestPage().evaluate(() => {
    const grow = () => {
      const spacer = document.createElement("div");
      spacer.id = "capture-growth";
      spacer.style.height = "100px";
      document.body.append(spacer);
    };
    window.addEventListener("scroll", grow, { once: true });
  });
  const result = await callTool("stave_lens_screenshot", { fullPage: true });
  expect(result.isError).toBe(true);
  expect(result.text).toContain("resized during full-page capture");
  await expect.poll(() => guestPage().evaluate(() => scrollY)).toBe(before.y);
  expect(
    await guestPage().evaluate(() => document.documentElement.style.cssText),
  ).toBe(before.style ?? "");
});
