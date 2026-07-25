import { describe, expect, test } from "bun:test";
import {
  MAX_ROUTINE_RUNS_PER_ROUTINE,
  computeNextRoutineRunAt,
  createDefaultRoutineRuntime,
  formatRoutineSchedule,
  normalizeRoutineState,
  pruneRoutineRuns,
  routineRuntimeToProviderOptions,
  RoutineInformationResourceCreateInputSchema,
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

  test("anchors daily schedules to the chosen local start time", () => {
    // Local wall-clock anchors, so build expectations from local dates too.
    const beforeStart = new Date(2026, 0, 13, 8, 0);
    const afterStart = new Date(2026, 0, 13, 10, 0);
    const at = { hour: 9, minute: 30 };

    expect(
      computeNextRoutineRunAt({
        schedule: { every: 1, unit: "days", at },
        after: beforeStart,
      }),
    ).toBe(new Date(2026, 0, 13, 9, 30).toISOString());
    expect(
      computeNextRoutineRunAt({
        schedule: { every: 1, unit: "days", at },
        after: afterStart,
      }),
    ).toBe(new Date(2026, 0, 14, 9, 30).toISOString());
    expect(
      computeNextRoutineRunAt({
        schedule: { every: 3, unit: "days", at },
        after: afterStart,
      }),
    ).toBe(new Date(2026, 0, 16, 9, 30).toISOString());
  });

  test("anchors weekly schedules to the chosen weekday and time", () => {
    // 2026-01-13 is a Tuesday (local).
    const tuesday = new Date(2026, 0, 13, 10, 0);
    const at = { hour: 9, minute: 0 };

    // Monday (1) has already passed this week → next Monday.
    expect(
      computeNextRoutineRunAt({
        schedule: { every: 1, unit: "weeks", at, weekday: 1 },
        after: tuesday,
      }),
    ).toBe(new Date(2026, 0, 19, 9, 0).toISOString());
    // Friday (5) is still ahead this week.
    expect(
      computeNextRoutineRunAt({
        schedule: { every: 1, unit: "weeks", at, weekday: 5 },
        after: tuesday,
      }),
    ).toBe(new Date(2026, 0, 16, 9, 0).toISOString());
    // Same weekday, time already passed → skip a full period.
    expect(
      computeNextRoutineRunAt({
        schedule: { every: 2, unit: "weeks", at, weekday: 2 },
        after: tuesday,
      }),
    ).toBe(new Date(2026, 0, 27, 9, 0).toISOString());
  });

  test("formats schedule anchors", () => {
    expect(
      formatRoutineSchedule({
        every: 1,
        unit: "days",
        at: { hour: 9, minute: 5 },
      }),
    ).toBe("Every 1 day at 09:05");
    expect(
      formatRoutineSchedule({
        every: 2,
        unit: "weeks",
        at: { hour: 14, minute: 30 },
        weekday: 1,
      }),
    ).toBe("Every 2 weeks on Mon at 14:30");
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

  test("restricts schedule anchors to day and week schedules", () => {
    expect(
      RoutineUpsertInputSchema.safeParse({
        ...validInput,
        schedule: {
          every: 1,
          unit: "days",
          at: { hour: 9, minute: 0 },
        },
      }).success,
    ).toBe(true);
    expect(
      RoutineUpsertInputSchema.safeParse({
        ...validInput,
        schedule: {
          every: 1,
          unit: "weeks",
          at: { hour: 9, minute: 0 },
          weekday: 1,
        },
      }).success,
    ).toBe(true);
    // Start time is meaningless for minute/hour intervals.
    expect(
      RoutineUpsertInputSchema.safeParse({
        ...validInput,
        schedule: {
          every: 30,
          unit: "minutes",
          at: { hour: 9, minute: 0 },
        },
      }).success,
    ).toBe(false);
    // A weekday anchor requires a week schedule and a start time.
    expect(
      RoutineUpsertInputSchema.safeParse({
        ...validInput,
        schedule: {
          every: 1,
          unit: "days",
          at: { hour: 9, minute: 0 },
          weekday: 1,
        },
      }).success,
    ).toBe(false);
    expect(
      RoutineUpsertInputSchema.safeParse({
        ...validInput,
        schedule: { every: 1, unit: "weeks", weekday: 1 },
      }).success,
    ).toBe(false);
  });
});

describe("routine Information resource validation", () => {
  test("accepts each resource-specific create payload", () => {
    const workspaceId = "ws-1";
    const inputs = [
      { kind: "notes", workspaceId, text: "Review the release policy." },
      { kind: "todo", workspaceId, text: "Check the deployment." },
      {
        kind: "pull_request",
        workspaceId,
        url: "https://github.com/sendbird/stave/pull/185",
        status: "review",
      },
      {
        kind: "jira",
        workspaceId,
        url: "https://example.atlassian.net/browse/PROJ-123",
        issueKey: "PROJ-123",
      },
      {
        kind: "confluence",
        workspaceId,
        url: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Spec",
        spaceKey: "ENG",
      },
      {
        kind: "storybook",
        workspaceId,
        url: "https://storybook.example.com/?path=/docs/button",
      },
      {
        kind: "amplify",
        workspaceId,
        url: "https://main.example.amplifyapp.com",
      },
      {
        kind: "slack",
        workspaceId,
        url: "https://team.slack.com/archives/C123/p123",
        channelName: "#project",
      },
      {
        kind: "figma",
        workspaceId,
        url: "https://www.figma.com/design/file-key/example?node-id=1-2",
        nodeId: "1:2",
      },
      {
        kind: "custom",
        workspaceId,
        label: "Environment",
        fieldType: "single_select",
        value: "Staging",
        options: ["Development", "Staging", "Production"],
      },
    ];

    for (const input of inputs) {
      expect(
        RoutineInformationResourceCreateInputSchema.safeParse(input).success,
      ).toBe(true);
    }
  });

  test("rejects missing content and non-http resource URLs", () => {
    expect(
      RoutineInformationResourceCreateInputSchema.safeParse({
        kind: "notes",
        workspaceId: "ws-1",
        text: " ",
      }).success,
    ).toBe(false);
    expect(
      RoutineInformationResourceCreateInputSchema.safeParse({
        kind: "figma",
        workspaceId: "ws-1",
        url: "file:///tmp/design.fig",
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
      startedAt: new Date(Date.UTC(2026, 6, 23, 0, index)).toISOString(),
      completedAt: new Date(Date.UTC(2026, 6, 23, 0, index, 30)).toISOString(),
      resultPreview: null,
      error: null,
      configHash: null,
      trustPolicy: "review-required",
    }));

    const pruned = pruneRoutineRuns(runs);
    expect(pruned).toHaveLength(MAX_ROUTINE_RUNS_PER_ROUTINE);
    expect(pruned[0]?.id).toBe("run-54");
    expect(pruned.at(-1)?.id).toBe("run-5");
  });
});
