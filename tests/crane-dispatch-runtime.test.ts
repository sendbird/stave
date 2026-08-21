import { describe, expect, test } from "bun:test";
import {
  applyCraneAutonomyPreset,
  buildCraneDispatchRuntimeChoice,
  buildCraneTeamRuntimeMemory,
  clampCraneDispatchEffort,
  describeCraneAccess,
  detectCraneAutonomyPreset,
  listCraneEffortOptions,
  reseedCraneAccessForProvider,
  resolveCraneDispatchAccessDefaults,
  resolveCraneDispatchAdvisorChoice,
  resolveCraneDispatchAdvisorDefaults,
  resolveCraneDispatchAdvisorTarget,
  resolveCraneDispatchEffort,
  resolveCraneDispatchModelDefaults,
  selectCraneDispatchAdvisorTarget,
  type CraneDispatchAccessState,
} from "@/lib/crane-connector/dispatch-runtime";
import { CraneDispatchApprovalResponseSchema } from "@/lib/crane-connector/types";
import { defaultSettings } from "@/store/app-settings";

const SETTINGS = {
  ...defaultSettings,
  modelClaude: "claude-opus-4-5",
  modelCodex: "gpt-5.6",
  claudeEffort: "high",
  codexReasoningEffort: "xhigh",
} satisfies typeof defaultSettings;

const ADVISOR_SETTINGS_OFF = {
  advisorEnabled: false,
  advisorTarget: null,
  advisorTargetByProvider: {},
  advisorConsultLimit: 5,
};

const GUIDED_CLAUDE_ACCESS: CraneDispatchAccessState = {
  claudePermissionMode: "acceptEdits",
  claudeSandboxEnabled: false,
  claudeAllowUnsandboxedCommands: true,
  claudeAllowDangerouslySkipPermissions: false,
  codexFileAccess: "workspace-write",
  codexNetworkAccess: false,
  codexApprovalPolicy: "untrusted",
  codexWebSearch: "cached",
};

