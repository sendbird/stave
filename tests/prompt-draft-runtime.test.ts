import { describe, expect, test } from "bun:test";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";
import {
  arePromptDraftRuntimeOverridesEqual,
  resolvePromptDraftPlanModeChange,
  resolvePromptDraftModelForProvider,
  resolvePromptDraftRuntimeState,
  transitionClaudePromptDraftPermissionMode,
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
            claudePermissionMode: "plan",
            claudePermissionModeBeforePlan: "acceptEdits",
            claudeEffort: "xhigh",
            codexPlanMode: true,
            codexReasoningEffort: "ultra",
            codexFastMode: false,
          },
        },
        fallback: {
          claudePermissionMode: "default",
          claudePermissionModeBeforePlan: null,
          claudeEffort: "medium",
          codexPlanMode: false,
          codexReasoningEffort: "high",
          codexFastMode: true,
        },
      }),
    ).toEqual({
      claudePermissionMode: "plan",
      claudePermissionModeBeforePlan: "acceptEdits",
      claudeEffort: "xhigh",
      codexPlanMode: true,
      codexReasoningEffort: "ultra",
      codexFastMode: false,
    });
  });

  test("restores the prior Claude permission mode when leaving plan mode", () => {
    expect(
      transitionClaudePromptDraftPermissionMode({
        nextMode: "acceptEdits",
        currentMode: "plan",
        beforePlan: "bypassPermissions",
      }),
    ).toEqual({
      claudePermissionMode: "acceptEdits",
      claudePermissionModeBeforePlan: null,
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
        { autoRouting: true, codexPlanMode: true },
        { autoRouting: true, codexPlanMode: true },
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
        claudePermissionModeBeforePlan: null,
        codexPlanMode: false,
      },
    });
    expect(resolvedFromDraft.boundSecretIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);

    const resolvedFromFallback = resolvePromptDraftRuntimeState({
      promptDraft: { text: "", attachedFilePaths: [], attachments: [] },
      fallback: {
        claudePermissionMode: "default",
        claudePermissionModeBeforePlan: null,
        codexPlanMode: false,
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

  test("restores the prior Claude mode without clearing Codex sessions when plan mode is disabled", () => {
    expect(
      resolvePromptDraftPlanModeChange({
        providerId: "claude-code",
        enabled: false,
        runtimeOverrides: {
          claudePermissionMode: "plan",
          claudePermissionModeBeforePlan: "acceptEdits",
        },
        claudePermissionMode: "plan",
        claudePermissionModeBeforePlan: "acceptEdits",
        codexPlanMode: false,
      }),
    ).toEqual({
      runtimeOverrides: {
        claudePermissionMode: "acceptEdits",
        claudePermissionModeBeforePlan: null,
      },
      shouldClearCodexSession: false,
      shouldAbortActiveTurn: false,
    });
  });

  test("keeps task-local model and effort when Claude plan mode changes", () => {
    expect(
      resolvePromptDraftPlanModeChange({
        providerId: "claude-code",
        enabled: true,
        runtimeOverrides: {
          model: "claude-opus-4-8",
          claudeEffort: "xhigh",
          autoRouting: false,
        },
        claudePermissionMode: "auto",
        claudePermissionModeBeforePlan: null,
        codexPlanMode: false,
      }).runtimeOverrides,
    ).toEqual({
      model: "claude-opus-4-8",
      claudeEffort: "xhigh",
      autoRouting: false,
      claudePermissionMode: "plan",
      claudePermissionModeBeforePlan: "auto",
    });
  });

  test("turns Codex plan mode off and clears the persisted Codex session for the next turn", () => {
    expect(
      resolvePromptDraftPlanModeChange({
        providerId: "codex",
        enabled: false,
        runtimeOverrides: {
          claudePermissionMode: "auto",
          codexPlanMode: true,
        },
        claudePermissionMode: "default",
        claudePermissionModeBeforePlan: null,
        codexPlanMode: true,
      }),
    ).toEqual({
      runtimeOverrides: {
        claudePermissionMode: "auto",
        codexPlanMode: false,
      },
      shouldClearCodexSession: true,
      shouldAbortActiveTurn: false,
    });
  });

  test("keeps the Codex session when plan mode stays enabled", () => {
    expect(
      resolvePromptDraftPlanModeChange({
        providerId: "codex",
        enabled: true,
        runtimeOverrides: {
          codexPlanMode: false,
        },
        claudePermissionMode: "default",
        claudePermissionModeBeforePlan: null,
        codexPlanMode: false,
      }),
    ).toEqual({
      runtimeOverrides: {
        codexPlanMode: true,
      },
      shouldClearCodexSession: false,
      shouldAbortActiveTurn: false,
    });
  });

  test("aborts an active Codex planning turn when leaving plan mode after a plan arrived", () => {
    expect(
      resolvePromptDraftPlanModeChange({
        providerId: "codex",
        enabled: false,
        runtimeOverrides: {
          codexPlanMode: true,
        },
        claudePermissionMode: "default",
        claudePermissionModeBeforePlan: null,
        codexPlanMode: true,
        isTurnActive: true,
        hasPlanResponse: true,
      }),
    ).toEqual({
      runtimeOverrides: {
        codexPlanMode: false,
      },
      shouldClearCodexSession: true,
      shouldAbortActiveTurn: true,
    });
  });

  test("parses persisted prompt draft runtime overrides from workspace snapshots", () => {
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
              claudePermissionMode: "plan",
              claudePermissionModeBeforePlan: "acceptEdits",
              claudeEffort: "xhigh",
              codexPlanMode: true,
              codexReasoningEffort: "ultra",
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

    expect(parsed?.promptDraftByTask["task-1"]?.runtimeOverrides).toEqual({
      model: "claude-opus-4-6",
      claudePermissionMode: "plan",
      claudePermissionModeBeforePlan: "acceptEdits",
      claudeEffort: "xhigh",
      codexPlanMode: true,
      codexReasoningEffort: "ultra",
      autoRouting: true,
      advisorEnabled: true,
      advisorTarget: {
        providerId: "claude-code",
        model: "claude-opus-4-6",
        effort: "high",
      },
    });
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
        codexPlanMode: true,
        // Written by a newer build; this one has never heard of it.
        someFutureOverride: { nested: "value" },
      }),
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.tasks).toHaveLength(1);
    expect(parsed?.promptDraftByTask["task-1"]?.runtimeOverrides).toEqual({
      codexPlanMode: true,
    });
  });

  test("drops a corrupt advisor target instead of rejecting the workspace", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: snapshotWithDraftOverrides({
        codexPlanMode: true,
        advisorEnabled: "yes-please",
        advisorTarget: { providerId: "not-a-provider", model: "" },
      }),
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.tasks).toHaveLength(1);
    expect(parsed?.promptDraftByTask["task-1"]?.runtimeOverrides).toEqual({
      codexPlanMode: true,
    });
  });
});

