import { afterEach, beforeEach, expect, mock, test } from "bun:test";

const webContents = {
  id: 700,
  isDestroyed: () => false,
  getURL: () => "https://lens.fixture.test/page",
};

const commands: Array<{ method: string; params?: Record<string, unknown> }> =
  [];
const cleanupCommands: Array<{
  method: string;
  params?: Record<string, unknown>;
}> = [];
let callFailure: unknown = null;
let boxFailure: unknown = null;
let attachedForCleanup = true;

mock.module("electron", () => ({
  webContents: {
    fromId: (id: number) => (id === webContents.id ? webContents : null),
  },
}));
mock.module("../electron/main/browser/browser-manager", () => ({
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
  withLensScreenshotTimeout: <T>(value: Promise<T>) => value,
}));
mock.module("../electron/main/browser/browser-cdp-controller", () => ({
  detachCdpController: () => undefined,
  ensureCdpAttached: () => undefined,
  sendCdpCommand: async (
    _id: number,
    method: string,
    params?: Record<string, unknown>,
  ) => {
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
  attachedForCleanup = true;
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
