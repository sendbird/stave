import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildStarterProfile } from "../src/lib/providers/auto-routing-profile";
import type { MissionCommandResponse } from "../src/lib/missions/api";
import { useAgentAssignmentsStore, type TaskAgent } from "../src/store/agent-assignments-store";
import { registerAgentRunBridge } from "../src/store/agent-run-send";
import { defaultSettings } from "../src/store/app-settings";
import { cancelPendingAutoRouting, skipPendingAutoRoutingClassifier } from "../src/store/auto-routing-dispatch";
import { usePendingAutoRoutingStore } from "../src/store/pending-auto-routing-store";

// #646: the composer is cleared on send, then the agent-run start is awaited.
// When the host refuses it, the prompt runs as a single turn, and nothing that
// send does to the composer may overwrite text typed while the start was pending.

const originalWindow = (globalThis as { window?: unknown }).window;
const TASK_ID = "task-agent-refused";
const PROMPT = "Add CSV export to the report page.";
const TYPED = "Also check the PDF export.";

let startedTurns = 0;
let classifierStarted: Promise<void>;
let refuseStart: (() => void) | null = null;

function installWindow() {
  startedTurns = 0;
  refuseStart = null;
  let started!: () => void;
  classifierStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const storage = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    api: {
      provider: {
        classifyRoute: () => {
          started();
          return new Promise(() => {});
        },
        cancelRouteClassification: async () => ({ ok: true }),
        startPushTurn: async () => {
          startedTurns += 1;
          return { ok: true, streamId: "stream-1", turnId: "turn-1" };
        },
        subscribeStreamEvents: () => () => {},
        abortTurn: async () => ({ ok: true, message: "aborted" }),
        cleanupTask: async () => ({ ok: true, message: "cleaned" }),
      },
    },
  };
  useAgentAssignmentsStore.setState({
    byTaskId: { [TASK_ID]: { agentConfigId: "implementer", agentName: "Implementer" } as TaskAgent },
  });
}

async function seedStore() {
  const { useAppStore } = await import("../src/store/app.store");
  // After the store's import, which registers the missions store's own bridge.
  registerAgentRunBridge({
    activeMission: () => null,
    start: () =>
      new Promise<MissionCommandResponse>((resolve) => {
        refuseStart = () => resolve({ ok: false, mission: null });
      }),
    cancel: async () => ({ ok: true, mission: null }),
    watchFirstPrompt: () => {},
  });
  const profile = buildStarterProfile("starter-balanced");
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    hasHydratedWorkspaces: true,
    workspaces: [{ id: "ws-agent", name: "Agent", updatedAt: "2026-10-01T00:00:00.000Z" }],
    activeWorkspaceId: "ws-agent",
    repositoryPath: "/tmp/stave-project",
    workspacePathById: { "ws-agent": "/tmp/stave-project/.stave/workspaces/agent" },
    workspaceBranchById: { "ws-agent": "agent" },
    workspaceDefaultById: { "ws-agent": false },
    taskWorkspaceIdById: { [TASK_ID]: "ws-agent" },
    tasks: [
      {
        id: TASK_ID,
        title: "Agent task",
        provider: "codex",
        updatedAt: "2026-10-01T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
    ],
    activeTaskId: TASK_ID,
    draftProvider: "codex",
    messagesByTask: { [TASK_ID]: [] },
    activeTurnIdsByTask: {},
    nativeSessionReadyByTask: {},
    providerSessionByTask: {},
    promptDraftByTask: {
      [TASK_ID]: { text: PROMPT, attachedFilePaths: [], attachments: [], runtimeOverrides: { autoRouting: true } },
    },
    failedSendsByTask: {},
    settings: {
      ...defaultSettings,
      autoRoutingEnabled: true,
      autoRoutingProfile: { ...profile, signals: { ...profile.signals, classifier: true } },
    },
  });
  return useAppStore;
}

/** Sends, types while the start is pending (unless `typed` is empty), then refuses the start. */
async function sendTypeAndRefuse(typed: string) {
  const useAppStore = await seedStore();
  const send = useAppStore.getState().sendUserMessage({ taskId: TASK_ID, content: PROMPT, turnOrigin: "conversation" });
  expect(useAppStore.getState().promptDraftByTask[TASK_ID]?.text).toBe("");
  if (typed) useAppStore.getState().updatePromptDraft({ taskId: TASK_ID, patch: { text: typed } });
  while (!refuseStart) await Bun.sleep(1);
  refuseStart();
  await classifierStarted;
  return { useAppStore, send };
}

beforeEach(() => {
  installWindow();
  usePendingAutoRoutingStore.setState({ byTaskId: {} });
});

afterEach(() => {
  cancelPendingAutoRouting(TASK_ID);
  registerAgentRunBridge(null);
  useAgentAssignmentsStore.setState({ byTaskId: {} });
  usePendingAutoRoutingStore.setState({ byTaskId: {} });
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("a refused agent-run start", () => {
  test("keeps text typed meanwhile when the single turn starts", async () => {
    const { useAppStore, send } = await sendTypeAndRefuse(TYPED);
    expect(useAppStore.getState().promptDraftByTask[TASK_ID]?.text).toBe(TYPED);
    expect(skipPendingAutoRoutingClassifier(TASK_ID)).toBe(true);
    expect((await send).status).toBe("started");
    expect(startedTurns).toBe(1);
    expect(useAppStore.getState().promptDraftByTask[TASK_ID]?.text).toBe(TYPED);
  });

  test("keeps text typed meanwhile when the single turn is stopped, parking the prompt", async () => {
    const { useAppStore, send } = await sendTypeAndRefuse(TYPED);
    useAppStore.getState().abortTaskTurn({ taskId: TASK_ID });
    expect(await send).toEqual({ status: "blocked" });
    expect(useAppStore.getState().promptDraftByTask[TASK_ID]?.text).toBe(TYPED);
    expect(useAppStore.getState().failedSendsByTask[TASK_ID]).toEqual([expect.objectContaining({ text: PROMPT })]);
  });

  test("gives the prompt back to a composer still empty since the send", async () => {
    const { useAppStore, send } = await sendTypeAndRefuse("");
    useAppStore.getState().abortTaskTurn({ taskId: TASK_ID });
    expect(await send).toEqual({ status: "blocked" });
    expect(useAppStore.getState().promptDraftByTask[TASK_ID]?.text).toBe(PROMPT);
    expect(useAppStore.getState().failedSendsByTask[TASK_ID]).toBeUndefined();
  });
});
