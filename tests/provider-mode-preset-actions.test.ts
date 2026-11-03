import { describe, expect, test } from "bun:test";
import {
  buildClaudeProviderModeSettingsPatch,
  buildCodexProviderModeSettingsPatch,
  describePresetActions,
  describePresetLocks,
  type PresetAction,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import type { ProviderId } from "@/lib/providers/provider.types";

const PRESETS: readonly ProviderModePresetId[] = ["manual", "guided", "auto"];
const PROVIDERS: readonly ProviderId[] = ["claude-code", "codex", "cursor", "kiro", "opencode"];

const table = (actions: readonly PresetAction[]) =>
  actions.map((action) => `${action.kind}:${action.state}${action.note ? `(${action.note})` : ""}`);

/**
 * A preset list is a safety statement: a wrong "on its own" tells the user a
 * call will not stop when it will run. Every row is reviewed against the
 * provider's meaning of the preset's settings, and the cross-checks below tie
 * the rows to the preset definitions so a changed preset fails here.
 */
describe("describePresetActions", () => {
  test("the provider × preset table", () => {
    const snapshot = Object.fromEntries(PROVIDERS.map((providerId) => [
      providerId,
      Object.fromEntries(PRESETS.map((presetId) => [presetId, table(describePresetActions(providerId, presetId))])),
    ]));
    expect(snapshot).toEqual({
      "claude-code": {
        manual: ["read:own", "edit:asks", "command:sandbox", "web:asks", "mcp:asks"],
        guided: ["read:own", "edit:own", "command:asks(someFileCommands)", "web:asks", "mcp:asks"],
        auto: ["read:own", "edit:own", "command:flagged", "web:own", "mcp:flagged"],
      },
      codex: {
        manual: ["read:own", "edit:asks", "command:sandbox(beyondSandboxAsks)", "web:off"],
        guided: ["read:own", "edit:flagged", "command:flagged", "web:own"],
        auto: ["read:own", "edit:own", "command:own", "web:own"],
      },
      cursor: { manual: ["tools:asks"], guided: ["tools:flagged"], auto: ["tools:own"] },
      // No Guided tier: nothing is listed for a preset the provider lacks.
      kiro: { manual: ["tools:asks"], guided: [], auto: ["tools:own"] },
      opencode: { manual: ["tools:asks"], guided: [], auto: ["tools:own"] },
    });
  });

  test("Claude's rows follow its preset settings", () => {
    for (const presetId of PRESETS) {
      const patch = buildClaudeProviderModeSettingsPatch({ presetId });
      const byKind = new Map(describePresetActions("claude-code", presetId).map((action) => [action.kind, action]));
      // Commands run without asking only inside a sandbox that cannot be left,
      // or where Claude's own classifier reviews them.
      if (byKind.get("command")?.state === "sandbox") {
        expect(patch.claudeSandboxEnabled).toBe(true);
        expect(patch.claudeAllowUnsandboxedCommands).toBe(false);
      }
      expect(byKind.get("command")?.state).not.toBe("own");
      // Edits run on their own only where the permission mode accepts them.
      if (byKind.get("edit")?.state === "own") {
        expect(["acceptEdits", "auto", "bypassPermissions"]).toContain(patch.claudePermissionMode);
      }
      // No preset bypasses permissions, so nothing is listed as unconditional
      // except reads, edits and (in auto) web tools.
      expect(patch.claudeAllowDangerouslySkipPermissions).toBe(false);
    }
  });

  test("Codex's rows follow its preset settings", () => {
    for (const presetId of PRESETS) {
      const patch = buildCodexProviderModeSettingsPatch({ presetId });
      const byKind = new Map(describePresetActions("codex", presetId).map((action) => [action.kind, action]));
      const neverAsks = patch.codexApprovalPolicy === "never";
      // Something runs on its own outside a sandbox only when Codex never asks.
      for (const kind of ["edit", "command"] as const) {
        if (byKind.get(kind)?.state === "own") expect(neverAsks).toBe(true);
      }
      if (patch.codexFileAccess === "read-only") expect(byKind.get("edit")?.state).toBe("asks");
      expect(byKind.get("web")?.state).toBe(patch.codexWebSearch === "disabled" ? "off" : "own");
      // MCP tools follow Codex's own App and MCP tool approval setting.
      expect(byKind.has("mcp")).toBe(false);
    }
  });
});

describe("describePresetLocks", () => {
  test("only Claude has rows that always ask, and only the guardrails left on", () => {
    expect(describePresetLocks("claude-code", ["G1", "G2", "G3"])).toEqual(["G1", "G2", "G3"]);
    expect(describePresetLocks("claude-code", ["G3", "G1"])).toEqual(["G1", "G3"]);
    expect(describePresetLocks("claude-code", [])).toEqual([]);
    for (const providerId of ["codex", "cursor", "kiro", "opencode"] as const) {
      expect(describePresetLocks(providerId, ["G1", "G2", "G3"])).toEqual([]);
    }
  });
});
