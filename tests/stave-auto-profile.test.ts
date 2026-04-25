import { describe, expect, test } from "bun:test";
import {
  applyStaveRoleRuntimeOverrides,
  buildStaveAutoModelSettingsPatch,
  buildStaveAutoProfileFromSettings,
  createDefaultStaveAutoRoleRuntimeOverrides,
  DEFAULT_STAVE_AUTO_MODEL_PRESET_ID,
  detectStaveAutoModelPreset,
  normalizeStaveAutoRoleRuntimeOverrides,
} from "@/lib/providers/stave-auto-profile";

function createSettings(
  overrides: Partial<
    Parameters<typeof buildStaveAutoProfileFromSettings>[0]["settings"]
  > = {},
) {
  return {
    ...buildStaveAutoModelSettingsPatch({
      presetId: DEFAULT_STAVE_AUTO_MODEL_PRESET_ID,
    }),
    staveAutoOrchestrationMode: "auto" as const,
    staveAutoMaxSubtasks: 3,
    staveAutoMaxParallelSubtasks: 2,
    staveAutoAllowCrossProviderWorkers: true,
    staveAutoFastMode: false,
    staveAutoRoleRuntimeOverrides: createDefaultStaveAutoRoleRuntimeOverrides(),
    claudeFastModeVisible: true,
    codexFastModeVisible: true,
    ...overrides,
  };
}

describe("createDefaultStaveAutoRoleRuntimeOverrides", () => {
  test("returns explicit provider defaults (no undefined/inherit values)", () => {
    const defaults = createDefaultStaveAutoRoleRuntimeOverrides();

    for (const role of Object.values(defaults)) {
      expect(role.claude.permissionMode).toBe("auto");
      expect(role.claude.thinkingMode).toBe("adaptive");
      expect(role.claude.effort).toBe("medium");
      expect(role.claude.fastMode).toBe(false);
      expect(role.codex.approvalPolicy).toBe("untrusted");
      expect(role.codex.reasoningEffort).toBe("medium");
      expect(role.codex.fastMode).toBe(false);
    }
  });
});

describe("stave auto profile presets", () => {
  test("uses GPT-5.5 as the recommended verify model", () => {
    const recommended = buildStaveAutoModelSettingsPatch({
      presetId: DEFAULT_STAVE_AUTO_MODEL_PRESET_ID,
    });

    expect(recommended.staveAutoImplementModel).toBe("gpt-5.3-codex");
    expect(recommended.staveAutoVerifyModel).toBe("gpt-5.5");
  });

  test("detects known presets from matching role settings", () => {
    expect(
      detectStaveAutoModelPreset({
        settings: buildStaveAutoModelSettingsPatch({ presetId: "recommended" }),
      }),
    ).toBe("recommended");
    expect(
      detectStaveAutoModelPreset({
        settings: buildStaveAutoModelSettingsPatch({
          presetId: "recommended-1m",
        }),
      }),
    ).toBe("recommended-1m");
    expect(
      detectStaveAutoModelPreset({
        settings: buildStaveAutoModelSettingsPatch({ presetId: "claude-only" }),
      }),
    ).toBe("claude-only");
    expect(
      detectStaveAutoModelPreset({
        settings: buildStaveAutoModelSettingsPatch({ presetId: "codex-only" }),
      }),
    ).toBe("codex-only");
  });

  test("treats mixed manual values as custom", () => {
    const custom = buildStaveAutoModelSettingsPatch({
      presetId: "recommended",
    });
    custom.staveAutoImplementModel = "claude-sonnet-4-6";

    expect(detectStaveAutoModelPreset({ settings: custom })).toBeNull();
  });

  test("lowers supervisor defaults across the built-in presets", () => {
    expect(
      buildStaveAutoModelSettingsPatch({ presetId: "recommended" })
        .staveAutoSupervisorModel,
    ).toBe("claude-sonnet-4-6");
    expect(
      buildStaveAutoModelSettingsPatch({ presetId: "recommended-1m" })
        .staveAutoSupervisorModel,
    ).toBe("claude-sonnet-4-6[1m]");
    expect(
      buildStaveAutoModelSettingsPatch({ presetId: "claude-only" })
        .staveAutoSupervisorModel,
    ).toBe("claude-sonnet-4-6");
    expect(
      buildStaveAutoModelSettingsPatch({ presetId: "codex-only" })
        .staveAutoSupervisorModel,
    ).toBe("gpt-5.4-mini");
  });

  test("recommended-1m preset uses [1m] models for supervisor, analyze and general", () => {
    const patch = buildStaveAutoModelSettingsPatch({
      presetId: "recommended-1m",
    });

    expect(patch.staveAutoSupervisorModel).toBe("claude-sonnet-4-6[1m]");
    expect(patch.staveAutoAnalyzeModel).toBe("claude-opus-4-7[1m]");
    expect(patch.staveAutoGeneralModel).toBe("claude-sonnet-4-6[1m]");

    // Lightweight roles stay on standard-context models
    expect(patch.staveAutoClassifierModel).toBe("claude-haiku-4-5");
    expect(patch.staveAutoQuickEditModel).toBe("claude-haiku-4-5");
    expect(patch.staveAutoImplementModel).toBe("gpt-5.3-codex");
    expect(patch.staveAutoVerifyModel).toBe("gpt-5.5");
  });

  test("builds the runtime profile from preset-backed settings", () => {
    const profile = buildStaveAutoProfileFromSettings({
      settings: createSettings({
        ...buildStaveAutoModelSettingsPatch({ presetId: "codex-only" }),
        staveAutoFastMode: true,
      }),
    });

    expect(profile.classifierModel).toBe("gpt-5.4-mini");
    expect(profile.implementModel).toBe("gpt-5.3-codex");
    expect(profile.verifyModel).toBe("gpt-5.5");
    expect(profile.fastMode).toBe(true);
    expect(profile.claudeFastModeSupported).toBe(true);
    expect(profile.codexFastModeSupported).toBe(true);
  });

  test("normalizes partial role runtime overrides", () => {
    const profile = buildStaveAutoProfileFromSettings({
      settings: createSettings({
        staveAutoRoleRuntimeOverrides: normalizeStaveAutoRoleRuntimeOverrides({
          value: {
            implement: {
              codex: {
                reasoningEffort: "xhigh",
                fastMode: true,
              },
            },
          },
        }),
      }),
    });

    expect(profile.roleRuntimeOverrides?.implement.codex.reasoningEffort).toBe(
      "xhigh",
    );
    expect(profile.roleRuntimeOverrides?.implement.codex.fastMode).toBe(true);
    // Per-role defaults are now explicit (not undefined/inherit) — general role keeps the default value.
    expect(profile.roleRuntimeOverrides?.general.claude.permissionMode).toBe(
      "auto",
    );
  });
});

