import { describe, expect, test } from "bun:test";
import {
  buildModelEffortRuntimeOverrides,
  clampModelEffort,
  getModelEffortLabel,
  isModelEffort,
  listModelEffortOptions,
} from "@/lib/providers/model-effort";

describe("model effort helpers", () => {
  test("lists provider-specific effort values", () => {
    expect(
      listModelEffortOptions({
        providerId: "claude-code",
        model: "claude-sonnet-5",
      }).map((option) => option.value),
    ).toEqual(["low", "medium", "high", "xhigh", "max"]);

    expect(
      listModelEffortOptions({
        providerId: "codex",
        model: "gpt-5.6-luna",
      }).map((option) => option.value),
    ).not.toContain("ultra");
  });

  test("exposes no effort scale for Claude Haiku, which rejects the field", () => {
    expect(
      listModelEffortOptions({
        providerId: "claude-code",
        model: "claude-haiku-4-5",
      }),
    ).toEqual([]);
  });

  test("keeps a supported effort and steps down an unsupported Codex tier", () => {
    expect(
      clampModelEffort({
        providerId: "codex",
        model: "gpt-5.6-sol",
        effort: "ultra",
        fallback: "medium",
      }),
    ).toBe("ultra");

    expect(
      clampModelEffort({
        providerId: "codex",
        model: "gpt-5.6-luna",
        effort: "ultra",
        fallback: "medium",
      }),
    ).toBe("max");
  });

  test("falls back when the provider cannot run the carried-over effort", () => {
    expect(
      clampModelEffort({
        providerId: "claude-code",
        model: "claude-sonnet-5",
        effort: "ultra",
        fallback: "high",
      }),
    ).toBe("high");

    expect(
      clampModelEffort({
        providerId: "claude-code",
        model: "claude-sonnet-5",
        effort: undefined,
        fallback: "max",
      }),
    ).toBe("max");
  });

  test("maps effort onto the runtime override the provider reads", () => {
    expect(
      buildModelEffortRuntimeOverrides({
        providerId: "claude-code",
        model: "claude-sonnet-5",
        effort: "xhigh",
      }),
    ).toEqual({ claudeEffort: "xhigh" });

    expect(
      buildModelEffortRuntimeOverrides({
        providerId: "codex",
        model: "gpt-5.6-luna",
        effort: "ultra",
      }),
    ).toEqual({ codexReasoningEffort: "max" });

    expect(
      buildModelEffortRuntimeOverrides({
        providerId: "claude-code",
        model: "claude-sonnet-5",
        effort: "ultra",
      }),
    ).toEqual({});

    expect(
      buildModelEffortRuntimeOverrides({
        providerId: "codex",
        model: "gpt-5.6-sol",
        effort: undefined,
      }),
    ).toEqual({});
  });

  test("labels efforts and rejects unknown values", () => {
    expect(
      getModelEffortLabel({
        providerId: "claude-code",
        model: "claude-sonnet-5",
        effort: "xhigh",
      }),
    ).toBe("X-High");
    expect(isModelEffort("ultra")).toBe(true);
    expect(isModelEffort("turbo")).toBe(false);
    expect(isModelEffort(undefined)).toBe(false);
  });
});
