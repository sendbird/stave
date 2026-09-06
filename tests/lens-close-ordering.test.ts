import { afterEach, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

const sent: string[] = [];
const partition = {
  webRequest: new Proxy({}, { get: () => () => undefined }),
  setPermissionCheckHandler() {},
  setPermissionRequestHandler() {},
};
const guests = new Map<number, FakeGuest>();
class FakeGuest extends EventEmitter {
  session = partition;
  hostWebContents = { id: 1 };
  constructor(readonly id: number) {
    super();
  }
  getType() {
    return "webview";
  }
  isDestroyed() {
    return false;
  }
  setAudioMuted() {}
  setBackgroundThrottling() {}
  setWindowOpenHandler() {}
}
let finishDrain: (result: "drained" | "timed-out") => void;
let drain = new Promise<"drained" | "timed-out">((resolve) => {
  finishDrain = resolve;
});
mock.module("electron", () => ({
  BrowserWindow: class {},
  session: { fromPartition: () => partition },
  webContents: { fromId: (id: number) => guests.get(id) },
}));
mock.module("../electron/main/window", () => ({
  getMainWindow: () => ({
    webContents: {
      id: 1,
      isDestroyed: () => false,
      send: (channel: string) => sent.push(channel),
    },
  }),
  toggleMainWindowDevTools() {},
}));
mock.module("../electron/main/browser/browser-downloads", () => ({
  attachPartitionDownloadHandler: () => () => undefined,
}));
mock.module("../electron/main/browser/lens-credential-service", () => ({
  fillLensCredentialForWebContents: async () => undefined,
}));
mock.module("../electron/main/utils/external-url", () => ({
  openExternalWithFallback: async () => undefined,
}));
mock.module("../electron/main/browser/browser-lens-snapshot", () => ({
  disposeLensSnapshotState() {},
}));
mock.module("../electron/main/browser/browser-cdp-diagnostics", () => ({
  disposeLensCdpDiagnostics: () => drain,
  clearLensCdpDiagnostics() {},
  getLensCdpDiagnosticsState() {},
}));
mock.module("../electron/main/runtime-diagnostic-log", () => ({
  appendRuntimeDiagnostic: async () => {
    sent.push("diagnostic");
  },
}));
const manager = await import("../electron/main/browser/browser-manager");
afterEach(async () => {
  finishDrain("drained");
  await manager.destroyAllBrowserSessions();
  sent.length = 0;
});

for (const outcome of ["drained", "timed-out"] as const) {
  test(`guest removal follows the CDP ${outcome} outcome and blocks key reuse`, async () => {
    drain = new Promise((resolve) => {
      finishDrain = resolve;
    });
    guests.set(10, new FakeGuest(10));
    const args = {
      workspaceId: "close-test",
      lensSessionId: "default",
      guestWebContentsId: 10,
    };
    expect(manager.bindBrowserSessionGuest(args).ok).toBe(true);
    const closing = manager.destroyBrowserSession(args.workspaceId);
    expect(manager.destroyBrowserSession(args.workspaceId)).toBe(closing);
    await Promise.resolve();
    expect(sent).not.toContain("lens:session-closed");
    expect(manager.getBrowserSession(args.workspaceId)).toBeUndefined();
    expect(manager.bindBrowserSessionGuest(args).ok).toBe(false);
    let reopened = false;
    const waiting = manager
      .waitForBrowserSessionClose(args.workspaceId, "default")
      .then(() => {
        reopened = true;
      });
    await Promise.resolve();
    expect(reopened).toBe(false);
    finishDrain(outcome);
    await closing;
    await waiting;
    expect(
      sent.filter((channel) => channel === "lens:session-closed"),
    ).toHaveLength(1);
    if (outcome === "timed-out")
      expect(sent.indexOf("diagnostic")).toBeLessThan(
        sent.indexOf("lens:session-closed"),
      );
    expect(reopened).toBe(true);
    expect(manager.bindBrowserSessionGuest(args).ok).toBe(true);
  });
}
