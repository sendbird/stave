import { describe, expect, test } from "bun:test";
import {
  registerDynamicDefaultReasoningEfforts,
} from "@/lib/providers/model-catalog";
import {
  applyModelRuntimePreference,
  buildModelRuntimePreferenceKey,
  mergeModelRuntimePreference,
  normalizeModelRuntimePreferences,
  type ModelRuntimePreferenceSettings,
} from "@/lib/providers/model-runtime-preferences";

const settings: ModelRuntimePreferenceSettings = {
  modelRuntimePreferences: {},
  modelClaude: "claude-sonnet-5",
  modelCodex: "gpt-5.6-terra",
  modelKiro: "auto",
  claudePermissionMode: "acceptEdits",
  claudeAllowDangerouslySkipPermissions: false,
  claudeSandboxEnabled: false,
  claudeAllowUnsandboxedCommands: true,
  claudeEffort: "high",
  claudeFastMode: false,
  cursorEffort: "medium",
  cursorFastMode: false,
  codexFileAccess: "workspace-write",
  codexApprovalPolicy: "untrusted",
  codexNetworkAccess: false,
  codexWebSearch: "cached",
  codexReasoningEffort: "xhigh",
  codexFastMode: false,
  kiroEffort: "medium",
};

describe("model runtime preferences", () => {
  test("keeps mode, effort, and fast mode isolated between Codex models", () => {
    let preferences = mergeModelRuntimePreference({
      preferences: {},
      providerId: "codex",
      model: "gpt-5.6-luna",
      patch: { mode: "auto", effort: "max", fastMode: true },
    });
    preferences = mergeModelRuntimePreference({
      preferences,
      providerId: "codex",
      model: "gpt-5.6-sol",
      patch: { mode: "manual", effort: "ultra", fastMode: false },
    });

    const lunaSettings = applyModelRuntimePreference({
      settings: { ...settings, modelRuntimePreferences: preferences },
      providerId: "codex",
      model: "gpt-5.6-luna",
    });
    const solSettings = applyModelRuntimePreference({
      settings: { ...settings, modelRuntimePreferences: preferences },
      providerId: "codex",
      model: "gpt-5.6-sol",
    });

    expect(lunaSettings).toMatchObject({
      codexFileAccess: "danger-full-access",
      codexApprovalPolicy: "never",
      codexNetworkAccess: true,
      codexWebSearch: "live",
      codexReasoningEffort: "max",
      codexFastMode: true,
    });
    expect(solSettings).toMatchObject({
      codexFileAccess: "read-only",
      codexApprovalPolicy: "on-request",
      codexNetworkAccess: false,
      codexWebSearch: "disabled",
      codexReasoningEffort: "ultra",
      codexFastMode: false,
    });
  });

  test("restores Claude preferences without changing provider defaults", () => {
    const preferences = mergeModelRuntimePreference({
      preferences: {},
      providerId: "claude-code",
      model: "claude-opus-4-8",
      patch: { mode: "manual", effort: "max", fastMode: true },
    });
    const scopedSettings = applyModelRuntimePreference({
      settings: { ...settings, modelRuntimePreferences: preferences },
      providerId: "claude-code",
      model: "claude-opus-4-8",
    });

    expect(scopedSettings).toMatchObject({
      claudePermissionMode: "default",
      claudeSandboxEnabled: true,
      claudeAllowUnsandboxedCommands: false,
      claudeEffort: "max",
      claudeFastMode: true,
    });
    expect(settings).toMatchObject({
      claudePermissionMode: "acceptEdits",
      claudeEffort: "high",
      claudeFastMode: false,
    });
  });

  test("falls back to the original settings for an unseen model", () => {
    const scopedSettings = applyModelRuntimePreference({
      settings,
      providerId: "codex",
      model: "gpt-5.6-terra",
    });

    expect(scopedSettings).toBe(settings);
  });

  test("uses model defaults instead of carrying effort into an unseen model", () => {
    const codexSettings = applyModelRuntimePreference({
      settings: {
        ...settings,
        modelCodex: "gpt-5.6-luna",
        codexReasoningEffort: "max",
      },
      providerId: "codex",
      model: "gpt-5.6-sol",
    });
    const claudeSettings = applyModelRuntimePreference({
      settings,
      providerId: "claude-code",
      model: "claude-opus-4-8",
    });

    // Sol and Opus both sit on the "high" rung of the inverse effort ladder,
    // so neither inherits Luna's "max" nor the incoming settings value.
    expect(codexSettings.codexReasoningEffort).toBe("high");
    expect(claudeSettings.claudeEffort).toBe("high");
  });

  test("normalizes persisted preferences by provider capabilities", () => {
    const normalized = normalizeModelRuntimePreferences({
      "claude-code:claude-opus-4-8": {
        mode: "auto",
        effort: "ultra",
        fastMode: true,
      },
      "codex:gpt-5.6-luna": {
        mode: "guided",
        effort: "max",
        fastMode: false,
      },
      "kiro:kiro-model": {
        effort: "xhigh",
        fastMode: true,
      },
      invalid: { mode: "auto", effort: "high" },
    });

    expect(normalized).toEqual({
      [buildModelRuntimePreferenceKey({
        providerId: "claude-code",
        model: "claude-opus-4-8",
      })]: { mode: "auto", fastMode: true },
      [buildModelRuntimePreferenceKey({
        providerId: "codex",
        model: "gpt-5.6-luna",
      })]: { mode: "guided", effort: "max", fastMode: false },
      [buildModelRuntimePreferenceKey({
        providerId: "kiro",
        model: "kiro-model",
      })]: { effort: "xhigh" },
    });
  });

  test("remembers Kiro effort per model without changing Codex settings", () => {
    const preferences = mergeModelRuntimePreference({
      preferences: {},
      providerId: "kiro",
      model: "kiro-model",
      patch: { effort: "high" },
    });
    const scoped = applyModelRuntimePreference({
      settings: { ...settings, modelRuntimePreferences: preferences },
      providerId: "kiro",
      model: "kiro-model",
    });

    expect(scoped.kiroEffort).toBe("high");
    expect(scoped.codexReasoningEffort).toBe(settings.codexReasoningEffort);
  });

  test("remembers Cursor effort and fast mode per model", () => {
    const preferences = mergeModelRuntimePreference({
      preferences: {},
      providerId: "cursor",
      model: "gpt-5.6-sol",
      patch: { effort: "high", fastMode: true },
    });
    const scoped = applyModelRuntimePreference({
      settings: { ...settings, modelRuntimePreferences: preferences },
      providerId: "cursor",
      model: "gpt-5.6-sol",
    });

    expect(scoped).toMatchObject({
      cursorEffort: "high",
      cursorFastMode: true,
    });
    expect(scoped.kiroEffort).toBe(settings.kiroEffort);
  });

  // Regression: "Astra effort keeps resetting to low".
  //
  // The composer re-derives the Codex effort from settings on every render and
  // only stores a per-model preference when the selection carried an explicit
  // effort. Switching to a model without one (the seeded Alt+1..0 slots have
  // no effort configured) therefore hit this fallback every time — and the old
  // fallback adopted the target model's runtime default unconditionally, so a
  // model whose `model/list` recommendation is "low" overwrote the user's
  // choice continuously rather than once.
  describe("codex model switch", () => {
    const withAstraDefaultLow = () => {
      registerDynamicDefaultReasoningEfforts(
        new Map([
          ["gpt-6-astra", "low"],
          ["gpt-5.6-terra", "xhigh"],
        ]),
      );
    };

    test("carries a tuned effort onto the next model", () => {
      withAstraDefaultLow();

      const scoped = applyModelRuntimePreference({
        // "ultra" is not Terra's default, so it was a deliberate choice.
        settings: { ...settings, codexReasoningEffort: "ultra" },
        providerId: "codex",
        model: "gpt-6-astra",
      });

      expect(scoped.codexReasoningEffort).toBe("ultra");
    });

    test("re-derives an effort still parked on the previous default", () => {
      withAstraDefaultLow();

      const scoped = applyModelRuntimePreference({
        // "xhigh" is Terra's default, so it was never tuned.
        settings: { ...settings, codexReasoningEffort: "xhigh" },
        providerId: "codex",
        model: "gpt-6-astra",
      });

      expect(scoped.codexReasoningEffort).toBe("low");
    });

    test("a stored per-model preference still wins outright", () => {
      withAstraDefaultLow();

      const preferences = mergeModelRuntimePreference({
        preferences: {},
        providerId: "codex",
        model: "gpt-6-astra",
        patch: { effort: "max" },
      });
      const scoped = applyModelRuntimePreference({
        settings: {
          ...settings,
          codexReasoningEffort: "xhigh",
          modelRuntimePreferences: preferences,
        },
        providerId: "codex",
        model: "gpt-6-astra",
      });

      expect(scoped.codexReasoningEffort).toBe("max");
    });

    test("still clamps a carried effort the target model rejects", () => {
      registerDynamicDefaultReasoningEfforts(
        new Map([["gpt-5.6-terra", "xhigh"]]),
      );

      const scoped = applyModelRuntimePreference({
        // Luna accepts no "ultra"; the carried value steps down to "max".
        settings: { ...settings, codexReasoningEffort: "ultra" },
        providerId: "codex",
        model: "gpt-5.6-luna",
      });

      expect(scoped.codexReasoningEffort).toBe("max");
    });
  });
});
