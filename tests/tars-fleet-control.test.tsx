import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { tarsRecordText } from "./tars-record-text";
import path from "node:path";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { describeFleetTarsOutcome, FleetTaskControlPanel } from "../src/components/layout/FleetTaskControlPanel";
import { useAgentRunActions, type AgentRunActions } from "../src/components/agent-runs/useAgentRunActions";
import { AgentRunLineView } from "../src/components/agent-runs/AgentRunLine";
import { TarsConversation } from "../src/components/tars/TarsConversation";
import { TarsOwnerLabel } from "../src/components/tars/TarsOwnerBadge";
import { FleetTaskTableView } from "../src/components/layout/FleetTaskTable";
import type { FleetTaskRow } from "../src/lib/fleet/task-rows";
import { routeTarsOwnedIntent } from "../src/store/tars-owned-control";
import { publishTarsSnapshot, useTarsSnapshotStore } from "../src/store/tars-snapshot-store";
import type { TarsConversationState } from "../src/components/tars/use-tars-conversation";
import { findTarsResponsibility, resolveTarsOwner, tarsOperationFor } from "../src/lib/tars/ownership";
import { TarsActInputSchema, TarsConversationSchema, type TarsActInput, type TarsActResult } from "../src/lib/tars/conversation";
import type { TarsBridgeApi, TarsResponsibility, TarsSnapshot } from "../src/lib/tars/types";
import { useAppStore } from "../src/store/app.store";
import { useAgentRunsStore } from "../src/store/agent-runs-store";
import { agentRunDetail, agentRunFixture } from "./fixtures/agent-run-fixtures";
import { settle, TARS_AT, tarsHostBridge, tarsResponsibility } from "./fixtures/tars-host-bridge";
import type { Task } from "../src/types/chat";
import { useFleetAgentRunsStore } from "../src/store/fleet-agent-runs-store";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";

const AT = TARS_AT;
const TARGET = { repositoryPath: "/tmp/repo", workspaceId: "ws-1", taskId: "task-1", turnId: "turn-1" };
const originalWindow = globalThis.window;

const responsibility = tarsResponsibility;
const hostBridge = tarsHostBridge;

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return isValidElement(node) ? textOf((node.props as { children?: ReactNode }).children) : "";
}

/** Render the panel and keep its element tree, so a test presses the real handlers without a DOM. */
function renderPanel() {
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() { sink.tree = FleetTaskControlPanel({ target: TARGET, onOpenTask() {}, onClose() {} }); return sink.tree; }
  const html = renderToStaticMarkup(createElement(Capture));
  const buttons: Array<{ label: string; onClick: () => void }> = [];
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!isValidElement(node)) return;
    const props = node.props as { children?: ReactNode; onClick?: () => void };
    if (props.onClick) buttons.push({ label: textOf(props.children), onClick: props.onClick });
    visit(props.children);
  };
  visit(sink.tree);
  return { html, labels: buttons.map((button) => button.label), press: (label: string) => buttons.find((button) => button.label === label)!.onClick() };
}

function task(id: string): Task {
  return { id, title: id, provider: "codex", updatedAt: AT, unread: false, archivedAt: null, controlMode: "interactive", controlOwner: "stave" } as Task;
}

/* Server rendering reads each store's initial state, so the scene is seeded there and in the live state the handlers read. */
const appInitial = useAppStore.getInitialState();
const fleetRunsInitial = useFleetAgentRunsStore.getInitialState();
const originalFleetRuns = { details: fleetRunsInitial.details, loaded: fleetRunsInitial.loaded };
/** Fleet's run mirror, as rendering and the click both read it. */
function seedFleetRuns(details: AgentRunDetail[]) {
  const state = { details: Object.fromEntries(details.map((detail) => [detail.agentRun.id, detail])), loaded: true };
  Object.assign(fleetRunsInitial, state);
  useFleetAgentRunsStore.setState(state);
}
/** A run you started yourself on task-1 after Tars lost it. */
const userRun = () => agentRunDetail(agentRunFixture({ id: "user-run", leadTaskId: "task-1" }));
const tarsRun = (events: AgentRunDetail["events"] = []) => agentRunDetail(agentRunFixture({ id: "agent-run-1", leadTaskId: "task-1" }), events);
const tarsInitial = useTarsSnapshotStore.getInitialState();
const APP_FIELDS = ["repositoryPath", "activeWorkspaceId", "workspaces", "recentRepositories", "taskWorkspaceIdById", "tasks", "messagesByTask",
  "activeTurnIdsByTask", "abortTaskTurn"] as const;
