import { describe, expect, test } from "bun:test";
import {
  AUX_LANES,
  buildReadOnlyAuxRuntimeOptions,
  DEFAULT_AUXILIARY_INFERENCE_POLICY,
  migrateLegacyTurnSummaryModels,
  normalizeAuxiliaryInferencePolicy,
  resolveAuxLaneRuntime,
  supportsExplicitEffort,
} from "../src/lib/providers/auxiliary-inference-policy";

describe("auxiliary inference policy defaults", () => {
  test("no lane inherits the user's primary model", () => {
    for (const lane of AUX_LANES) {
      const runtime = resolveAuxLaneRuntime({
        lane,
        policy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
        activeProviderId: "claude-code",
      });
      // A resolved model is a light-tier pick; `null` defers to the runtime's
      // own (already cheap) default. Neither reads the primary model setting.
      expect(runtime.model === null || runtime.model.length > 0).toBe(true);
      expect(runtime.enabled).toBe(true);
    }
  });

  test("resolves the light tier for the recurring per-turn lanes", () => {
    expect(
      resolveAuxLaneRuntime({
        lane: "turnSummary",
        policy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
        activeProviderId: "claude-code",
      }).model,
    ).toBe("claude-haiku-4-5");
    expect(
      resolveAuxLaneRuntime({
        lane: "intentGuard",
        policy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
        activeProviderId: "codex",
      }).model,
    ).toBe("gpt-5.6-luna");
  });

  test("leaves the pre-PR review model to the provider default", () => {
    expect(
      resolveAuxLaneRuntime({
        lane: "prePrReview",
        policy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
        activeProviderId: "claude-code",
      }).model,
    ).toBeNull();
  });

  test("keeps the recurring lanes gated on real work", () => {
    expect(
      DEFAULT_AUXILIARY_INFERENCE_POLICY.intentGuard.onlyAfterFileEdits,
    ).toBe(true);
    expect(
      DEFAULT_AUXILIARY_INFERENCE_POLICY.intentGuard.onlyWhenDiffChanged,
    ).toBe(true);
    expect(
      DEFAULT_AUXILIARY_INFERENCE_POLICY.turnSummary.skipWithoutAssistantText,
    ).toBe(true);
    expect(DEFAULT_AUXILIARY_INFERENCE_POLICY.taskName.maxUserTurns).toBe(1);
    expect(DEFAULT_AUXILIARY_INFERENCE_POLICY.utility.maxProviderAttempts).toBe(
      2,
    );
  });
});

describe("provider fall-through", () => {
  test("lane override wins over every other signal", () => {
    expect(
      resolveAuxLaneRuntime({
        lane: "utility",
        policy: normalizeAuxiliaryInferencePolicy({
          utility: { enabled: true, providerId: "codex" },
        }),
        legacyProviderId: "claude-code",
        activeProviderId: "claude-code",
      }).providerId,
    ).toBe("codex");
  });

  test("falls through to the legacy setting, then the active task, then Claude", () => {
    const policy = normalizeAuxiliaryInferencePolicy({});
    expect(
      resolveAuxLaneRuntime({
        lane: "utility",
        policy,
        legacyProviderId: "codex",
        activeProviderId: "claude-code",
      }).providerId,
    ).toBe("codex");
    expect(
      resolveAuxLaneRuntime({
        lane: "utility",
        policy,
        legacyProviderId: "auto",
        activeProviderId: "codex",
      }).providerId,
    ).toBe("codex");
    expect(
      resolveAuxLaneRuntime({
        lane: "utility",
        policy,
        legacyProviderId: "auto",
        activeProviderId: "cursor",
      }).providerId,
    ).toBe("claude-code");
  });
});

