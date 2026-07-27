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
  resolveCraneDispatchEffort,
  resolveCraneDispatchModelDefaults,
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
      advisorTarget: null,
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
      advisorTarget: null,
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
        advisorTarget: null,
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
        advisorTarget: null,
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
        advisorTarget: null,
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
      buildCraneTeamRuntimeMemory({ model: remembered }),
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
});
