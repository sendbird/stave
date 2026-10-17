import { describe, expect, test } from "bun:test";
import type { AuxiliaryInferencePolicy } from "../src/lib/providers/auxiliary-inference-policy";
import {
  migrateAuxLaneSingleSwitch,
  withAuxLaneSingleSwitchMigration,
} from "../src/lib/providers/aux-lane-single-switch-migration";

/** Settings as saved through 0.27.3: two switches per lane. */
function oldSettings(args: {
  prePrReviewEnabled: boolean;
  prePrReviewLane: boolean;
  editorAiCompletions: boolean;
  inlineLane: boolean;
}) {
  return {
    prePrReviewEnabled: args.prePrReviewEnabled,
    editorAiCompletions: args.editorAiCompletions,
    auxiliaryInferencePolicy: {
      intentGuard: { enabled: true, onlyWhenDiffChanged: true, onlyAfterFileEdits: true },
      turnSummary: { enabled: false, skipWithoutAssistantText: true },
      taskName: { enabled: true, maxUserTurns: 1 },
      utility: { enabled: true, maxProviderAttempts: 2 },
      prDescription: { enabled: true },
      prePrReview: { enabled: args.prePrReviewLane, providerId: "codex" },
      inlineCompletion: { enabled: args.inlineLane, model: "claude-haiku-5-5" },
    },
  } as Record<string, unknown>;
}

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
  const options = withAuxLaneSingleSwitchMigration(createAppStorePersistenceOptions());
  const state = { ...useAppStore.getInitialState(), settings } as never as {
    settings: Record<string, unknown> & {
      auxiliaryInferencePolicy: AuxiliaryInferencePolicy;
      editorAiCompletions: boolean;
    };
  };
  options.onRehydrateStorage()(state as never);
  return state.settings;
}

