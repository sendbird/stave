import { buildQueuedTurnFromDraft } from "@/store/prompt-draft-context";
import { arePromptDraftQueuedTurnsEqual } from "@/store/prompt-draft-state";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";
import { describe, expect, test } from "bun:test";
import { buildModelSelectionRuntimeOverrides } from "@/lib/providers/model-effort";
import { defaultSettings } from "@/store/app-settings";
import { buildPromptDraftForSend } from "@/store/prompt-draft-send";
import {
  applyAutoRoutingPlanMode,
  resolvePromptDraftRuntimeState,
} from "@/store/prompt-draft-runtime";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import { RuntimeOptionsObjectSchema } from "../electron/main/ipc/schemas";
import { buildCodexTurnStartParams } from "../electron/providers/codex-app-server-params";

describe("model selector effort submission", () => {
  for (const effort of [
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
  ] as const) {
    test(`replaces stale draft effort with ${effort} through the Codex request`, () => {
      const runtimeOverrides = buildModelSelectionRuntimeOverrides({
        runtimeOverrides: {
          codexReasoningEffort: "xhigh",
          codexPlanMode: true,
        },
        settings: defaultSettings,
        providerId: "codex",
        model: "gpt-6-astra",
        effort,
      });
      const draft = buildPromptDraftForSend({
        content: "Explain this function",
        sourceDraft: {
          text: "",
          attachedFilePaths: [],
          attachments: [],
          runtimeOverrides,
        },
      });
      const resolved = resolvePromptDraftRuntimeState({
        promptDraft: draft,
        fallback: defaultSettings,
      });
      const runtimeOptions = RuntimeOptionsObjectSchema.parse(
        buildProviderRuntimeOptions({
          provider: "codex",
          model: "gpt-6-astra",
          settings: { ...defaultSettings, ...resolved },
        }),
      );
      expect(runtimeOptions.codexReasoningEffort).toBe(effort);
      expect(
        buildCodexTurnStartParams({
          threadId: "existing-thread",
          prompt: draft.text,
          cwd: "/tmp/workspace",
          runtimeOptions,
        }).effort,
      ).toBe(effort);
      expect(runtimeOptions.codexPlanMode).toBe(true);
    });
  }

  test("model-only selection replaces the previous draft effort with the target preference", () => {
    const overrides = buildModelSelectionRuntimeOverrides({
      runtimeOverrides: {
        codexReasoningEffort: "xhigh",
        boundSecretIds: ["secret-id"],
      },
      settings: {
        ...defaultSettings,
        modelRuntimePreferences: { "codex:gpt-5.6-luna": { effort: "medium" } },
      },
      providerId: "codex",
      model: "gpt-5.6-luna",
    });
    expect(overrides.codexReasoningEffort).toBe("medium");
    expect(overrides.boundSecretIds).toEqual(["secret-id"]);
    expect(
      buildModelSelectionRuntimeOverrides({
        runtimeOverrides: overrides,
        settings: defaultSettings,
        providerId: "codex",
        model: "gpt-5.6-luna",
        effort: "ultra",
      }).codexReasoningEffort,
    ).toBe("max");
  });
});

