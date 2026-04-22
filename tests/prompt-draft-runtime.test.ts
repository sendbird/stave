import { describe, expect, test } from "bun:test";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";
import {
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
            codexPlanMode: true,
          },
        },
        fallback: {
          claudePermissionMode: "default",
          claudePermissionModeBeforePlan: null,
          codexPlanMode: false,
        },
      }),
    ).toEqual({
      claudePermissionMode: "plan",
      claudePermissionModeBeforePlan: "acceptEdits",
      codexPlanMode: true,
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
              codexPlanMode: true,
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
      codexPlanMode: true,
    });
  });
});
