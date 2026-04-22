import { describe, expect, test } from "bun:test";
import {
  CODEX_MODEL_OPTIONS,
  DEFAULT_CLAUDE_OPUS_MODEL,
  STAVE_META_MODEL_OPTIONS,
  getDynamicDisplayNames,
  resolveClaudeEffortForModelSwitch,
  resolveDefaultClaudeEffortForModel,
  getDefaultModelForProvider,
  getNextProviderId,
  getProviderIconUrl,
  getProviderLabel,
  getProviderWaveToneClass,
  getSdkModelOptions,
  inferProviderIdFromModel,
  listProviderIds,
  registerDynamicDisplayNames,
  toHumanModelName,
  upgradeSettingsScopedClaudeOpusModel,
} from "@/lib/providers/model-catalog";

describe("model catalog", () => {
  test("includes the verified Codex model set", () => {
    expect(CODEX_MODEL_OPTIONS).toEqual([
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
    ]);
  });

  test("formats GPT-5.4 with the canonical label", () => {
    expect(toHumanModelName({ model: "gpt-5.4" })).toBe("GPT-5.4");
  });

  test("returns provider labels from the descriptor registry", () => {
    expect(
      getProviderLabel({ providerId: "claude-code", variant: "full" }),
    ).toBe("Claude Code");
    expect(getProviderLabel({ providerId: "claude-code" })).toBe("Claude");
  });

  test("returns provider defaults from the descriptor registry", () => {
    expect(getDefaultModelForProvider({ providerId: "claude-code" })).toBe(
      "claude-sonnet-4-6",
    );
  });

  test("uses xhigh as the Claude effort default for Opus models", () => {
    expect(
      resolveDefaultClaudeEffortForModel({ model: DEFAULT_CLAUDE_OPUS_MODEL }),
    ).toBe("xhigh");
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-opus-4-7[1m]" }),
    ).toBe("xhigh");
    expect(
      resolveDefaultClaudeEffortForModel({ model: "claude-sonnet-4-6" }),
    ).toBe("medium");
  });

  test("only updates Claude effort on model switch when the current value is still the previous model default", () => {
    expect(
      resolveClaudeEffortForModelSwitch({
        previousModel: "claude-sonnet-4-6",
        nextModel: DEFAULT_CLAUDE_OPUS_MODEL,
        currentEffort: "medium",
      }),
    ).toBe("xhigh");
    expect(
      resolveClaudeEffortForModelSwitch({
        previousModel: DEFAULT_CLAUDE_OPUS_MODEL,
        nextModel: "claude-sonnet-4-6",
        currentEffort: "xhigh",
      }),
    ).toBe("medium");
    expect(
      resolveClaudeEffortForModelSwitch({
        previousModel: "claude-sonnet-4-6",
        nextModel: DEFAULT_CLAUDE_OPUS_MODEL,
        currentEffort: "max",
      }),
    ).toBe("max");
  });

  test("upgrades settings-scoped Opus 4.6 aliases to Opus 4.7 while preserving the 1M suffix", () => {
    expect(
      upgradeSettingsScopedClaudeOpusModel({ model: "claude-opus-4-6" }),
    ).toBe(DEFAULT_CLAUDE_OPUS_MODEL);
    expect(
      upgradeSettingsScopedClaudeOpusModel({ model: "claude-opus-4-6[1m]" }),
    ).toBe("claude-opus-4-7[1m]");
    expect(
      upgradeSettingsScopedClaudeOpusModel({ model: "claude-opus-4-6-fast" }),
    ).toBe("claude-opus-4-6-fast");
  });

  test("returns provider wave tone classes", () => {
    expect(getProviderWaveToneClass({ providerId: "claude-code" })).toBe(
      "text-provider-claude",
    );
    expect(getProviderWaveToneClass({ providerId: "codex" })).toBe(
      "text-provider-codex",
    );
    expect(getProviderWaveToneClass({ providerId: "stave" })).toBe(
      "text-primary",
    );
    expect(
      getProviderWaveToneClass({ providerId: "stave", model: "gpt-5.4" }),
    ).toBe("text-provider-codex");
    expect(
      getProviderWaveToneClass({
        providerId: "stave",
        model: "claude-sonnet-4-6",
      }),
    ).toBe("text-provider-claude");
  });

  test("infers provider ids from routed model ids", () => {
    expect(inferProviderIdFromModel({ model: "gpt-5.4" })).toBe("codex");
    expect(inferProviderIdFromModel({ model: "gpt-5-codex" })).toBe("codex");
    expect(inferProviderIdFromModel({ model: "claude-sonnet-4-6" })).toBe(
      "claude-code",
    );
    expect(inferProviderIdFromModel({ model: "stave-auto" })).toBe("stave");
  });

  // ── 1M context model variants ─────────────────────────────────────────────

  test("formats [1m] model variants with human-readable labels", () => {
    expect(toHumanModelName({ model: "claude-opus-4-7[1m]" })).toBe(
      "Claude Opus 4.7 (1M)",
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
    expect(inferProviderIdFromModel({ model: "claude-opus-4-7[1m]" })).toBe(
      "claude-code",
    );
    expect(inferProviderIdFromModel({ model: "claude-sonnet-4-6[1m]" })).toBe(
      "claude-code",
    );
  });

  test("wave tone class resolves correctly for [1m] variants via stave", () => {
    expect(
      getProviderWaveToneClass({
        providerId: "stave",
        model: "claude-opus-4-7[1m]",
      }),
    ).toBe("text-provider-claude");
    expect(
      getProviderWaveToneClass({
        providerId: "stave",
        model: "claude-sonnet-4-6[1m]",
      }),
    ).toBe("text-provider-claude");
  });

  test("cycles provider order from the descriptor registry", () => {
    expect(getNextProviderId({ providerId: "claude-code" })).toBe("codex");
  });

  // ── Stave meta-provider ──────────────────────────────────────────────────

  describe("stave meta-provider", () => {
    test("is registered in the provider list", () => {
      expect(listProviderIds()).toContain("stave");
    });

    test("includes the stave-auto pseudo-model", () => {
      expect(STAVE_META_MODEL_OPTIONS).toEqual(["stave-auto"]);
    });

    test("defaults to stave-auto", () => {
      expect(getDefaultModelForProvider({ providerId: "stave" })).toBe(
        "stave-auto",
      );
    });

    test("returns stave-auto as the only model option", () => {
      expect(getSdkModelOptions({ providerId: "stave" })).toEqual([
        "stave-auto",
      ]);
    });

    test("formats stave-auto with the canonical human label", () => {
      expect(toHumanModelName({ model: "stave-auto" })).toBe("Stave Auto");
    });

    test("returns 'Stave' as the short label", () => {
      expect(getProviderLabel({ providerId: "stave" })).toBe("Stave");
    });

    test("returns 'Stave' as the full label", () => {
      expect(getProviderLabel({ providerId: "stave", variant: "full" })).toBe(
        "Stave",
      );
    });

    test("switches stave icon urls by theme", () => {
      expect(
        getProviderIconUrl({ providerId: "stave", isDarkMode: false }),
      ).toContain("stave-logo-dark.svg");
      expect(
        getProviderIconUrl({ providerId: "stave", isDarkMode: true }),
      ).toContain("stave-logo-light.svg");
    });

    test("cycles from codex to stave", () => {
      expect(getNextProviderId({ providerId: "codex" })).toBe("stave");
    });

    test("cycles from stave back to claude-code", () => {
      expect(getNextProviderId({ providerId: "stave" })).toBe("claude-code");
    });
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
        "Claude Opus 4.7",
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
