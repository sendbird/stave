import { describe, expect, test } from "bun:test";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";
import {
  arePromptDraftRuntimeOverridesEqual,
  resolvePromptDraftModelForProvider,
  resolvePromptDraftRuntimeState,
} from "@/store/prompt-draft-runtime";

describe("prompt-draft runtime state", () => {
  test("prefers task-local runtime overrides over global fallbacks", () => {
    expect(
      resolvePromptDraftRuntimeState({
        promptDraft: {
          text: "Plan this fix",
          attachedFilePaths: [],
          attachments: [],
          runtimeOverrides: {
            claudePermissionMode: "acceptEdits",
            claudeEffort: "xhigh",
            codexReasoningEffort: "ultra",
            codexFastMode: false,
            cursorMode: "ask",
          },
        },
        fallback: {
          claudePermissionMode: "default",
          claudeEffort: "medium",
          codexReasoningEffort: "high",
          codexFastMode: true,
          cursorMode: "agent",
        },
      }),
    ).toEqual({
      claudePermissionMode: "acceptEdits",
      claudeEffort: "xhigh",
      codexReasoningEffort: "ultra",
      codexFastMode: false,
      cursorMode: "ask",
    });
  });

  test("uses the task-local model override only when it matches the active provider", () => {
    expect(
      resolvePromptDraftModelForProvider({
        providerId: "claude-code",
        runtimeOverrides: {
          model: "claude-opus-4-6",
        },
        fallbackModel: "claude-sonnet-4-6",
      }),
    ).toBe("claude-opus-4-6");

    expect(
      resolvePromptDraftModelForProvider({
        providerId: "codex",
        runtimeOverrides: {
          model: "claude-opus-4-6",
        },
        fallbackModel: "gpt-5.4",
      }),
    ).toBe("gpt-5.4");

    expect(
      resolvePromptDraftModelForProvider({
        providerId: "cursor",
        runtimeOverrides: { model: "auto" },
        fallbackModel: "auto",
      }),
    ).toBe("auto");

    expect(
      resolvePromptDraftModelForProvider({
        providerId: "kiro",
        runtimeOverrides: { model: "auto" },
        fallbackModel: "auto",
      }),
    ).toBe("auto");

    expect(
      resolvePromptDraftModelForProvider({
        providerId: "cursor",
        runtimeOverrides: {
          model: "gpt-5.6-sol-high-fast",
          modelProviderId: "cursor",
        },
        fallbackModel: "auto",
      }),
    ).toBe("gpt-5.6-sol-high-fast");

    expect(
      resolvePromptDraftModelForProvider({
        providerId: "codex",
        runtimeOverrides: {
          model: "gpt-5.6-sol-high-fast",
          modelProviderId: "cursor",
        },
        fallbackModel: "gpt-5.6-terra",
      }),
    ).toBe("gpt-5.6-terra");

    expect(
      resolvePromptDraftModelForProvider({
        providerId: "kiro",
        runtimeOverrides: {
          model: "kiro-model-1",
          modelProviderId: "kiro",
        },
        fallbackModel: "auto",
      }),
    ).toBe("kiro-model-1");
  });

  test("compares the explicit model provider as part of draft runtime state", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { model: "shared-model", modelProviderId: "cursor" },
        { model: "shared-model", modelProviderId: "codex" },
      ),
    ).toBe(false);
  });

  test("compares auto routing overrides as part of draft runtime state", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { autoRouting: true },
        { autoRouting: false },
      ),
    ).toBe(false);
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { autoRouting: true, codexFastMode: true },
        { autoRouting: true, codexFastMode: true },
      ),
    ).toBe(true);
  });

  test("compares Codex Fast as part of draft runtime state", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { codexFastMode: true },
        { codexFastMode: false },
      ),
    ).toBe(false);
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { codexFastMode: false },
        { codexFastMode: false },
      ),
    ).toBe(true);
  });

  test("compares Cursor mode as part of draft runtime state", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { cursorMode: "ask" },
        { cursorMode: "agent" },
      ),
    ).toBe(false);
  });

  test("carries bound secret ids from draft overrides then fallback", () => {
    const resolvedFromDraft = resolvePromptDraftRuntimeState({
      promptDraft: {
        text: "",
        attachedFilePaths: [],
        attachments: [],
        runtimeOverrides: {
          boundSecretIds: ["11111111-1111-4111-8111-111111111111"],
        },
      },
      fallback: {
        claudePermissionMode: "default",
      },
    });
    expect(resolvedFromDraft.boundSecretIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);

    const resolvedFromFallback = resolvePromptDraftRuntimeState({
      promptDraft: { text: "", attachedFilePaths: [], attachments: [] },
      fallback: {
        claudePermissionMode: "default",
        boundSecretIds: ["22222222-2222-4222-8222-222222222222"],
      },
    });
    expect(resolvedFromFallback.boundSecretIds).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  test("treats bound secret id changes as a runtime-override difference", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { boundSecretIds: ["a"] },
        { boundSecretIds: ["a"] },
      ),
    ).toBe(true);
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { boundSecretIds: ["a"] },
        { boundSecretIds: ["a", "b"] },
      ),
    ).toBe(false);
    expect(
      arePromptDraftRuntimeOverridesEqual({ boundSecretIds: [] }, {}),
    ).toBe(true);
  });

  test("parses persisted prompt draft runtime overrides, dropping retired plan-mode values", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "codex",
            updatedAt: "2026-04-01T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [],
        },
        promptDraftByTask: {
          "task-1": {
            text: "",
            attachedFilePaths: [],
            attachments: [],
            runtimeOverrides: {
              model: "claude-opus-4-6",
              modelProviderId: "claude-code",
              claudePermissionMode: "plan",
              claudePermissionModeBeforePlan: "acceptEdits",
              claudeEffort: "xhigh",
              codexPlanMode: true,
              codexReasoningEffort: "ultra",
              cursorMode: "plan",
              autoRouting: true,
              advisorEnabled: true,
              advisorTarget: {
                providerId: "claude-code",
                model: "claude-opus-4-6",
                effort: "high",
              },
            },
          },
        },
        providerSessionByTask: {},
        editorTabs: [],
        activeEditorTabId: null,
      },
    });

    // A draft left in plan mode returns to the mode saved before it, and the
    // retired Cursor plan mode falls back to the user's settings.
    expect(parsed?.promptDraftByTask["task-1"]?.runtimeOverrides).toEqual({
      model: "claude-opus-4-6",
      modelProviderId: "claude-code",
      claudePermissionMode: "acceptEdits",
      claudeEffort: "xhigh",
      codexReasoningEffort: "ultra",
      autoRouting: true,
    });
  });

  test("reads a saved plan message as an ordinary reply", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "cursor",
            updatedAt: "2026-08-30T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [
            {
              id: "task-1-m-1",
              role: "assistant",
              model: "auto",
              providerId: "cursor",
              content: "1. Inspect\n2. Patch",
              parts: [],
              isPlanResponse: true,
              planText: "1. Inspect\n2. Patch",
              planReview: {
                requestId: "cursor:plan:3",
                responseMode: "blocking",
              },
            },
          ],
        },
        promptDraftByTask: {},
        providerSessionByTask: {
          "task-1": { cursor: "cursor-session-1" },
        },
        editorTabs: [],
        activeEditorTabId: null,
      },
    });

    const message = parsed?.messagesByTask["task-1"]?.[0];
    expect(message?.content).toBe("1. Inspect\n2. Patch");
    expect(message).not.toHaveProperty("planReview");
    expect(message).not.toHaveProperty("isPlanResponse");
    expect(parsed?.providerSessionByTask["task-1"]?.cursor).toBe(
      "cursor-session-1",
    );
  });

  // A snapshot is parsed all-or-nothing: any rejection here returns null for the
  // WHOLE workspace, hydration falls back to an empty state, and the next autosave
  // makes that permanent. These two cases are the ways a draft override can carry
  // a value this build does not understand, and neither may cost the user a
  // workspace. Regression guard for a bug where adding an override field to the
  // type but not to this schema erased every task on the next relaunch.
  const snapshotWithDraftOverrides = (
    runtimeOverrides: Record<string, unknown>,
  ) => ({
    activeTaskId: "task-1",
    tasks: [
      {
        id: "task-1",
        title: "Task 1",
        provider: "codex" as const,
        updatedAt: "2026-04-01T00:00:00.000Z",
        unread: false,
      },
    ],
    messagesByTask: { "task-1": [] },
    promptDraftByTask: {
      "task-1": { text: "", attachedFilePaths: [], attachments: [], runtimeOverrides },
    },
    providerSessionByTask: {},
    editorTabs: [],
    activeEditorTabId: null,
  });

  test("drops an override field this build does not know instead of rejecting the workspace", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: snapshotWithDraftOverrides({
        codexFastMode: true,
        // Written by a newer build; this one has never heard of it.
        someFutureOverride: { nested: "value" },
      }),
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.tasks).toHaveLength(1);
    expect(parsed?.promptDraftByTask["task-1"]?.runtimeOverrides).toEqual({
      codexFastMode: true,
    });
  });

  test("drops retired Advisor and Worker overrides instead of rejecting the workspace", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: snapshotWithDraftOverrides({
        codexFastMode: true,
        advisorEnabled: "yes-please",
        advisorTarget: { providerId: "not-a-provider", model: "" },
      }),
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.tasks).toHaveLength(1);
    expect(parsed?.promptDraftByTask["task-1"]?.runtimeOverrides).toEqual({
      codexFastMode: true,
    });
  });
});
