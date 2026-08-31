import { describe, expect, test } from "bun:test";
import {
  CURSOR_PROVIDER_MODE_PRESETS,
  KIRO_PROVIDER_MODE_PRESETS,
  buildCursorProviderModeSettingsPatch,
  buildKiroProviderModeSettingsPatch,
  detectCursorProviderModePreset,
  detectKiroProviderModePreset,
  resolveCursorProviderModePresentation,
  resolveKiroProviderModePresentation,
} from "@/lib/providers/provider-mode-presets";
import { buildCursorAcpCommandArgs } from "../electron/providers/cursor/cursor-acp-profile";
import { buildKiroAcpCommandArgs } from "../electron/providers/kiro/kiro-acp-profile";

describe("Cursor and Kiro approval presets", () => {
  test("offers three Cursor tiers and only the two Kiro tiers the CLI can honor", () => {
    expect(CURSOR_PROVIDER_MODE_PRESETS.map((preset) => preset.id)).toEqual([
      "manual",
      "guided",
      "auto",
    ]);
    // `--trust-tools` accepts unknown tool names silently, so a Kiro Guided
    // tier could present as partial trust while trusting nothing.
    expect(KIRO_PROVIDER_MODE_PRESETS.map((preset) => preset.id)).toEqual([
      "manual",
      "auto",
    ]);
  });

  test("maps each Cursor preset to the verified agent acp flags", () => {
    expect(buildCursorAcpCommandArgs("manual")).toEqual(["acp"]);
    expect(buildCursorAcpCommandArgs("guided")).toEqual([
      "acp",
      "--auto-review",
    ]);
    expect(buildCursorAcpCommandArgs("auto")).toEqual([
      "acp",
      "--force",
      "--approve-mcps",
    ]);
    // An absent preference must never be read as "approvals off".
    expect(buildCursorAcpCommandArgs(undefined)).toEqual(["acp"]);
  });

  test("adds Kiro's trust-all flag only for Auto and keeps effort intact", () => {
    expect(buildKiroAcpCommandArgs("xhigh", "manual")).toEqual([
      "acp",
      "--effort",
      "xhigh",
    ]);
    expect(buildKiroAcpCommandArgs("xhigh", "auto")).toEqual([
      "acp",
      "--effort",
      "xhigh",
      "--trust-all-tools",
    ]);
    expect(buildKiroAcpCommandArgs(undefined)).toEqual([
      "acp",
      "--effort",
      "medium",
    ]);
  });

  test("collapses a Kiro preset it cannot honor down to Manual", () => {
    expect(buildKiroProviderModeSettingsPatch({ presetId: "guided" })).toEqual({
      kiroApprovalMode: "manual",
    });
    expect(buildKiroProviderModeSettingsPatch({ presetId: "auto" })).toEqual({
      kiroApprovalMode: "auto",
    });
  });

  test("round-trips each preset through detection", () => {
    for (const preset of CURSOR_PROVIDER_MODE_PRESETS) {
      expect(
        detectCursorProviderModePreset({
          settings: buildCursorProviderModeSettingsPatch({
            presetId: preset.id,
          }),
        }),
      ).toBe(preset.id);
    }
    for (const preset of KIRO_PROVIDER_MODE_PRESETS) {
      expect(
        detectKiroProviderModePreset({
          settings: buildKiroProviderModeSettingsPatch({
            presetId: preset.id,
          }),
        }),
      ).toBe(preset.id);
    }
  });

  test("describes the flags behind each tier and notes Cursor plan mode", () => {
    expect(
      resolveCursorProviderModePresentation({
        settings: { cursorApprovalMode: "auto" },
      }),
    ).toMatchObject({ id: "auto", tone: "warning" });
    expect(
      resolveCursorProviderModePresentation({
        settings: { cursorApprovalMode: "auto" },
      }).detail,
    ).toContain("--force");
    expect(
      resolveCursorProviderModePresentation({
        settings: { cursorApprovalMode: "manual" },
        planMode: true,
      }).planNote,
    ).toContain("plan");
    expect(
      resolveKiroProviderModePresentation({
        settings: { kiroApprovalMode: "auto" },
      }).detail,
    ).toContain("--trust-all-tools");
  });
});
