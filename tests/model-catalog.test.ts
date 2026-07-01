import { describe, expect, test } from "bun:test";
import {
  CODEX_MODEL_OPTIONS,
  DEFAULT_CLAUDE_OPUS_MODEL,
  getDynamicDisplayNames,
  resolveClaudeEffortForModelSwitch,
  resolveDefaultClaudeEffortForModel,
  getDefaultModelForProvider,
  getNextProviderId,
  getProviderLabel,
  getProviderWaveToneClass,
  inferProviderIdFromModel,
  registerDynamicDisplayNames,
  toHumanModelName,
  upgradeSettingsScopedClaudeModel,
} from "@/lib/providers/model-catalog";

describe("model catalog", () => {
  test("includes the verified Codex model set", () => {
    expect(CODEX_MODEL_OPTIONS).toEqual([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex-spark",
    ]);
  });

  test("formats current GPT models with canonical labels", () => {
    expect(toHumanModelName({ model: "gpt-5.5" })).toBe("GPT-5.5");
    expect(toHumanModelName({ model: "gpt-5.4" })).toBe("GPT-5.4");
  });

  test("formats Claude Sonnet 5 with canonical labels", () => {
    expect(toHumanModelName({ model: "claude-sonnet-5" })).toBe(
      "Claude Sonnet 5",
    );
    expect(toHumanModelName({ model: "claude-sonnet-5[1m]" })).toBe(
      "Claude Sonnet 5 (1M)",
    );
  });

  test("returns provider labels from the descriptor registry", () => {
    expect(
      getProviderLabel({ providerId: "claude-code", variant: "full" }),
    ).toBe("Claude Code");
    expect(getProviderLabel({ providerId: "claude-code" })).toBe("Claude");
  });

  test("returns provider defaults from the descriptor registry", () => {
    expect(getDefaultModelForProvider({ providerId: "claude-code" })).toBe(
      "claude-sonnet-5",
    );
    expect(getDefaultModelForProvider({ providerId: "codex" })).toBe(
      "gpt-5.5",
    );
  });

  test("uses xhigh for Opus and high for Sonnet as the Claude effort default", () => {
    expect(
      resolveDefaultClaudeEffortForModel({ model: DEFAULT_CLAUDE_OPUS_MODEL }),
    ).toBe("xhigh");
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-opus-4-7[1m]" }),
    ).toBe("xhigh");
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-sonnet-5" }),
    ).toBe("high");
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-sonnet-5[1m]" }),
    ).toBe("high");
    // Legacy Sonnet 4.6 ids that still appear in historical records resolve too.
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-sonnet-4-6" }),
    ).toBe("high");
  });

  test("only updates Claude effort on model switch when the current value is still the previous model default", () => {
    expect(
      resolveClaudeEffortForModelSwitch({
        previousModel: "claude-sonnet-4-6",
        nextModel: DEFAULT_CLAUDE_OPUS_MODEL,
        currentEffort: "high",
      }),
    ).toBe("xhigh");
    expect(
      resolveClaudeEffortForModelSwitch({
        previousModel: DEFAULT_CLAUDE_OPUS_MODEL,
        nextModel: "claude-sonnet-4-6",
        currentEffort: "xhigh",
      }),
    ).toBe("high");
    expect(
      resolveClaudeEffortForModelSwitch({
        previousModel: "claude-sonnet-4-6",
        nextModel: DEFAULT_CLAUDE_OPUS_MODEL,
        currentEffort: "max",
      }),
    ).toBe("max");
  });

  test("upgrades settings-scoped Opus and Sonnet aliases to the current default while preserving the 1M suffix", () => {
    expect(
      upgradeSettingsScopedClaudeModel({ model: "claude-opus-4-6" }),
    ).toBe(DEFAULT_CLAUDE_OPUS_MODEL);
    expect(
      upgradeSettingsScopedClaudeModel({ model: "claude-opus-4-6[1m]" }),
    ).toBe("claude-opus-4-8[1m]");
    expect(
      upgradeSettingsScopedClaudeModel({ model: "claude-opus-4-6-fast" }),
    ).toBe("claude-opus-4-6-fast");
    expect(
      upgradeSettingsScopedClaudeModel({ model: "claude-sonnet-4-6" }),
    ).toBe("claude-sonnet-5");
    expect(
      upgradeSettingsScopedClaudeModel({ model: "claude-sonnet-4-6[1m]" }),
    ).toBe("claude-sonnet-5[1m]");
    // Already-current Sonnet 5 ids pass through unchanged.
    expect(
      upgradeSettingsScopedClaudeModel({ model: "claude-sonnet-5" }),
    ).toBe("claude-sonnet-5");
  });

  test("returns provider wave tone classes", () => {
    expect(getProviderWaveToneClass({ providerId: "claude-code" })).toBe(
      "text-provider-claude",
    );
    expect(getProviderWaveToneClass({ providerId: "codex" })).toBe(
      "text-provider-codex",
    );
  });

  test("infers provider ids from routed model ids", () => {
    expect(inferProviderIdFromModel({ model: "gpt-5.4" })).toBe("codex");
    expect(inferProviderIdFromModel({ model: "gpt-5-codex" })).toBe("codex");
    expect(inferProviderIdFromModel({ model: "claude-sonnet-4-6" })).toBe(
      "claude-code",
    );
  });

  // ── 1M context model variants ─────────────────────────────────────────────

  test("formats [1m] model variants with human-readable labels", () => {
    expect(toHumanModelName({ model: "claude-opus-4-8[1m]" })).toBe(
      "Claude Opus 4.8 (1M)",
    );
    expect(toHumanModelName({ model: "claude-sonnet-4-6[1m]" })).toBe(
      "Claude Sonnet 4.6 (1M)",
    );
    // Legacy Opus 4.6 (1M) label is retained so existing chat/turn records
    // continue to render a recognizable name.
    expect(toHumanModelName({ model: "claude-opus-4-6[1m]" })).toBe(
      "Claude Opus 4.6 (1M)",
    );
  });

  test("infers claude-code provider for [1m] model variants", () => {
    expect(inferProviderIdFromModel({ model: "claude-opus-4-8[1m]" })).toBe(
      "claude-code",
    );
    expect(inferProviderIdFromModel({ model: "claude-sonnet-4-6[1m]" })).toBe(
      "claude-code",
    );
  });

  test("wave tone class resolves correctly for [1m] variants", () => {
    expect(
      getProviderWaveToneClass({
        providerId: "claude-code",
        model: "claude-opus-4-8[1m]",
      }),
    ).toBe("text-provider-claude");
    expect(
      getProviderWaveToneClass({
        providerId: "claude-code",
        model: "claude-sonnet-4-6[1m]",
      }),
    ).toBe("text-provider-claude");
  });

  test("cycles provider order from the descriptor registry", () => {
    expect(getNextProviderId({ providerId: "claude-code" })).toBe("codex");
    expect(getNextProviderId({ providerId: "codex" })).toBe("claude-code");
  });

  // ── Dynamic display-name registry ─────────────────────────────────────────

  describe("dynamic display-name registry", () => {
    test("registerDynamicDisplayNames populates the registry", () => {
      registerDynamicDisplayNames(
        new Map([
          ["gpt-5.5-turbo", "GPT-5.5 Turbo"],
          ["gpt-6", "GPT-6"],
        ]),
      );
      expect(getDynamicDisplayNames().get("gpt-5.5-turbo")).toBe(
        "GPT-5.5 Turbo",
      );
      expect(getDynamicDisplayNames().get("gpt-6")).toBe("GPT-6");
    });

    test("toHumanModelName prefers dynamic names over the fallback formatter", () => {
      registerDynamicDisplayNames(
        new Map([["gpt-99-future", "GPT 99 Future"]]),
      );
      expect(toHumanModelName({ model: "gpt-99-future" })).toBe(
        "GPT 99 Future",
      );
    });

    test("toHumanModelName still returns static names when no dynamic entry exists", () => {
      expect(toHumanModelName({ model: DEFAULT_CLAUDE_OPUS_MODEL })).toBe(
        "Claude Opus 4.8",
      );
    });

    test("dynamic names do not overwrite static names when both exist", () => {
      // Static "gpt-5.4" = "GPT-5.4"; dynamic should override it
      registerDynamicDisplayNames(new Map([["gpt-5.4", "GPT 5.4 (Dynamic)"]]));
      // Dynamic wins
      expect(toHumanModelName({ model: "gpt-5.4" })).toBe("GPT 5.4 (Dynamic)");
    });
  });
});
