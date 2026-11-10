import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyAppLocale, i18n } from "@/i18n";
import { toastManager } from "@/lib/notifications/toast";
import { TarsConversationSchema } from "../src/lib/tars/conversation";
import type { TarsBridgeApi } from "../src/lib/tars/types";
import { registerAgentRunBridge } from "../src/store/agent-run-send";
import { useAppStore } from "../src/store/app.store";
import { publishTarsSnapshot, useTarsSnapshotStore } from "../src/store/tars-snapshot-store";
import type { Task } from "../src/types/chat";
import { createAgentChoiceActions, type AgentChoiceContext } from "../src/components/ai-elements/agent-choice-actions";
import { BUILTIN_AGENTS } from "../src/lib/agents/starters";
import { isTarsWorkflowId, tarsWorkflowId } from "../src/lib/tars/ownership";
import { tarsWorkflow } from "../electron/host-service/tars-execution";
import { settle, TARS_AT, tarsHostBridge, tarsResponsibility } from "./fixtures/tars-host-bridge";

const originalWindow = globalThis.window;
const TARS_RUN_UUID = "0f0e0d0c-0b0a-4908-8706-050403020100";
const originalAdd = toastManager.add;
const APP_FIELDS = ["repositoryPath", "activeWorkspaceId", "taskWorkspaceIdById", "tasks", "messagesByTask", "activeTurnIdsByTask"] as const;
const originalApp = Object.fromEntries(APP_FIELDS.map((key) => [key, useAppStore.getState()[key]]));

let cancels: string[] = [];
let abortedTurns: string[] = [];
let userTurns: string[] = [];
let toasts: Array<{ title: unknown; description: unknown }> = [];

function task(id: string): Task {
  return { id, title: id, provider: "codex", updatedAt: TARS_AT, unread: false, archivedAt: null, controlMode: "interactive", controlOwner: "stave" } as Task;
}

/** The task's active agent run, as the agent runs store reports it to the Stop path. */
function installRun(run: { id?: string; workflowId?: string } = {}) {
  registerAgentRunBridge({
    activeAgentRun: (workspaceId, taskId) => (workspaceId === "ws-1" && taskId === "task-1"
      ? { id: run.id ?? "agent-run-1", agentOrigin: true, workflowId: run.workflowId ?? `tars-${TARS_RUN_UUID}` } : null),
    isUserTurn: (_agentRunId, turnId) => userTurns.includes(turnId),
    start: () => Promise.reject(new Error("unexpected")),
    cancel: async (agentRunId) => { cancels.push(agentRunId); return { ok: true } as never; },
    watchFirstPrompt: () => {},
  });
}

function installWindow(tars?: TarsBridgeApi) {
  Object.assign(globalThis, { window: { api: {
    ...(tars ? { tars } : {}),
    provider: { abortTurn: async ({ turnId }: { turnId: string }) => { abortedTurns.push(turnId); }, cleanupTask: async () => {} },
  } } });
}

/** Every Stop entry point calls this store action; it is the one place a stop could cancel a run. */
const stop = () => useAppStore.getState().abortTaskTurn({ taskId: "task-1" });
const turnStopped = () => abortedTurns.length === 1 && useAppStore.getState().activeTurnIdsByTask["task-1"] === undefined;

beforeEach(() => {
  cancels = []; abortedTurns = []; toasts = []; userTurns = [];
  toastManager.add = ((options: { title?: unknown; description?: unknown }) => { toasts.push({ title: options.title, description: options.description }); return "toast"; }) as typeof toastManager.add;
  useAppStore.setState({ repositoryPath: "/tmp/repo", activeWorkspaceId: "ws-1", taskWorkspaceIdById: { "task-1": "ws-1" },
    tasks: [task("task-1")], messagesByTask: { "task-1": [] }, activeTurnIdsByTask: { "task-1": "turn-1" } });
  useTarsSnapshotStore.setState({ snapshot: null });
  installRun();
});
afterEach(() => {
  Object.assign(globalThis, { window: originalWindow });
  toastManager.add = originalAdd;
  useAppStore.setState(originalApp);
  useTarsSnapshotStore.setState({ snapshot: null });
  registerAgentRunBridge(null);
});

