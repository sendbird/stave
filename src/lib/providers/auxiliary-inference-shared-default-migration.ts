// temporary-migration: auxiliary-inference-shared-default
/**
 * Background AI moved to one shared default with per-lane overrides after
 * 0.25.2. Before then two provider settings outside Background AI decided
 * some lanes' provider: `utilityInferenceProvider` (Settings → Models
 * "Utility AI", read by the utility and task naming lanes) and
 * `prePrReviewProvider` (read by the pre-PR review and intent guard lanes).
 *
 * This folds them into lane overrides once, so every lane keeps the provider
 * it ran on, then drops both keys. The new shared default starts at `auto`
 * with an automatic model, which is exactly what a lane without a saved
 * model already used; a lane's saved model is read as its override by
 * `normalizeAuxiliaryInferencePolicy`, so explicit models need no rewrite.
 *
 * Runs before the policy is normalized and only while the saved settings have
 * no `auxiliaryInferenceDefault`, which this writes; it is idempotent.
 */
import {
  DEFAULT_AUX_INFERENCE_DEFAULT,
  type AuxLane,
  type AuxLaneProviderId,
} from "./auxiliary-inference-policy";

/** Lanes that read `utilityInferenceProvider` before the shared default. */
const UTILITY_PROVIDER_LANES = ["utility", "taskName"] as const satisfies readonly AuxLane[];
/** Lanes that read `prePrReviewProvider` before the shared default. */
const PRE_PR_REVIEW_PROVIDER_LANES = ["prePrReview", "intentGuard"] as const satisfies readonly AuxLane[];

function managedProvider(value: unknown): AuxLaneProviderId | null {
  return value === "claude-code" || value === "codex" ? value : null;
}

/**
 * `settings` is the merged settings object being rehydrated and is changed in
 * place; `persisted` is what was saved, read to decide whether to run.
 */
export function migrateAuxInferenceSharedDefault(args: {
  settings: Record<string, unknown>;
  persisted: Record<string, unknown> | null | undefined;
}): void {
  const { settings, persisted } = args;
  const alreadyMigrated = persisted?.auxiliaryInferenceDefault !== undefined;
  if (!alreadyMigrated && persisted) {
    const source =
      persisted.auxiliaryInferencePolicy &&
      typeof persisted.auxiliaryInferencePolicy === "object"
        ? (persisted.auxiliaryInferencePolicy as Record<string, unknown>)
        : {};
    const policy: Record<string, unknown> = { ...source };
    const pin = (lanes: readonly AuxLane[], providerId: AuxLaneProviderId) => {
      for (const lane of lanes) {
        const config =
          policy[lane] && typeof policy[lane] === "object"
            ? (policy[lane] as Record<string, unknown>)
            : null;
        // A lane already pinned kept its pin; the legacy setting never reached it.
        if (managedProvider(config?.providerId)) continue;
        policy[lane] = { ...(config ?? {}), providerId };
      }
    };
    const utilityProvider = managedProvider(persisted.utilityInferenceProvider);
    if (utilityProvider) {
      pin(UTILITY_PROVIDER_LANES, utilityProvider);
    }
    // These two lanes were never given the task's provider, so with the shared
    // default at `auto` they resolve to Claude; only Codex needs a pin.
    if (managedProvider(persisted.prePrReviewProvider) === "codex") {
      pin(PRE_PR_REVIEW_PROVIDER_LANES, "codex");
    }
    if (Object.keys(policy).length > 0) {
      settings.auxiliaryInferencePolicy = policy;
    }
    settings.auxiliaryInferenceDefault = { ...DEFAULT_AUX_INFERENCE_DEFAULT };
  }
  delete settings.utilityInferenceProvider;
  delete settings.prePrReviewProvider;
}
// end temporary-migration: auxiliary-inference-shared-default
