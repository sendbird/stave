import { beforeEach, expect, mock, test } from "bun:test";
const cleanup: string[] = [];
let composed: Buffer;
mock.module("electron", () => ({
  nativeImage: {
    createFromBuffer: (png: Buffer) => ({
      isEmpty: () => false,
      resize: () => ({ toBitmap: () => Buffer.alloc(16, png[0]) }),
    }),
    createFromBitmap: (pixels: Buffer) => {
      composed = pixels;
      return { toPNG: () => Buffer.from("assembled") };
    },
  },
}));
mock.module("../electron/main/browser/browser-screenshot-guard", () => ({
  assertLensScreenshotPng: () => {},
  assertLensScreenshotRect: () => {},
}));
mock.module("../electron/main/browser/browser-cdp-controller", () => ({
  sendCdpCommandIfAttached: async (_id: number, method: string) => {
    cleanup.push(method);
  },
}));
const { captureFullPage } =
  await import("../electron/main/browser/browser-full-page-capture");
let y = 0,
  shots = 0,
  failAt = 0,
  resize = false;
let failPreparation = false;
const geometry = () => ({
  x: 0,
  y,
  width: 2,
  height: resize ? 5 : 3,
  viewportWidth: 2,
  viewportHeight: 2,
});
async function command(
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  if (method === "Page.getFrameTree")
    return { frameTree: { frame: { id: "frame" } } };
  if (method === "Page.createIsolatedWorld") return { executionContextId: 4 };
  if (method === "Runtime.evaluate") return { result: { objectId: "capture" } };
  if (method === "Runtime.callFunctionOn") {
    if (
      String(params?.functionDeclaration).includes("prepare") &&
      failPreparation
    )
      throw new Error("preparation expired");
    if (String(params?.functionDeclaration).includes("move")) {
      y = Math.min(1, (params?.arguments as { value: number }[])[1]!.value);
    }
    return { result: { value: geometry() } };
  }
  if (method === "Page.captureScreenshot") {
    shots++;
    if (shots === failAt) throw new Error("native failed");
    return { data: Buffer.from([10 + y]).toString("base64") };
  }
  throw new Error(method);
}
beforeEach(() => {
  cleanup.length = 0;
  y = shots = failAt = 0;
  resize = failPreparation = false;
});

test("stitches distinct lower pixels and handles bottom scroll clamping", async () => {
  await expect(captureFullPage(1, command, () => {})).resolves.toContain(
    "data:image/png",
  );
  expect(shots).toBe(2);
  expect([...composed!]).toEqual([
    ...Buffer.alloc(16, 10),
    ...Buffer.alloc(8, 11),
  ]);
  expect(cleanup).toEqual(["Runtime.callFunctionOn", "Runtime.releaseObject"]);
});
test("a later native failure restores page state before releasing its handle", async () => {
  failAt = 2;
  await expect(captureFullPage(1, command, () => {})).rejects.toThrow(
    "native failed",
  );
  expect(cleanup).toEqual(["Runtime.callFunctionOn", "Runtime.releaseObject"]);
});
test("a preparation deadline still has a handle with which to restore styles", async () => {
  failPreparation = true;
  await expect(captureFullPage(1, command, () => {})).rejects.toThrow(
    "preparation expired",
  );
  expect(cleanup).toEqual(["Runtime.callFunctionOn", "Runtime.releaseObject"]);
});
test("a replacement document never receives the old scroll restoration", async () => {
  await expect(
    captureFullPage(1, command, () => {
      throw new Error("document replaced");
    }),
  ).rejects.toThrow("document replaced");
  expect(cleanup).toEqual(["Runtime.releaseObject"]);
});
