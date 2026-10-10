import { beforeEach, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { LensCapturePaintRequest } from "../src/lib/lens/lens.types";

class Guest extends EventEmitter {
  id = 41;
  destroyed = false;
  throttled = true;
  isDestroyed() {
    return this.destroyed;
  }
  getBackgroundThrottling() {
    return this.throttled;
  }
  setBackgroundThrottling(value: boolean) {
    this.throttled = value;
  }
}
const guest = new Guest();
const messages: LensCapturePaintRequest[] = [];
let autoAck = true;
const renderer = Object.assign(new EventEmitter(), {
  id: 9,
  isDestroyed: () => false,
  send: (_channel: string, payload: LensCapturePaintRequest) => {
    messages.push(payload);
    if (autoAck && payload.active)
      resolveLensCapturePaint({ requestId: payload.requestId, ok: true }, 9);
  },
});
mock.module("electron", () => ({ webContents: { fromId: () => guest } }));
mock.module("../electron/main/window", () => ({
  getMainWindow: () => ({ webContents: renderer }),
}));
mock.module("../electron/main/browser/browser-manager", () => ({
  getSessionIdentityForWebContentsId: () => ({
    workspaceId: "w",
    lensSessionId: "s",
  }),
}));
const { acquireLensCapturePaint, resolveLensCapturePaint } =
  await import("../electron/main/browser/browser-capture-paint");
beforeEach(() => {
  messages.length = 0;
  autoAck = true;
  guest.destroyed = false;
  guest.throttled = true;
});
const flush = () => new Promise((r) => setTimeout(r, 0));

test("lease restores idle throttling and ends only once", async () => {
  const release = await acquireLensCapturePaint(
    41,
    new AbortController().signal,
  );
  expect(guest.throttled).toBe(false);
  expect(messages.map((p) => p.active)).toEqual([true]);
  release();
  release();
  expect(guest.throttled).toBe(true);
  expect(messages.map((p) => p.active)).toEqual([true, false]);
  expect(messages[1]!.requestId).toBe(messages[0]!.requestId);
});

test("untrusted acknowledgement cannot start a capture, and cancellation parks it", async () => {
  autoAck = false;
  const abort = new AbortController();
  const pending = acquireLensCapturePaint(41, abort.signal);
  const error = pending.catch((e: Error) => e);
  resolveLensCapturePaint({ requestId: messages[0]!.requestId, ok: true }, 999);
  await flush();
  expect(messages).toHaveLength(1);
  abort.abort();
  expect(String(await error)).toContain("cancelled");
  expect(messages.map((p) => p.active)).toEqual([true, false]);
  resolveLensCapturePaint({ requestId: messages[0]!.requestId, ok: true }, 9);
  expect(messages).toHaveLength(2);
  expect(guest.throttled).toBe(true);
});

test("guest destruction while preparing rejects without retaining listeners", async () => {
  autoAck = false;
  const pending = acquireLensCapturePaint(41, new AbortController().signal);
  const error = pending.catch((e: Error) => e);
  guest.destroyed = true;
  guest.emit("destroyed");
  expect(String(await error)).toContain("closed");
  expect(guest.listenerCount("destroyed")).toBe(0);
  expect(renderer.listenerCount("destroyed")).toBe(0);
});

test("a caller deadline does not release an acquired native paint lease", async () => {
  const abort = new AbortController();
  const release = await acquireLensCapturePaint(41, abort.signal);
  abort.abort();
  expect(messages).toHaveLength(1);
  expect(guest.throttled).toBe(false);
  release();
  expect(messages.map((p) => p.active)).toEqual([true, false]);
});
