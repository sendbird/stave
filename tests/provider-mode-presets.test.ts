import { describe, expect, test } from "bun:test";
import {
  buildClaudeProviderModeSettingsPatch,
  buildCodexProviderModeSettingsPatch,
  detectClaudeProviderModePreset,
  detectCodexProviderModePreset,
  resolveClaudeProviderModePresentation,
  resolveCodexProviderModePresentation,
} from "@/lib/providers/provider-mode-presets";

describe("provider mode presets", () => {
  test("detects Claude auto preset from the current default-style combination", () => {
    expect(detectClaudeProviderModePreset({
      settings: {
        claudePermissionMode: "auto",
        claudeAllowDangerouslySkipPermissions: false,
        claudeSandboxEnabled: false,
        claudeAllowUnsandboxedCommands: true,
      },
    })).toBe("auto");
  });

  test("detects Claude guided preset from acceptEdits combination", () => {
    expect(detectClaudeProviderModePreset({
      settings: {
        claudePermissionMode: "acceptEdits",
        claudeAllowDangerouslySkipPermissions: false,
        claudeSandboxEnabled: false,
        claudeAllowUnsandboxedCommands: true,
      },
    })).toBe("guided");
  });

  test("builds Codex auto preset patch", () => {
    expect(buildCodexProviderModeSettingsPatch({ presetId: "auto" })).toEqual({
      codexFileAccess: "danger-full-access",
      codexApprovalPolicy: "never",
      codexNetworkAccess: true,
      codexWebSearch: "live",
    });
  });

  test("detects Codex guided preset from the App Server baseline", () => {
    expect(detectCodexProviderModePreset({
      settings: {
        codexFileAccess: "workspace-write",
        codexApprovalPolicy: "untrusted",
        codexNetworkAccess: false,
        codexWebSearch: "cached",
      },
    })).toBe("guided");
  });

  test("includes plan-mode notes in presenter output", () => {
    const claudePresentation = resolveClaudeProviderModePresentation({
      settings: buildClaudeProviderModeSettingsPatch({ presetId: "manual" }),
      planMode: true,
    });
    const codexPresentation = resolveCodexProviderModePresentation({
      settings: buildCodexProviderModeSettingsPatch({ presetId: "guided" }),
      planMode: true,
    });

    expect(claudePresentation.label).toBe("Manual");
    expect(claudePresentation.planNote).toContain("Plan is enabled");
    expect(codexPresentation.label).toBe("Guided");
    expect(codexPresentation.planNote).toContain("read-only");
  });
});
