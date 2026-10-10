import { expect, mock, test } from "bun:test";
import { lensCaptureLane } from "../electron/main/browser/browser-capture-lane";
let releasePaint = 0,
  captures = 0;
mock.module("../electron/main/browser/browser-capture-paint", () => ({
  acquireLensCapturePaint: async () => () => {
    releasePaint++;
  },
}));
mock.module("../electron/main/browser/browser-cdp-controller", () => ({
  isCdpPageSleeping: () => false,
}));
const { captureLensPreview } =
  await import("../electron/main/browser/browser-capture-preview");

test("preview timeout retains native ownership and skips new previews", async () => {
  let finish!: (value: unknown) => void;
  const native = new Promise((r) => {
    finish = r;
  });
  const session = {
    documentId: "d",
    webContents: {
      id: 321,
      isDestroyed: () => false,
      capturePage: () => {
        captures++;
        return native;
      },
    },
  } as unknown as Parameters<typeof captureLensPreview>[0];
  const preview = captureLensPreview(session);
  await expect(preview).resolves.toBeUndefined();
  expect(releasePaint).toBe(0);
  expect(lensCaptureLane.isBusy(321)).toBe(true);
  await expect(captureLensPreview(session)).resolves.toBeUndefined();
  expect(captures).toBe(1);
  let started = false;
  const next = lensCaptureLane.run(
    321,
    async () => {
      started = true;
    },
    { timeoutMs: 5000 },
  );
  expect(started).toBe(false);
  finish({ isEmpty: () => false });
  await next;
  expect(releasePaint).toBe(1);
  expect(started).toBe(true);
});
