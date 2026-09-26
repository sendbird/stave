import { describe, expect, test } from "bun:test";
import {
  applyAutomationTrustPolicyToRuntime,
  applyAutomationCadencePreset,
  automationPermissionModeToTrustPolicy,
  automationTrustPolicyToPermissionMode,
  detectAutomationCadencePreset,
  AUTOMATION_PERMISSION_MODES,
  MAX_AUTOMATION_RUNS_PER_AUTOMATION,
  AUTOMATION_CADENCE_PRESETS,
  computeNextAutomationRunAt,
  createDefaultAutomationRuntime,
  formatAutomationSchedule,
  normalizeAutomationState,
  pruneAutomationRuns,
  automationRuntimeToProviderOptions,
  AutomationInformationResourceCreateInputSchema,
  AutomationUpsertInputSchema,
  type AutomationRun,
} from "@/lib/automations";

describe("automation schedule", () => {
  test("computes the next interval without replaying missed periods", () => {
    expect(
      computeNextAutomationRunAt({
        schedule: { every: 2, unit: "hours" },
        after: "2026-07-23T00:00:00.000Z",
      }),
    ).toBe("2026-07-23T02:00:00.000Z");
    expect(formatAutomationSchedule({ every: 1, unit: "days" })).toBe(
      "Every 1 day",
    );
    expect(formatAutomationSchedule({ every: 3, unit: "weeks" })).toBe(
      "Every 3 weeks",
    );
  });

  test("anchors daily schedules to the chosen local start time", () => {
    // Local wall-clock anchors, so build expectations from local dates too.
    const beforeStart = new Date(2026, 0, 13, 8, 0);
    const afterStart = new Date(2026, 0, 13, 10, 0);
    const at = { hour: 9, minute: 30 };

    expect(
      computeNextAutomationRunAt({
        schedule: { every: 1, unit: "days", at },
        after: beforeStart,
      }),
    ).toBe(new Date(2026, 0, 13, 9, 30).toISOString());
    expect(
      computeNextAutomationRunAt({
        schedule: { every: 1, unit: "days", at },
        after: afterStart,
      }),
    ).toBe(new Date(2026, 0, 14, 9, 30).toISOString());
    expect(
      computeNextAutomationRunAt({
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
      computeNextAutomationRunAt({
        schedule: { every: 1, unit: "weeks", at, weekday: 1 },
        after: tuesday,
      }),
    ).toBe(new Date(2026, 0, 19, 9, 0).toISOString());
    // Friday (5) is still ahead this week.
    expect(
      computeNextAutomationRunAt({
        schedule: { every: 1, unit: "weeks", at, weekday: 5 },
        after: tuesday,
      }),
    ).toBe(new Date(2026, 0, 16, 9, 0).toISOString());
    // Same weekday, time already passed → skip a full period.
    expect(
      computeNextAutomationRunAt({
        schedule: { every: 2, unit: "weeks", at, weekday: 2 },
        after: tuesday,
      }),
    ).toBe(new Date(2026, 0, 27, 9, 0).toISOString());
  });

  test("formats schedule anchors", () => {
    expect(
      formatAutomationSchedule({
        every: 1,
        unit: "days",
        at: { hour: 9, minute: 5 },
      }),
    ).toBe("Every 1 day at 09:05");
    expect(
      formatAutomationSchedule({
        every: 2,
        unit: "weeks",
        at: { hour: 14, minute: 30 },
        weekday: 1,
      }),
    ).toBe("Every 2 weeks on Mon at 14:30");
  });
});

describe("automation multi-weekday schedules", () => {
  const at = { hour: 9, minute: 0 };

  test("fires on whichever targeted weekday comes first", () => {
    // 2026-01-13 is a Tuesday (local), 10:00 — past today's 09:00 anchor.
    const tuesday = new Date(2026, 0, 13, 10, 0);
    expect(
      computeNextAutomationRunAt({
        schedule: {
          every: 1,
          unit: "weeks",
          at,
          weekdays: [1, 2, 3, 4, 5],
        },
        after: tuesday,
      }),
      // Wednesday is the next weekday ahead.
    ).toBe(new Date(2026, 0, 14, 9, 0).toISOString());
    expect(
      computeNextAutomationRunAt({
        schedule: { every: 1, unit: "weeks", at, weekdays: [0, 6] },
        after: tuesday,
      }),
      // Saturday comes before Sunday.
    ).toBe(new Date(2026, 0, 17, 9, 0).toISOString());
  });

  test("matches the single-weekday result for a one-day set", () => {
    const tuesday = new Date(2026, 0, 13, 10, 0);
    expect(
      computeNextAutomationRunAt({
        schedule: { every: 1, unit: "weeks", at, weekdays: [5] },
        after: tuesday,
      }),
    ).toBe(
      computeNextAutomationRunAt({
        schedule: { every: 1, unit: "weeks", at, weekday: 5 },
        after: tuesday,
      }),
    );
  });

  test("formats common weekday sets as plain language", () => {
    expect(
      formatAutomationSchedule({
        every: 1,
        unit: "weeks",
        at,
        weekdays: [1, 2, 3, 4, 5],
      }),
    ).toBe("Every weekday at 09:00");
    expect(
      formatAutomationSchedule({ every: 1, unit: "weeks", at, weekdays: [0, 6] }),
    ).toBe("Every weekend day at 09:00");
    expect(
      formatAutomationSchedule({ every: 1, unit: "weeks", at, weekdays: [1, 3] }),
    ).toBe("Every week on Mon, Wed at 09:00");
    expect(
      formatAutomationSchedule({ every: 2, unit: "weeks", at, weekdays: [1, 3] }),
    ).toBe("Every 2 weeks on Mon, Wed at 09:00");
  });

  test("rejects weekday sets that cannot be scheduled", () => {
    const base = {
      name: "Weekday review",
      prompt: "Review changes.",
      enabled: true,
      environment: {
        kind: "repository" as const,
        workspaceId: "ws-1",
        path: "/tmp/project",
        repositoryPath: "/tmp/project",
        label: "Project",
      },
      runtime: createDefaultAutomationRuntime("codex"),
    };
    // Missing start time.
    expect(
      AutomationUpsertInputSchema.safeParse({
        ...base,
        schedule: { every: 1, unit: "weeks", weekdays: [1, 2] },
      }).success,
    ).toBe(false);
    // Wrong unit.
    expect(
      AutomationUpsertInputSchema.safeParse({
        ...base,
        schedule: { every: 1, unit: "days", at, weekdays: [1, 2] },
      }).success,
    ).toBe(false);
    // Duplicate days.
    expect(
      AutomationUpsertInputSchema.safeParse({
        ...base,
        schedule: { every: 1, unit: "weeks", at, weekdays: [1, 1] },
      }).success,
    ).toBe(false);
    // Both day sources at once.
    expect(
      AutomationUpsertInputSchema.safeParse({
        ...base,
        schedule: { every: 1, unit: "weeks", at, weekday: 1, weekdays: [2] },
      }).success,
    ).toBe(false);
    expect(
      AutomationUpsertInputSchema.safeParse({
        ...base,
        schedule: { every: 1, unit: "weeks", at, weekdays: [1, 2] },
      }).success,
    ).toBe(true);
  });
});

describe("automation cadence presets", () => {
  const dailySchedule = {
    every: 1,
    unit: "days" as const,
    at: { hour: 9, minute: 0 },
  };

  test("round-trips every preset it can express", () => {
    for (const preset of AUTOMATION_CADENCE_PRESETS) {
      if (preset === "custom") {
        continue;
      }
      const applied = applyAutomationCadencePreset({
        preset,
        schedule: dailySchedule,
        enabled: true,
      });
      expect(
        detectAutomationCadencePreset({
          schedule: applied.schedule,
          enabled: applied.enabled,
        }),
      ).toBe(preset);
    }
  });

  test("produces schedules the spec schema accepts", () => {
    for (const preset of AUTOMATION_CADENCE_PRESETS) {
      const applied = applyAutomationCadencePreset({
        preset,
        schedule: dailySchedule,
        enabled: true,
      });
      expect(
        AutomationUpsertInputSchema.safeParse({
          name: "Preset",
          prompt: "Do the thing.",
          enabled: applied.enabled,
          schedule: applied.schedule,
          environment: {
            kind: "repository" as const,
            workspaceId: "ws-1",
            path: "/tmp/project",
            repositoryPath: "/tmp/project",
            label: "Project",
          },
          runtime: createDefaultAutomationRuntime("codex"),
        }).success,
      ).toBe(true);
    }
  });

  test("manual keeps the schedule so re-enabling restores the cadence", () => {
    const applied = applyAutomationCadencePreset({
      preset: "manual",
      schedule: dailySchedule,
      enabled: true,
    });
    expect(applied.enabled).toBe(false);
    expect(applied.schedule).toEqual(dailySchedule);
    expect(
      detectAutomationCadencePreset({ schedule: dailySchedule, enabled: false }),
    ).toBe("manual");
  });

  test("falls back to custom for hand-tuned intervals", () => {
    expect(
      detectAutomationCadencePreset({
        schedule: { every: 3, unit: "hours" },
        enabled: true,
      }),
    ).toBe("custom");
  });
});

describe("automation permission modes", () => {
  test("maps every mode onto a distinct trust policy", () => {
    for (const mode of AUTOMATION_PERMISSION_MODES) {
      expect(
        automationTrustPolicyToPermissionMode(
          automationPermissionModeToTrustPolicy(mode),
        ),
      ).toBe(mode);
    }
  });

  test("normalizes the runtime to what the host runtime enforces", () => {
    const codex = createDefaultAutomationRuntime("codex");
    expect(
      applyAutomationTrustPolicyToRuntime(codex, "unattended"),
    ).toMatchObject({ approvalPolicy: "never" });
    expect(
      applyAutomationTrustPolicyToRuntime(codex, "review-required"),
    ).toMatchObject({ approvalPolicy: "untrusted" });

    // Unattended runs bypass rather than deny: `dontAsk` used to be wired here
    // and silently blocked Bash, file edits, and third-party MCP servers.
    const claude = {
      ...createDefaultAutomationRuntime("claude-code"),
      permissionMode: "acceptEdits" as const,
      allowDangerouslySkipPermissions: false,
      allowUnsandboxedCommands: true,
    };
    expect(
      applyAutomationTrustPolicyToRuntime(claude, "unattended"),
    ).toMatchObject({
      permissionMode: "bypassPermissions",
      allowUnsandboxedCommands: true,
      allowDangerouslySkipPermissions: true,
    });
    expect(
      applyAutomationTrustPolicyToRuntime(claude, "review-required"),
    ).toMatchObject({
      permissionMode: "default",
      allowUnsandboxedCommands: false,
      allowDangerouslySkipPermissions: false,
    });
  });

  test("leaves hand-configured runtimes untouched", () => {
    const claude = {
      ...createDefaultAutomationRuntime("claude-code"),
      permissionMode: "bypassPermissions" as const,
    };
    expect(
      applyAutomationTrustPolicyToRuntime(claude, "workspace-trusted"),
    ).toBe(claude);
  });
});

describe("automation spec validation", () => {
  const validInput = {
    name: "Daily review",
    prompt: "Review the latest changes.",
    enabled: true,
    schedule: { every: 1, unit: "days" as const },
    environment: {
      kind: "repository" as const,
      workspaceId: "ws-1",
      path: "/tmp/project",
      repositoryPath: "/tmp/project",
      label: "Project",
    },
    runtime: createDefaultAutomationRuntime("codex"),
    informationReferences: [
      {
        section: "notes" as const,
        scope: "section" as const,
        label: "Notes",
        token: "@info:notes",
      },
    ],
  };

  test("accepts a complete editable automation spec", () => {
    expect(AutomationUpsertInputSchema.safeParse(validInput).success).toBe(true);
  });

  test("rejects workspace and folder execution targets", () => {
    expect(
      AutomationUpsertInputSchema.safeParse({
        ...validInput,
        environment: {
          ...validInput.environment,
          kind: "workspace",
        },
      }).success,
    ).toBe(false);
    expect(
      AutomationUpsertInputSchema.safeParse({
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
      AutomationUpsertInputSchema.safeParse({
        ...validInput,
        runtime: {
          ...createDefaultAutomationRuntime("claude-code"),
          permissionMode: "plan",
        },
      }).success,
    ).toBe(true);
    expect(
      AutomationUpsertInputSchema.safeParse({
        ...validInput,
        runtime: {
          ...createDefaultAutomationRuntime("codex"),
          approvalPolicy: "on-failure",
        },
      }).success,
    ).toBe(true);
  });

  test("rejects Lens because background automations only attach Information resources", () => {
    const parsed = AutomationUpsertInputSchema.safeParse({
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
      AutomationUpsertInputSchema.safeParse({
        ...validInput,
        prompt: "",
      }).success,
    ).toBe(false);
    expect(
      AutomationUpsertInputSchema.safeParse({
        ...validInput,
        schedule: { every: 0, unit: "minutes" },
      }).success,
    ).toBe(false);
  });

  test("restricts schedule anchors to day and week schedules", () => {
    expect(
      AutomationUpsertInputSchema.safeParse({
        ...validInput,
        schedule: {
          every: 1,
          unit: "days",
          at: { hour: 9, minute: 0 },
        },
      }).success,
    ).toBe(true);
    expect(
      AutomationUpsertInputSchema.safeParse({
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
      AutomationUpsertInputSchema.safeParse({
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
      AutomationUpsertInputSchema.safeParse({
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
      AutomationUpsertInputSchema.safeParse({
        ...validInput,
        schedule: { every: 1, unit: "weeks", weekday: 1 },
      }).success,
    ).toBe(false);
  });
});

describe("automation Information resource validation", () => {
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
        AutomationInformationResourceCreateInputSchema.safeParse(input).success,
      ).toBe(true);
    }
  });

  test("rejects missing content and non-http resource URLs", () => {
    expect(
      AutomationInformationResourceCreateInputSchema.safeParse({
        kind: "notes",
        workspaceId: "ws-1",
        text: " ",
      }).success,
    ).toBe(false);
    expect(
      AutomationInformationResourceCreateInputSchema.safeParse({
        kind: "figma",
        workspaceId: "ws-1",
        url: "file:///tmp/design.fig",
      }).success,
    ).toBe(false);
  });
});

describe("automation runtime options", () => {
  test("maps Codex permissions and effort onto the provider contract", () => {
    const runtime = {
      ...createDefaultAutomationRuntime("codex"),
      provider: "codex" as const,
      effort: "ultra" as const,
      fileAccess: "danger-full-access" as const,
      approvalPolicy: "on-failure" as const,
      networkAccess: true,
      webSearch: "live" as const,
    };
    expect(automationRuntimeToProviderOptions(runtime)).toEqual({
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
      ...createDefaultAutomationRuntime("claude-code"),
      provider: "claude-code" as const,
      effort: "max" as const,
      permissionMode: "plan" as const,
      sandboxEnabled: true,
      allowUnsandboxedCommands: false,
      allowDangerouslySkipPermissions: true,
    };
    expect(automationRuntimeToProviderOptions(runtime)).toEqual({
      model: runtime.model,
      claudeEffort: "max",
      claudePermissionMode: "plan",
      claudeSandboxEnabled: true,
      claudeAllowUnsandboxedCommands: false,
      claudeAllowDangerouslySkipPermissions: true,
    });
  });
});

describe("automation persistence normalization", () => {
  test("falls back to an empty versioned state for invalid data", () => {
    expect(normalizeAutomationState({ version: 99 })).toEqual({
      version: 1,
      automations: [],
      runs: [],
    });
  });

  test("keeps only the newest bounded run history per automation", () => {
    const runs: AutomationRun[] = Array.from({ length: 55 }, (_, index) => ({
      id: `run-${index}`,
      automationId: "automation-1",
      workspaceId: "ws-1",
      repositoryPath: "/tmp/project",
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

    const pruned = pruneAutomationRuns(runs);
    expect(pruned).toHaveLength(MAX_AUTOMATION_RUNS_PER_AUTOMATION);
    expect(pruned[0]?.id).toBe("run-54");
    expect(pruned.at(-1)?.id).toBe("run-5");
  });
});
