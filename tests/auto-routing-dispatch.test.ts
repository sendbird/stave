import { toast } from "../src/lib/notifications/toast";
import { expect, test, spyOn } from "bun:test";
import { defaultSettings } from "../src/store/app-settings";
import { cancelPendingAutoRouting, resolveAutoRoutingForSend } from "../src/store/auto-routing-dispatch";
import { buildStarterProfile } from "../src/lib/providers/auto-routing-profile";

test("default Auto dispatch uses the classifier bridge and preserves Plan intent", async () => {
  const previousWindow = globalThis.window;
  let phase: string | undefined;
  let calls = 0;
  globalThis.window = { api: { provider: {
    classifyRoute: async (request: { phase?: string }) => {
      calls++;
      phase = request.phase;
      return { ok: true,
        classification: { version: 1, intent: "explain", complexity: "low",
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
        runtimeOverrides: { autoRouting: true, autoRoutingPlanMode: true } },
      provider: "codex", activeModel: "gpt-5.6-sol", prompt: "Explain payment transactions",
      history: [], fileContextCount: 0, workspaceCwd: "/tmp/routing-test",
    });
    expect(calls).toBe(1);
    expect(phase).toBe("plan");
    expect(decision).toMatchObject({ source: "classifier", model: "gpt-6-luna" });
  } finally {
    globalThis.window = previousWindow;
  }
});

test("cancelled classification never returns a dispatch decision and permits a fresh send", async () => {
  const previousWindow = globalThis.window;
  const notice = spyOn(toast, "info").mockReturnValue("routing-notice");
  const dismiss = spyOn(toast, "dismiss").mockImplementation(() => {});
  let started!: () => void;
  const classifierStarted = new Promise<void>((resolve) => { started = resolve; });
  let cancelledRequest = "";
  const profile = buildStarterProfile("starter-balanced");
  const args = {
    taskId: "route-cancellation-test",
    state: {
      settings: { ...defaultSettings, autoRoutingEnabled: true,
        autoRoutingProfile: { ...profile, signals: { ...profile.signals, classifier: true } } },
      providerAvailability: { "claude-code": true, codex: true, cursor: false, kiro: false },
      rateLimitsSnapshot: null,
    },
    promptDraft: { text: "fix typo", runtimeOverrides: { autoRouting: true } },
    provider: "codex" as const, activeModel: "gpt-5.6-sol", prompt: "fix typo",
    history: [], fileContextCount: 0, workspaceCwd: "/tmp/routing-test",
  };
  globalThis.window = { api: { provider: {
    classifyRoute: () => { started(); return new Promise(() => {}); },
    cancelRouteClassification: async ({ requestId }: { requestId: string }) => {
      cancelledRequest = requestId;
      return { ok: true };
    },
  } } } as unknown as Window & typeof globalThis;
  try {
    const pending = resolveAutoRoutingForSend(args);
    await classifierStarted;
    await expect(resolveAutoRoutingForSend(args)).rejects.toMatchObject({ name: "AbortError" });
    await Bun.sleep(550);
    expect(notice).toHaveBeenCalledTimes(1);
    const cancel = notice.mock.calls[0]?.[1]?.action;
    expect(cancel?.label).toBe("Cancel");
    cancel?.onClick({} as never);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(dismiss).toHaveBeenCalledWith("routing-notice");
    expect(cancelledRequest).toMatch(/^[a-f0-9-]{36}$/);
    expect(cancelPendingAutoRouting(args.taskId)).toBe(false);
    const next = await resolveAutoRoutingForSend({ ...args, state: { ...args.state,
      settings: { ...args.state.settings, autoRoutingProfile: { ...profile, signals: { ...profile.signals, classifier: false } } } } });
    expect(next?.model).toBe("gpt-6-luna");
    expect(next?.source).toBe("heuristic");
  } finally {
    cancelPendingAutoRouting(args.taskId);
    globalThis.window = previousWindow;
    notice.mockRestore();
    dismiss.mockRestore();
  }
});