const originalApp = Object.fromEntries(APP_FIELDS.map((key) => [key, appInitial[key]]));
const originalRunCommand = useAgentRunsStore.getState().runCommand;
let aborts: Array<{ taskId: string; keepAgentRun?: boolean }> = [];
let runCommands: string[] = [];

/** Make the last published snapshot what the next render reads. */
function syncTarsRender() {
  tarsInitial.snapshot = useTarsSnapshotStore.getState().snapshot;
}
function seedTars(snapshot: TarsSnapshot) {
  publishTarsSnapshot(snapshot);
  syncTarsRender();
}

beforeEach(() => {
  aborts = []; runCommands = [];
  const scene = {
    repositoryPath: TARGET.repositoryPath, activeWorkspaceId: TARGET.workspaceId,
    workspaces: [{ id: TARGET.workspaceId, name: "ws-1" }] as never, recentRepositories: [], taskWorkspaceIdById: {},
    tasks: [task("task-1")], messagesByTask: { "task-1": [] }, activeTurnIdsByTask: { "task-1": "turn-1" },
    abortTaskTurn: ((args: { taskId: string; keepAgentRun?: boolean }) => { aborts.push(args); }) as never,
  };
  Object.assign(appInitial, scene);
  useAppStore.setState(scene);
  useAgentRunsStore.setState({ runCommand: (async (command: string) => { runCommands.push(command); return { ok: true }; }) as never });
});
afterEach(() => {
  Object.assign(globalThis, { window: originalWindow });
  Object.assign(appInitial, originalApp);
  useAppStore.setState(originalApp);
  useAgentRunsStore.setState({ runCommand: originalRunCommand });
  useTarsSnapshotStore.setState({ snapshot: null });
  tarsInitial.snapshot = null;
  Object.assign(fleetRunsInitial, originalFleetRuns);
  useFleetAgentRunsStore.setState(originalFleetRuns);
});

