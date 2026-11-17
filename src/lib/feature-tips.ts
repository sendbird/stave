/** Optional features a short tip may offer to turn on. */
export const FEATURE_TIP_IDS = ["steering"] as const;
export type FeatureTipId = (typeof FEATURE_TIP_IDS)[number];

/** Keeps known tip ids once each; anything else in a stored snapshot is dropped. */
export function normalizeDismissedFeatureTips(value: unknown): FeatureTipId[] {
  if (!Array.isArray(value)) return [];
  return FEATURE_TIP_IDS.filter((id) => value.includes(id));
}
