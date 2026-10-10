import { beforeEach, expect, mock, test } from "bun:test";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const session = {
  workspaceId: "workspace",
  lensSessionId: "lens",
  documentId: "d1",
};
let url = "https://allowed.test/";
let destroyed = false;
const guest = { id: 900, getURL: () => url, isDestroyed: () => destroyed };
const commands: string[] = [];
let approvals = 0;
let approved = true;
let approvalWait: Promise<void> | undefined;
let metricsWait: Promise<void> | undefined;
let captureWait: Promise<void> | undefined;
let dispatchWait: Promise<void> | undefined;
let cleanupWait: Promise<void> | undefined;
let scrollY = 0;
let targetPresent = true;

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
  webContents: { fromId: () => guest },
  nativeImage: {
    createFromBuffer: () => ({
      isEmpty: () => false,
      getSize: () => ({ width: 800, height: 600 }),
      crop: () => ({ toPNG: () => Buffer.from("crop") }),
    }),
  },
}));
mock.module("../electron/main/browser/browser-manager", () => ({
  getBrowserSession: () => session,
  getSessionIdentityForWebContentsId: () => session,
}));
mock.module("../electron/main/browser/browser-security", () => ({
  assertCdpAllowed: async () => {
    approvals++;
    await approvalWait;
    if (!approved) throw new Error("Site access denied");
  },
}));
mock.module("../electron/main/browser/browser-screenshot-guard", () => ({
  LENS_SCREENSHOT_COMMAND_TIMEOUT_MS: 40,
  assertLensScreenshotRect: () => undefined,
  assertLensScreenshotPng: () => undefined,
}));
mock.module("../electron/main/browser/browser-cdp-controller", () => ({
  sendCdpCommand: async (
    _id: number,
    method: string,
    _params: { awaitPromise?: boolean } | undefined,
    beforeDispatch: () => void,
  ) => {
    await dispatchWait;
    beforeDispatch();
    if (
      method === "Page.enable" ||
      (method === "Runtime.evaluate" && _params?.awaitPromise)
    )
      return {};
    commands.push(method);
    if (method === "Page.getLayoutMetrics") {
      await metricsWait;
      return { cssContentSize: { width: 800, height: 1600 } };
    }
    if (method === "Page.captureScreenshot") {
      await captureWait;
      return { data: "cG5n" };
    }
    return {
      result: {
        value: {
          viewport: {
            width: 800,
            height: 600,
            offsetX: 0,
            offsetY: 0,
            scale: 1,
          },
          scrollX: 0,
          scrollY,
          rect: targetPresent ? { x: 10, y: 20, width: 100, height: 50 } : null,
        },
      },
    };
  },
  sendCdpCommandIfAttached: async (_id: number, method: string) => {
    commands.push(method);
    await cleanupWait;
  },
}));
const { captureScreenshot, healLensViewportEmulation } =
  await import("../electron/main/browser/browser-screenshot");
beforeEach(() => {
  url = "https://allowed.test/";
  session.documentId = "d1";
  destroyed = false;
  commands.length = 0;
  approvals = 0;
  approved = true;
  approvalWait = metricsWait = captureWait = dispatchWait = undefined;
  cleanupWait = undefined;
  scrollY = 0;
  targetPresent = true;
});

test("navigation while queued rejects both stale captures", async () => {
  const pending = deferred();
  captureWait = pending.promise;
  const first = captureScreenshot(guest.id);
  const firstError = first.catch((error: Error) => error);
  await flush();
  const second = captureScreenshot(guest.id);
  const secondError = second.catch((error: Error) => error);
  url = "https://unapproved.test/";
  session.documentId = "d2";
  pending.resolve();
  const errors = await Promise.all([firstError, secondError]);
  for (const error of errors) expect(String(error)).toContain("page changed");
  expect(
    commands.filter((method) => method === "Page.captureScreenshot"),
  ).toHaveLength(1);
});

test("revoked site permission is checked when a queued capture starts", async () => {
  const pending = deferred();
  captureWait = pending.promise;
  const first = captureScreenshot(guest.id);
  await flush();
  const second = captureScreenshot(guest.id);
  const rejected = second.catch((error: Error) => error);
  approved = false;
  pending.resolve();
  await first;
  expect(String(await rejected)).toContain("Site access denied");
  expect(approvals).toBeGreaterThanOrEqual(3);
  expect(
    commands.filter((method) => method === "Page.captureScreenshot"),
  ).toHaveLength(1);
});