describe("Tars ownership resolver", () => {
  const snapshot = { responsibilities: [responsibility()] };
  test("owned: a task or its own run resolves to the responsibility id and revision", () => {
    expect(resolveTarsOwner(snapshot, { taskId: "task-1", workspaceId: "ws-1" }))
      .toEqual({ responsibilityId: "goal", revision: 4, state: "running", title: "Verified result" });
    expect(resolveTarsOwner(snapshot, { agentRunId: "agent-run-1" })?.responsibilityId).toBe("goal");
    // The snapshot's own row, so a store selector stays stable.
    expect(findTarsResponsibility(snapshot.responsibilities, { taskId: "task-1" })).toBe(snapshot.responsibilities[0]!);
  });
  test("a known run must be the responsibility's own; an unknown one leaves the task to decide", () => {
    const blocked = { responsibilities: [responsibility({ state: "blocked" })] };
    expect(resolveTarsOwner(blocked, { taskId: "task-1", agentRunId: "user-run", agentRunWorkflowId: "agent-run" })).toBeNull();
    expect(resolveTarsOwner(blocked, { taskId: "task-1", agentRunId: null })).toBeNull();
    expect(resolveTarsOwner(blocked, { taskId: "task-1" })?.responsibilityId).toBe("goal");
    // Before Tars records its run, only a run whose workflow names the responsibility is its own.
    const preparing = { responsibilities: [responsibility({ state: "preparing", agentRunId: null })] };
    expect(resolveTarsOwner(preparing, { taskId: "task-1", agentRunId: "run-x", agentRunWorkflowId: "tars-goal" })?.responsibilityId).toBe("goal");
    expect(resolveTarsOwner(preparing, { taskId: "task-1", agentRunId: "run-x", agentRunWorkflowId: "agent-run" })).toBeNull();
    expect(resolveTarsOwner(preparing, { taskId: "task-1", agentRunId: null })?.responsibilityId).toBe("goal");
  });
  test("not owned: another task, another workspace, or another run on the same task", () => {
    expect(resolveTarsOwner(snapshot, { taskId: "task-2" })).toBeNull();
    expect(resolveTarsOwner(snapshot, { taskId: "task-1", workspaceId: "ws-2" })).toBeNull();
    expect(resolveTarsOwner(snapshot, { taskId: "task-1", agentRunId: "agent-run-2" })).toBeNull();
    expect(resolveTarsOwner(snapshot, {})).toBeNull();
    expect(resolveTarsOwner(null, { taskId: "task-1" })).toBeNull();
  });
  test("ended or taken-over work is not Tars's", () => {
    for (const state of ["completed", "cancelled", "takenOver"] as const) {
      expect(resolveTarsOwner({ responsibilities: [responsibility({ state })] }, { taskId: "task-1" })).toBeNull();
    }
  });
  test("while Tars holds the work, stop is Tars's pause (none once paused) and take over its takeover", () => {
    expect(tarsOperationFor(responsibility(), "pause")).toBe("pause");
    expect(tarsOperationFor(responsibility({ state: "blocked" }), "pause")).toBe("pause");
    // Already paused: a stop needs no Tars control and ends only your own turn.
    expect(tarsOperationFor(responsibility({ state: "paused" }), "pause")).toBeNull();
    expect(tarsOperationFor(responsibility({ state: "takenOver" }), "pause")).toBeNull();
    expect(tarsOperationFor(responsibility({ state: "paused" }), "takeover")).toBe("takeover");
    expect(tarsOperationFor(null, "takeover")).toBeNull();
    // Only work Tars paused resumes through Tars; a usage-limit wait on running or blocked work is the run's own.
    expect(tarsOperationFor(responsibility({ state: "paused" }), "resume")).toBe("resume");
    expect(tarsOperationFor(responsibility(), "resume")).toBeNull();
    expect(tarsOperationFor(responsibility({ state: "blocked" }), "resume")).toBeNull();
    expect(tarsOperationFor(responsibility({ state: "takenOver" }), "resume")).toBeNull();
  });
});