describe("applyStaveRoleRuntimeOverrides", () => {
  test("applies Claude role overrides on top of inherited runtime options", () => {
    const profile = buildStaveAutoProfileFromSettings({
      settings: createSettings({
        staveAutoRoleRuntimeOverrides: normalizeStaveAutoRoleRuntimeOverrides({
          value: {
            plan: {
              claude: {
                permissionMode: "acceptEdits",
                thinkingMode: "enabled",
                effort: "xhigh",
                fastMode: true,
              },
            },
          },
        }),
      }),
    });

    expect(
      applyStaveRoleRuntimeOverrides({
        profile,
        role: "plan",
        model: "claude-opus-4-7",
        runtimeOptions: {
          claudePermissionMode: "auto",
          claudeThinkingMode: "adaptive",
          claudeEffort: "medium",
          claudeFastMode: false,
        },
      }),
    ).toMatchObject({
      claudePermissionMode: "acceptEdits",
      claudeThinkingMode: "enabled",
      claudeEffort: "xhigh",
      claudeFastMode: true,
    });
  });

  test("applies Codex role overrides on top of inherited runtime options", () => {
    const profile = buildStaveAutoProfileFromSettings({
      settings: createSettings({
        staveAutoRoleRuntimeOverrides: normalizeStaveAutoRoleRuntimeOverrides({
          value: {
            implement: {
              codex: {
                approvalPolicy: "never",
                reasoningEffort: "xhigh",
                fastMode: false,
              },
            },
          },
        }),
      }),
    });

    expect(
      applyStaveRoleRuntimeOverrides({
        profile,
        role: "implement",
        model: "gpt-5.3-codex",
        runtimeOptions: {
          codexApprovalPolicy: "on-request",
          codexReasoningEffort: "medium",
          codexFastMode: true,
        },
      }),
    ).toMatchObject({
      codexApprovalPolicy: "never",
      codexReasoningEffort: "xhigh",
      codexFastMode: false,
    });
  });

  test("plan role default permissionMode is 'auto' and can be overridden — callers must re-apply 'plan' mode after override", () => {
    // This test documents the invariant that runtime.ts enforces: after applyStaveRoleRuntimeOverrides
    // for the plan role, the caller MUST reset claudePermissionMode back to "plan" to prevent freeze.
    const profile = buildStaveAutoProfileFromSettings({
      settings: createSettings(),
    });

    // Default plan role sets permissionMode to "auto" (explicit default, not inherit).
    // If runtime.ts did NOT re-apply "plan", the Claude runtime would never call ExitPlanMode.
    const result = applyStaveRoleRuntimeOverrides({
      profile,
      role: "plan",
      model: "opusplan",
      runtimeOptions: { claudePermissionMode: "plan" },
    });

    // The default permissionMode override ("auto") clobbers the "plan" value —
    // runtime.ts must restore it after this call.
    expect(result.claudePermissionMode).toBe("auto");
  });
});
