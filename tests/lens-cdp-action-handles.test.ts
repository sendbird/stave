import { afterEach, beforeEach, expect, mock, test } from "bun:test";

const webContents = {
  id: 700,
  isDestroyed: () => false,
  getURL: () => "https://lens.fixture.test/page",
};

const session = {
  workspaceId: "workspace-fixture",
  lensSessionId: "lens-fixture",
  documentId: "document-1",
};

const commands: Array<{ method: string; params?: Record<string, unknown> }> =
  [];
const cleanupCommands: Array<{
  method: string;
  params?: Record<string, unknown>;
}> = [];
let callFailure: unknown = null;
let boxFailure: unknown = null;
let screenshotFailure: unknown = null;
let attachedForCleanup = true;
let pendingScreenshot: Promise<void> | null = null;
const crops: Array<{ x: number; y: number; width: number; height: number }> =
  [];

mock.module("../electron/main/browser/browser-full-page-capture", () => ({
  captureFullPage: async (
    _id: number,
    command: (method: string, params: unknown) => Promise<{ data: string }>,
  ) => {
    const result = await command("Page.captureScreenshot", { format: "png" });
    return `data:image/png;base64,${result.data}`;
  },
}));
mock.module("../electron/main/browser/browser-capture-paint", () => ({
  acquireLensCapturePaint: async () => () => undefined,
}));
mock.module("electron", () => ({
  webContents: {
    fromId: (id: number) => (id === webContents.id ? webContents : null),
  },
  nativeImage: {
    createFromBuffer: () => ({
      isEmpty: () => false,
      getSize: () => ({ width: 1400, height: 1000 }),
      crop: (rect: { x: number; y: number; width: number; height: number }) => {
        crops.push(rect);
        return { toPNG: () => Buffer.from("crop") };
      },
    }),
  },
}));
mock.module("../electron/main/browser/browser-manager", () => ({
  getBrowserSession: () => session,
  getSessionIdentityForWebContentsId: () => ({
    workspaceId: "workspace-fixture",
    lensSessionId: "lens-fixture",
  }),
}));
mock.module("../electron/main/browser/browser-guest-broker", () => ({
  borrowLensGuestFocus: async () => ({ requestId: "borrow", ok: true }),
  releaseLensGuestFocus: async () => undefined,
}));
mock.module("../electron/main/browser/browser-lens-snapshot", () => ({
  describeLensRef: (_id: number, ref: string) => `button ${ref}`,
  resolveLensRefToObjectId: async (_id: number, ref: string) => {
    if (ref === "d1e2") throw new Error("second target disappeared");
    return ref === "d1e3" ? "ref-object-3" : "ref-object-1";
  },
}));
mock.module("../electron/main/browser/browser-security", () => ({
  assertCdpAllowed: async () => undefined,
}));
mock.module("../electron/main/browser/browser-style-capture", () => ({
  getLensBoxModelScript: () => "",
}));
mock.module("../electron/main/browser/browser-screenshot-guard", () => ({
  assertLensScreenshotRect: () => undefined,
  assertLensScreenshotPng: () => undefined,
  LENS_SCREENSHOT_COMMAND_TIMEOUT_MS: 10_000,
}));
mock.module("../electron/main/browser/browser-cdp-controller", () => ({
  detachCdpController: () => undefined,
  ensureCdpAttached: () => undefined,
  sendCdpCommand: async (
    _id: number,
    method: string,
    params?: Record<string, unknown>,
  ) => {
    if (
      method === "Page.enable" ||
      (method === "Runtime.evaluate" && params?.awaitPromise)
    )
      return {};
    commands.push({ method, params });
    if (method === "Runtime.callFunctionOn" && callFailure) {
      throw callFailure;
    }
    if (method === "DOM.getBoxModel" && boxFailure) {
      throw boxFailure;
    }
    if (method === "DOM.getBoxModel") {
      return { model: { border: [10, 20, 30, 20, 30, 40, 10, 40] } };
    }
    if (method === "Runtime.callFunctionOn") {
      return { result: { value: true } };
    }
    if (method === "Page.getLayoutMetrics") {
      return { cssContentSize: { width: 1400, height: 3200 } };
    }
    if (
      method === "Runtime.evaluate" &&
      String(params?.expression).includes("visualViewport")
    ) {
      return {
        result: {
          value: {
            viewport: {
              width: 700,
              height: 500,
              offsetX: 0,
              offsetY: 0,
              scale: 1,
            },
            scrollX: 0,
            scrollY: 0,
          },
        },
      };
    }
    if (method === "Page.captureScreenshot") {
      if (pendingScreenshot) await pendingScreenshot;
      if (screenshotFailure) throw screenshotFailure;
      return { data: "cGVuZw==" };
    }
    return { result: { objectId: "selector-object" } };
  },
  sendCdpCommandIfAttached: async (
    _id: number,
    method: string,
    params?: Record<string, unknown>,
  ) => {
    cleanupCommands.push({ method, params });
    return attachedForCleanup ? {} : undefined;
  },
}));