describe("Fleet controls on Tars-owned work", () => {
  test("pause and take over go through tars:act from Fleet; the turn is never stopped directly and the run is never cancelled", async () => {
    const host = hostBridge();
    try {
      seedTars(await host.runtime.get());
      Object.assign(globalThis, { window: { api: { tars: host.bridge } } });
      const owned = renderPanel();
      expect(owned.html).toContain("data-tars-owner");
      expect(owned.labels).toContain("Pause");
      expect(owned.labels).toContain("Take over");
      expect(owned.labels).not.toContain("Stop");
      owned.press("Pause");
      await settle(() => useTarsSnapshotStore.getState().snapshot?.responsibilities[0]?.state === "paused");
      expect(host.acts).toEqual([{ requestId: expect.stringMatching(/^fleet:/), responsibilityId: host.row.id, expectedRevision: host.row.revision,
        operation: "pause", source: "fleet" }]);

      syncTarsRender();
      const paused = renderPanel();
      expect(paused.labels).toContain("Take over");
      // Paused by Tars: nothing to pause; Stop ends only your own turn (covered in tars-task-stop).
      expect(paused.labels).not.toContain("Pause");
      expect(paused.labels).toContain("Stop");
      paused.press("Take over");
      await settle(() => useTarsSnapshotStore.getState().snapshot?.responsibilities[0]?.state === "takenOver");
      await host.runtime.drain();
      expect(host.acts.map((input) => [input.operation, input.source])).toEqual([["pause", "fleet"], ["takeover", "fleet"]]);
      expect(host.runControls).toEqual(["pause", "takeover"]);
      // The pause settled the run, so only the in-flight turn stops; the run is kept, never cancelled.
      expect(aborts).toEqual([{ taskId: "task-1", keepAgentRun: true }]);
      expect(runCommands).toEqual([]);

      // Taken over: the work is yours, so Fleet stops your own turn directly and shows no Tars owner.
      syncTarsRender();
      const yours = renderPanel();
      expect(yours.html).not.toContain("data-tars-owner");
      expect(yours.labels).toContain("Stop");
      expect(yours.labels).not.toContain("Take over");

      const conversation = TarsConversationSchema.parse({ settings: null, activity: [], messages: [], receipts: [], records: host.conversations.listActions() });
      const state = { conversation, error: null, busy: false, available: true, refresh: async () => {} } as unknown as TarsConversationState;
      const render = () => renderToStaticMarkup(createElement(TarsConversation, { state, name: "Tars", titleOf: () => "Verified result",
        initialSettings: { providerId: "codex", model: "test-model", maxTurns: 30 } }));
      expect(tarsRecordText(render())).toContain("Pause Verified result Applied");
      expect(tarsRecordText(render())).toContain("Take over Verified result Applied");
      expect(render()).toContain('aria-label="You did this in Fleet"');
      applyAppLocale("ko"); await i18n.changeLanguage("ko");
      try { expect(tarsRecordText(render())).toContain("일시 정지 Verified result 적용됨"); } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
    } finally { host.close(); }
  });

  test("on a row Tars already paused, Fleet's Stop ends only your own turn and keeps the run", async () => {
    const host = hostBridge({ state: "paused" });
    try {
      seedTars(await host.runtime.get());
      Object.assign(globalThis, { window: { api: { tars: host.bridge } } });
      const panel = renderPanel();
      expect(panel.html).toContain("data-tars-owner");
      expect(panel.labels).not.toContain("Pause");
      panel.press("Stop");
      await settle(() => aborts.length === 1);
      expect(aborts).toEqual([{ taskId: "task-1", keepAgentRun: true }]);
      expect(host.acts).toEqual([]);
      expect(runCommands).toEqual([]);
    } finally { host.close(); }
  });

  test("your own run on a task Tars lost: Fleet, the task view and the table all treat it as yours", async () => {
    const host = hostBridge({ state: "blocked" });
    try {
      seedTars(await host.runtime.get());
      seedFleetRuns([userRun()]);
      Object.assign(globalThis, { window: { api: { tars: host.bridge } } });
      const panel = renderPanel();
      expect(panel.html).not.toContain("data-tars-owner");
      expect(panel.labels).toContain("Stop");
      expect(panel.labels).not.toContain("Take over");
      panel.press("Stop");
      await settle(() => aborts.length === 1);
      // The store's Stop then cancels your run, exactly as the task view's Stop does.
      expect(aborts).toEqual([{ taskId: "task-1", keepAgentRun: false }]);
      expect(host.acts).toEqual([]);
      const sink: { actions: AgentRunActions } = { actions: {} };
      function Capture() { sink.actions = useAgentRunActions(userRun()); return null; }
      renderToStaticMarkup(createElement(Capture));
      expect(sink.actions.tarsOwned).toBe(false);
      const row = { key: "task-1", repositoryPath: "/tmp/repo", repositoryName: "repo", workspaceId: "ws-1", workspaceName: "ws-1", workspaceBranch: null,
        workspaceActivity: "live", task: task("task-1"), status: "running", need: null, waitingSince: null, activeTurnId: "turn-1", rank: 3 } as unknown as FleetTaskRow;
      expect(renderToStaticMarkup(createElement(FleetTaskTableView, { rows: [row], nowMs: Date.parse(AT), onOpenTask() {} }))).not.toContain("data-tars-owner");
      // Tars's own run on the same task is still Tars's.
      seedFleetRuns([tarsRun()]);
      expect(renderPanel().html).toContain("data-tars-owner");
    } finally { host.close(); }
  });

  test("a pause Tars refuses keeps the run's automatic turn; your own turn still stops", async () => {
    const snapshot: TarsSnapshot = { identity: { id: "personal", name: "Tars", instructions: "", updatedAt: AT }, responsibilities: [responsibility()], runtime: "desktop" };
    const bridge: TarsBridgeApi = {
      get: async () => snapshot, create: async () => snapshot, updateIdentity: async () => snapshot,
      act: async (input): Promise<TarsActResult> => ({ snapshot, record: { requestId: input.requestId, source: input.source, requestHash: "e".repeat(64),
        action: { kind: "control", responsibilityId: input.responsibilityId, expectedRevision: input.expectedRevision, operation: input.operation },
        status: "rejected", error: "diagnostic", reason: "stale", revision: 2, createdAt: AT, updatedAt: AT } }),
    };
    seedTars(snapshot);
    Object.assign(globalThis, { window: { api: { tars: bridge } } });
    seedFleetRuns([tarsRun()]);
    renderPanel().press("Pause");
    await Bun.sleep(30);
    expect(aborts).toEqual([]);
    const userTurn = { id: "event-1", agentRunId: "agent-run-1", sequence: 1, kind: "user-turn", idempotencyKey: null, detail: { turnId: "turn-1" }, createdAt: AT } as AgentRunDetail["events"][number];
    seedFleetRuns([tarsRun([userTurn])]);
    renderPanel().press("Pause");
    await settle(() => aborts.length === 1);
    expect(aborts).toEqual([{ taskId: "task-1", keepAgentRun: true }]);
  });

  test("a row Tars does not own keeps the direct stop and never calls tars:act", async () => {
    const host = hostBridge({ taskId: "another-task" });
    try {
      seedTars(await host.runtime.get());
      Object.assign(globalThis, { window: { api: { tars: host.bridge } } });
      const panel = renderPanel();
      expect(panel.html).not.toContain("data-tars-owner");
      expect(panel.labels).toContain("Stop");
      expect(panel.labels).not.toContain("Take over");
      panel.press("Stop");
      await settle(() => aborts.length === 1);
      expect(aborts).toEqual([{ taskId: "task-1", keepAgentRun: false }]);
      expect(host.acts).toEqual([]);
    } finally { host.close(); }
  });

  test("newly delegated work is read fresh at the click, so a stale label cannot stop it directly", async () => {
    const host = hostBridge();
    try {
      // The last snapshot predates the delegation; the control reads ownership again.
      const outcome = await routeTarsOwnedIntent({ target: { taskId: "task-1", workspaceId: "ws-1" }, intent: "pause", source: "fleet", bridge: host.bridge });
      expect(outcome.kind).toBe("applied");
      expect(host.acts.map((input) => input.source)).toEqual(["fleet"]);
      // Without a Tars bridge (browser runtime), every row acts as it always has.
      expect(await routeTarsOwnedIntent({ target: { taskId: "task-1" }, intent: "pause", source: "fleet" })).toEqual({ kind: "direct" });
    } finally { host.close(); }
  });

  test("an unreadable ownership never stops Tars's work directly", async () => {
    publishTarsSnapshot({ identity: { id: "personal", name: "Tars", instructions: "", updatedAt: AT }, responsibilities: [responsibility()], runtime: "desktop" });
    const acts: TarsActInput[] = [];
    const bridge: TarsBridgeApi = { get: () => Promise.reject(new Error("host unavailable")), create: () => Promise.reject(new Error("unexpected")),
      updateIdentity: () => Promise.reject(new Error("unexpected")), act: async (input) => { acts.push(input); throw new Error("unexpected"); } };
    const owned = await routeTarsOwnedIntent({ target: { taskId: "task-1" }, intent: "takeover", source: "fleet", bridge });
    expect(owned).toEqual({ kind: "failed", reasonKey: "shell:tars.controlReasons.unknown" });
    expect(await routeTarsOwnedIntent({ target: { taskId: "task-2" }, intent: "pause", source: "fleet", bridge })).toEqual({ kind: "direct" });
    expect(acts).toEqual([]);
  });

  test("a refusal from Fleet shows the translated reason, never the host diagnostic", async () => {
    const diagnostic = "Host diagnostic that must stay out of the interface.";
    const snapshot: TarsSnapshot = { identity: { id: "personal", name: "Tars", instructions: "", updatedAt: AT }, responsibilities: [responsibility()], runtime: "desktop" };
    const bridge: TarsBridgeApi = {
      get: async () => snapshot, create: async () => snapshot, updateIdentity: async () => snapshot,
      act: async (input): Promise<TarsActResult> => ({ snapshot, record: { requestId: input.requestId, source: input.source, requestHash: "e".repeat(64),
        action: { kind: "control", responsibilityId: input.responsibilityId, expectedRevision: input.expectedRevision, operation: input.operation },
        status: "rejected", error: diagnostic, reason: "ownershipLost", revision: 2, createdAt: AT, updatedAt: AT } }),
    };
    const outcome = await routeTarsOwnedIntent({ target: { taskId: "task-1" }, intent: "pause", source: "fleet", bridge });
    if (outcome.kind === "direct") throw new Error("expected Tars to settle the control");
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    try {
      const status = describeFleetTarsOutcome(outcome);
      expect(status.tone).toBe("error");
      expect(status.text).toBe("이 Task의 담당이 바뀌어 Tars가 이어서 진행할 수 없습니다. 해당 Task에서 계속하세요.");
      expect(status.text).not.toContain(diagnostic);
    } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
    expect(describeFleetTarsOutcome(outcome).text).toContain("ownership changed");
  });

  test("the owner label shows only on rows an active Tars responsibility holds", () => {
    seedTars({ identity: { id: "personal", name: "Tars", instructions: "", updatedAt: AT },
      responsibilities: [responsibility(), responsibility({ id: "ended", taskId: "task-3", state: "completed" })], runtime: "desktop" });
    const label = (taskId: string) => renderToStaticMarkup(createElement(TarsOwnerLabel, { target: { taskId, workspaceId: "ws-1" } }));
    expect(label("task-1")).toContain(">Tars<");
    expect(label("task-2")).toBe("");
    expect(label("task-3")).toBe("");
    // In Fleet's table, only the owned row carries the mark.
    const row = (id: string) => ({ key: id, repositoryPath: "/tmp/repo", repositoryName: "repo", workspaceId: "ws-1", workspaceName: "ws-1",
      workspaceBranch: null, workspaceActivity: "live", task: task(id), status: "idle", need: null, waitingSince: null, activeTurnId: null, rank: 3 }) as unknown as FleetTaskRow;
    const html = renderToStaticMarkup(createElement(FleetTaskTableView, { rows: [row("task-1"), row("task-2"), row("task-3")], nowMs: Date.parse(AT), onOpenTask() {} }));
    const segment = (id: string) => html.split(`data-fleet-task-table-row="${id}"`)[1]!.split("data-fleet-task-table-row")[0]!;
    expect(segment("task-1")).toContain("data-tars-owner");
    expect(segment("task-2")).not.toContain("data-tars-owner");
    expect(segment("task-3")).not.toContain("data-tars-owner");
  });
});