describe("Stop on a task whose run Tars holds", () => {
  test("pauses through tars:act as a task-view control, stops the in-flight turn and never cancels the run", async () => {
    const host = tarsHostBridge();
    try {
      installWindow(host.bridge);
      stop();
      await settle(turnStopped);
      await host.runtime.drain();
      expect(host.acts.map((input) => [input.operation, input.source, input.expectedRevision])).toEqual([["pause", "task", host.row.revision]]);
      expect(host.runControls).toEqual(["pause"]);
      expect(host.store.get(host.row.id)?.state).toBe("paused");
      expect(cancels).toEqual([]);
      expect(abortedTurns).toEqual(["turn-1"]);
      const records = TarsConversationSchema.parse({ settings: null, activity: [], messages: [], receipts: [], records: host.conversations.listActions() }).records;
      expect(records.map((record) => [record.source, record.status, record.action.operation])).toEqual([["task", "applied", "pause"]]);
      applyAppLocale("ko"); await i18n.changeLanguage("ko");
      try {
        expect(i18n.t(`shell:tars.conversation.records.${records[0]!.source}.applied.pause`)).toBe("일시 정지 적용됨 · 작업 화면");
      } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
    } finally { host.close(); }
  });

  test("a task Tars does not hold keeps the old Stop: its run is cancelled, then the turn stops", async () => {
    const host = tarsHostBridge({ taskId: "another-task", agentRunId: "another-run" });
    try {
      installWindow(host.bridge);
      stop();
      await settle(turnStopped);
      expect(cancels).toEqual(["agent-run-1"]);
      expect(host.acts).toEqual([]);
    } finally { host.close(); }
  });

  test("without a Tars bridge the Stop is unchanged", async () => {
    installWindow();
    stop();
    await settle(turnStopped);
    expect(cancels).toEqual(["agent-run-1"]);
  });

  test("fails safe: when ownership cannot be read and Tars held the work, the run and its automatic turn are kept and the reason is shown", async () => {
    publishTarsSnapshot({ identity: { id: "personal", name: "Tars", instructions: "", updatedAt: TARS_AT }, responsibilities: [tarsResponsibility()], runtime: "desktop" });
    const acts: unknown[] = [];
    installWindow({ get: () => Promise.reject(new Error("host unavailable")), create: () => Promise.reject(new Error("unexpected")),
      updateIdentity: () => Promise.reject(new Error("unexpected")), act: async (input) => { acts.push(input); throw new Error("unexpected"); } });
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    try {
      stop();
      await settle(() => toasts.length === 1);
      await Bun.sleep(20);
      expect(cancels).toEqual([]);
      expect(acts).toEqual([]);
      // Nothing paused the run, so cutting its automatic turn would only spend its retry.
      expect(abortedTurns).toEqual([]);
      expect(useAppStore.getState().activeTurnIdsByTask["task-1"]).toBe("turn-1");
      expect(toasts).toEqual([{ title: "Tars가 이 조작을 적용하지 않았습니다",
        description: "Tars가 이 조작을 적용하지 못했습니다. 작업의 현재 상태를 확인하고 다시 시도하세요." }]);
    } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
  });

  test("on work Tars already paused, Stop ends only your own turn: no Tars control, no run cancel", async () => {
    const host = tarsHostBridge({ state: "paused" });
    try {
      installWindow(host.bridge);
      stop();
      await settle(turnStopped);
      expect(host.acts).toEqual([]);
      expect(cancels).toEqual([]);
      expect(host.store.get(host.row.id)?.state).toBe("paused");
      expect(toasts.map((toast) => toast.title)).toEqual([i18n.t("shell:tars.owner.turnOnly")]);
    } finally { host.close(); }
  });

  test("keepAgentRun stops only the turn, for a caller Tars already answered", async () => {
    installWindow();
    useAppStore.getState().abortTaskTurn({ taskId: "task-1", keepAgentRun: true });
    await settle(turnStopped);
    expect(cancels).toEqual([]);
  });
});

describe("Stop when Tars refuses, cannot be asked, or no longer owns the run", () => {
  const snapshotOf = (rows = [tarsResponsibility()]) => ({ identity: { id: "personal" as const, name: "Tars", instructions: "", updatedAt: TARS_AT }, responsibilities: rows, runtime: "desktop" as const });
  const refusing = (): TarsBridgeApi => ({
    get: async () => snapshotOf(), create: async () => snapshotOf(), updateIdentity: async () => snapshotOf(),
    act: async (input) => ({ snapshot: snapshotOf(), record: { requestId: input.requestId, source: input.source, requestHash: "e".repeat(64),
      action: { kind: "control", responsibilityId: input.responsibilityId, expectedRevision: input.expectedRevision, operation: input.operation },
      status: "rejected", error: "diagnostic", reason: "stale", revision: 2, createdAt: TARS_AT, updatedAt: TARS_AT } }),
  });

  test("a refused pause keeps the run's automatic turn and shows the reason", async () => {
    installWindow(refusing());
    stop();
    await settle(() => toasts.length === 1);
    await Bun.sleep(20);
    expect(cancels).toEqual([]);
    expect(abortedTurns).toEqual([]);
    expect(toasts[0]!.description).toBe(i18n.t("shell:tars.controlReasons.stale"));
  });

  test("a refused pause still stops your own turn, never the run", async () => {
    userTurns = ["turn-1"];
    installWindow(refusing());
    stop();
    await settle(turnStopped);
    expect(cancels).toEqual([]);
  });

  test("with no snapshot and an unreadable ownership, the run's own Tars marker keeps it", async () => {
    installWindow({ get: () => Promise.reject(new Error("host unavailable")), create: () => Promise.reject(new Error("unexpected")),
      updateIdentity: () => Promise.reject(new Error("unexpected")), act: () => Promise.reject(new Error("unexpected")) });
    stop();
    await settle(() => toasts.length === 1);
    expect(cancels).toEqual([]);
    // A run without the marker is cancelled as before.
    installRun({ workflowId: "agent-run" });
    toasts = [];
    stop();
    await settle(turnStopped);
    expect(cancels).toEqual(["agent-run-1"]);
    expect(toasts).toEqual([]);
  });

  test("your own run on a task Tars lost is yours: Stop cancels it as before", async () => {
    const host = tarsHostBridge({ state: "blocked" });
    try {
      installRun({ id: "user-run", workflowId: "agent-run" });
      installWindow(host.bridge);
      stop();
      await settle(turnStopped);
      expect(cancels).toEqual(["user-run"]);
      expect(host.acts).toEqual([]);
    } finally { host.close(); }
  });
});

