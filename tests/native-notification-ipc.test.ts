import { expect, test } from "bun:test";
import path from "node:path";

test("native actions use stored identities, reject widened IPC, and respect platform and setting", () => {
  const source = `
    import { mock } from "bun:test";
    const handlers = new Map(); const shown = []; const calls = [];
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    class Notification { static isSupported() { return true; } constructor(options) { this.options = options; this.listeners = {}; shown.push(this); } on(name, listener) { this.listeners[name] = listener; return this; } show() {} }
    mock.module("electron", () => ({ Notification, BrowserWindow: { fromWebContents: () => null }, app: {}, ipcMain: { handle: (key, fn) => handlers.set(key, fn) } }));
    mock.module("./electron/main/window", () => ({ getMainWindow: () => null }));
    mock.module("./electron/main/i18n", () => ({ tMain: key => key }));
    const row = { id: "notice", kind: "task.approval_requested", workspaceId: "ws", taskId: "task", turnId: "turn", action: { requestId: "request", messageId: "message" }, payload: {} };
    mock.module("./electron/main/state", () => ({ ensurePersistenceReady: async () => ({ listNotifications: () => [row] }) }));
    mock.module("./electron/main/stave-mcp-service", () => ({
      getTaskStatus: async () => ({ activeTurnId: "turn", pendingApprovals: [{ requestId: "request", messageId: "message" }] }),
      respondApproval: async args => { calls.push(args); return { ok: true }; }, respondUserInput: async args => { calls.push(args); return { ok: true }; },
    }));
    const { registerNotificationHandlers } = await import(process.env.NATIVE_NOTIFICATION_MODULE ?? "./electron/main/ipc/notifications"); registerNotificationHandlers();
    const event = { sender: {} }; const args = { notificationId: "notice", title: "Task", body: "Check" };
    await handlers.get("notifications:set-actions-enabled")?.(event, { enabled: true });
    const widened = await handlers.get("notifications:show-native")(event, { ...args, actions: [{ scope: "always" }] });
    await handlers.get("notifications:show-native")(event, args);
    const actionable = shown.at(-1); await actionable.listeners.action?.({}, 0); await new Promise(resolve => setTimeout(resolve, 0));
    await actionable.listeners.action?.({}, 1); await new Promise(resolve => setTimeout(resolve, 0));
    await handlers.get("notifications:set-actions-enabled")?.(event, { enabled: false });
    await handlers.get("notifications:show-native")(event, args); const off = shown.at(-1).options;
    Object.defineProperty(process, "platform", { value: "linux" });
    await handlers.get("notifications:set-actions-enabled")?.(event, { enabled: true });
    await handlers.get("notifications:show-native")(event, args); const unsupported = shown.at(-1).options;
    console.log(JSON.stringify({ widened, options: actionable.options, calls, off, unsupported }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const output = JSON.parse(result.stdout.toString());
  expect(output.widened.ok).toBe(false);
  expect(output.options.actions).toEqual([{ type: "button", text: "nativeNotification.allowOnce" }, { type: "button", text: "nativeNotification.deny" }]);
  expect(output.calls).toEqual([{ workspaceId: "ws", taskId: "task", requestId: "request", expectedMessageId: "message", approved: true }]);
  expect(output.off.actions).toBeUndefined(); expect(output.unsupported.actions).toBeUndefined();
});