describe("task view run controls on Tars-owned work", () => {
  function captureActions(detail = agentRunDetail(agentRunFixture())) {
    const sink: { actions: AgentRunActions } = { actions: {} };
    function Capture() { sink.actions = useAgentRunActions(detail); return null; }
    renderToStaticMarkup(createElement(Capture));
    return sink.actions;
  }

  test("take control is Tars's takeover from the task view: the run is paused for you, never cancelled or released", async () => {
    const host = hostBridge();
    try {
      seedTars(await host.runtime.get());
      Object.assign(globalThis, { window: { api: { tars: host.bridge } } });
      const actions = captureActions();
      expect(actions.tarsOwned).toBe(true);
      actions.onTakeControl!();
      await settle(() => useTarsSnapshotStore.getState().snapshot?.responsibilities[0]?.state === "takenOver");
      await host.runtime.drain();
      expect(host.acts.map((input) => [input.operation, input.source])).toEqual([["takeover", "task"]]);
      expect(host.runControls).toEqual(["takeover"]);
      expect(runCommands).toEqual([]);
      const conversation = TarsConversationSchema.parse({ settings: null, activity: [], messages: [], receipts: [], records: host.conversations.listActions() });
      const state = { conversation, error: null, busy: false, available: true, refresh: async () => {} } as unknown as TarsConversationState;
      applyAppLocale("ko"); await i18n.changeLanguage("ko");
      try {
        const html = renderToStaticMarkup(createElement(TarsConversation, { state, name: "Tars", initialSettings: { providerId: "codex", model: "test-model", maxTurns: 30 } }));
        expect(tarsRecordText(html)).toContain("직접 맡기 적용됨");
        expect(html).toContain('aria-label="작업 화면에서 직접 한 일입니다"');
      } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
    } finally { host.close(); }
  });

  test("a run Tars does not own keeps its stop and take control", async () => {
    const host = hostBridge({ taskId: "another-task", agentRunId: "another-run" });
    try {
      seedTars(await host.runtime.get());
      Object.assign(globalThis, { window: { api: { tars: host.bridge } } });
      const actions = captureActions();
      expect(actions.tarsOwned).toBe(false);
      actions.onStop!();
      await settle(() => aborts.length === 1);
      actions.onTakeControl!();
      await settle(() => runCommands.length === 1);
      expect(runCommands).toEqual(["cancel"]);
      expect(host.acts).toEqual([]);
    } finally { host.close(); }
  });

  test("the run line names Tars as the owner and says take control keeps the run", () => {
    const detail = agentRunDetail(agentRunFixture());
    const line = (actions: AgentRunActions) => renderToStaticMarkup(createElement(AgentRunLineView, { detail, nowPhrase: null, now: Date.parse(AT), reducedMotion: true, actions }));
    expect(line({ onStop() {}, onTakeControl() {}, tarsOwned: true })).toContain("data-tars-owner");
    expect(line({ onStop() {}, onTakeControl() {} })).not.toContain("data-tars-owner");
  });
});