describe("queued effort snapshots", () => {
  for (const [providerId, model, key] of [
    ["codex", "gpt-6-astra", "codexReasoningEffort"],
    ["claude-code", "claude-sonnet-5", "claudeEffort"],
    ["cursor", "gpt-5.6-sol", "cursorEffort"],
    ["kiro", "auto", "kiroEffort"],
  ] as const) {
    test(`${providerId} retains queue-time effort after composer changes and persistence`, () => {
      const queued = buildQueuedTurnFromDraft({
        draft: {
          text: "Queued prompt",
          attachedFilePaths: [],
          attachments: [],
          runtimeOverrides: { [key]: "low" },
        },
        settings: defaultSettings,
        providerId,
        model,
      });
      const sourceDraft = {
        text: "New draft",
        attachedFilePaths: [],
        attachments: [],
        runtimeOverrides: { [key]: "xhigh" as const, autoRouting: true },
        queuedTurns: [queued],
      };
      const restored = parseWorkspaceSnapshot({
        payload: JSON.parse(
          JSON.stringify({
            activeTaskId: "task-1",
            tasks: [
              {
                id: "task-1",
                title: "Task",
                provider: providerId,
                updatedAt: "2026-09-08T00:00:00Z",
                unread: false,
              },
            ],
            messagesByTask: { "task-1": [] },
            promptDraftByTask: { "task-1": sourceDraft },
          }),
        ),
      });
      const restoredItem =
        restored?.promptDraftByTask["task-1"]?.queuedTurns?.[0];
      expect(restoredItem?.effort).toBe("low");
      const submitted = buildPromptDraftForSend({
        content: queued.content,
        sourceDraft,
        queuedTurn: restoredItem,
      });
      expect(submitted.runtimeOverrides?.[key]).toBe("low");
      expect(submitted.runtimeOverrides?.autoRouting).toBe(false);
      expect(sourceDraft.runtimeOverrides[key]).toBe("xhigh");
      expect(
        arePromptDraftQueuedTurnsEqual(
          [queued],
          [{ ...queued, effort: "high" }],
        ),
      ).toBe(false);
    });
  }

  test("captures the model preference even when the draft has no effort override", () => {
    const queued = buildQueuedTurnFromDraft({
      draft: { text: "Queued", attachedFilePaths: [], attachments: [] },
      providerId: "codex",
      model: "gpt-6-astra",
      settings: {
        ...defaultSettings,
        modelRuntimePreferences: { "codex:gpt-6-astra": { effort: "max" } },
      },
    });
    expect(queued.effort).toBe("max");
    const { effort: _effort, ...legacy } = queued;
    const sent = buildPromptDraftForSend({
      content: legacy.content,
      sourceDraft: {
        text: "",
        attachments: [],
        attachedFilePaths: [],
        runtimeOverrides: { codexReasoningEffort: "high" },
      },
      queuedTurn: legacy,
    });
    expect(sent.runtimeOverrides?.codexReasoningEffort).toBe("high");
    expect(sent.runtimeOverrides?.autoRouting).toBe(false);
    expect(sent.runtimeOverrides?.modelProviderId).toBe("codex");
  });

  test("Stave Auto queue items do not pin Cursor Auto and keep routing on send", () => {
    const queued = buildQueuedTurnFromDraft({
      draft: {
        text: "Queued auto follow-up",
        attachedFilePaths: [],
        attachments: [],
        runtimeOverrides: { autoRouting: true, cursorEffort: "medium" },
      },
      providerId: "cursor",
      model: "auto",
      autoRouting: true,
      settings: defaultSettings,
    });
    expect(queued).toMatchObject({
      autoRouting: true,
      content: "Queued auto follow-up",
    });
    expect(queued.providerId).toBeUndefined();
    expect(queued.model).toBeUndefined();
    expect(queued.effort).toBeUndefined();

    const submitted = buildPromptDraftForSend({
      content: queued.content,
      sourceDraft: {
        text: "Composer switched to Cursor",
        attachedFilePaths: [],
        attachments: [],
        runtimeOverrides: {
          autoRouting: false,
          model: "auto",
          modelProviderId: "cursor",
          cursorEffort: "high",
        },
        queuedTurns: [queued],
      },
      queuedTurn: queued,
    });
    expect(submitted.runtimeOverrides?.autoRouting).toBe(true);
    expect(submitted.runtimeOverrides?.model).toBeUndefined();
    expect(submitted.runtimeOverrides?.modelProviderId).toBeUndefined();
  });

  test("Stave Auto keeps queue-time plan intent and applies it to the routed provider", () => {
    const queued = buildQueuedTurnFromDraft({
      draft: {
        text: "Plan the migration",
        attachedFilePaths: [],
        attachments: [],
        runtimeOverrides: {
          autoRouting: true,
          autoRoutingPlanMode: true,
          cursorMode: "plan",
        },
      },
      autoRouting: true,
    });
    expect(queued.autoRoutingPlanMode).toBe(true);
    const submitted = buildPromptDraftForSend({
      content: queued.content,
      sourceDraft: {
        text: "",
        attachedFilePaths: [],
        attachments: [],
        runtimeOverrides: { autoRouting: true, autoRoutingPlanMode: false },
      },
      queuedTurn: queued,
    });
    expect(submitted.runtimeOverrides?.autoRoutingPlanMode).toBe(true);
    const runtimeState = resolvePromptDraftRuntimeState({
      promptDraft: submitted,
      fallback: defaultSettings,
    });
    expect(
      applyAutoRoutingPlanMode({
        providerId: "codex",
        runtimeOverrides: submitted.runtimeOverrides,
        runtimeState,
      }).codexPlanMode,
    ).toBe(true);
    expect(
      applyAutoRoutingPlanMode({
        providerId: "claude-code",
        runtimeOverrides: submitted.runtimeOverrides,
        runtimeState,
      }).claudePermissionMode,
    ).toBe("plan");
    expect(
      applyAutoRoutingPlanMode({
        providerId: "codex",
        runtimeOverrides: { autoRouting: true, autoRoutingPlanMode: false },
        runtimeState: { ...runtimeState, codexPlanMode: true },
      }).codexPlanMode,
    ).toBe(false);
  });
});