describe("Crane dispatch runtime", () => {
  test("defaults effort to the same value an interactive turn would use", () => {
    expect(
      resolveCraneDispatchEffort({
        settings: SETTINGS,
        providerId: "claude-code",
        model: SETTINGS.modelClaude,
      }),
    ).toBe("high");
    expect(
      resolveCraneDispatchEffort({
        settings: SETTINGS,
        providerId: "codex",
        model: SETTINGS.modelCodex,
      }),
    ).toBe("xhigh");
  });

  test("always emits the chosen effort in the approve payload", () => {
    const claudeRuntime = buildCraneDispatchRuntimeChoice({
      model: {
        providerId: "claude-code",
        model: "claude-opus-4-5",
        effort: "max",
        codexFastMode: false,
      },
      access: GUIDED_CLAUDE_ACCESS,
      providerTimeoutMs: 43_200_000,
      advisor: null,
    });
    expect(claudeRuntime).toMatchObject({
      provider: "claude-code",
      claudeEffort: "max",
    });

    const codexRuntime = buildCraneDispatchRuntimeChoice({
      model: {
        providerId: "codex",
        model: "gpt-5.6",
        effort: "ultra",
        codexFastMode: true,
      },
      access: GUIDED_CLAUDE_ACCESS,
      providerTimeoutMs: 43_200_000,
      advisor: null,
    });
    expect(codexRuntime).toMatchObject({
      provider: "codex",
      codexReasoningEffort: "ultra",
      codexFastMode: true,
    });

    for (const runtime of [claudeRuntime, codexRuntime]) {
      expect(
        CraneDispatchApprovalResponseSchema.safeParse({
          jobId: "job-1",
          projectPath: "/tmp/project",
          workspace: { strategy: "new", branchName: "crane/atl-2" },
          runtime,
        }).success,
      ).toBe(true);
    }
  });

  test("never sends a Codex-only effort tier as claudeEffort", () => {
    // Reachable if a remembered Codex runtime is replayed onto Claude before
    // the clamp runs; the strict IPC schema would reject "ultra" outright.
    expect(
      buildCraneDispatchRuntimeChoice({
        model: {
          providerId: "claude-code",
          model: "claude-opus-4-5",
          effort: "ultra",
          codexFastMode: false,
        },
        access: GUIDED_CLAUDE_ACCESS,
        providerTimeoutMs: 43_200_000,
        advisor: null,
      }),
    ).toMatchObject({ claudeEffort: "high" });
  });

  test("clamps an effort the target model does not accept", () => {
    const lunaEfforts = listCraneEffortOptions({
      providerId: "codex",
      model: "gpt-5.6-luna",
    }).map((option) => option.value);
    const clamped = clampCraneDispatchEffort({
      settings: SETTINGS,
      providerId: "codex",
      model: "gpt-5.6-luna",
      effort: "ultra",
    });
    if (lunaEfforts.includes("ultra")) {
      expect(clamped).toBe("ultra");
    } else {
      expect(lunaEfforts).toContain(clamped);
      expect(clamped).not.toBe("ultra");
    }

    expect(
      clampCraneDispatchEffort({
        settings: SETTINGS,
        providerId: "claude-code",
        model: "claude-opus-4-5",
        effort: "ultra",
      }),
    ).toBe("high");
  });

  test("round-trips each autonomy preset on the fields Crane can send", () => {
    for (const providerId of ["claude-code", "codex"] as const) {
      for (const presetId of ["manual", "guided", "auto"] as const) {
        const access = applyCraneAutonomyPreset({
          providerId,
          presetId,
          access: GUIDED_CLAUDE_ACCESS,
        });
        expect(detectCraneAutonomyPreset({ providerId, access })).toBe(
          presetId,
        );
      }
    }
  });

  test("sends every field an autonomy preset controls, not just the visible ones", () => {
    // Regression: dropping claudeAllowUnsandboxedCommands made "Manual" a lie.
    // The Claude runtime defaults that flag to true, so a sandboxed Manual run
    // could still escape the sandbox from Bash.
    const manual = applyCraneAutonomyPreset({
      providerId: "claude-code",
      presetId: "manual",
      access: GUIDED_CLAUDE_ACCESS,
    });
    expect(manual).toMatchObject({
      claudePermissionMode: "default",
      claudeSandboxEnabled: true,
      claudeAllowUnsandboxedCommands: false,
      claudeAllowDangerouslySkipPermissions: false,
    });
    expect(
      buildCraneDispatchRuntimeChoice({
        model: {
          providerId: "claude-code",
          model: "claude-opus-4-5",
          effort: "high",
          codexFastMode: false,
        },
        access: manual,
        providerTimeoutMs: 43_200_000,
        advisor: null,
      }),
    ).toMatchObject({
      claudeSandboxEnabled: true,
      claudeAllowUnsandboxedCommands: false,
    });

    const codexManual = applyCraneAutonomyPreset({
      providerId: "codex",
      presetId: "manual",
      access: GUIDED_CLAUDE_ACCESS,
    });
    expect(codexManual.codexWebSearch).toBe("disabled");
    expect(
      buildCraneDispatchRuntimeChoice({
        model: {
          providerId: "codex",
          model: "gpt-5.6",
          effort: "high",
          codexFastMode: false,
        },
        access: codexManual,
        providerTimeoutMs: 43_200_000,
        advisor: null,
      }),
    ).toMatchObject({ codexWebSearch: "disabled" });
  });

  test("carries an explicit autonomy choice across a provider switch", () => {
    // Stave defaults here are the most permissive Codex preset, so a dropped
    // carry-over would silently upgrade a deliberate Manual to Auto.
    const permissiveSettings = {
      ...SETTINGS,
      codexFileAccess: "danger-full-access",
      codexApprovalPolicy: "never",
      codexNetworkAccess: true,
      codexWebSearch: "live",
    } satisfies typeof defaultSettings;
    const manualClaude = applyCraneAutonomyPreset({
      providerId: "claude-code",
      presetId: "manual",
      access: resolveCraneDispatchAccessDefaults({
        settings: permissiveSettings,
        providerId: "claude-code",
        model: "claude-opus-4-5",
      }),
    });

    const switched = reseedCraneAccessForProvider({
      settings: permissiveSettings,
      previous: { providerId: "claude-code", access: manualClaude },
      next: { providerId: "codex", model: "gpt-5.6" },
    });
    expect(
      detectCraneAutonomyPreset({ providerId: "codex", access: switched }),
    ).toBe("manual");
    expect(switched).toMatchObject({
      codexFileAccess: "read-only",
      codexApprovalPolicy: "on-request",
      codexNetworkAccess: false,
    });

    // A hand-edited state has no counterpart, so the new provider falls back
    // to its own Stave defaults rather than an invented mapping.
    const customClaude = {
      ...manualClaude,
      claudePermissionMode: "bypassPermissions",
    } satisfies CraneDispatchAccessState;
    expect(
      reseedCraneAccessForProvider({
        settings: permissiveSettings,
        previous: { providerId: "claude-code", access: customClaude },
        next: { providerId: "codex", model: "gpt-5.6" },
      }),
    ).toMatchObject({ codexFileAccess: "danger-full-access" });

    // Same provider must be a no-op, not a reset to defaults.
    expect(
      reseedCraneAccessForProvider({
        settings: permissiveSettings,
        previous: { providerId: "claude-code", access: customClaude },
        next: { providerId: "claude-code", model: "claude-haiku-4-5" },
      }),
    ).toBe(customClaude);
  });

  test("prefers a per-model pinned mode over the global provider setting", () => {
    const pinned = {
      ...SETTINGS,
      claudePermissionMode: "auto",
      claudeSandboxEnabled: false,
      modelRuntimePreferences: {
        "claude-code:claude-opus-4-5": { mode: "manual" },
      },
    } as unknown as typeof defaultSettings;
    expect(
      detectCraneAutonomyPreset({
        providerId: "claude-code",
        access: resolveCraneDispatchAccessDefaults({
          settings: pinned,
          providerId: "claude-code",
          model: "claude-opus-4-5",
        }),
      }),
    ).toBe("manual");
  });

  test("discards a remembered model the picker no longer offers", () => {
    const memory = {
      provider: "codex",
      model: "gpt-5.6-retired",
      effort: "low",
      fastMode: true,
    } as const;
    expect(
      resolveCraneDispatchModelDefaults({
        settings: SETTINGS,
        draftProvider: "claude-code",
        memory,
        availableModels: ["gpt-5.6", "claude-opus-4-5"],
      }),
    ).toMatchObject({
      providerId: "claude-code",
      model: "claude-opus-4-5",
      effort: "high",
    });
    expect(
      resolveCraneDispatchModelDefaults({
        settings: SETTINGS,
        draftProvider: "claude-code",
        memory,
        availableModels: ["gpt-5.6-retired"],
      }),
    ).toMatchObject({ providerId: "codex", model: "gpt-5.6-retired" });
  });

  test("reports a hand-edited access combination as custom", () => {
    expect(
      detectCraneAutonomyPreset({
        providerId: "claude-code",
        access: {
          ...GUIDED_CLAUDE_ACCESS,
          claudePermissionMode: "bypassPermissions",
        },
      }),
    ).toBeNull();
    expect(
      describeCraneAccess({
        providerId: "claude-code",
        access: GUIDED_CLAUDE_ACCESS,
      }),
    ).toBe(
      "Permission acceptEdits / Sandbox off / Unsandboxed on / Dangerous Skip off",
    );
  });

  test("seeds from remembered team runtime but re-derives access locally", () => {
    const remembered = resolveCraneDispatchModelDefaults({
      settings: SETTINGS,
      draftProvider: "claude-code",
      memory: {
        provider: "codex",
        model: "gpt-5.6",
        effort: "low",
        fastMode: true,
      },
    });
    expect(remembered).toEqual({
      providerId: "codex",
      model: "gpt-5.6",
      effort: "low",
      codexFastMode: true,
    });

    // Access levels are never remembered: an "auto" one-off approval must not
    // silently replay on the team's next job.
    const autoSettings = {
      ...SETTINGS,
      codexFileAccess: "danger-full-access",
      codexApprovalPolicy: "never",
      codexNetworkAccess: true,
      codexWebSearch: "live",
    } satisfies typeof defaultSettings;
    expect(
      buildCraneTeamRuntimeMemory({
        model: remembered,
        advisor: resolveCraneDispatchAdvisorDefaults({
          settings: ADVISOR_SETTINGS_OFF,
          primaryProviderId: "codex",
        }),
      }),
    ).not.toHaveProperty("codexFileAccess");
    expect(
      detectCraneAutonomyPreset({
        providerId: "codex",
        access: resolveCraneDispatchAccessDefaults({
          settings: autoSettings,
          providerId: "codex",
          model: "gpt-5.6",
        }),
      }),
    ).toBe("auto");
  });

  test("falls back to the draft provider defaults without a memory", () => {
    expect(
      resolveCraneDispatchModelDefaults({
        settings: SETTINGS,
        draftProvider: "codex",
        memory: null,
      }),
    ).toMatchObject({
      providerId: "codex",
      model: "gpt-5.6",
      effort: "xhigh",
    });
  });

  describe("advisor", () => {
    test("inherits the Stave default instead of always starting off", () => {
      // The regression this replaces: the dialog hardcoded "off", so a user
      // with a configured global Advisor silently lost it on every dispatch.
      const advisor = resolveCraneDispatchAdvisorDefaults({
        settings: {
          advisorEnabled: true,
          advisorTarget: { providerId: "codex", model: "gpt-5.6-sol" },
          advisorTargetByProvider: {},
          advisorConsultLimit: 5,
        },
        primaryProviderId: "claude-code",
      });
      expect(advisor.enabled).toBe(true);
      expect(advisor.providerId).toBe("codex");
      expect(resolveCraneDispatchAdvisorTarget(advisor)).toMatchObject({
        providerId: "codex",
        model: "gpt-5.6-sol",
      });
    });

    test("inherits the settings default for the provider it is not armed with", () => {
      const advisor = resolveCraneDispatchAdvisorDefaults({
        settings: {
          advisorEnabled: false,
          advisorTarget: null,
          advisorTargetByProvider: {
            "claude-code": { model: "claude-fable-5", effort: "max" },
          },
          advisorConsultLimit: 5,
        },
        primaryProviderId: "codex",
      });
      // Nothing armed, so it opens opposite the primary — and finds the
      // per-provider default configured in Settings rather than the catalog
      // floor.
      expect(advisor.enabled).toBe(false);
      expect(advisor.providerId).toBe("claude-code");
      expect(advisor.targetByProvider["claude-code"]).toMatchObject({
        model: "claude-fable-5",
        effort: "max",
      });
    });

    test("distinguishes a team with no advisor memory from one explicitly off", () => {
      const settings = {
        advisorEnabled: true,
        advisorTarget: { providerId: "codex" as const, model: "gpt-5.6-sol" },
        advisorTargetByProvider: {},
        advisorConsultLimit: 5,
      };
      const memory = {
        provider: "codex" as const,
        model: "gpt-5.6",
        effort: "xhigh" as const,
      };

      // Mapped before the Advisor became rememberable: the key is absent, so
      // the global default still applies rather than reading as "off".
      expect(
        resolveCraneDispatchAdvisorDefaults({
          settings,
          memory,
          primaryProviderId: "codex",
        }).enabled,
      ).toBe(true);

      // An explicit null is the team saying "no Advisor", which must survive a
      // default that is on.
      expect(
        resolveCraneDispatchAdvisorDefaults({
          settings,
          memory: { ...memory, advisor: null },
          primaryProviderId: "codex",
        }).enabled,
      ).toBe(false);

      // An explicit target wins over the Stave default target.
      const remembered = resolveCraneDispatchAdvisorDefaults({
        settings,
        memory: {
          ...memory,
          advisor: { providerId: "claude-code", model: "claude-fable-5" },
        },
        primaryProviderId: "codex",
      });
      expect(remembered.enabled).toBe(true);
      expect(resolveCraneDispatchAdvisorTarget(remembered)).toMatchObject({
        providerId: "claude-code",
        model: "claude-fable-5",
      });
    });

    test("keeps each provider's pick when the provider is switched back", () => {
      let advisor = resolveCraneDispatchAdvisorDefaults({
        settings: ADVISOR_SETTINGS_OFF,
        primaryProviderId: "claude-code",
      });
      advisor = selectCraneDispatchAdvisorTarget({
        advisor,
        target: { providerId: "codex", model: "gpt-5.6-sol", effort: "high" },
      });
      advisor = selectCraneDispatchAdvisorTarget({
        advisor,
        target: {
          providerId: "claude-code",
          model: "claude-fable-5",
          effort: "max",
        },
      });

      // Switching provider must not reset the other side to the catalog
      // default, which is what a single flat target would have done.
      expect(advisor.targetByProvider.codex).toMatchObject({
        model: "gpt-5.6-sol",
        effort: "high",
      });
      expect(advisor.targetByProvider["claude-code"]).toMatchObject({
        model: "claude-fable-5",
        effort: "max",
      });
    });

    test("configuring an advisor while off does not arm it", () => {
      const seeded = resolveCraneDispatchAdvisorDefaults({
        settings: ADVISOR_SETTINGS_OFF,
        primaryProviderId: "claude-code",
      });
      const configured = selectCraneDispatchAdvisorTarget({
        advisor: seeded,
        target: { providerId: "codex", model: "gpt-5.6-sol" },
      });
      expect(configured.enabled).toBe(false);
      expect(resolveCraneDispatchAdvisorTarget(configured)).toBeNull();
    });

    test("remembers an advisor-free dispatch as an explicit null", () => {
      const model = {
        providerId: "codex" as const,
        model: "gpt-5.6",
        effort: "xhigh" as const,
        codexFastMode: false,
      };
      const off = resolveCraneDispatchAdvisorDefaults({
        settings: ADVISOR_SETTINGS_OFF,
        primaryProviderId: "codex",
      });
      // `null`, not absent: absent would re-inherit the global default on the
      // team's next job and undo the choice being remembered.
      expect(buildCraneTeamRuntimeMemory({ model, advisor: off })).toMatchObject(
        { advisor: null },
      );

      const armed = selectCraneDispatchAdvisorTarget({
        advisor: { ...off, enabled: true },
        target: { providerId: "claude-code", model: "claude-fable-5" },
      });
      expect(
        buildCraneTeamRuntimeMemory({ model, advisor: armed }).advisor,
      ).toMatchObject({ providerId: "claude-code", model: "claude-fable-5" });
    });

    test("sends the advisor effort and consult budget through the IPC schema", () => {
      const runtime = buildCraneDispatchRuntimeChoice({
        model: {
          providerId: "codex",
          model: "gpt-5.6",
          effort: "xhigh",
          codexFastMode: false,
        },
        access: GUIDED_CLAUDE_ACCESS,
        providerTimeoutMs: 43_200_000,
        advisor: resolveCraneDispatchAdvisorChoice({
          advisor: selectCraneDispatchAdvisorTarget({
            advisor: {
              ...resolveCraneDispatchAdvisorDefaults({
                settings: ADVISOR_SETTINGS_OFF,
                primaryProviderId: "codex",
              }),
              enabled: true,
            },
            target: {
              providerId: "claude-code",
              model: "claude-fable-5",
              effort: "max",
            },
          }),
          consultLimit: 2,
        }),
      });

      // The effort used to be stripped by the strict schema, and the budget was
      // never sent at all, so a dispatch silently ran at the model default with
      // the runtime's own ceiling of 5.
      expect(runtime).toMatchObject({
        advisorTarget: {
          providerId: "claude-code",
          model: "claude-fable-5",
          effort: "max",
        },
        advisorConsultLimit: 2,
      });
      expect(
        CraneDispatchApprovalResponseSchema.safeParse({
          jobId: "job-1",
          projectPath: "/tmp/project",
          workspace: { strategy: "new", branchName: "crane/atl-2" },
          runtime,
        }).success,
      ).toBe(true);
    });

    test("rejects an advisor target with no consult budget beside it", () => {
      const base = {
        jobId: "job-1",
        projectPath: "/tmp/project",
        workspace: { strategy: "new", branchName: "crane/atl-2" },
        runtime: buildCraneDispatchRuntimeChoice({
          model: {
            providerId: "codex",
            model: "gpt-5.6",
            effort: "xhigh",
            codexFastMode: false,
          },
          access: GUIDED_CLAUDE_ACCESS,
          providerTimeoutMs: 43_200_000,
          advisor: null,
        }),
      };

      // A hand-built payload is the case the refinement guards: the builder
      // cannot produce it, but the main process parses whatever arrives.
      expect(
        CraneDispatchApprovalResponseSchema.safeParse({
          ...base,
          runtime: {
            ...base.runtime,
            advisorTarget: { providerId: "codex", model: "gpt-5.6-sol" },
          },
        }).success,
      ).toBe(false);
      expect(
        CraneDispatchApprovalResponseSchema.safeParse({
          ...base,
          runtime: { ...base.runtime, advisorConsultLimit: 3 },
        }).success,
      ).toBe(false);
    });
  });
});