describe("tars:act source contract", () => {
  test("the schema accepts Fleet and task-view sources and rejects unknown ones", () => {
    const input = { requestId: "fleet:1", responsibilityId: "goal", expectedRevision: 1, operation: "pause" };
    for (const source of ["click", "fleet", "task"]) expect(TarsActInputSchema.safeParse({ ...input, source }).success).toBe(true);
    for (const source of ["tray", "Fleet", "", undefined]) expect(TarsActInputSchema.safeParse({ ...input, source }).success).toBe(false);
  });

  test("main IPC forwards the new sources and refuses unknown ones before dispatch", () => {
    const source = `
      import { mock } from "bun:test";
      const handlers = new Map(); const calls = [];
      mock.module("electron", () => ({ webContents: { getAllWebContents: () => [] }, ipcMain: { handle: (key, callback) => handlers.set(key, callback) } }));
      mock.module("./electron/main/host-service-client", () => ({ onHostServiceEvent: () => () => {}, invokeHostService: async (...args) => { calls.push(args); return { ok: true }; } }));
      mock.module("./electron/main/tars-conversation-instance", () => ({ getTarsConversationService: async () => { throw new Error("unexpected"); } }));
      const { registerTarsHandlers } = await import("./electron/main/ipc/tars"); registerTarsHandlers();
      const input = { requestId: "fleet:1", responsibilityId: "goal", expectedRevision: 1, operation: "takeover" };
      await handlers.get("tars:act")(null, { ...input, source: "fleet" });
      await handlers.get("tars:act")(null, { ...input, requestId: "task:1", source: "task" });
      let refused = 0;
      for (const invalid of [{ ...input, source: "tray" }, { ...input, source: "Fleet" }, { ...input }]) {
        try { await handlers.get("tars:act")(null, invalid); } catch { refused++; }
      }
      console.log(JSON.stringify({ calls, refused }));
    `;
    const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    const output = JSON.parse(result.stdout.toString());
    expect(output.refused).toBe(3);
    expect(output.calls.map((call: [string, TarsActInput]) => [call[0], call[1].source])).toEqual([["tars.act", "fleet"], ["tars.act", "task"]]);
  });
});