describe("advisor overrides in draft equality", () => {
  test("an advisor arming change is not diffed away as unchanged", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { advisorEnabled: true },
        { advisorEnabled: false },
      ),
    ).toBe(false);
    expect(arePromptDraftRuntimeOverridesEqual({ advisorEnabled: true }, {})).toBe(
      false,
    );
  });

  test("an advisor model change is not diffed away as unchanged", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { advisorTarget: { providerId: "codex", model: "gpt-5.6-sol" } },
        { advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" } },
      ),
    ).toBe(false);
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { advisorTarget: { providerId: "codex", model: "gpt-5.6-sol" } },
        { advisorTarget: { providerId: "claude-code", model: "gpt-5.6-sol" } },
      ),
    ).toBe(false);
  });

  test("equal advisor arming compares equal", () => {
    const target = { providerId: "codex" as const, model: "gpt-5.6-sol" };
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { advisorEnabled: true, advisorTarget: { ...target } },
        { advisorEnabled: true, advisorTarget: { ...target } },
      ),
    ).toBe(true);
  });
});

describe("advisor target equality", () => {
  const base = { providerId: "codex" as const, model: "gpt-5.6-sol" };

  test("a changed effort is a real change", () => {
    // `updatePromptDraft` drops writes this reports as unchanged, so treating
    // effort as invisible would make the tier control silently do nothing.
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { advisorEnabled: true, advisorTarget: { ...base, effort: "low" } },
        { advisorEnabled: true, advisorTarget: { ...base, effort: "max" } },
      ),
    ).toBe(false);
  });

  test("pinning a tier differs from following the model default", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { advisorTarget: base },
        { advisorTarget: { ...base, effort: "xhigh" } },
      ),
    ).toBe(false);
  });

  test("identical targets still compare equal", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { advisorEnabled: true, advisorTarget: { ...base, effort: "low" } },
        { advisorEnabled: true, advisorTarget: { ...base, effort: "low" } },
      ),
    ).toBe(true);
  });
});
