import { expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { lensCaptureLane } from "../electron/main/browser/browser-capture-lane";
import { captureLensSurface } from "../electron/main/browser/browser-surface-capture";
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
    webContents: Object.assign(new EventEmitter(), {
      id: 321,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
      capturePage: () => {
        captures++;
        return native;
      },
    }),
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

test("destroying a guest settles a native copy whose callback never ran", async () => {
  let startCopy!: () => void;
  const started = new Promise<void>((resolve) => { startCopy = resolve; });
  const guest = Object.assign(new EventEmitter(), {
    capturePage: () => { startCopy(); return new Promise<never>(() => {}); },
  });
  const copy = lensCaptureLane.run(322, () =>
    captureLensSurface(guest as unknown as WebContents),
  { timeoutMs: 5000 });
  const result = copy.catch((error: Error) => error);

  await started;
  guest.emit("destroyed");
  expect(String(await result)).toContain("guest closed");
  expect(guest.listenerCount("destroyed")).toBe(0);
  await expect(lensCaptureLane.run(322, async () => "fresh", {
    timeoutMs: 5000,
  })).resolves.toBe("fresh");
});
