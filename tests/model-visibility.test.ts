import { describe, expect, test } from "bun:test";
import {
  clearProviderModelVisibility,
  countHiddenModels,
  getModelVisibilityKey,
  normalizeModelVisibility,
  readModelVisibilityOverride,
  setModelVisibilityOverride,
} from "@/lib/providers/model-visibility";

describe("model visibility overrides", () => {
  test("keys a provider variant down to the row the selector renders", () => {
    expect(
      getModelVisibilityKey({
        providerId: "cursor",
        model: "gpt-5.4[context=272k,reasoning=high,fast=true]",
      }),
    ).toBe("gpt-5.4");
    expect(
      getModelVisibilityKey({
        providerId: "claude-code",
        model: "claude-opus-5[1m]",
      }),
    ).toBe("claude-opus-5");
    expect(
      getModelVisibilityKey({ providerId: "kiro", model: " kiro-model " }),
    ).toBe("kiro-model");
  });

  test("normalizes away unknown providers, non-boolean values, and variants", () => {
    expect(
      normalizeModelVisibility({
        cursor: {
          "gpt-5.4[fast=true]": false,
          "grok-4.6": "yes",
        },
        "claude-code": { "claude-opus-5[1m]": true },
        legacy: { "old-model": false },
        codex: "nope",
      }),
    ).toEqual({
      cursor: { "gpt-5.4": false },
      "claude-code": { "claude-opus-5": true },
    });
    expect(normalizeModelVisibility(null)).toEqual({});
    expect(normalizeModelVisibility([{ cursor: {} }])).toEqual({});
  });

  test("reads one override for every variant of the same row", () => {
    const visibility = normalizeModelVisibility({
      cursor: { "gpt-5.4": false },
    });
    expect(
      readModelVisibilityOverride({
        visibility,
        providerId: "cursor",
        model: "gpt-5.4[context=272k,reasoning=high,fast=true]",
      }),
    ).toBe(false);
    expect(
      readModelVisibilityOverride({
        visibility,
        providerId: "cursor",
        model: "grok-4.6",
      }),
    ).toBeUndefined();
  });

  test("drops an override instead of storing a redundant entry", () => {
    const hidden = setModelVisibilityOverride({
      providerId: "codex",
      model: "gpt-5.5",
      visible: false,
    });
    expect(hidden).toEqual({ codex: { "gpt-5.5": false } });
    expect(countHiddenModels({ visibility: hidden, providerId: "codex" })).toBe(
      1,
    );

    const restored = setModelVisibilityOverride({
      visibility: hidden,
      providerId: "codex",
      model: "gpt-5.5",
      visible: undefined,
    });
    expect(restored).toEqual({});

    const unchanged = setModelVisibilityOverride({
      visibility: hidden,
      providerId: "codex",
      model: "gpt-5.5",
      visible: false,
    });
    expect(unchanged).toBe(hidden);
  });

  test("clears one provider without touching the others", () => {
    const visibility = normalizeModelVisibility({
      cursor: { "gpt-5.4": false },
      kiro: { "kiro-model": true },
    });
    expect(
      clearProviderModelVisibility({ visibility, providerId: "cursor" }),
    ).toEqual({ kiro: { "kiro-model": true } });
    expect(
      clearProviderModelVisibility({ visibility, providerId: "codex" }),
    ).toBe(visibility);
  });
});
