import { toast } from "../src/lib/notifications/toast";
import { expect, test, spyOn } from "bun:test";
import { defaultSettings } from "../src/store/app-settings";
import {
  buildAutoRoutingModelResolution,
  cancelPendingAutoRouting,
  resolveAutoRoutingForSend,
  shouldClassifyAutoRoute,
  skipPendingAutoRoutingClassifier,
} from "../src/store/auto-routing-dispatch";
import { AUTO_ROUTING_CLASSIFIER_SKIPPED_RATIONALE } from "../src/lib/routing/auto-routing";
import { AutoRoutingModelResolutionSchema } from "../src/lib/providers/model-resolution";
import { buildStarterProfile } from "../src/lib/providers/auto-routing-profile";

test("default Auto dispatch uses the classifier bridge for an execute turn", async () => {
  const previousWindow = globalThis.window;
  let phase: string | undefined;
  let calls = 0;
  globalThis.window = { api: { provider: {
    classifyRoute: async (request: { phase?: string }) => {
      calls++;
      phase = request.phase;
      return { ok: true,
        classification: { version: 2, intent: "explain", complexity: "low",
          risk: "normal", continuity: "new", evidenceCodes: ["explicit_request"] },
        utility: { providerId: "codex", model: "gpt-5.6-luna", selectionReason: "explicit",
          degraded: false, attempts: [] },
      };
    },
  } } } as unknown as Window & typeof globalThis;
  try {
    const decision = await resolveAutoRoutingForSend({
      taskId: "default-model-first-test",
      state: { settings: { ...defaultSettings, autoRoutingEnabled: true },
        providerAvailability: { "claude-code": true, codex: true, cursor: false, kiro: false },
        rateLimitsSnapshot: null },
      promptDraft: { text: "Explain payment transactions", attachedFilePaths: [], attachments: [],
        runtimeOverrides: { autoRouting: true } },
      provider: "codex", activeModel: "gpt-5.6-sol", prompt: "Explain payment transactions",
      history: [], fileContextCount: 0, workspaceCwd: "/tmp/routing-test",
    });
    expect(calls).toBe(1);
    expect(phase).toBe("execute");
    expect(decision).toMatchObject({ source: "classifier", model: "gpt-6-luna" });
  } finally {
    globalThis.window = previousWindow;
  }
});

function buildHangingClassifierArgs(taskId: string) {
  const profile = buildStarterProfile("starter-balanced");
  return {
    profile,
    args: {
      taskId,
      state: {
        settings: { ...defaultSettings, autoRoutingEnabled: true,
          autoRoutingProfile: { ...profile, signals: { ...profile.signals, classifier: true } } },
        providerAvailability: { "claude-code": true, codex: true, cursor: false, kiro: false },
        rateLimitsSnapshot: null,
      },
      promptDraft: { text: "fix typo", attachedFilePaths: [], attachments: [],
        runtimeOverrides: { autoRouting: true } },
      provider: "codex" as const, activeModel: "gpt-5.6-sol", prompt: "fix typo",
      history: [], fileContextCount: 0, workspaceCwd: "/tmp/routing-test",
    },
  };
}

function installHangingClassifier() {
  let started!: () => void;
  const classifierStarted = new Promise<void>((resolve) => { started = resolve; });
  const cancelledRequests: string[] = [];
  globalThis.window = { api: { provider: {
    classifyRoute: () => { started(); return new Promise(() => {}); },
    cancelRouteClassification: async ({ requestId }: { requestId: string }) => {
      cancelledRequests.push(requestId);
      return { ok: true };
    },
  } } } as unknown as Window & typeof globalThis;
  return { classifierStarted, cancelledRequests };
}

test("cancelled classification never returns a dispatch decision and permits a fresh send", async () => {
  const previousWindow = globalThis.window;
  const info = spyOn(toast, "info");
  const warning = spyOn(toast, "warning");
  const { profile, args } = buildHangingClassifierArgs("route-cancellation-test");
  const { classifierStarted, cancelledRequests } = installHangingClassifier();
  try {
    const pending = resolveAutoRoutingForSend(args);
    await classifierStarted;
    await expect(resolveAutoRoutingForSend(args)).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelPendingAutoRouting(args.taskId)).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelledRequests[0]).toMatch(/^[a-f0-9-]{36}$/);
    expect(cancelPendingAutoRouting(args.taskId)).toBe(false);
    // The wait is shown in the transcript, never as a notification.
    expect(info).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    const next = await resolveAutoRoutingForSend({ ...args, state: { ...args.state,
      settings: { ...args.state.settings, autoRoutingProfile: { ...profile, signals: { ...profile.signals, classifier: false } } } } });
    expect(next?.model).toBe("gpt-6-luna");
    expect(next?.source).toBe("heuristic");
    expect(next?.classifierElapsedMs).toBeUndefined();
  } finally {
    cancelPendingAutoRouting(args.taskId);
    globalThis.window = previousWindow;
    info.mockRestore();
    warning.mockRestore();
  }
});

