import { afterEach, expect, test } from "bun:test";
import { buildAgentRunStartInput } from "../src/lib/agent-runs/agent-run";
import { useAgentRunsStore } from "../src/store/agent-runs-store";
import { createEmptyWorkspaceState, flushPendingSnapshotPersists } from "../src/store/workspace-session-state";
import { useAppStore } from "../src/store/app.store";

const originalWindow = globalThis.window;
const originalState = useAppStore.getState();
const input = () => buildAgentRunStartInput({
  workspaceId: "ws-new", taskId: "new-task", agent: { name: "Lead" }, assignment: "A new goal", now: new Date(),
});
let failSaves = false;
let releaseSave: (() => void) | undefined;
let savePending = false;
const operations: string[] = [];

function install(holdSave = false) {
  operations.length = 0;
  savePending = false;
  Object.assign(globalThis, { window: { api: {
    persistence: {
      listWorkspaces: async () => ({ ok: true, rows: [] }),
      loadWorkspace: async () => ({ ok: true, snapshot: null }),
      loadWorkspaceShellLite: async () => ({ ok: true, shellLite: null }),
      upsertWorkspace: async () => {
        savePending = true;
        if (holdSave) await new Promise<void>((resolve) => { releaseSave = resolve; });
        if (failSaves) return { ok: false };
        operations.push("saved");
        return { ok: true };
      },
    },
    agentRuns: { start: async () => { operations.push("start"); return { ok: false, agentRun: null, code: "refused" }; } },
  } } });
  const empty = createEmptyWorkspaceState();
  // No snapshot is queued: a just-created task still waits on App's timer.
  useAppStore.setState({
    ...empty, activeWorkspaceId: "ws-new", activeTaskId: "new-task",
    workspaces: [{ id: "ws-new", name: "New", updatedAt: new Date().toISOString() }],
    tasks: [{ id: "new-task", title: "New", provider: "codex", updatedAt: new Date().toISOString(), unread: false }],
  });
}

afterEach(async () => {
  failSaves = false;
  releaseSave?.();
  releaseSave = undefined;
  await flushPendingSnapshotPersists();
  useAppStore.setState(originalState);
  Object.assign(globalThis, { window: originalWindow });
});

test("starting a run waits until its newly created task is acknowledged in persistence", async () => {
  install(true);
  const starting = useAgentRunsStore.getState().startAgentRun(input());
  while (!savePending) await Bun.sleep(0);
  expect(operations).toEqual([]);
  releaseSave!();
  await starting;
  expect(operations).toEqual(["saved", "start"]);
});

test("failed persistence never requests a run and the retained snapshot can be retried", async () => {
  install();
  failSaves = true;
  expect(await useAgentRunsStore.getState().startAgentRun(input())).toMatchObject({ ok: false, code: "failed" });
  expect(operations).toEqual([]);
  failSaves = false;
  await useAgentRunsStore.getState().startAgentRun(input());
  expect(operations).toEqual(["saved", "start"]);
});
