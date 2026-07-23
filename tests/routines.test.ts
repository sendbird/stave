import { describe, expect, test } from "bun:test";
import {
  MAX_ROUTINE_RUNS_PER_ROUTINE,
  computeNextRoutineRunAt,
  createDefaultRoutineRuntime,
  formatRoutineSchedule,
  normalizeRoutineState,
  pruneRoutineRuns,
  routineRuntimeToProviderOptions,
  RoutineUpsertInputSchema,
  type RoutineRun,
} from "@/lib/routines";

describe("routine schedule", () => {
  test("computes the next interval without replaying missed periods", () => {
    expect(
      computeNextRoutineRunAt({
        schedule: { every: 2, unit: "hours" },
        after: "2026-07-23T00:00:00.000Z",
      }),
    ).toBe("2026-07-23T02:00:00.000Z");
    expect(formatRoutineSchedule({ every: 1, unit: "days" })).toBe(
      "Every 1 day",
    );
    expect(formatRoutineSchedule({ every: 3, unit: "weeks" })).toBe(
      "Every 3 weeks",
    );
  });
});

describe("routine spec validation", () => {
  const validInput = {
    name: "Daily review",
    prompt: "Review the latest changes.",
    enabled: true,
    schedule: { every: 1, unit: "days" as const },
    environment: {
      kind: "repository" as const,
      workspaceId: "ws-1",
      path: "/tmp/project",
      projectPath: "/tmp/project",
      label: "Project",
    },
    runtime: createDefaultRoutineRuntime("codex"),
    informationReferences: [
      {
        section: "notes" as const,
        scope: "section" as const,
        label: "Notes",
        token: "@info:notes",
      },
    ],
  };

  test("accepts a complete editable routine spec", () => {
    expect(RoutineUpsertInputSchema.safeParse(validInput).success).toBe(true);
  });

  test("rejects workspace and folder execution targets", () => {
    expect(
      RoutineUpsertInputSchema.safeParse({
        ...validInput,
        environment: {
          ...validInput.environment,
          kind: "workspace",
        },
      }).success,
    ).toBe(false);
    expect(
      RoutineUpsertInputSchema.safeParse({
        ...validInput,
        environment: {
          ...validInput.environment,
          kind: "folder",
        },
      }).success,
    ).toBe(false);
  });

  test("accepts provider-specific plan and on-failure permission modes", () => {
    expect(
      RoutineUpsertInputSchema.safeParse({
        ...validInput,
        runtime: {
          ...createDefaultRoutineRuntime("claude-code"),
          permissionMode: "plan",
        },
      }).success,
    ).toBe(true);
    expect(
      RoutineUpsertInputSchema.safeParse({
        ...validInput,
        runtime: {
          ...createDefaultRoutineRuntime("codex"),
          approvalPolicy: "on-failure",
        },
      }).success,
    ).toBe(true);
  });

  test("rejects Lens because background routines only attach Information resources", () => {
    const parsed = RoutineUpsertInputSchema.safeParse({
      ...validInput,
      informationReferences: [
        {
          section: "lens",
          scope: "section",
          label: "Lens",
          token: "@lens",
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects empty prompts and invalid intervals", () => {
    expect(
      RoutineUpsertInputSchema.safeParse({
        ...validInput,
        prompt: "",
      }).success,
    ).toBe(false);
    expect(
      RoutineUpsertInputSchema.safeParse({
        ...validInput,
        schedule: { every: 0, unit: "minutes" },
      }).success,
    ).toBe(false);
  });
});

describe("routine runtime options", () => {
  test("maps Codex permissions and effort onto the provider contract", () => {
    const runtime = {
      ...createDefaultRoutineRuntime("codex"),
      provider: "codex" as const,
      effort: "ultra" as const,
      fileAccess: "danger-full-access" as const,
      approvalPolicy: "on-failure" as const,
      networkAccess: true,
      webSearch: "live" as const,
    };
    expect(routineRuntimeToProviderOptions(runtime)).toEqual({
      model: runtime.model,
      codexReasoningEffort: "ultra",
      codexFileAccess: "danger-full-access",
      codexApprovalPolicy: "on-failure",
      codexNetworkAccess: true,
      codexWebSearch: "live",
    });
  });

  test("maps Claude permissions and effort onto the provider contract", () => {
    const runtime = {
      ...createDefaultRoutineRuntime("claude-code"),
      provider: "claude-code" as const,
      effort: "max" as const,
      permissionMode: "plan" as const,
      sandboxEnabled: true,
      allowUnsandboxedCommands: false,
      allowDangerouslySkipPermissions: true,
    };
    expect(routineRuntimeToProviderOptions(runtime)).toEqual({
      model: runtime.model,
      claudeEffort: "max",
      claudePermissionMode: "plan",
      claudeSandboxEnabled: true,
      claudeAllowUnsandboxedCommands: false,
      claudeAllowDangerouslySkipPermissions: true,
    });
  });
});

describe("routine persistence normalization", () => {
  test("falls back to an empty versioned state for invalid data", () => {
    expect(normalizeRoutineState({ version: 99 })).toEqual({
      version: 1,
      routines: [],
      runs: [],
    });
  });

  test("keeps only the newest bounded run history per routine", () => {
    const runs: RoutineRun[] = Array.from({ length: 55 }, (_, index) => ({
      id: `run-${index}`,
      routineId: "routine-1",
      workspaceId: "ws-1",
      projectPath: "/tmp/project",
      taskId: `task-${index}`,
      turnId: `turn-${index}`,
      status: "completed",
      trigger: "scheduled",
      scheduledFor: null,
      startedAt: new Date(
        Date.UTC(2026, 6, 23, 0, index),
      ).toISOString(),
      completedAt: new Date(
        Date.UTC(2026, 6, 23, 0, index, 30),
      ).toISOString(),
      resultPreview: null,
      error: null,
    }));

    const pruned = pruneRoutineRuns(runs);
    expect(pruned).toHaveLength(MAX_ROUTINE_RUNS_PER_ROUTINE);
    expect(pruned[0]?.id).toBe("run-54");
    expect(pruned.at(-1)?.id).toBe("run-5");
  });
});