const cdp = await import("../electron/main/browser/browser-cdp");

beforeEach(() => {
  commands.length = 0;
  cleanupCommands.length = 0;
  callFailure = null;
  boxFailure = null;
  screenshotFailure = null;
  attachedForCleanup = true;
  pendingScreenshot = null;
  crops.length = 0;
});

afterEach(() => {
  commands.length = 0;
  cleanupCommands.length = 0;
});

test("releases one ref wrapper after a successful action", async () => {
  await expect(
    cdp.callOnLensTarget<boolean>(
      webContents.id,
      "d1e1",
      "function () { return true; }",
    ),
  ).resolves.toBe(true);

  expect(cleanupCommands).toEqual([
    { method: "Runtime.releaseObject", params: { objectId: "ref-object-1" } },
  ]);
});

test("releases a ref wrapper when its action throws", async () => {
  callFailure = new Error("guest went away during action");

  await expect(
    cdp.callOnLensTarget<boolean>(
      webContents.id,
      "d1e1",
      "function () { return true; }",
    ),
  ).rejects.toThrow("guest went away during action");

  expect(cleanupCommands).toEqual([
    { method: "Runtime.releaseObject", params: { objectId: "ref-object-1" } },
  ]);
});

test("click releases its resolved wrapper after dispatch", async () => {
  await expect(
    cdp.clickElement(webContents.id, "d1e1"),
  ).resolves.toBeUndefined();

  expect(
    commands.filter(({ method }) => method === "Input.dispatchMouseEvent"),
  ).toHaveLength(2);
  expect(cleanupCommands).toEqual([
    { method: "Runtime.releaseObject", params: { objectId: "ref-object-1" } },
  ]);
});

test("measurement releases the first wrapper when the second resolution fails", async () => {
  await expect(
    cdp.measureElements(webContents.id, "d1e1", "d1e2"),
  ).rejects.toThrow("second target disappeared");

  expect(cleanupCommands).toEqual([
    { method: "Runtime.releaseObject", params: { objectId: "ref-object-1" } },
  ]);
});

test("measurement releases both resolved wrappers after a successful call", async () => {
  await expect(
    cdp.measureElements(webContents.id, "d1e1", "d1e3"),
  ).resolves.toBeTruthy();

  expect(cleanupCommands).toEqual([
    { method: "Runtime.releaseObject", params: { objectId: "ref-object-1" } },
    { method: "Runtime.releaseObject", params: { objectId: "ref-object-3" } },
  ]);
});