test("late layout metrics cannot start a full-page capture after its deadline", async () => {
  const pending = deferred();
  metricsWait = pending.promise;
  await expect(captureScreenshot(guest.id, { fullPage: true })).rejects.toThrow(
    "timed out",
  );
  pending.resolve();
  await flush();
  expect(commands).toEqual(["Page.getLayoutMetrics"]);
  await expect(captureScreenshot(guest.id)).resolves.toContain(
    "data:image/png",
  );
});

test("a retry waits for both native settlement and timeout cleanup", async () => {
  const native = deferred();
  const cleanup = deferred();
  captureWait = native.promise;
  cleanupWait = cleanup.promise;
  await expect(captureScreenshot(guest.id, { fullPage: true })).rejects.toThrow(
    "timed out",
  );
  const next = captureScreenshot(guest.id);
  native.resolve();
  await flush();
  expect(
    commands.filter((method) => method === "Page.captureScreenshot"),
  ).toHaveLength(1);
  cleanup.resolve();
  await expect(next).resolves.toContain("data:image/png");
  expect(commands).toEqual([
    "Page.getLayoutMetrics",
    "Page.captureScreenshot",
    "Emulation.clearDeviceMetricsOverride",
    "Emulation.clearDeviceMetricsOverride",
    "Page.captureScreenshot",
  ]);
});

test("an approval timeout cannot later start a capture", async () => {
  const pending = deferred();
  approvalWait = pending.promise;
  await expect(captureScreenshot(guest.id)).rejects.toThrow("timed out");
  pending.resolve();
  await flush();
  expect(commands).toEqual([]);
});

test("navigation while approval is pending rejects the action", async () => {
  const pending = deferred();
  approvalWait = pending.promise;
  const capture = captureScreenshot(guest.id);
  const rejected = capture.catch((error: Error) => error);
  await flush();
  url = "https://unapproved.test/";
  pending.resolve();
  expect(String(await rejected)).toContain("page changed");
  expect(commands).toEqual([]);
});

test("a deadline while the controller is waking prevents native dispatch", async () => {
  const pending = deferred();
  dispatchWait = pending.promise;
  await expect(captureScreenshot(guest.id)).rejects.toThrow("timed out");
  pending.resolve();
  await flush();
  expect(commands).toEqual([]);
});

test("one heal request survives a running capture and precedes a retry", async () => {
  const pending = deferred();
  captureWait = pending.promise;
  const first = captureScreenshot(guest.id);
  await flush();
  const heal = healLensViewportEmulation(guest.id);
  const next = captureScreenshot(guest.id);
  pending.resolve();
  await Promise.all([first, heal, next]);
  expect(commands).toEqual([
    "Page.captureScreenshot",
    "Emulation.clearDeviceMetricsOverride",
    "Page.captureScreenshot",
  ]);
});

test("target lookup is delayed until the previous capture has settled", async () => {
  const pending = deferred();
  captureWait = pending.promise;
  const first = captureScreenshot(guest.id);
  await flush();
  const second = captureScreenshot(guest.id, { selector: "#target" });
  const rejected = second.catch((error: Error) => error);
  await flush();
  expect(commands).toEqual(["Page.captureScreenshot"]);
  targetPresent = false;
  pending.resolve();
  await first;
  expect(String(await rejected)).toContain("target was not found");
  expect(commands).toEqual(["Page.captureScreenshot", "Runtime.evaluate"]);
});

test("scrolling during selected-area capture rejects the stale crop", async () => {
  const pending = deferred();
  captureWait = pending.promise;
  const capture = captureScreenshot(guest.id, { selector: "#target" });
  const rejected = capture.catch((error: Error) => error);
  await flush();
  scrollY = 120;
  pending.resolve();
  expect(String(await rejected)).toContain("viewport moved");
});

test("late annotation preparation is bounded and never starts a capture", async () => {
  const pending = deferred();
  let restores = 0;
  await expect(
    captureScreenshot(
      guest.id,
      {},
      {
        prepare: () => pending.promise,
        restore: async () => {
          restores++;
        },
      },
    ),
  ).rejects.toThrow("timed out");
  pending.resolve();
  await flush();
  expect(commands).toEqual([]);
  expect(restores).toBe(1);
});

test("closing the guest during preparation prevents capture and overlay restoration", async () => {
  let restores = 0;
  await expect(
    captureScreenshot(
      guest.id,
      {},
      {
        prepare: async () => {
          destroyed = true;
        },
        restore: async () => {
          restores++;
        },
      },
    ),
  ).rejects.toThrow("page changed");
  expect(commands).toEqual([]);
  expect(restores).toBe(0);
});
