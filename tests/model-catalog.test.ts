import { describe, expect, test } from "bun:test";
import {
  ALL_CODEX_REASONING_EFFORTS,
  CLAUDE_FABLE_MODEL,
  CLAUDE_SDK_MODEL_OPTIONS,
  DEFAULT_CLAUDE_HAIKU_MODEL,
  clampCodexEffortToModel,
  CODEX_MODEL_OPTIONS,
  DEFAULT_CLAUDE_OPUS_MODEL,
  getDynamicDisplayNames,
  getModelCapability,
  listCodexReasoningEffortsForModel,
  listModelCapabilities,
  resolveDefaultClaudeFallbackModel,
  resolveClaudeEffortForModelSwitch,
  resolveDefaultCodexEffortForModel,
  resolveDefaultClaudeEffortForModel,
  resolveTierModel,
  getDefaultModelForProvider,
  getNextProviderId,
  getProviderLabel,
  getProviderWaveTone,
  inferProviderIdFromModel,
  registerDynamicDefaultReasoningEfforts,
  registerDynamicDisplayNames,
  registerDynamicSupportedReasoningEfforts,
  toHumanModelName,
  upgradeSettingsScopedClaudeModel,
} from "@/lib/providers/model-catalog";

describe("model catalog", () => {
  test("includes Claude Fable 5.1 without making it the Claude default", () => {
    expect(CLAUDE_SDK_MODEL_OPTIONS).toContain(CLAUDE_FABLE_MODEL);
    expect(getDefaultModelForProvider({ providerId: "claude-code" })).toBe(
      DEFAULT_CLAUDE_OPUS_MODEL,
    );
    expect(getDefaultModelForProvider({ providerId: "claude-code" })).not.toBe(
      CLAUDE_FABLE_MODEL,
    );
  });

  test("includes the verified Codex model set led by GPT-6 Astra", () => {
    expect(CODEX_MODEL_OPTIONS).toEqual([
      "gpt-6-astra",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ]);
  });

  test("includes GPT-6 Astra without making it the Codex default", () => {
    expect(getDefaultModelForProvider({ providerId: "codex" })).toBe(
      "gpt-5.6-sol",
    );
    expect(getDefaultModelForProvider({ providerId: "codex" })).not.toBe(
      "gpt-6-astra",
    );
  });

  test("includes Fable 5.1 and Sonnet 5 in the Claude SDK options", () => {
    expect(CLAUDE_SDK_MODEL_OPTIONS).toContain(CLAUDE_FABLE_MODEL);
    expect(CLAUDE_SDK_MODEL_OPTIONS).toContain("claude-sonnet-5");
    expect(CLAUDE_SDK_MODEL_OPTIONS).toContain("claude-sonnet-5[1m]");
    expect(getDefaultModelForProvider({ providerId: "claude-code" })).toBe(
      DEFAULT_CLAUDE_OPUS_MODEL,
    );
  });

  test("includes Haiku 4.5 so Background AI and other pickers can show the light-tier default", () => {
    expect(CLAUDE_SDK_MODEL_OPTIONS).toContain(DEFAULT_CLAUDE_HAIKU_MODEL);
    expect(getDefaultModelForProvider({ providerId: "claude-code" })).not.toBe(
      DEFAULT_CLAUDE_HAIKU_MODEL,
    );
  });

  test("formats current GPT models with canonical labels", () => {
    expect(toHumanModelName({ model: "gpt-6-astra" })).toBe("GPT-6 Astra");
    expect(toHumanModelName({ model: "gpt-5.6-sol" })).toBe("GPT-5.6 Sol");
    expect(toHumanModelName({ model: "gpt-5.6-terra" })).toBe("GPT-5.6 Terra");
    expect(toHumanModelName({ model: "gpt-5.6-luna" })).toBe("GPT-5.6 Luna");
    expect(toHumanModelName({ model: "gpt-5.5" })).toBe("GPT-5.5");
    expect(toHumanModelName({ model: "claude-sonnet-5" })).toBe(
      "Claude Sonnet 5",
    );
  });

  test("formats Claude Sonnet 5 with canonical labels", () => {
    expect(toHumanModelName({ model: "claude-sonnet-5" })).toBe(
      "Claude Sonnet 5",
    );
    expect(toHumanModelName({ model: "claude-sonnet-5[1m]" })).toBe(
      "Claude Sonnet 5 (1M)",
    );
  });

  test("formats Claude Fable models with canonical labels", () => {
    expect(toHumanModelName({ model: CLAUDE_FABLE_MODEL })).toBe(
      "Claude Fable 5.1",
    );
    // Historical records keep the retired id and still render a real name.
    expect(toHumanModelName({ model: "claude-fable-5" })).toBe(
      "Claude Fable 5",
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
      DEFAULT_CLAUDE_OPUS_MODEL,
    );
    expect(getDefaultModelForProvider({ providerId: "codex" })).toBe(
      "gpt-5.6-sol",
    );
  });

  test("pitches the Claude effort default inverse to model strength", () => {
    // Fable medium -> Opus high -> Sonnet xhigh. Fable is checked before Opus
    // so the shared frontier tier does not drag it up a rung.
    expect(
      resolveDefaultClaudeEffortForModel({ model: CLAUDE_FABLE_MODEL }),
    ).toBe("medium");
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-fable-5" }),
    ).toBe("medium");
    expect(
      resolveDefaultClaudeEffortForModel({ model: DEFAULT_CLAUDE_OPUS_MODEL }),
    ).toBe("high");
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-opus-4-7[1m]" }),
    ).toBe("high");
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-sonnet-5" }),
    ).toBe("xhigh");
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-sonnet-5[1m]" }),
    ).toBe("xhigh");
    // Legacy Sonnet 4.6 ids that still appear in historical records resolve too.
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-sonnet-4-6" }),
    ).toBe("xhigh");
    // Haiku is off the ladder: the Claude API rejects `effort` for it outright.
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-haiku-4-5" }),
    ).toBe("medium");
  });

  test("returns the default Codex effort from model capabilities", () => {
    // Astra medium -> Sol high -> Terra xhigh -> Luna max: effort runs inverse
    // to model strength so every rung costs roughly the same quality.
    expect(resolveDefaultCodexEffortForModel({ model: "gpt-6-astra" })).toBe(
      "medium",
    );
    expect(resolveDefaultCodexEffortForModel({ model: "gpt-5.6-sol" })).toBe(
      "high",
    );
    expect(resolveDefaultCodexEffortForModel({ model: "gpt-5.6-terra" })).toBe(
      "xhigh",
    );
    expect(resolveDefaultCodexEffortForModel({ model: "gpt-5.6-luna" })).toBe(
      "max",
    );
    // Legacy GPT-5.5 keeps the xhigh cap it was verified at.
    expect(resolveDefaultCodexEffortForModel({ model: "gpt-5.5" })).toBe(
      "xhigh",
    );
    // Legacy models removed from the picker have no known Codex
    // recommendation, so they fall back to the flat "medium" baseline.
    expect(resolveDefaultCodexEffortForModel({ model: "gpt-5.4-mini" })).toBe(
      "medium",
    );
    expect(resolveDefaultCodexEffortForModel({ model: "gpt-5.4" })).toBe(
      "medium",
    );
    expect(
      resolveDefaultCodexEffortForModel({ model: "gpt-5.3-codex-spark" }),
    ).toBe("medium");
  });

  test("prefers a dynamically registered Codex default effort over the static fallback", () => {
    registerDynamicDefaultReasoningEfforts(new Map([["gpt-5.4-mini", "high"]]));
    expect(resolveDefaultCodexEffortForModel({ model: "gpt-5.4-mini" })).toBe(
      "high",
    );
  });

  test("ignores unrecognized dynamically registered effort values", () => {
    registerDynamicDefaultReasoningEfforts(
      new Map([["gpt-unknown-model", "not-a-real-effort"]]),
    );
    expect(
      resolveDefaultCodexEffortForModel({ model: "gpt-unknown-model" }),
    ).toBe("medium");
  });

  test("scopes selectable Codex reasoning efforts per model, per the verified server catalog", () => {
    // Astra/Sol/Terra accept the full scale including "ultra".
    expect(listCodexReasoningEffortsForModel({ model: "gpt-6-astra" })).toEqual(
      ["low", "medium", "high", "xhigh", "max", "ultra"],
    );
    expect(listCodexReasoningEffortsForModel({ model: "gpt-5.6-sol" })).toEqual(
      ["low", "medium", "high", "xhigh", "max", "ultra"],
    );
    expect(
      listCodexReasoningEffortsForModel({ model: "gpt-5.6-terra" }),
    ).toEqual(["low", "medium", "high", "xhigh", "max", "ultra"]);
    // Luna has no "ultra" tier.
    expect(
      listCodexReasoningEffortsForModel({ model: "gpt-5.6-luna" }),
    ).toEqual(["low", "medium", "high", "xhigh", "max"]);
    // GPT-5.5 caps out at "xhigh" (no "max"/"ultra").
    expect(listCodexReasoningEffortsForModel({ model: "gpt-5.5" })).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    // Unknown/legacy models are unrestricted.
    expect(listCodexReasoningEffortsForModel({ model: "gpt-5.4" })).toEqual(
      ALL_CODEX_REASONING_EFFORTS,
    );
  });

  test("prefers a dynamically registered supported-effort list over the static fallback", () => {
    // Uses a model id not touched by other tests in this file so the
    // module-level registry mutation can't leak into later assertions.
    registerDynamicSupportedReasoningEfforts(
      new Map([["gpt-5.4-mini", ["low", "medium"]]]),
    );
    expect(
      listCodexReasoningEffortsForModel({ model: "gpt-5.4-mini" }),
    ).toEqual(["low", "medium"]);
  });

  test("clamps an unsupported Codex effort down to the model's nearest supported value", () => {
    // "ultra" carried over from Sol isn't valid for Luna — step down to the
    // nearest lower supported value ("max"), not straight to the default.
    expect(
      clampCodexEffortToModel({ model: "gpt-5.6-luna", effort: "ultra" }),
    ).toBe("max");
    // Already-supported values pass through unchanged.
    expect(
      clampCodexEffortToModel({ model: "gpt-5.6-luna", effort: "high" }),
    ).toBe("high");
    // GPT-5.5 caps at "xhigh" — "max" clamps down to it.
    expect(clampCodexEffortToModel({ model: "gpt-5.5", effort: "max" })).toBe(
      "xhigh",
    );
  });

  test("keeps selectable models backed by capability metadata", () => {
    const catalogModels = [...CLAUDE_SDK_MODEL_OPTIONS, ...CODEX_MODEL_OPTIONS];
    for (const model of catalogModels) {
      expect(getModelCapability({ model })).toEqual(
        expect.objectContaining({ model }),
      );
    }
    expect(listModelCapabilities({ providerId: "codex" }).length).toBe(
      CODEX_MODEL_OPTIONS.length + 1,
    );
  });

  test("resolves tier models within provider eligibility", () => {
    expect(resolveTierModel({ providerId: "claude-code", tier: "heavy" })).toBe(
      "claude-sonnet-5",
    );
    expect(
      resolveTierModel({ providerId: "claude-code", tier: "frontier" }),
    ).toBe(CLAUDE_FABLE_MODEL);
    expect(resolveTierModel({ providerId: "codex", tier: "light" })).toBe(
      "gpt-5.6-luna",
    );
    expect(resolveTierModel({ providerId: "codex", tier: "frontier" })).toBe(
      "gpt-6-astra",
    );
    expect(resolveTierModel({ providerId: "claude-code", tier: "light" })).toBe(
      "claude-haiku-4-5",
    );
    expect(
      resolveTierModel({
        providerId: "claude-code",
        tier: "frontier",
        eligibleModels: ["claude-haiku-4-5"],
      }),
    ).toBe("claude-haiku-4-5");
  });

  test("only updates Claude effort on model switch when the current value is still the previous model default", () => {
    expect(
      resolveClaudeEffortForModelSwitch({
        previousModel: "claude-sonnet-4-6",
        nextModel: DEFAULT_CLAUDE_OPUS_MODEL,
        currentEffort: "xhigh",
      }),
    ).toBe("high");
    expect(
      resolveClaudeEffortForModelSwitch({
        previousModel: DEFAULT_CLAUDE_OPUS_MODEL,
        nextModel: "claude-sonnet-4-6",
        currentEffort: "high",
      }),
    ).toBe("xhigh");
    // A tuned value survives the switch untouched.
    expect(
      resolveClaudeEffortForModelSwitch({
        previousModel: "claude-sonnet-4-6",
        nextModel: DEFAULT_CLAUDE_OPUS_MODEL,
        currentEffort: "max",
      }),
    ).toBe("max");
  });

  test("upgrades settings-scoped Opus and Sonnet aliases to the current default while preserving the 1M suffix", () => {
    expect(upgradeSettingsScopedClaudeModel({ model: "claude-opus-4-6" })).toBe(
      DEFAULT_CLAUDE_OPUS_MODEL,
    );
    expect(
      upgradeSettingsScopedClaudeModel({ model: "claude-opus-4-6[1m]" }),
    ).toBe("claude-opus-5[1m]");
    expect(upgradeSettingsScopedClaudeModel({ model: "claude-opus-4-8" })).toBe(
      DEFAULT_CLAUDE_OPUS_MODEL,
    );
    expect(
      upgradeSettingsScopedClaudeModel({ model: "claude-opus-4-8[1m]" }),
    ).toBe("claude-opus-5[1m]");
    expect(
      upgradeSettingsScopedClaudeModel({ model: "claude-opus-4-6-fast" }),
    ).toBe("claude-opus-4-6-fast");
    expect(
      upgradeSettingsScopedClaudeModel({ model: "claude-sonnet-4-6" }),
    ).toBe("claude-sonnet-5");
    expect(
      upgradeSettingsScopedClaudeModel({ model: "claude-sonnet-4-6[1m]" }),
    ).toBe("claude-sonnet-5[1m]");
    expect(upgradeSettingsScopedClaudeModel({ model: "claude-fable-5" })).toBe(
      CLAUDE_FABLE_MODEL,
    );
    // Already-current Sonnet 5 ids pass through unchanged.
    expect(upgradeSettingsScopedClaudeModel({ model: "claude-sonnet-5" })).toBe(
      "claude-sonnet-5",
    );
  });

  test("uses matching Opus 4.8 variants as the automatic Opus 5 fallback", () => {
    expect(resolveDefaultClaudeFallbackModel({ model: "claude-opus-5" })).toBe(
      "claude-opus-4-8",
    );
    expect(
      resolveDefaultClaudeFallbackModel({ model: "claude-opus-5[1m]" }),
    ).toBe("claude-opus-4-8[1m]");
    expect(
      resolveDefaultClaudeFallbackModel({ model: "claude-sonnet-5" }),
    ).toBeUndefined();
  });

  test("returns semantic provider wave tones", () => {
    expect(getProviderWaveTone({ providerId: "claude-code" })).toBe("claude");
    expect(getProviderWaveTone({ providerId: "codex" })).toBe("codex");
    expect(getProviderWaveTone({ providerId: "cursor" })).toBe("accent");
    expect(getProviderWaveTone({ providerId: "kiro" })).toBe("accent");
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

  test("wave tone resolves correctly for [1m] variants", () => {
    expect(
      getProviderWaveTone({
        providerId: "claude-code",
        model: "claude-opus-4-8[1m]",
      }),
    ).toBe("claude");
    expect(
      getProviderWaveTone({
        providerId: "claude-code",
        model: "claude-sonnet-4-6[1m]",
      }),
    ).toBe("claude");
  });

  test("cycles provider order from the descriptor registry", () => {
    expect(getNextProviderId({ providerId: "claude-code" })).toBe("codex");
    expect(getNextProviderId({ providerId: "codex" })).toBe("cursor");
    expect(getNextProviderId({ providerId: "cursor" })).toBe("kiro");
    expect(getNextProviderId({ providerId: "kiro" })).toBe("claude-code");
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
        "Claude Opus 5",
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
