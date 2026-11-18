import { expect, test } from "bun:test";

test("actual IPC and preload validate suggestion inputs and outputs", () => {
  const source = `
    import { mock } from "bun:test";
    const handlers = new Map(); let api; let response; let generated = 0;
    mock.module("electron", () => ({
      webContents: { getAllWebContents: () => [] },
      ipcMain: { handle: (key, callback) => handlers.set(key, callback) },
      contextBridge: { exposeInMainWorld: (name, value) => { if(name === "api") api = value; } },
      ipcRenderer: { on: () => {}, removeListener: () => {}, invoke: (key, input) => handlers.get(key)(null, input) },
      webUtils: { getPathForFile: () => "" },
    }));
    mock.module("./electron/main/host-service-client", () => ({ onHostServiceEvent: () => () => {}, invokeHostService: () => { throw new Error("Unexpected host call"); } }));
    mock.module("./electron/main/tars-conversation-instance", () => ({ getTarsConversationService: () => { throw new Error("Unexpected conversation call"); } }));
    mock.module("./electron/main/tars-suggestion-instance", () => ({ suggestTarsRequests: async () => { generated++; return response; } }));
    const { registerTarsHandlers } = await import("./electron/main/ipc/tars"); registerTarsHandlers();
    await import("./electron/preload");
    const input = {requestId:"ipc",language:"en",facts:[{kind:"blocked",title:"Upload",count:1}]};
    response = {status:"generated",requestId:"ipc",providerId:"codex",model:"saved",suggestions:[{label:"Generated label",prompt:"Generated prompt"}]};
    const result = await api.tars.suggest(input);
    let denied = 0;
    for (const invalid of [{...input,model:"override"},{...input,facts:[]},{...input,language:"invalid"}]) {
      try { await api.tars.suggest(invalid); } catch { denied++; }
      try { await handlers.get("tars:suggest")(null,invalid); } catch { denied++; }
    }
    response = {status:"generated",requestId:"ipc",providerId:"codex",model:"saved",suggestions:[{label:"Missing prompt"}]};
    try { await api.tars.suggest(input); } catch { denied++; }
    console.log(JSON.stringify({result,denied,generated}));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const output = JSON.parse(result.stdout.toString());
  expect(output.denied).toBe(7);
  expect(output.generated).toBe(2);
  expect(output.result.suggestions).toEqual([{ label: "Generated label", prompt: "Generated prompt" }]);
});
