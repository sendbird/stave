import { expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

const targets = new Map<number, unknown>();
mock.module("electron", () => ({ webContents: { fromId: (id: number) => targets.get(id) } }));
const { setCdpPageSleeping, sendCdpCommand, isCdpPageSleeping } = await import("../electron/main/browser/browser-cdp-controller");

function target(id: number, send: (method: string, params?: Record<string, unknown>) => Promise<unknown>) {
  let attached = false;
  const wc = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    debugger: Object.assign(new EventEmitter(), {
      isAttached: () => attached,
      attach: () => { attached = true; },
      sendCommand: send,
    }),
  });
  targets.set(id, wc);
  return wc;
}

test("a command waits for pending freeze and wake before accessing the page", async () => {
  const calls: string[] = [];
  let finishFreeze!: () => void;
  target(901, async (method, params) => {
    calls.push(method === "Page.setWebLifecycleState" ? String(params?.state) : method);
    if (params?.state === "frozen") await new Promise<void>((resolve) => { finishFreeze = resolve; });
    return {};
  });
  const freeze = setCdpPageSleeping(901, true);
  await Promise.resolve(); await Promise.resolve();
  const capture = sendCdpCommand(901, "Page.captureScreenshot");
  expect(calls).toEqual(["frozen"]);
  finishFreeze();
  await Promise.all([freeze, capture]);
  expect(calls).toEqual(["frozen", "active", "Page.captureScreenshot"]);
  expect(isCdpPageSleeping(901)).toBe(false);
});

test("unsupported freezing and a failed wake do not poison future commands", async () => {
  let fail = true;
  const calls: string[] = [];
  target(902, async (method, params) => {
    calls.push(String(params?.state ?? method));
    if (method === "Page.setWebLifecycleState" && fail) { fail = false; throw new Error("Unavailable"); }
    return {};
  });
  await expect(setCdpPageSleeping(902, true)).rejects.toThrow("Unavailable");
  await sendCdpCommand(902, "Runtime.evaluate");
  await setCdpPageSleeping(902, true);
  fail = true;
  await expect(sendCdpCommand(902, "Runtime.evaluate")).rejects.toThrow("Unavailable");
  expect(isCdpPageSleeping(902)).toBe(true);
  await sendCdpCommand(902, "Runtime.evaluate");
  expect(calls.slice(-2)).toEqual(["active", "Runtime.evaluate"]);
});
