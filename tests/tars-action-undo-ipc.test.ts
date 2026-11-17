import { expect, test } from "bun:test";
import path from "node:path";

test("Undo validates caller identity through actual preload and IPC, with no caller-supplied restoration payload", () => {
  const source = `
    import { mock } from "bun:test";
    let api, reply = { record: null, refusal: "unsupported" }; const handlers = new Map(), calls = [];
    mock.module("electron", () => ({
      contextBridge: { exposeInMainWorld: (name, value) => { if (name === "api") api = value; } },
      ipcRenderer: { on() {}, removeListener() {}, invoke: async (channel, input) => handlers.get(channel)(null, input) },
      webUtils: { getPathForFile: () => "" }, webContents: { getAllWebContents: () => [] },
      ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
    }));
    mock.module("./electron/main/host-service-client", () => ({ onHostServiceEvent: () => () => {}, invokeHostService: async (...args) => { calls.push(args); return reply; } }));
    mock.module("./electron/main/tars-conversation-instance", () => ({ getTarsConversationService: async () => { throw new Error("Undo must use host"); } }));
    const { registerTarsHandlers } = await import("./electron/main/ipc/tars"); registerTarsHandlers();
    await import("./electron/preload");
    const input = { requestId: "move", expectedRevision: 2 };
    const result = await api.tars.undoAction(input);
    let denied = 0;
    for (const invalid of [{ ...input, priority: 20 }, { ...input, undo: { kind: "queue" } }, { ...input, expectedRevision: 0 }]) {
      try { await api.tars.undoAction(invalid); } catch { denied++; }
      try { await handlers.get("tars:undo-action")(null, invalid); } catch { denied++; }
    }
    reply = { record: null, refusal: "invented" };
    try { await api.tars.undoAction(input); } catch { denied++; }
    console.log(JSON.stringify({ result, denied, calls }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({ result: { record: null, refusal: "unsupported" }, denied: 7,
    calls: [["tars.undo-action", { requestId: "move", expectedRevision: 2 }], ["tars.undo-action", { requestId: "move", expectedRevision: 2 }]] });
});
