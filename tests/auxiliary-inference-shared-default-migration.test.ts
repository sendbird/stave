import { describe, expect, test } from "bun:test";
import {
  DEFAULT_AUX_INFERENCE_DEFAULT,
  normalizeAuxiliaryInferencePolicy,
  resolveAuxLaneRuntime,
  type AuxInferenceDefault,
  type AuxiliaryInferencePolicy,
} from "../src/lib/providers/auxiliary-inference-policy";
import { migrateAuxInferenceSharedDefault } from "../src/lib/providers/auxiliary-inference-shared-default-migration";

/** Settings as saved before the shared default: null means "automatic". */
const OLD_POLICY = {
  intentGuard: { enabled: true, model: null, onlyWhenDiffChanged: true, onlyAfterFileEdits: true },
  turnSummary: { enabled: true, model: "gpt-5.6-luna", fallbackModel: null, skipWithoutAssistantText: true },
  taskName: { enabled: true, model: null, maxUserTurns: 1 },
  utility: { enabled: false, model: null, maxProviderAttempts: 2 },
  prDescription: { enabled: true, providerId: "claude-code", model: "claude-sonnet-5" },
  prePrReview: { enabled: true, model: null },
  inlineCompletion: { enabled: false, model: null },
};

async function rehydrate(settings: Record<string, unknown>) {
  const values = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
    api: {},
  };
  const { useAppStore } = await import("../src/store/app.store");
  const { createAppStorePersistenceOptions } = await import("../src/store/app-store-persistence");
  const options = createAppStorePersistenceOptions();
  const state = { ...useAppStore.getInitialState(), settings } as never as {
    settings: Record<string, unknown> & {
      auxiliaryInferencePolicy: AuxiliaryInferencePolicy;
      auxiliaryInferenceDefault: AuxInferenceDefault;
    };
  };
  options.onRehydrateStorage?.()?.(state as never);
  return state.settings;
}

describe("temporary migration: auxiliary-inference-shared-default", () => {
  test("a saved per-lane model survives as that lane's override", async () => {
    const settings = await rehydrate({
      auxiliaryInferencePolicy: structuredClone(OLD_POLICY),
      utilityInferenceProvider: "auto",
      prePrReviewProvider: "claude-code",
    });
    expect(settings.auxiliaryInferenceDefault).toEqual(DEFAULT_AUX_INFERENCE_DEFAULT);
    const policy = settings.auxiliaryInferencePolicy;
    expect(policy.turnSummary.model).toBe("gpt-5.6-luna");
    expect(policy.prDescription).toMatchObject({ providerId: "claude-code", model: "claude-sonnet-5" });
    // Automatic lanes now inherit: no key, not null.
    expect("model" in policy.taskName).toBe(false);
    expect("fallbackModel" in policy.turnSummary).toBe(false);
    // Lane switches and lane-specific knobs are untouched.
    expect(policy.utility).toEqual({ enabled: false, maxProviderAttempts: 2 });
    // Default users get no provider overrides.
    expect(policy.prePrReview).toEqual({ enabled: true });
    expect(policy.intentGuard.providerId).toBeUndefined();
    expect("utilityInferenceProvider" in settings).toBe(false);
    expect("prePrReviewProvider" in settings).toBe(false);

    // Same effective model as before for the overridden and the automatic lane.
    const shared = settings.auxiliaryInferenceDefault;
    expect(
      resolveAuxLaneRuntime({ lane: "turnSummary", policy, shared, activeProviderId: "codex" }).model,
    ).toBe("gpt-5.6-luna");
    expect(
      resolveAuxLaneRuntime({ lane: "taskName", policy, shared, activeProviderId: "codex" }).model,
    ).toBe("gpt-6-luna");
  });

  test("the retired provider settings become lane overrides with the same provider", async () => {
    const settings = await rehydrate({
      auxiliaryInferencePolicy: {
        ...structuredClone(OLD_POLICY),
        // Already pinned: the legacy setting never reached it, so it keeps its pin.
        taskName: { enabled: true, providerId: "claude-code", model: null },
      },
      utilityInferenceProvider: "codex",
      prePrReviewProvider: "codex",
    });
    const policy = settings.auxiliaryInferencePolicy;
    const shared = settings.auxiliaryInferenceDefault;
    expect(policy.utility.providerId).toBe("codex");
    expect(policy.taskName.providerId).toBe("claude-code");
    expect(policy.prePrReview.providerId).toBe("codex");
    expect(policy.intentGuard.providerId).toBe("codex");
    // Lanes that followed the task still follow it.
    expect(policy.turnSummary.providerId).toBeUndefined();
    expect(
      resolveAuxLaneRuntime({ lane: "utility", policy, shared, activeProviderId: "claude-code" }).providerId,
    ).toBe("codex");
    expect(
      resolveAuxLaneRuntime({ lane: "prDescription", policy, shared, activeProviderId: "codex" }).providerId,
    ).toBe("claude-code");
  });

  test("runs once: settings that already have a shared default are left alone", () => {
    const persisted = {
      auxiliaryInferenceDefault: { providerId: "codex", model: null },
      auxiliaryInferencePolicy: { utility: { enabled: true } },
      utilityInferenceProvider: "claude-code",
    };
    const settings: Record<string, unknown> = structuredClone(persisted);
    migrateAuxInferenceSharedDefault({ settings, persisted });
    expect(settings.auxiliaryInferenceDefault).toEqual({ providerId: "codex", model: null });
    expect(settings.auxiliaryInferencePolicy).toEqual({ utility: { enabled: true } });
    expect("utilityInferenceProvider" in settings).toBe(false);
  });

  test("a profile with no saved policy still gets its utility provider", () => {
    const persisted = { utilityInferenceProvider: "codex" };
    const settings: Record<string, unknown> = { ...persisted };
    migrateAuxInferenceSharedDefault({ settings, persisted });
    const policy = normalizeAuxiliaryInferencePolicy(settings.auxiliaryInferencePolicy);
    expect(policy.utility).toEqual({ enabled: true, providerId: "codex", maxProviderAttempts: 2 });
    expect(policy.taskName.providerId).toBe("codex");
    expect(policy.intentGuard.providerId).toBeUndefined();
  });
});
