// temporary-migration: plan-mode-removal
import { describe, expect, test } from "bun:test";
import {
  createDefaultAutomationRuntime,
  normalizeAutomationState,
} from "@/lib/automations";
import { withoutRetiredPlanModeFields } from "@/lib/plan-mode-removal-migration";
import { parseNormalizedEvent } from "@/lib/providers/runtime";
import { normalizedPermissionOptions } from "@/lib/runs/delegation-policy";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";

describe("plan-mode-removal migration", () => {
  test("settings return to the mode saved before plan mode, else default", () => {
    expect(
      withoutRetiredPlanModeFields({
        claudePermissionMode: "plan",
        claudePermissionModeBeforePlan: "acceptEdits",
        claudePlanModeApprovalScope: "bashTaskAndMcp",
        codexPlanMode: true,
        cursorMode: "plan",
        codexFastMode: true,
      }),
    ).toEqual({
      claudePermissionMode: "acceptEdits",
      cursorMode: "agent",
      codexFastMode: true,
    });
    expect(
      withoutRetiredPlanModeFields({
        claudePermissionMode: "plan",
        claudePermissionModeBeforePlan: null,
      }),
    ).toEqual({ claudePermissionMode: "default" });
  });

  test("a draft override in plan mode is dropped so the task follows settings", () => {
    expect(
      withoutRetiredPlanModeFields(
        { claudePermissionMode: "plan", cursorMode: "plan", model: "m" },
        { dropRetiredModes: true },
      ),
    ).toEqual({ model: "m" });
  });

  test("leaves values without plan mode untouched", () => {
    const settings = { claudePermissionMode: "auto", cursorMode: "ask" };
    expect(withoutRetiredPlanModeFields(settings)).toBe(settings);
  });

  test("a workspace snapshot with plan-mode drafts and queued turns still parses", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "claude-code",
            updatedAt: "2026-04-01T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: { "task-1": [] },
        promptDraftByTask: {
          "task-1": {
            text: "",
            attachedFilePaths: [],
            attachments: [],
            runtimeOverrides: {
              claudePermissionMode: "plan",
              claudePermissionModeBeforePlan: "auto",
              codexPlanMode: true,
              autoRoutingPlanMode: true,
            },
            queuedTurns: [
              {
                id: "queue-1",
                queuedAt: "2026-04-11T00:00:02.000Z",
                content: "follow-up",
                attachedFilePaths: [],
                attachments: [],
                autoRouting: true,
                autoRoutingPlanMode: true,
              },
            ],
          },
        },
        providerSessionByTask: {},
        editorTabs: [],
        activeEditorTabId: null,
      },
    });
    const draft = parsed?.promptDraftByTask["task-1"];
    expect(draft?.runtimeOverrides).toEqual({ claudePermissionMode: "auto" });
    expect(draft?.queuedTurns?.[0]).not.toHaveProperty("autoRoutingPlanMode");
  });

  test("an automation saved in plan mode keeps running read-only instead of resetting every automation", () => {
    const state = normalizeAutomationState({
      version: 1,
      runs: [],
      automations: [
        {
          id: "automation-1",
          name: "Nightly audit",
          prompt: "Audit the repository.",
          enabled: true,
          schedule: { every: 1, unit: "days" },
          environment: {
            kind: "repository",
            workspaceId: "ws-1",
            path: "/tmp/project",
            repositoryPath: "/tmp/project",
            label: "Project",
          },
          runtime: {
            ...createDefaultAutomationRuntime("claude-code"),
            permissionMode: "plan",
          },
          trustPolicy: "review-required",
          maxConcurrentRuns: 1,
          informationReferences: [],
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          lastRunAt: null,
          nextRunAt: null,
        },
      ],
    });
    expect(state.automations).toHaveLength(1);
    expect(state.automations[0]?.runtime).toMatchObject({
      permissionMode: "dontAsk",
    });
  });

  test("a delegation policy saved in plan mode is read back as default", () => {
    expect(
      normalizedPermissionOptions("claude-code", {
        claudePermissionMode: "plan",
        claudePlanModeApprovalScope: "strict",
      }),
    ).toMatchObject({ claudePermissionMode: "default" });
  });

  test("a stored plan_ready event is skipped quietly", () => {
    expect(
      parseNormalizedEvent({ payload: { type: "plan_ready", planText: "x" } }),
    ).toBeNull();
  });
});
// end temporary-migration: plan-mode-removal
