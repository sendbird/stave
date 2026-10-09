// temporary-migration: auto-routing-v1-settings-keys
/**
 * Stave Auto's v1 settings were flat flags beside the v2 role table
 * (`autoRoutingProfile`), kept after 0.25.2 only as mirrors nothing routed
 * with. They are no longer settings. App settings rehydration drops them, and
 * the host's synced copy of the routing settings (saved before then with the
 * same keys) is read without them, so a run resumed before the renderer
 * re-syncs still routes. A copy saved without a profile gets the profile its
 * v1 flags describe, as routing did before.
 */
import { migrateLegacyAutoSettings } from "@/lib/providers/auto-routing-profile";

export const AUTO_ROUTING_V1_SETTINGS_KEYS = [
  "autoRoutingUseClassifier",
  "autoRoutingObjective",
  "autoRoutingSafetyEscalation",
  "autoRoutingAllowProviderSwitch",
  "autoRoutingEligibleClaudeModels",
  "autoRoutingEligibleCodexModels",
] as const;

/** Removes the v1 keys from rehydrated app settings, in place. */
export function dropAutoRoutingV1SettingsKeys(settings: Record<string, unknown>): void {
  for (const key of AUTO_ROUTING_V1_SETTINGS_KEYS) {
    delete settings[key];
  }
}

/** The host copy's `routing` object without v1 keys; anything else is returned unchanged. */
export function withoutAutoRoutingV1Keys(routing: unknown): unknown {
  if (!routing || typeof routing !== "object" || Array.isArray(routing)) {
    return routing;
  }
  const source = routing as Record<string, unknown>;
  if (!AUTO_ROUTING_V1_SETTINGS_KEYS.some((key) => key in source)) {
    return routing;
  }
  const next: Record<string, unknown> = { ...source };
  dropAutoRoutingV1SettingsKeys(next);
  if (next.autoRoutingProfile === undefined) {
    next.autoRoutingProfile = migrateLegacyAutoSettings(source);
  }
  return next;
}
// end temporary-migration: auto-routing-v1-settings-keys
