import { describe, expect, test } from "bun:test";
import {
  CODEX_SDK_MODEL_OPTIONS,
  STAVE_META_MODEL_OPTIONS,
  getDefaultModelForProvider,
  getNextProviderId,
  getProviderIconUrl,
  getProviderLabel,
  getSdkModelOptions,
  listProviderIds,
  toHumanModelName,
} from "@/lib/providers/model-catalog";

describe("model catalog", () => {
  test("includes the verified Codex model set", () => {
    expect(CODEX_SDK_MODEL_OPTIONS).toEqual([
      "gpt-5.4",
      "gpt-5.3-codex",
    ]);
  });

  test("formats GPT-5.4 with the canonical label", () => {
    expect(toHumanModelName({ model: "gpt-5.4" })).toBe("GPT-5.4");
  });

  test("returns provider labels from the descriptor registry", () => {
    expect(getProviderLabel({ providerId: "claude-code", variant: "full" })).toBe("Claude Code");
    expect(getProviderLabel({ providerId: "claude-code" })).toBe("Claude");
  });

  test("returns provider defaults from the descriptor registry", () => {
    expect(getDefaultModelForProvider({ providerId: "claude-code" })).toBe("claude-sonnet-4-6");
  });

  test("returns stable asset-backed icon urls for provider badges", () => {
    expect(getProviderIconUrl({ providerId: "claude-code" })).toContain("claude-color.svg");
    expect(getProviderIconUrl({ providerId: "codex" })).toContain("codex-color.svg");
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
      expect(getDefaultModelForProvider({ providerId: "stave" })).toBe("stave-auto");
    });

    test("returns stave-auto as the only model option", () => {
      expect(getSdkModelOptions({ providerId: "stave" })).toEqual(["stave-auto"]);
    });

    test("formats stave-auto with the canonical human label", () => {
      expect(toHumanModelName({ model: "stave-auto" })).toBe("Stave Auto");
    });

    test("returns 'Stave' as the short label", () => {
      expect(getProviderLabel({ providerId: "stave" })).toBe("Stave");
    });

    test("returns 'Stave' as the full label", () => {
      expect(getProviderLabel({ providerId: "stave", variant: "full" })).toBe("Stave");
    });

    test("switches stave icon urls by theme", () => {
      expect(getProviderIconUrl({ providerId: "stave", isDarkMode: false })).toContain("stave-logo-dark.svg");
      expect(getProviderIconUrl({ providerId: "stave", isDarkMode: true })).toContain("stave-logo-light.svg");
    });

    test("cycles from codex to stave", () => {
      expect(getNextProviderId({ providerId: "codex" })).toBe("stave");
    });

    test("cycles from stave back to claude-code", () => {
      expect(getNextProviderId({ providerId: "stave" })).toBe("claude-code");
    });
  });
});
