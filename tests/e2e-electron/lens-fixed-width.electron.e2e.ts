import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  E2E_LENS_SESSION_ID as SESSION_ID,
  E2E_WORKSPACE_ID,
  launchStave,
  openLensSurface,
  seedRepository,
  type StaveApp,
} from "./harness/stave-app";
import {
  callStaveMcpTool,
  waitForStaveMcpEndpoint,
  type StaveMcpEndpoint,
} from "./harness/stave-mcp";

const target = { workspaceId: E2E_WORKSPACE_ID, lensSessionId: SESSION_ID };
let stave: StaveApp;
let endpoint: StaveMcpEndpoint;
let directory: string;
let server: Server;
let origin: string;

test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "lens-fixed-width-"));
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>Responsive layout</title><main>Width check</main>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture port");
  origin = `http://127.0.0.1:${address.port}`;

  stave = await launchStave();
  await seedRepository(stave.page, {
    repositoryPath: directory,
    settings: {
      lensCdpApprovedHosts: ["127.0.0.1"],
      lensDeveloperModeCdp: true,
      lensAgentPresentationMode: "agent-decides",
    },
  });
  await openLensSurface(stave.page);
  endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);
  const navigated = await callTool("stave_lens_navigate", { url: origin });
  expect(navigated.isError, navigated.text).toBe(false);
  await expect.poll(() => stave.app.windows().some((page) => page.url().startsWith(origin))).toBe(true);
});

test.afterAll(async () => {
  await stave?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

function callTool(name: string, args: Record<string, unknown>) {
  return callStaveMcpTool(endpoint, name, { ...target, ...args });
}

function guestPage() {
  const page = stave.app.windows().find((window) => window.url().startsWith(origin));
  if (!page) throw new Error("The Lens guest page is gone");
  return page;
}

function guestViewport() {
  return guestPage().evaluate(() => ({ width: innerWidth, height: innerHeight }));
}

test("fixed-width checks resize the live guest through the toolbar and MCP", async () => {
  const pickWidth = async (label: string) => {
    await stave.page.getByTestId("lens-viewport-width").click();
    await stave.page.getByRole("menuitemradio", { name: label, exact: true }).click();
  };
  const guest = stave.page.locator(`webview[data-lens-session-id="${SESSION_ID}"]`);
  await expect(guest).toHaveCSS("opacity", "1");
  const invalid = await callTool("stave_lens_set_viewport", { width: "390" });
  expect(invalid.isError).toBe(true);

  await pickWidth("390 px");
  await expect.poll(async () => (await guestViewport()).width).toBe(390);

  const result = await callTool("stave_lens_set_viewport", { width: 820 });
  expect(result.isError, result.text).toBe(false);
  expect(result.structuredContent).toMatchObject({ viewport: { innerWidth: 820 } });
  await expect(stave.page.getByTestId("lens-viewport-width")).toHaveText("820 px");
  expect((await guestViewport()).width).toBe(820);

  await stave.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((window) => window.isVisible())!;
    const [, height] = main.getContentSize();
    main.setContentSize(840, height);
  });
  await pickWidth("1280 px");
  await expect.poll(async () => (await guestViewport()).width).toBe(1280);
  const pane = stave.page.locator(`[data-lens-guest-chrome][data-lens-session-id="${SESSION_ID}"]`);
  const widthDifference = async () =>
    (await guest.boundingBox())!.width - (await pane.boundingBox())!.width;
  await expect.poll(widthDifference).toBeCloseTo(0, 0);
  expect(await guestPage().evaluate(() => matchMedia("(min-width: 1280px)").matches)).toBe(true);
  const page = guestPage();
  const [, reloaded] = await Promise.all([
    page.waitForEvent("framenavigated", {
      predicate: (frame) => frame === page.mainFrame(),
    }),
    callTool("stave_lens_reload", {}),
  ]);
  expect(reloaded.isError, reloaded.text).toBe(false);
  await expect.poll(async () => (await guestViewport()).width).toBe(1280);

  const { width: innerWidth, height: innerHeight } = await guestViewport();
  for (const name of ["stave_lens_snapshot", "stave_lens_screenshot"]) {
    const read = await callTool(name, {});
    expect(read.isError, read.text).toBe(false);
    expect(read.structuredContent).toMatchObject({ viewport: { innerWidth, innerHeight } });
  }
  const setGuestZoom = (factor: number) =>
    stave.app.evaluate(({ webContents }, { origin, factor }) => {
      const guest = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith(origin))!;
      guest.setZoomFactor(factor);
    }, { origin, factor });
  await setGuestZoom(1.25);
  try {
    const zoomed = await callTool("stave_lens_set_viewport", { width: 390 });
    expect(zoomed.isError, zoomed.text).toBe(false);
    expect((await guestViewport()).width).toBe(390);
  } finally {
    await setGuestZoom(1);
  }

  const reset = await callTool("stave_lens_set_viewport", { width: "fit" });
  expect(reset.isError, reset.text).toBe(false);
  await expect(stave.page.getByTestId("lens-viewport-width")).toHaveText("Fit");
  expect((await guestViewport()).width).toBeLessThan(840);
  await expect(guest).toHaveCSS("transform", "none");
  await expect.poll(widthDifference).toBeCloseTo(0, 0);
});

test("a hidden Lens session has its own width and resets on close", async () => {
  const lensSessionId = "hidden-width-check";
  const setWidth = (width: number | "fit") =>
    callTool("stave_lens_set_viewport", { lensSessionId, width });
  const hidden = stave.page.locator(`webview[data-lens-session-id="${lensSessionId}"]`);
  const before = await guestViewport();

  const fixed = await setWidth(390);
  expect(fixed.isError, fixed.text).toBe(false);
  expect(fixed.structuredContent).toMatchObject({ viewport: { innerWidth: 390 } });
  await expect(hidden).toHaveCSS("opacity", "0");
  expect(await guestViewport()).toEqual(before);

  const closed = await callTool("stave_lens_close_session", { lensSessionId });
  expect(closed.structuredContent).toMatchObject({ closed: true });
  await expect(hidden).toHaveCount(0);

  const reopened = await callTool("stave_lens_open_session", { lensSessionId });
  expect(reopened.isError, reopened.text).toBe(false);
  await expect(hidden).toHaveCSS("width", "1280px");
  const guestId = await hidden.evaluate(
    (element) => (element as Electron.WebviewTag).getWebContentsId(),
  );
  await expect.poll(() =>
    stave.app.evaluate(({ webContents }, id) =>
      webContents.fromId(id)?.executeJavaScript("innerWidth"),
    guestId),
  ).toBe(1280);
});