describe("every Stop entry point goes through the store's Stop", () => {
  const read = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();
  test.each([
    ["composer Stop", "src/components/session/ChatInputComposer.tsx", "onAbort={() => abortTaskTurn({ taskId: args.activeTaskId })}"],
    ["Esc keybinding", "src/components/layout/useAppKeybindings.ts", "store().abortTaskTurn({ taskId: store().activeTaskId })"],
    ["command palette", "src/components/layout/AppShell.tsx", "stopActiveTurn: () => abortTaskTurn({ taskId: activeTaskId })"],
    ["review status line", "src/components/review/ReviewTaskStatusLine.tsx", "useAppStore.getState().abortTaskTurn({ taskId })"],
    ["composer shelf", "src/components/session/composer-shelf/ComposerShelf.tsx", "const onStop = useCallback(() => abortTaskTurn({ taskId })"],
    ["run line", "src/components/agent-runs/useAgentRunActions.ts", "onStop: () => useAppStore.getState().abortTaskTurn({ taskId: agentRun.leadTaskId })"],
  ])("%s", async (_name, path, call) => {
    const source = await read(path);
    expect(source).toContain(call);
    // None of them cancels a run itself; only the store's Stop decides.
    expect(source.includes('runCommand("cancel"') ? path : null).toBe(path.endsWith("useAgentRunActions.ts") ? path : null);
  });
});

describe("changing the agent of work Tars holds", () => {
  const selection = { key: "codex:gpt", providerId: "codex", model: "gpt", label: "GPT", available: true } as const;
  function picker() {
    const calls: string[] = [];
    let selected = 0;
    const context: AgentChoiceContext = {
      taskId: "task-1", workspaceId: "ws-1", repositoryPath: "/tmp/repo", taskTitle: "Task", standards: undefined, hasTurns: true,
      selectedModel: selection, modelOptions: [selection],
      current: { agentConfigId: "implementer", agentName: "Implementer", agentPermission: "auto" } as never,
      api: {
        recordTask: async () => { calls.push("record"); return { ok: true, value: {} } as never; },
        releaseTask: async () => { calls.push("release"); return { ok: true, value: null } as never; },
      },
      onModelSelect: () => { selected += 1; }, applyAssignment: () => {}, reload: () => {}, setPending: () => {}, setBusy: () => {},
    };
    return { actions: createAgentChoiceActions(() => context), calls, selected: () => selected };
  }

  test("is refused with a translated explanation, so Tars's run is never ended behind it", async () => {
    const host = tarsHostBridge();
    try {
      installWindow(host.bridge);
      const { actions, calls, selected } = picker();
      applyAppLocale("ko"); await i18n.changeLanguage("ko");
      try {
        expect(await actions.apply(BUILTIN_AGENTS[0]!)).toBe(false);
        actions.selectModel({ selection });
        await settle(() => toasts.length === 2);
        expect(toasts[0]).toEqual({ title: "Tars가 이 작업의 에이전트를 맡고 있습니다",
          description: "에이전트를 바꾸면 Tars의 실행이 끝나므로 먼저 작업을 직접 맡으세요." });
      } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
      expect(calls).toEqual([]);
      expect(selected()).toBe(0);
      expect(host.acts).toEqual([]);
    } finally { host.close(); }
  });

  test("once you took the work over, or for a task Tars does not hold, the agent changes as before", async () => {
    for (const owned of [{ state: "takenOver" as const }, { taskId: "another-task", agentRunId: "another-run" }]) {
      const host = tarsHostBridge(owned);
      try {
        installWindow(host.bridge);
        const { actions, calls, selected } = picker();
        actions.selectModel({ selection });
        await settle(() => selected() === 1);
        expect(calls).toEqual(["release"]);
      } finally { host.close(); }
    }
  });
});

describe("the Tars run marker", () => {
  test("is the workflow id Tars starts its run with", () => {
    const row = tarsResponsibility({ id: TARS_RUN_UUID });
    expect(tarsWorkflow(row, TARS_AT).id).toBe(tarsWorkflowId(row.id));
    expect(isTarsWorkflowId(tarsWorkflowId(row.id))).toBe(true);
    for (const other of ["agent-run", "tars-helper", `tars-${TARS_RUN_UUID}-copy`, null]) expect(isTarsWorkflowId(other)).toBe(false);
  });
});