test("skipping the classifier resolves on local rules without a notification", async () => {
  const previousWindow = globalThis.window;
  const warning = spyOn(toast, "warning");
  const { args } = buildHangingClassifierArgs("route-skip-test");
  const { classifierStarted, cancelledRequests } = installHangingClassifier();
  try {
    expect(skipPendingAutoRoutingClassifier(args.taskId)).toBe(false);
    const pending = resolveAutoRoutingForSend(args);
    await classifierStarted;
    expect(skipPendingAutoRoutingClassifier(args.taskId)).toBe(true);
    expect(skipPendingAutoRoutingClassifier(args.taskId)).toBe(false);
    const decision = await pending;
    expect(decision?.source).toBe("classifier_fallback");
    expect(decision?.rationale.startsWith(AUTO_ROUTING_CLASSIFIER_SKIPPED_RATIONALE)).toBe(true);
    expect(typeof decision?.classifierElapsedMs).toBe("number");
    expect(cancelledRequests).toHaveLength(1);
    expect(warning).not.toHaveBeenCalled();
    expect(cancelPendingAutoRouting(args.taskId)).toBe(false);
    const resolution = decision
      ? buildAutoRoutingModelResolution({ decision, provider: decision.providerId, model: decision.model })
      : null;
    expect(resolution?.classifierElapsedMs).toBe(decision?.classifierElapsedMs);
    expect(AutoRoutingModelResolutionSchema.safeParse(resolution).success).toBe(true);
  } finally {
    cancelPendingAutoRouting(args.taskId);
    globalThis.window = previousWindow;
    warning.mockRestore();
  }
});

test("only a classifier-backed Auto send waits in the pending state", () => {
  const profile = buildStarterProfile("starter-balanced");
  const settings = { ...defaultSettings, autoRoutingEnabled: true,
    autoRoutingProfile: { ...profile, signals: { ...profile.signals, classifier: true } } };
  const draft = { text: "x", attachedFilePaths: [], attachments: [], runtimeOverrides: { autoRouting: true } };
  expect(shouldClassifyAutoRoute({ settings, promptDraft: draft })).toBe(true);
  expect(shouldClassifyAutoRoute({ settings: { ...settings, autoRoutingEnabled: false }, promptDraft: draft })).toBe(false);
  expect(shouldClassifyAutoRoute({ settings, promptDraft: { ...draft, runtimeOverrides: { autoRouting: false } } })).toBe(false);
  expect(shouldClassifyAutoRoute({ settings, promptDraft: { ...draft, runtimeOverrides: { autoRouting: true, model: "gpt-5.6-sol" } } })).toBe(false);
  expect(shouldClassifyAutoRoute({ settings: { ...settings,
    autoRoutingProfile: { ...profile, signals: { ...profile.signals, classifier: false } } }, promptDraft: draft })).toBe(false);
});

test("an unclear intent on a task running as an agent routes as its agent's task class, or the class the caller names", async () => {
  const { useAgentAssignmentsStore } = await import("../src/store/agent-assignments-store");
  const previousWindow = globalThis.window;
  globalThis.window = { api: { provider: {
    classifyRoute: async () => ({ ok: true,
      classification: { version: 2, intent: "unknown", complexity: "low",
        risk: "normal", continuity: "new", evidenceCodes: ["explicit_request"] },
      utility: { providerId: "codex", model: "gpt-5.6-luna", selectionReason: "explicit",
        degraded: false, attempts: [] },
    }),
  } } } as unknown as Window & typeof globalThis;
  const previousAssignments = useAgentAssignmentsStore.getState().byTaskId;
  useAgentAssignmentsStore.setState({
    byTaskId: { "agent-task": { agentTaskClass: "docs" } as never },
  });
  const args = {
    state: { settings: { ...defaultSettings, autoRoutingEnabled: true },
      providerAvailability: { "claude-code": true, codex: true, cursor: false, kiro: false },
      rateLimitsSnapshot: null },
    promptDraft: { text: "Explain the save error", attachedFilePaths: [], attachments: [],
      runtimeOverrides: { autoRouting: true } },
    provider: "codex" as const, activeModel: "gpt-5.6-sol", prompt: "Explain the save error",
    history: [], fileContextCount: 0, workspaceCwd: "/tmp/routing-test",
  };
  try {
    // An unclear intent alone routes as implement work.
    expect((await resolveAutoRoutingForSend({ ...args, taskId: "plain-task" }))?.taskClass).toBe("implement");
    expect((await resolveAutoRoutingForSend({ ...args, taskId: "agent-task" }))?.taskClass).toBe("docs");
    expect((await resolveAutoRoutingForSend({ ...args, taskClassHint: "debug" }))?.taskClass).toBe("debug");
  } finally {
    globalThis.window = previousWindow;
    useAgentAssignmentsStore.setState({ byTaskId: previousAssignments });
  }
});
