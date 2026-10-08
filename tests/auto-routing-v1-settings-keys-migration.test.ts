import { describe, expect, test } from "bun:test";
import {
  buildStarterProfile,
  migrateLegacyAutoSettings,
} from "../src/lib/providers/auto-routing-profile";
import { AgentRouteSettingsSchema } from "../src/lib/routing/agent-run-route";
import { AUTO_ROUTING_V1_SETTINGS_KEYS } from "../src/lib/routing/auto-routing-v1-settings-migration";

const V1_KEYS = {
  autoRoutingUseClassifier: false,
  autoRoutingObjective: 0.1,
  autoRoutingSafetyEscalation: false,
  autoRoutingAllowProviderSwitch: true,
  autoRoutingEligibleClaudeModels: ["claude-haiku-5-5"],
  autoRoutingEligibleCodexModels: [],
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
    settings: Record<string, unknown>;
  };
  options.onRehydrateStorage?.()?.(state as never);
  return state.settings;
}

describe("temporary migration: auto-routing-v1-settings-keys", () => {
  test("settings rehydration drops the v1 keys and keeps the saved profile", async () => {
    const profile = buildStarterProfile("starter-quality-first");
    const settings = await rehydrate({
      autoRoutingEnabled: true,
      autoRoutingProfile: profile,
      ...V1_KEYS,
    });
    for (const key of AUTO_ROUTING_V1_SETTINGS_KEYS) {
      expect(key in settings).toBe(false);
    }
    expect(settings.autoRoutingEnabled).toBe(true);
    // The profile decides routing, exactly as before; the stale v1 flags do not.
    expect(settings.autoRoutingProfile).toMatchObject({
      id: "starter-quality-first",
      stance: profile.stance,
      signals: profile.signals,
    });
  });

  test("a host copy saved with v1 keys still parses, without them", () => {
    const profile = buildStarterProfile("starter-balanced");
    const parsed = AgentRouteSettingsSchema.parse({
      routing: { autoRoutingEnabled: true, autoRoutingProfile: profile, ...V1_KEYS },
      classifier: null,
    });
    expect(Object.keys(parsed.routing).sort()).toEqual(["autoRoutingEnabled", "autoRoutingProfile"]);
    expect(parsed.routing.autoRoutingProfile?.id).toBe("starter-balanced");
  });

  test("a host copy saved without a profile routes with the profile its v1 flags describe", () => {
    const parsed = AgentRouteSettingsSchema.parse({
      routing: { autoRoutingEnabled: true, ...V1_KEYS },
      classifier: null,
    });
    const expected = migrateLegacyAutoSettings(V1_KEYS);
    expect(parsed.routing.autoRoutingProfile).toMatchObject({
      id: expected.id,
      stance: "cost-saver",
      signals: expected.signals,
      eligibleModelsByProvider: expected.eligibleModelsByProvider,
    });
  });

  test("the current shape round-trips unchanged", () => {
    const routing = { autoRoutingEnabled: false, autoRoutingProfile: buildStarterProfile("starter-balanced") };
    const parsed = AgentRouteSettingsSchema.parse({ routing, classifier: null });
    expect(parsed.routing.autoRoutingEnabled).toBe(false);
    expect(parsed.routing.autoRoutingProfile?.id).toBe("starter-balanced");
    expect(AgentRouteSettingsSchema.safeParse({ routing: { ...routing, unknownKey: 1 }, classifier: null }).success).toBe(
      false,
    );
  });
});
