import { expect } from "bun:test";
import { Database } from "bun:sqlite";
import { TarsStore } from "../../electron/persistence/tars-store";
import { TarsConversationStore } from "../../electron/persistence/tars-conversation-store";
import { createTarsRuntime } from "../../electron/host-service/tars-runtime";
import { actTars } from "../../electron/host-service/tars-control";
import type { TarsActInput } from "../../src/lib/tars/conversation";
import type { TarsBridgeApi, TarsResponsibility } from "../../src/lib/tars/types";

export const TARS_AT = "2026-11-05T00:00:00.000Z";

/** A responsibility row holding `task-1` and its run `agent-run-1` in `ws-1`. */
export function tarsResponsibility(overrides: Partial<TarsResponsibility> = {}): TarsResponsibility {
  return { id: "goal", requestId: "request", title: "Verified result", instruction: "Work", acceptanceCriteria: ["Checks pass"], workspaceId: "source",
    executionWorkspaceId: "ws-1", repositoryPath: "/tmp/repo", providerId: "codex", model: null, agentId: null, priority: 50, maxTurns: 30, revision: 4,
    state: "running", detail: null, taskId: "task-1", agentRunId: "agent-run-1", reverifyAfter: null, createdAt: TARS_AT, updatedAt: TARS_AT, ...overrides };
}

/** The real host path behind the bridge: admission, the run port and the conversation's action records. */
export function tarsHostBridge(owned: Partial<TarsResponsibility> = {}) {
  const database = new Database(":memory:");
  const store = new TarsStore(database);
  const conversations = new TarsConversationStore(database);
  const runControls: string[] = [];
  const runtime = createTarsRuntime({ store, now: () => TARS_AT, validateScope: async () => {}, prepareWorkspace: async () => "ws-1",
    prepareTask: async () => {}, findRun: async () => null, startRun: async () => "agent-run-1", observe: async () => ({ state: "running", detail: null }),
    controlRun: async (_row, operation) => { runControls.push(operation); } });
  const created = store.create({ requestId: "owned", title: "Verified result", instruction: "Work", acceptanceCriteria: ["Checks pass"],
    workspaceId: "source", repositoryPath: "/tmp/repo", providerId: "codex" }, TARS_AT);
  const row = store.patch(created.id, created.revision, { state: "running", taskId: "task-1", executionWorkspaceId: "ws-1", agentRunId: "agent-run-1", ...owned }, TARS_AT);
  const acts: TarsActInput[] = [];
  const bridge: TarsBridgeApi = {
    get: () => runtime.get(),
    create: () => Promise.reject(new Error("unexpected")),
    updateIdentity: () => Promise.reject(new Error("unexpected")),
    act: async (input) => { acts.push(input); return actTars(input, { conversations, runtime }); },
  };
  return { bridge, acts, runControls, store, conversations, runtime, row, close: () => { runtime.stop(); database.close(); } };
}

export async function settle(check: () => boolean) {
  for (let attempt = 0; attempt < 400 && !check(); attempt += 1) await Bun.sleep(5);
  expect(check()).toBe(true);
}