test("cleanup never reattaches a closing debugger", async () => {
  attachedForCleanup = false;

  await expect(
    cdp.clickElement(webContents.id, "d1e1"),
  ).resolves.toBeUndefined();

  expect(cleanupCommands).toEqual([
    { method: "Runtime.releaseObject", params: { objectId: "ref-object-1" } },
  ]);
  expect(
    commands.some(({ method }) => method === "Runtime.releaseObject"),
  ).toBe(false);
});

test("full-page capture cleans up without an oversized native surface", async () => {
  await expect(
    cdp.captureScreenshot(webContents.id, { fullPage: true }),
  ).resolves.toBe("data:image/png;base64,cGVuZw==");

  expect(
    commands.find(({ method }) => method === "Page.captureScreenshot")?.params,
  ).not.toHaveProperty("captureBeyondViewport");
  expect(cleanupCommands).toEqual([
    { method: "Emulation.clearDeviceMetricsOverride", params: undefined },
  ]);
});

test("full-page capture clears the viewport override when the capture fails", async () => {
  screenshotFailure = new Error("Lens screenshot timed out after 15 seconds.");

  await expect(
    cdp.captureScreenshot(webContents.id, { fullPage: true }),
  ).rejects.toThrow("timed out");

  expect(cleanupCommands).toEqual([
    { method: "Emulation.clearDeviceMetricsOverride", params: undefined },
  ]);
});

test("viewport capture leaves emulation alone", async () => {
  await expect(cdp.captureScreenshot(webContents.id)).resolves.toBe(
    "data:image/png;base64,cGVuZw==",
  );

  expect(cleanupCommands).toEqual([]);
});

test("selected-area capture crops a viewport capture instead of sending a CDP clip", async () => {
  await expect(
    cdp.captureScreenshot(webContents.id, {
      clip: { x: 10, y: 20, width: 100, height: 40 },
    }),
  ).resolves.toBe(
    `data:image/png;base64,${Buffer.from("crop").toString("base64")}`,
  );

  const captures = commands.filter(
    ({ method }) => method === "Page.captureScreenshot",
  );
  expect(captures).toEqual([
    { method: "Page.captureScreenshot", params: { format: "png" } },
  ]);
  // A 700x500 CSS viewport captured at 1400x1000 is 2 pixels per CSS pixel.
  expect(crops).toEqual([{ x: 20, y: 40, width: 200, height: 80 }]);
  expect(cleanupCommands).toEqual([]);
});

test("selected-area capture refuses an area outside the visible page", async () => {
  await expect(
    cdp.captureScreenshot(webContents.id, {
      clip: { x: 0, y: 900, width: 100, height: 40 },
    }),
  ).rejects.toThrow("outside the visible part of the Lens page");
});

test("captures of one guest never overlap", async () => {
  let finishFirst!: () => void;
  pendingScreenshot = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });

  const fullPage = cdp.captureScreenshot(webContents.id, { fullPage: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  pendingScreenshot = null;
  const viewport = cdp.captureScreenshot(webContents.id);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(
    commands.filter(({ method }) => method === "Page.captureScreenshot"),
  ).toHaveLength(1);

  finishFirst();
  await expect(fullPage).resolves.toBe("data:image/png;base64,cGVuZw==");
  await expect(viewport).resolves.toBe("data:image/png;base64,cGVuZw==");
  expect(
    commands.filter(({ method }) => method === "Page.captureScreenshot"),
  ).toHaveLength(2);
});

test("healing waits out a running capture and clears a leftover override otherwise", async () => {
  let finishCapture!: () => void;
  pendingScreenshot = new Promise<void>((resolve) => {
    finishCapture = resolve;
  });
  const capture = cdp.captureScreenshot(webContents.id);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const heal = cdp.healLensViewportEmulation(webContents.id);
  expect(cleanupCommands).toEqual([]);

  finishCapture();
  await capture;
  await new Promise((resolve) => setTimeout(resolve, 0));

  await heal;
  expect(cleanupCommands).toEqual([
    { method: "Emulation.clearDeviceMetricsOverride", params: undefined },
  ]);
});
