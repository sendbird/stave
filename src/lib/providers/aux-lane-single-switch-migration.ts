// temporary-migration: aux-lane-single-switch
/**
 * Through 0.27.3 two Background AI lanes had two switches each, and the lane
 * ran only when both were on:
 *
 * - pre-PR review: `prePrReviewEnabled` AND `auxiliaryInferencePolicy.prePrReview.enabled`
 *   (the lane's `enabled` defaulted to on, `prePrReviewEnabled` to off);
 * - inline completion: `editorAiCompletions` AND `auxiliaryInferencePolicy.inlineCompletion.enabled`
 *   (both defaulted to off).
 *
 * Pre-PR review now uses only its lane `enabled`, and inline completion only
 * `editorAiCompletions`. This writes the old effective value (the AND) into
 * the switch that stays and drops the other key, so each lane stays on or off
 * exactly as it ran. It runs on the saved settings before rehydration
 * normalizes them, and only while a retired key is still present, so running
 * it again changes nothing.
 */

const RETIRED_PRE_PR_REVIEW_KEY = "prePrReviewEnabled";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Rewrites saved settings in place. */
export function migrateAuxLaneSingleSwitch(settings: Record<string, unknown>): void {
  const savedPolicy = asRecord(settings.auxiliaryInferencePolicy);
  const policy: Record<string, unknown> = { ...(savedPolicy ?? {}) };
  let policyChanged = false;

  if (Object.hasOwn(settings, RETIRED_PRE_PR_REVIEW_KEY)) {
    const lane = asRecord(policy.prePrReview);
    // A lane saved without `enabled` ran with the old lane default: on.
    const laneEnabled = typeof lane?.enabled === "boolean" ? lane.enabled : true;
    policy.prePrReview = {
      ...(lane ?? {}),
      enabled: settings[RETIRED_PRE_PR_REVIEW_KEY] === true && laneEnabled,
    };
    policyChanged = true;
    delete settings[RETIRED_PRE_PR_REVIEW_KEY];
  }

  const inlineLane = asRecord(policy.inlineCompletion);
  if (inlineLane && Object.hasOwn(inlineLane, "enabled")) {
    const { enabled: laneEnabled, ...rest } = inlineLane;
    settings.editorAiCompletions =
      settings.editorAiCompletions === true && laneEnabled === true;
    policy.inlineCompletion = rest;
    policyChanged = true;
  }

  if (policyChanged) {
    settings.auxiliaryInferencePolicy = policy;
  }
}

type RehydrateCallback = (state?: { settings?: unknown }) => void;

/**
 * Runs the migration on the saved settings before the store's own
 * rehydration, which normalizes the policy and would otherwise drop the
 * retired inline-completion `enabled` before it is read.
 */
export function withAuxLaneSingleSwitchMigration<
  TOptions extends { onRehydrateStorage: () => (state?: never) => void },
>(options: TOptions): TOptions {
  return {
    ...options,
    onRehydrateStorage: () => {
      const afterRehydrate = options.onRehydrateStorage() as RehydrateCallback;
      return (state?: { settings?: unknown }) => {
        const settings = asRecord(state?.settings);
        if (settings) {
          migrateAuxLaneSingleSwitch(settings);
        }
        afterRehydrate(state);
      };
    },
  };
}
// end temporary-migration: aux-lane-single-switch
