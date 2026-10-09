import { describe, expect, test } from "bun:test";
import {
  AUX_LANES,
  buildReadOnlyAuxRuntimeOptions,
  DEFAULT_AUX_INFERENCE_DEFAULT,
  DEFAULT_AUXILIARY_INFERENCE_POLICY,
  normalizeAuxInferenceDefault,
  migrateLegacyTurnSummaryModels,
  normalizeAuxiliaryInferencePolicy,
  resolveAuxLaneRuntime,
  supportsExplicitEffort,
} from "../src/lib/providers/auxiliary-inference-policy";

describe("auxiliary inference policy defaults", () => {
  test("no lane inherits the user's primary model", () => {
    for (const lane of AUX_LANES) {
      const runtime = resolveAuxLaneRuntime({
        shared: DEFAULT_AUX_INFERENCE_DEFAULT,
        lane,
        policy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
        activeProviderId: "claude-code",
      });
      // A resolved model is a light-tier pick; `null` defers to the runtime's
      // own (already cheap) default. Neither reads the primary model setting.
      expect(runtime.model === null || runtime.model.length > 0).toBe(true);
      // Inline completion is the one lane that is opt-in: it fires on every
      // typing pause with no reusable prompt prefix.
      expect(runtime.enabled).toBe(lane !== "inlineCompletion");
    }
  });

  test("background lanes never request premium fast mode", () => {
    for (const providerId of ["claude-code", "codex"] as const) {
      const options = buildReadOnlyAuxRuntimeOptions({ providerId });
      expect(options.claudeFastMode).toBeUndefined();
      expect(options.codexFastMode).toBeUndefined();
    }
  });

  test("resolves the light tier for the recurring per-turn lanes", () => {
    expect(
      resolveAuxLaneRuntime({
        shared: DEFAULT_AUX_INFERENCE_DEFAULT,
        lane: "turnSummary",
        policy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
        activeProviderId: "claude-code",
      }).model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveAuxLaneRuntime({
        shared: DEFAULT_AUX_INFERENCE_DEFAULT,
        lane: "intentGuard",
        policy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
        activeProviderId: "codex",
      }).model,
    ).toBe("gpt-6-luna");
  });

  test("falls back to the other provider for the turn summary", () => {
    // A workspace whose own provider CLI is not installed must still get a
    // summary; the pre-policy defaults deliberately named one model per
    // provider for exactly this reason.
    expect(
      resolveAuxLaneRuntime({
        shared: DEFAULT_AUX_INFERENCE_DEFAULT,
        lane: "turnSummary",
        policy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
        activeProviderId: "claude-code",
      }).fallbackModel,
    ).toBe("gpt-6-luna");
    expect(
      resolveAuxLaneRuntime({
        shared: DEFAULT_AUX_INFERENCE_DEFAULT,
        lane: "turnSummary",
        policy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
        activeProviderId: "codex",
      }).fallbackModel,
    ).toBe("claude-haiku-5-5");
    // Lanes without a declared fallback do not invent one.
    expect(
      resolveAuxLaneRuntime({
        shared: DEFAULT_AUX_INFERENCE_DEFAULT,
        lane: "taskName",
        policy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
        activeProviderId: "codex",
      }).fallbackModel,
    ).toBeNull();
  });

  test("leaves the pre-PR review model to the provider default", () => {
    expect(
      resolveAuxLaneRuntime({
        shared: DEFAULT_AUX_INFERENCE_DEFAULT,
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

describe("shared default and lane overrides", () => {
  const policy = normalizeAuxiliaryInferencePolicy({});

  test("auto follows the task's provider, then Claude", () => {
    expect(
      resolveAuxLaneRuntime({
        lane: "utility",
        policy,
        shared: DEFAULT_AUX_INFERENCE_DEFAULT,
        activeProviderId: "codex",
      }),
    ).toMatchObject({ providerId: "codex", providerSource: "task" });
    expect(
      resolveAuxLaneRuntime({
        lane: "utility",
        policy,
        shared: DEFAULT_AUX_INFERENCE_DEFAULT,
        activeProviderId: "cursor",
      }),
    ).toMatchObject({ providerId: "claude-code", providerSource: "automatic" });
  });

  test("every lane without an override inherits the shared provider and model", () => {
    const shared = { providerId: "codex" as const, model: "gpt-5.6-luna" };
    for (const lane of AUX_LANES) {
      const runtime = resolveAuxLaneRuntime({
        lane,
        policy,
        shared,
        activeProviderId: "claude-code",
      });
      expect(runtime.providerId).toBe("codex");
      expect(runtime.providerSource).toBe("shared");
      expect(runtime.model).toBe("gpt-5.6-luna");
      expect(runtime.modelSource).toBe("shared");
    }
  });

  test("a lane override wins over the shared default", () => {
    const runtime = resolveAuxLaneRuntime({
      lane: "turnSummary",
      policy: normalizeAuxiliaryInferencePolicy({
        turnSummary: {
          enabled: true,
          providerId: "claude-code",
          model: "claude-sonnet-5",
        },
      }),
      shared: { providerId: "codex", model: "gpt-5.6-luna" },
      activeProviderId: "codex",
    });
    expect(runtime).toMatchObject({
      providerId: "claude-code",
      providerSource: "override",
      model: "claude-sonnet-5",
      modelSource: "override",
    });
  });

  test("a provider-only override never receives the other provider's shared model", () => {
    const runtime = resolveAuxLaneRuntime({
      lane: "taskName",
      policy: normalizeAuxiliaryInferencePolicy({
        taskName: { enabled: true, providerId: "claude-code" },
      }),
      shared: { providerId: "codex", model: "gpt-5.6-luna" },
    });
    expect(runtime.providerId).toBe("claude-code");
    expect(runtime.model).toBe("claude-haiku-5-5");
    expect(runtime.modelSource).toBe("automatic");
  });

  test("a model-only override keeps the inherited provider", () => {
    const runtime = resolveAuxLaneRuntime({
      lane: "utility",
      policy: normalizeAuxiliaryInferencePolicy({
        utility: { enabled: true, model: "claude-sonnet-5" },
      }),
      shared: { providerId: "claude-code", model: "claude-haiku-5-5" },
    });
    expect(runtime).toMatchObject({
      providerId: "claude-code",
      providerSource: "shared",
      model: "claude-sonnet-5",
      modelSource: "override",
    });
  });

  test("an explicit shared model also reaches pre-PR review", () => {
    expect(
      resolveAuxLaneRuntime({
        lane: "prePrReview",
        policy,
        shared: { providerId: "claude-code", model: "claude-haiku-5-5" },
      }).model,
    ).toBe("claude-haiku-5-5");
  });

  test("the shared model always carries its own provider", () => {
    expect(
      normalizeAuxInferenceDefault({ providerId: "auto", model: "gpt-5.6-luna" }),
    ).toEqual({ providerId: "codex", model: "gpt-5.6-luna" });
    expect(
      normalizeAuxInferenceDefault({ providerId: "codex", model: "  " }),
    ).toEqual({ providerId: "codex", model: null });
    expect(normalizeAuxInferenceDefault("junk")).toEqual(
      DEFAULT_AUX_INFERENCE_DEFAULT,
    );
  });
});

describe("effort handling", () => {
  test("drops an explicit effort for Claude Haiku 4.5, which rejects it", () => {
    expect(
      supportsExplicitEffort({
        providerId: "claude-code",
        model: "claude-haiku-4-5",
      }),
    ).toBe(false);
    expect(
      supportsExplicitEffort({
        providerId: "claude-code",
        model: "claude-haiku-4-5-20251001",
      }),
    ).toBe(false);
  });

  test("a lane pinned to Haiku 4.5 moves onto Haiku 5.5 and keeps its effort", () => {
    expect(
      supportsExplicitEffort({
        providerId: "claude-code",
        model: "claude-haiku-5-5",
      }),
    ).toBe(true);
    const runtime = resolveAuxLaneRuntime({
      shared: DEFAULT_AUX_INFERENCE_DEFAULT,
      lane: "turnSummary",
      policy: normalizeAuxiliaryInferencePolicy({
        turnSummary: {
          enabled: true,
          model: "claude-haiku-4-5",
          fallbackModel: "claude-haiku-4-5",
          effort: "high",
        },
      }),
      activeProviderId: "claude-code",
    });
    expect(runtime.model).toBe("claude-haiku-5-5");
    expect(runtime.fallbackModel).toBe("claude-haiku-5-5");
    expect(runtime.effortOverrides).toEqual({ claudeEffort: "high" });
  });

  test("clamps a Codex effort the chosen model does not accept", () => {
    const overrides = resolveAuxLaneRuntime({
      shared: DEFAULT_AUX_INFERENCE_DEFAULT,
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
    expect(policy.turnSummary.model).toBeUndefined();
    expect(policy.turnSummary.effort).toBeUndefined();
    expect(Object.keys(policy).sort()).toEqual([...AUX_LANES].sort());
  });

  test("reads a saved null model as inherit, never as an override", () => {
    const policy = normalizeAuxiliaryInferencePolicy({
      turnSummary: { enabled: true, model: null, fallbackModel: null },
      taskName: { enabled: true, model: "claude-sonnet-5" },
    });
    expect("model" in policy.turnSummary).toBe(false);
    expect("fallbackModel" in policy.turnSummary).toBe(false);
    expect(policy.taskName.model).toBe("claude-sonnet-5");
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
    ).toEqual({ model: "gpt-5.6-luna", fallbackModel: "claude-haiku-5-5" });
    expect(
      migrateLegacyTurnSummaryModels({ primaryModel: "gpt-5.6-luna" }),
    ).toEqual({ model: "gpt-5.6-luna" });
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


test("read-only auxiliary work captures the selected account even without an explicit model", () => {
  const accountSelection = { claudeAccountProfileId: "11111111-1111-4111-8111-111111111111" };
  const options = buildReadOnlyAuxRuntimeOptions({ providerId: "claude-code", accountSelection });
  accountSelection.claudeAccountProfileId = "22222222-2222-4222-8222-222222222222";
  expect(options.claudeAccountProfileId).toBe("11111111-1111-4111-8111-111111111111");
  expect(options.codexAccountProfileId).toBe("system-default");
  expect(options.claudeAllowedTools).toEqual([]);
});