describe("temporary migration: aux-lane-single-switch", () => {
  const cases = [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ] as const;

  for (const [feature, lane] of cases) {
    test(`pre-PR review keeps ${feature && lane ? "on" : "off"} for feature=${feature} lane=${lane}`, () => {
      const settings = oldSettings({
        prePrReviewEnabled: feature,
        prePrReviewLane: lane,
        editorAiCompletions: false,
        inlineLane: false,
      });
      migrateAuxLaneSingleSwitch(settings);
      expect("prePrReviewEnabled" in settings).toBe(false);
      const policy = settings.auxiliaryInferencePolicy as Record<string, Record<string, unknown>>;
      expect(policy.prePrReview).toEqual({ enabled: feature && lane, providerId: "codex" });
    });

    test(`inline completion keeps ${feature && lane ? "on" : "off"} for feature=${feature} lane=${lane}`, () => {
      const settings = oldSettings({
        prePrReviewEnabled: false,
        prePrReviewLane: true,
        editorAiCompletions: feature,
        inlineLane: lane,
      });
      migrateAuxLaneSingleSwitch(settings);
      expect(settings.editorAiCompletions).toBe(feature && lane);
      const policy = settings.auxiliaryInferencePolicy as Record<string, Record<string, unknown>>;
      expect(policy.inlineCompletion).toEqual({ model: "claude-haiku-5-5" });
    });
  }

  test("a pre-PR review lane saved without enabled used the old lane default (on)", () => {
    const settings: Record<string, unknown> = {
      prePrReviewEnabled: true,
      auxiliaryInferencePolicy: { prePrReview: { model: "claude-sonnet-5" } },
    };
    migrateAuxLaneSingleSwitch(settings);
    expect(settings).toEqual({
      auxiliaryInferencePolicy: { prePrReview: { model: "claude-sonnet-5", enabled: true } },
      // No inline completion lane: completion was off.
      editorAiCompletions: false,
    });
  });

  test("an old profile without an inline completion lane keeps completion off", () => {
    const settings: Record<string, unknown> = {
      prePrReviewEnabled: false,
      editorAiCompletions: true,
      auxiliaryInferencePolicy: { prePrReview: { enabled: true } },
    };
    migrateAuxLaneSingleSwitch(settings);
    expect(settings).toEqual({
      editorAiCompletions: false,
      auxiliaryInferencePolicy: { prePrReview: { enabled: false } },
    });

    const withoutPolicy: Record<string, unknown> = {
      prePrReviewEnabled: true,
      editorAiCompletions: true,
    };
    migrateAuxLaneSingleSwitch(withoutPolicy);
    expect(withoutPolicy.editorAiCompletions).toBe(false);
    expect("prePrReviewEnabled" in withoutPolicy).toBe(false);
  });

  test("an old profile with an inline completion lane saved without enabled keeps completion off", () => {
    const settings: Record<string, unknown> = {
      prePrReviewEnabled: false,
      editorAiCompletions: true,
      auxiliaryInferencePolicy: { inlineCompletion: { model: "claude-haiku-5-5" } },
    };
    migrateAuxLaneSingleSwitch(settings);
    expect(settings.editorAiCompletions).toBe(false);
    const policy = settings.auxiliaryInferencePolicy as Record<string, Record<string, unknown>>;
    expect(policy.inlineCompletion).toEqual({ model: "claude-haiku-5-5" });

    // Once migrated, turning completion on again is left alone.
    settings.editorAiCompletions = true;
    const once = structuredClone(settings);
    migrateAuxLaneSingleSwitch(settings);
    expect(settings).toEqual(once);
  });

  test("is idempotent and leaves settings already in the new shape alone", () => {
    const settings = oldSettings({
      prePrReviewEnabled: true,
      prePrReviewLane: true,
      editorAiCompletions: true,
      inlineLane: true,
    });
    migrateAuxLaneSingleSwitch(settings);
    const once = structuredClone(settings);
    migrateAuxLaneSingleSwitch(settings);
    expect(settings).toEqual(once);

    const current: Record<string, unknown> = {
      editorAiCompletions: true,
      auxiliaryInferencePolicy: { prePrReview: { enabled: false }, inlineCompletion: {} },
    };
    const before = structuredClone(current);
    migrateAuxLaneSingleSwitch(current);
    expect(current).toEqual(before);
  });

  test("runs before rehydration normalizes the policy", async () => {
    const settings = await rehydrate(
      oldSettings({
        prePrReviewEnabled: true,
        prePrReviewLane: true,
        editorAiCompletions: true,
        inlineLane: true,
      }),
    );
    expect("prePrReviewEnabled" in settings).toBe(false);
    expect(settings.auxiliaryInferencePolicy.prePrReview).toEqual({
      enabled: true,
      providerId: "codex",
    });
    expect(settings.editorAiCompletions).toBe(true);
    expect(settings.auxiliaryInferencePolicy.inlineCompletion).toEqual({
      model: "claude-haiku-5-5",
    });
    expect(settings.auxiliaryInferencePolicy.turnSummary.enabled).toBe(false);
  });

  test("an old profile without an inline completion lane stays off after rehydration", async () => {
    const saved = oldSettings({
      prePrReviewEnabled: false,
      prePrReviewLane: true,
      editorAiCompletions: true,
      inlineLane: false,
    });
    delete (saved.auxiliaryInferencePolicy as Record<string, unknown>).inlineCompletion;
    const settings = await rehydrate(saved);
    expect(settings.editorAiCompletions).toBe(false);
  });

  test("an old profile with inline completion lane off stays off after rehydration", async () => {
    const settings = await rehydrate(
      oldSettings({
        prePrReviewEnabled: false,
        prePrReviewLane: true,
        editorAiCompletions: true,
        inlineLane: false,
      }),
    );
    expect(settings.editorAiCompletions).toBe(false);
    expect(settings.auxiliaryInferencePolicy.prePrReview.enabled).toBe(false);
  });
});