describe("Resume and Take over from any task surface", () => {
  const runResume: string[] = [];
  const storeInitial = useAgentRunsStore.getState();
  afterEach(() => { useAgentRunsStore.setState({ details: storeInitial.details, workspaceId: storeInitial.workspaceId }); });
  /** The real store `runCommand` over the bridge's own response shape (`{ ok, agentRun }`); `refreshed` is what a read returns afterwards. */
  function withRealRunCommand(detail: AgentRunDetail, bridge: TarsBridgeApi, refreshed: AgentRunDetail = detail) {
    runResume.length = 0;
    const call = (name: string) => async () => { runResume.push(name); return { ok: true, agentRun: detail }; };
    Object.assign(globalThis, { window: { api: { tars: bridge, agentRuns: { resume: call("resume"), takeOver: call("takeOver"), get: async () => ({ ok: true, agentRun: refreshed }) } } } });
    useAgentRunsStore.setState({ runCommand: originalRunCommand, workspaceId: detail.agentRun.workspaceId, details: { [detail.agentRun.id]: detail } });
  }

  test("Resume on a run Tars paused goes through Tars, not straight to the run", async () => {
    const host = hostBridge({ state: "paused" });
    try {
      seedTars(await host.runtime.get());
      const resumed = agentRunDetail(agentRunFixture({ id: "agent-run-1", leadTaskId: "task-1", state: "running" }));
      withRealRunCommand(tarsRun(), host.bridge, resumed);
      const result = await useAgentRunsStore.getState().runCommand("resume", { agentRunId: "agent-run-1" });
      expect(result.ok).toBe(true);
      expect(host.acts.map((input) => [input.operation, input.source])).toEqual([["resume", "task"]]);
      expect(runResume).toEqual([]);
      // The store reads the run again, so the surface shows what Tars's resume did.
      await settle(() => useAgentRunsStore.getState().details["agent-run-1"] === resumed);
      expect(useAgentRunsStore.getState().details["agent-run-1"]).toBe(resumed);
    } finally { host.close(); }
  });

  test("Take over on a run Tars holds is Tars's takeover; Resume of the run's own wait stays direct", async () => {
    const host = hostBridge();
    try {
      seedTars(await host.runtime.get());
      withRealRunCommand(tarsRun(), host.bridge);
      // Running work: a usage-limit Resume is the run's own and Tars records nothing.
      await useAgentRunsStore.getState().runCommand("resume", { agentRunId: "agent-run-1" });
      expect(host.acts).toEqual([]);
      expect(runResume).toEqual(["resume"]);
      await useAgentRunsStore.getState().runCommand("takeOver", { agentRunId: "agent-run-1" });
      expect(host.acts.map((input) => input.operation)).toEqual(["takeover"]);
      expect(runResume).toEqual(["resume"]);
    } finally { host.close(); }
  });

  test("a run no Tars responsibility holds acts directly", async () => {
    const host = hostBridge({ state: "takenOver" });
    try {
      seedTars(await host.runtime.get());
      withRealRunCommand(userRun(), host.bridge);
      await useAgentRunsStore.getState().runCommand("resume", { agentRunId: "user-run" });
      expect(host.acts).toEqual([]);
      expect(runResume).toEqual(["resume"]);
    } finally { host.close(); }
  });
  test("when Tars cannot be asked, Resume and Take over do not fall through to the run", async () => {
    const host = hostBridge({ state: "paused" });
    try {
      seedTars(await host.runtime.get());
      const unreachable: TarsBridgeApi = { ...host.bridge, act: async () => { throw new Error("host gone"); } };
      withRealRunCommand(tarsRun(), unreachable);
      const resumed = await useAgentRunsStore.getState().runCommand("resume", { agentRunId: "agent-run-1" });
      const taken = await useAgentRunsStore.getState().runCommand("takeOver", { agentRunId: "agent-run-1" });
      expect([resumed.ok, taken.ok]).toEqual([false, false]);
      expect(runResume).toEqual([]);
    } finally { host.close(); }
  });
});
