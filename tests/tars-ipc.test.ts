import { expect, test } from "bun:test";
import path from "node:path";

test("Tars IPC validates scope-bearing input before dispatch and awaits host responses", () => {
  // Isolate Electron module mocks from other boundary tests in the shared Bun process.
  const source = `
    import { mock } from "bun:test";
    const handlers = new Map();
    const calls = [];
    const snapshot = { identity: { id: "personal", name: "Tars", instructions: "", updatedAt: "2026-11-05T00:00:00.000Z" }, responsibilities: [], runtime: "desktop" };
    mock.module("electron", () => ({ webContents: { getAllWebContents: () => [] }, ipcMain: { handle: (key, callback) => handlers.set(key, callback) } }));
    mock.module("./electron/main/host-service-client", () => ({ onHostServiceEvent: () => () => {}, invokeHostService: async (...args) => { await Promise.resolve(); calls.push(args); return snapshot; } }));
    mock.module("./electron/main/tars-conversation-instance", () => ({ getTarsConversationService: async () => { throw new Error("Unexpected conversation service access"); } }));
    const { registerTarsHandlers } = await import("./electron/main/ipc/tars");
    registerTarsHandlers();
    const input = { requestId: "admit", title: "Owned outcome", instruction: "Verify the result", acceptanceCriteria: ["Verified"], repositoryPath: "/tmp/registered", workspaceId: "workspace-a", providerId: "codex" };
    const created = await handlers.get("tars:create")(null, input);
    let refused = 0;
    for (const invalid of [{ ...input, providerId: "cursor" }, { ...input, grantRoot: "/" }, { ...input, maxTurns: 101 }]) {
      try { await handlers.get("tars:create")(null, invalid); } catch { refused++; }
    }
    console.log(JSON.stringify({ created, refused, calls, handlers: [...handlers.keys()] }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const output = JSON.parse(result.stdout.toString());
  expect(output.refused).toBe(3);
  // The direct state-writing control bypass no longer exists.
  expect(output.handlers).not.toContain("tars:control");
  expect(output.created.runtime).toBe("desktop");
  expect(output.calls).toHaveLength(1);
  expect(output.calls[0]).toMatchObject(["tars.invoke", { action: "create", args: { workspaceId: "workspace-a", repositoryPath: "/tmp/registered", maxTurns: 30, priority: 50 } }]);
});

test("conversation IPC rejects invented authority, action bodies, invalid cancellation and pagination before dispatch", () => {
  const source = `
    import { mock } from "bun:test";
    const handlers = new Map(); const calls = [];
    mock.module("electron", () => ({ webContents: { getAllWebContents: () => [] }, ipcMain: { handle: (key, callback) => handlers.set(key, callback) } }));
    mock.module("./electron/main/host-service-client", () => ({ onHostServiceEvent: () => () => {}, invokeHostService: async () => { throw new Error("Conversation must use main service"); } }));
    mock.module("./electron/main/tars-conversation-instance", () => ({ getTarsConversationService: async () => ({
      configureConversation: (input) => { calls.push(["configure", input]); return input; },
      sendMessage: (input) => { calls.push(["send", input]); return { id: "stored" }; },
      getConversation: (input) => { calls.push(["list", input]); return { messages: [], receipts: [] }; },
      cancelMessage: (input) => { calls.push(["cancel", input]); return { id: input.messageId, state: "cancelled" }; },
    }) }));
    const { registerTarsHandlers } = await import("./electron/main/ipc/tars"); registerTarsHandlers();
    const input = { requestId: "send", text: "Repair search" };
    const settings = { providerId: "codex", model: "chosen", maxTurns: 30, runtimeHints: { codexAccountProfileId: "system-default", codexReasoningEffort: "high" } };
    await handlers.get("tars:configure-conversation")(null, settings);
    const execution = { ...settings, executionModel: { providerId: "claude-code", model: "claude-sonnet-5-5" }, allowedAgentIds: ["release-notes"] };
    await handlers.get("tars:configure-conversation")(null, execution);
    const sent = await handlers.get("tars:send-message")(null, input);
    await handlers.get("tars:get-conversation")(null, undefined);
    await handlers.get("tars:cancel-message")(null, { messageId: "stored", expectedRevision: 2 });
    let denied = 0;
    const invalid = [
      ["tars:send-message", { ...input, actions: [] }],
      ["tars:send-message", { ...input, grantRoot: "/" }],
      ["tars:send-message", { ...input, runtimeHints: { secretEnv: { TOKEN: "invented" } } }],
      ["tars:send-message", { ...input, runtimeHints: { boundSecretIds: ["secret"] } }],
      ["tars:send-message", { ...input, runtimeHints: { codexApprovalPolicy: "never" } }],
      ["tars:send-message", { ...input, mode: "delegate" }],
      ["tars:send-message", { ...input, workspaceId: "source" }],
      ["tars:send-message", { ...input, providerId: "codex" }],
      ["tars:configure-conversation", { ...settings, maxTurns: 0 }],
      ["tars:configure-conversation", { ...settings, runtimeHints: { boundSecretIds: ["secret"] } }],
      ["tars:configure-conversation", { ...settings, grantRoot: "/" }],
      ["tars:configure-conversation", { ...settings, allowedAgentIds: ["release-notes", "release-notes"] }],
      ["tars:configure-conversation", { ...settings, allowedAgentIds: ["../escape"] }],
      ["tars:configure-conversation", { ...settings, allowedAgentIds: Array.from({ length: 51 }, (_, i) => "agent-" + i) }],
      ["tars:configure-conversation", { ...settings, executionModel: { providerId: "cursor", model: "auto" } }],
      ["tars:configure-conversation", { ...settings, executionModel: { providerId: "codex", model: "gpt-6.1-sol", permissionMode: "auto" } }],
      ["tars:configure-conversation", { ...settings, executionModel: "gpt-6.1-sol" }],
      ["tars:send-message", { ...input, agentId: "release-notes" }],
      ["tars:send-message", { ...input, allowedAgentIds: ["release-notes"] }],
      ["tars:get-conversation", { limit: 0 }],
      ["tars:get-conversation", { limit: 1001 }],
      ["tars:get-conversation", { workspaceId: "different" }],
      ["tars:cancel-message", { messageId: "stored" }],
      ["tars:cancel-message", { messageId: "stored", expectedRevision: 1, action: "publish" }],
    ];
    for (const [channel, value] of invalid) { try { await handlers.get(channel)(null, value); } catch { denied++; } }
    console.log(JSON.stringify({ sent, calls, denied, handlers: [...handlers.keys()] }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const output = JSON.parse(result.stdout.toString());
  expect(output.denied).toBe(24);
  expect(output.calls).toEqual([
    ["configure", { providerId: "codex", model: "chosen", maxTurns: 30, runtimeHints: { codexAccountProfileId: "system-default", codexReasoningEffort: "high" } }],
    ["configure", { providerId: "codex", model: "chosen", maxTurns: 30, runtimeHints: { codexAccountProfileId: "system-default", codexReasoningEffort: "high" },
      executionModel: { providerId: "claude-code", model: "claude-sonnet-5-5" }, allowedAgentIds: ["release-notes"] }],
    ["send", { requestId: "send", text: "Repair search" }],
    ["list", { limit: 100, activityLimit: 100 }], ["cancel", { messageId: "stored", expectedRevision: 2 }],
  ]);
  expect(output.handlers).not.toContain("tars:apply-decision");
});

test("actual preload exposes strict send/list/cancel and rejects malformed responses", () => {
  const source = `
    import { mock } from "bun:test";
    let api; const calls = [];
    let reply;
    mock.module("electron", () => ({
      contextBridge: { exposeInMainWorld: (name, value) => { if (name === "api") api = value; } },
      ipcRenderer: { on: () => {}, removeListener: () => {}, invoke: async (channel, input) => { calls.push([channel, input]); return reply; } },
      webUtils: { getPathForFile: () => "" },
    }));
    await import("./electron/preload");
    const input = { requestId: "preload", text: "Discuss" };
    const settings = { providerId: "codex", model: "chosen", maxTurns: 30 };
    reply = settings; await api.tars.configureConversation(settings);
    const routed = { ...settings, executionModel: { providerId: "codex", model: "gpt-6.1-sol" }, allowedAgentIds: ["release-notes"] };
    reply = routed; const saved = await api.tars.configureConversation(routed);
    reply = { ...input, ...settings, id: "saved", state: "queued", revision: 1, reply: null, error: null, decision: null, createdAt: "2026-11-05T00:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z" };
    const sent = await api.tars.sendMessage(input);
    reply = { settings, messages: [reply], receipts: [], activity: [], records: [] }; await api.tars.getConversation();
    let denied = 0;
    for (const operation of [
      () => api.tars.sendMessage({ ...input, actions: [] }),
      () => api.tars.getConversation({ limit: 1001 }),
      () => api.tars.cancelMessage({ messageId: "saved", expectedRevision: 0 }),
      () => api.tars.configureConversation({ ...settings, runtimeHints: { TOKEN: "invented" } }),
      () => api.tars.configureConversation({ ...settings, allowedAgentIds: ["dup", "dup"] }),
      () => api.tars.configureConversation({ ...settings, executionModel: { providerId: "kiro", model: "auto" } }),
    ]) { try { await operation(); } catch { denied++; } }
    // A malformed host reply is refused even when the request was valid.
    reply = { ...routed, allowedAgentIds: ["bad id"] }; try { await api.tars.configureConversation(routed); } catch { denied++; }
    const before = calls.length;
    reply = { ...sent, state: "cancelled", revision: 2 }; await api.tars.cancelMessage({ messageId: "saved", expectedRevision: 1 });
    reply = { messages: [], receipts: [], actions: [] }; try { await api.tars.getConversation(); } catch { denied++; }
    console.log(JSON.stringify({ sent: sent.id, saved, denied, before, channels: calls.map(([channel]) => channel), hasHostAction: "applyDecision" in api.tars }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({ sent: "saved",
    saved: { providerId: "codex", model: "chosen", maxTurns: 30, executionModel: { providerId: "codex", model: "gpt-6.1-sol" }, allowedAgentIds: ["release-notes"] },
    denied: 8, before: 5,
    channels: ["tars:configure-conversation", "tars:configure-conversation", "tars:send-message", "tars:get-conversation", "tars:configure-conversation",
      "tars:cancel-message", "tars:get-conversation"], hasHostAction: false });
});

test("act IPC admits only a strict click control and forwards it to the host's admitted path", () => {
  const source = `
    import { mock } from "bun:test";
    const handlers = new Map(); const calls = [];
    mock.module("electron", () => ({ webContents: { getAllWebContents: () => [] }, ipcMain: { handle: (key, callback) => handlers.set(key, callback) } }));
    mock.module("./electron/main/host-service-client", () => ({ onHostServiceEvent: () => () => {}, invokeHostService: async (...args) => { calls.push(args); return { forwarded: true }; } }));
    mock.module("./electron/main/tars-conversation-instance", () => ({ getTarsConversationService: async () => { throw new Error("Controls must not use the conversation service"); } }));
    const { registerTarsHandlers } = await import("./electron/main/ipc/tars"); registerTarsHandlers();
    const input = { requestId: "click-1", responsibilityId: "goal", expectedRevision: 3, operation: "takeover", source: "click" };
    const result = await handlers.get("tars:act")(null, input);
    let denied = 0;
    for (const invalid of [
      { ...input, state: "running" }, { ...input, priority: 90 }, { ...input, reverifyAfter: null },
      { ...input, operation: "publish" }, { ...input, source: "model" }, { ...input, expectedRevision: 0 },
      { ...input, requestId: "has space" }, { responsibilityId: "goal", expectedRevision: 3, operation: "pause", source: "click" },
    ]) { try { await handlers.get("tars:act")(null, invalid); } catch { denied++; } }
    console.log(JSON.stringify({ result, denied, calls }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const output = JSON.parse(result.stdout.toString());
  expect(output.denied).toBe(8);
  expect(output.result).toEqual({ forwarded: true });
  expect(output.calls).toEqual([["tars.act", { requestId: "click-1", responsibilityId: "goal", expectedRevision: 3, operation: "takeover", source: "click" }]]);
});

test("actual preload validates act input and rejects a malformed host result", () => {
  const source = `
    import { mock } from "bun:test";
    let api; const calls = []; let reply;
    mock.module("electron", () => ({
      contextBridge: { exposeInMainWorld: (name, value) => { if (name === "api") api = value; } },
      ipcRenderer: { on: () => {}, removeListener: () => {}, invoke: async (channel, input) => { calls.push([channel, input]); return reply; } },
      webUtils: { getPathForFile: () => "" },
    }));
    await import("./electron/preload");
    const at = "2026-11-05T00:00:00.000Z";
    const input = { requestId: "click-1", responsibilityId: "goal", expectedRevision: 1, operation: "pause", source: "click" };
    const record = { requestId: "click-1", source: "click", requestHash: "c".repeat(64), action: { kind: "control", responsibilityId: "goal", expectedRevision: 1, operation: "pause" },
      status: "rejected", error: "The responsibility changed. Refresh before trying again.", reason: "stale", revision: 2, createdAt: at, updatedAt: at };
    reply = { record, snapshot: { identity: { id: "personal", name: "Tars", instructions: "", updatedAt: at }, responsibilities: [], runtime: "desktop" } };
    const accepted = await api.tars.act(input);
    let denied = 0;
    for (const operation of [() => api.tars.act({ ...input, extra: true }), () => api.tars.act({ ...input, operation: "resume-all" })]) {
      try { await operation(); } catch { denied++; }
    }
    reply = { record: { ...record, error: null } }; try { await api.tars.act(input); } catch { denied++; }
    // An unknown reason code is a malformed result, never shown as a raw string.
    reply = { ...reply, record: { ...record, reason: "bogus" }, snapshot: accepted.snapshot }; try { await api.tars.act(input); } catch { denied++; }
    reply = { record: { ...record, reason: null }, snapshot: accepted.snapshot }; try { await api.tars.act(input); } catch { denied++; }
    console.log(JSON.stringify({ status: accepted.record.status, reason: accepted.record.reason, denied, channels: calls.map(([channel]) => channel), hasControl: "control" in api.tars }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({ status: "rejected", reason: "stale", denied: 5, channels: ["tars:act", "tars:act", "tars:act", "tars:act"], hasControl: false });
});

test("actual preload validates snapshot reads and identity or responsibility writes in both directions", () => {
  const source = `
    import { mock } from "bun:test";
    let api; const calls = []; let reply;
    mock.module("electron", () => ({
      contextBridge: { exposeInMainWorld: (name, value) => { if (name === "api") api = value; } },
      ipcRenderer: { on: () => {}, removeListener: () => {}, invoke: async (channel, input) => { calls.push(channel); return reply; } },
      webUtils: { getPathForFile: () => "" },
    }));
    await import("./electron/preload");
    const snapshot = { identity: { id: "personal", name: "Tars", instructions: "", updatedAt: "2026-11-05T00:00:00.000Z" }, responsibilities: [], runtime: "desktop" };
    reply = snapshot;
    const read = await api.tars.get();
    await api.tars.updateIdentity({ name: "Tars", instructions: "Be brief." });
    let denied = 0;
    for (const operation of [() => api.tars.updateIdentity({ name: "Tars", instructions: "", token: "x" }),
      () => api.tars.create({ requestId: "r", title: "t", instruction: "i", acceptanceCriteria: [], workspaceId: "w", repositoryPath: "/tmp/r", providerId: "codex" })]) {
      try { await operation(); } catch { denied++; }
    }
    for (const malformed of [{ ...snapshot, runtime: "browser" }, { ...snapshot, responsibilities: [{ id: "partial" }] }, { ...snapshot, extra: true }]) {
      reply = malformed; try { await api.tars.get(); } catch { denied++; }
    }
    console.log(JSON.stringify({ read: read.runtime, denied, calls }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({ read: "desktop", denied: 5,
    calls: ["tars:get", "tars:update-identity", "tars:get", "tars:get", "tars:get"] });
});

test("reprioritize IPC admits only a strict queue move and forwards it to the host, never through the conversation service", () => {
  const source = `
    import { mock } from "bun:test";
    const handlers = new Map(); const calls = [];
    mock.module("electron", () => ({ webContents: { getAllWebContents: () => [] }, ipcMain: { handle: (key, callback) => handlers.set(key, callback) } }));
    mock.module("./electron/main/host-service-client", () => ({ onHostServiceEvent: () => () => {}, invokeHostService: async (...args) => { calls.push(args); return { forwarded: true }; } }));
    mock.module("./electron/main/tars-conversation-instance", () => ({ getTarsConversationService: async () => { throw new Error("Queue moves must not use the conversation service"); } }));
    const { registerTarsHandlers } = await import("./electron/main/ipc/tars"); registerTarsHandlers();
    const input = { requestId: "move-1", responsibilityId: "goal", expectedRevision: 3, move: { direction: "earlier", relativeTo: "other" }, source: "drag" };
    const result = await handlers.get("tars:reprioritize")(null, input);
    let denied = 0;
    for (const invalid of [
      { ...input, priority: 90 }, { ...input, move: { direction: "first" } }, { ...input, move: { direction: "later", priority: 5 } },
      { ...input, source: "words" }, { ...input, source: "model" }, { ...input, expectedRevision: 0 }, { ...input, requestId: "has space" },
      { requestId: "move-2", responsibilityId: "goal", expectedRevision: 3, source: "click" },
    ]) { try { await handlers.get("tars:reprioritize")(null, invalid); } catch { denied++; } }
    console.log(JSON.stringify({ result, denied, calls }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const output = JSON.parse(result.stdout.toString());
  expect(output.denied).toBe(8);
  expect(output.result).toEqual({ forwarded: true });
  expect(output.calls).toEqual([["tars.reprioritize", { requestId: "move-1", responsibilityId: "goal", expectedRevision: 3, move: { direction: "earlier", relativeTo: "other" }, source: "drag" }]]);
});

test("actual preload validates a queue move and rejects a malformed move record", () => {
  const source = `
    import { mock } from "bun:test";
    let api; const calls = []; let reply;
    mock.module("electron", () => ({
      contextBridge: { exposeInMainWorld: (name, value) => { if (name === "api") api = value; } },
      ipcRenderer: { on: () => {}, removeListener: () => {}, invoke: async (channel, input) => { calls.push([channel, input]); return reply; } },
      webUtils: { getPathForFile: () => "" },
    }));
    await import("./electron/preload");
    const at = "2026-11-05T00:00:00.000Z";
    const input = { requestId: "move-1", responsibilityId: "goal", expectedRevision: 1, move: { direction: "later" }, source: "click" };
    const record = { requestId: "move-1", source: "click", requestHash: "d".repeat(64), action: { kind: "move", responsibilityId: "goal", expectedRevision: 1, move: { direction: "later" } },
      status: "applied", error: null, reason: null, priority: 40, revision: 2, createdAt: at, updatedAt: at };
    const snapshot = { identity: { id: "personal", name: "Tars", instructions: "", updatedAt: at }, responsibilities: [], runtime: "desktop" };
    reply = { record, snapshot };
    const accepted = await api.tars.reprioritize(input);
    let denied = 0;
    for (const operation of [() => api.tars.reprioritize({ ...input, extra: true }), () => api.tars.reprioritize({ ...input, move: { direction: "later", by: 2 } })]) {
      try { await operation(); } catch { denied++; }
    }
    // A priority on a refused move, or a drag recorded as a control, is malformed.
    reply = { record: { ...record, status: "rejected", error: "Stale.", reason: "stale" }, snapshot }; try { await api.tars.reprioritize(input); } catch { denied++; }
    reply = { record: { ...record, source: "drag", action: { kind: "control", responsibilityId: "goal", expectedRevision: 1, operation: "pause" }, priority: undefined }, snapshot };
    try { await api.tars.reprioritize(input); } catch { denied++; }
    console.log(JSON.stringify({ status: accepted.record.status, priority: accepted.record.priority, denied, channels: calls.map(([channel]) => channel) }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({ status: "applied", priority: 40, denied: 4, channels: ["tars:reprioritize", "tars:reprioritize", "tars:reprioritize"] });
});
