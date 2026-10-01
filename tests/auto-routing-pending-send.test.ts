import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildStarterProfile } from "../src/lib/providers/auto-routing-profile";
import { defaultSettings } from "../src/store/app-settings";
import { AUTO_ROUTING_CLASSIFIER_SKIPPED_RATIONALE } from "../src/store/auto-routing";
import {
  cancelPendingAutoRouting,
  skipPendingAutoRoutingClassifier,
} from "../src/store/auto-routing-dispatch";
import { usePendingAutoRoutingStore } from "../src/store/pending-auto-routing-store";

const originalWindow = (globalThis as { window?: unknown }).window;
const TASK_ID = "task-auto-pending";
const PROMPT = "Refactor the session module onto the new interface.";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
}

let startedTurns = 0;
let classifierStarted: Promise<void>;

function installWindow() {
  startedTurns = 0;
  let started!: () => void;
  classifierStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  (globalThis as { window?: unknown }).window = {
    localStorage: createMemoryStorage(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    api: {
      provider: {
        // Never answers: the test decides whether the send is cancelled or
        // skips ahead on local rules.
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
}

async function seedStore() {
  const { useAppStore } = await import("../src/store/app.store");
  const profile = buildStarterProfile("starter-balanced");
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    hasHydratedWorkspaces: true,
    workspaces: [
      { id: "ws-auto", name: "Auto", updatedAt: "2026-09-01T00:00:00.000Z" },
    ],
    activeWorkspaceId: "ws-auto",
    repositoryPath: "/tmp/stave-project",
    workspacePathById: { "ws-auto": "/tmp/stave-project/.stave/workspaces/auto" },
    workspaceBranchById: { "ws-auto": "auto" },
    workspaceDefaultById: { "ws-auto": false },
    taskWorkspaceIdById: { [TASK_ID]: "ws-auto" },
    tasks: [
      {
        id: TASK_ID,
        title: "Auto pending",
        provider: "codex",
        updatedAt: "2026-09-01T00:00:00.000Z",
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
      [TASK_ID]: {
        text: PROMPT,
        attachedFilePaths: [],
        attachments: [],
        runtimeOverrides: { autoRouting: true },
      },
    },
    settings: {
      ...defaultSettings,
      autoRoutingEnabled: true,
      autoRoutingProfile: {
        ...profile,
        signals: { ...profile.signals, classifier: true },
      },
    },
  });
  return useAppStore;
}

beforeEach(() => {
  installWindow();
  usePendingAutoRoutingStore.setState({ byTaskId: {} });
});

afterEach(() => {
  cancelPendingAutoRouting(TASK_ID);
  usePendingAutoRoutingStore.setState({ byTaskId: {} });
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("a send waiting on the Auto classifier", () => {
  test("shows the prompt as a pending row, and Stop puts it back in the composer", async () => {
    const useAppStore = await seedStore();
    const send = useAppStore
      .getState()
      .sendUserMessage({ taskId: TASK_ID, content: PROMPT });
    await classifierStarted;

    const pending = usePendingAutoRoutingStore.getState().byTaskId[TASK_ID];
    expect(pending?.phase).toBe("classifying");
    expect(pending?.userMessage.role).toBe("user");
    expect(pending?.userMessage.content).toBe(PROMPT);
    // The real row only lands once the turn starts.
    expect(useAppStore.getState().messagesByTask[TASK_ID]).toEqual([]);
    expect(useAppStore.getState().promptDraftByTask[TASK_ID]?.text).toBe("");

    useAppStore.getState().abortTaskTurn({ taskId: TASK_ID });
    expect(await send).toEqual({ status: "blocked" });
    expect(usePendingAutoRoutingStore.getState().byTaskId[TASK_ID]).toBeUndefined();
    expect(useAppStore.getState().promptDraftByTask[TASK_ID]?.text).toBe(PROMPT);
    expect(useAppStore.getState().messagesByTask[TASK_ID]).toEqual([]);
    expect(startedTurns).toBe(0);
  });

  test("Start now runs the turn on local rules and hands the row to the real one", async () => {
    const useAppStore = await seedStore();
    const send = useAppStore
      .getState()
      .sendUserMessage({ taskId: TASK_ID, content: PROMPT });
    await classifierStarted;

    expect(skipPendingAutoRoutingClassifier(TASK_ID)).toBe(true);
    const result = await send;
    expect(result.status).toBe("started");
    expect(usePendingAutoRoutingStore.getState().byTaskId[TASK_ID]).toBeUndefined();

    await Bun.sleep(5);
    const messages = useAppStore.getState().messagesByTask[TASK_ID] ?? [];
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[0]?.content).toBe(PROMPT);
    const resolution = messages[1]?.modelResolution;
    expect(resolution?.source).toBe("classifier_fallback");
    expect(
      resolution?.rationale.startsWith(AUTO_ROUTING_CLASSIFIER_SKIPPED_RATIONALE),
    ).toBe(true);
    expect(typeof resolution?.classifierElapsedMs).toBe("number");
    expect(startedTurns).toBe(1);
  });
});
