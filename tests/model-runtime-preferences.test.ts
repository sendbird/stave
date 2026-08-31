import { describe, expect, test } from "bun:test";
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

    expect(codexSettings.codexReasoningEffort).toBe("xhigh");
    expect(claudeSettings.claudeEffort).toBe("xhigh");
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
});