describe("effort handling", () => {
  test("drops an explicit effort for Claude Haiku, which rejects it", () => {
    expect(
      supportsExplicitEffort({
        providerId: "claude-code",
        model: "claude-haiku-4-5",
      }),
    ).toBe(false);
    expect(
      resolveAuxLaneRuntime({
        lane: "turnSummary",
        policy: normalizeAuxiliaryInferencePolicy({
          turnSummary: {
            enabled: true,
            model: "claude-haiku-4-5",
            effort: "high",
          },
        }),
        activeProviderId: "claude-code",
      }).effortOverrides,
    ).toEqual({});
  });

  test("clamps a Codex effort the chosen model does not accept", () => {
    const overrides = resolveAuxLaneRuntime({
      lane: "utility",
      policy: normalizeAuxiliaryInferencePolicy({
        utility: { enabled: true, model: "gpt-5.6-luna", effort: "ultra" },
      }),
      activeProviderId: "codex",
    }).effortOverrides;
    expect(overrides.codexReasoningEffort).toBeDefined();
    expect(overrides.codexReasoningEffort).not.toBe("ultra");
  });
});

describe("normalization and migration", () => {
  test("always returns every lane so store selectors can index it", () => {
    const policy = normalizeAuxiliaryInferencePolicy(undefined);
    for (const lane of AUX_LANES) {
      expect(policy[lane]).toBeDefined();
      expect(typeof policy[lane].enabled).toBe("boolean");
    }
  });

  test("ignores junk values rather than persisting them", () => {
    const policy = normalizeAuxiliaryInferencePolicy({
      turnSummary: {
        enabled: "yes",
        providerId: "cursor",
        model: 42,
        effort: "turbo",
      },
      nonsense: { enabled: false },
    });
    expect(policy.turnSummary.enabled).toBe(true);
    expect(policy.turnSummary.providerId).toBeUndefined();
    expect(policy.turnSummary.model).toBeNull();
    expect(policy.turnSummary.effort).toBeUndefined();
    expect(Object.keys(policy).sort()).toEqual([...AUX_LANES].sort());
  });

  test("preserves an explicit disable", () => {
    expect(
      normalizeAuxiliaryInferencePolicy({ turnSummary: { enabled: false } })
        .turnSummary.enabled,
    ).toBe(false);
  });

  test("carries the legacy turn-summary models into the lane", () => {
    expect(
      migrateLegacyTurnSummaryModels({
        primaryModel: "gpt-5.6-luna",
        fallbackModel: "claude-haiku-4-5",
      }),
    ).toEqual({ model: "gpt-5.6-luna", fallbackModel: "claude-haiku-4-5" });
    expect(
      migrateLegacyTurnSummaryModels({ primaryModel: "  ", fallbackModel: "" }),
    ).toBeNull();
    expect(migrateLegacyTurnSummaryModels({})).toBeNull();
  });
});

describe("buildReadOnlyAuxRuntimeOptions", () => {
  test("never lets a background call write, browse, or stream", () => {
    const claude = buildReadOnlyAuxRuntimeOptions({
      providerId: "claude-code",
      model: "claude-haiku-4-5",
    });
    expect(claude).toMatchObject({
      model: "claude-haiku-4-5",
      chatStreamingEnabled: false,
      claudeAllowedTools: [],
      claudeMaxTurns: 1,
      claudePermissionMode: "dontAsk",
    });

    const codex = buildReadOnlyAuxRuntimeOptions({
      providerId: "codex",
      model: "gpt-5.6-luna",
    });
    expect(codex).toMatchObject({
      model: "gpt-5.6-luna",
      chatStreamingEnabled: false,
      codexApprovalPolicy: "never",
      codexFileAccess: "read-only",
      codexNetworkAccess: false,
      codexWebSearch: "disabled",
      codexReasoningSummary: "none",
    });
  });

  test("omits the model key when the runtime should choose", () => {
    expect(
      buildReadOnlyAuxRuntimeOptions({ providerId: "claude-code", model: null }),
    ).not.toHaveProperty("model");
  });
});
