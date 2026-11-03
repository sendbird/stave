import { afterEach, describe, expect, test } from "bun:test";
import {
  FLEET_TREE_DEFAULT_MARKER,
  migrateFleetTreeDefault,
} from "../src/lib/fleet/fleet-tree-default-migration";

const globalWithWindow = globalThis as { window?: unknown };
const hadWindow = "window" in globalWithWindow;
const originalWindow = globalWithWindow.window;

afterEach(() => {
  if (hadWindow) globalWithWindow.window = originalWindow;
  else delete globalWithWindow.window;
});

/** Settings as saved through 0.29.2: Fleet's layout was saved with every profile. */
function oldSettings(fleetBoardLayout?: unknown) {
  return {
    language: "en",
    themeMode: "dark",
    sidebarShowFleetView: true,
    ...(fleetBoardLayout === undefined ? {} : { fleetBoardLayout }),
  } as Record<string, unknown>;
}

/** Runs the real store rehydration, which calls the migration before normalizing. */
async function rehydrate(settings: Record<string, unknown>) {
  globalWithWindow.window = { api: {} };
  const { useAppStore } = await import("../src/store/app.store");
  const { createAppStorePersistenceOptions } = await import("../src/store/app-store-persistence");
  const state = { ...useAppStore.getInitialState(), settings } as never as {
    settings: Record<string, unknown>;
  };
  createAppStorePersistenceOptions().onRehydrateStorage()(state as never);
  return state.settings;
}

describe("temporary migration: fleet-tree-default", () => {
  test("a saved cards layout moves to tree once and records the marker", async () => {
    const settings = await rehydrate(oldSettings("cards"));
    expect(settings.fleetBoardLayout).toBe("tree");
    expect(settings[FLEET_TREE_DEFAULT_MARKER]).toBe(true);
    // The rest of the profile survives the conversion.
    expect(settings.themeMode).toBe("dark");
  });

  test("a profile saved before the layout existed opens on tree", async () => {
    const settings = await rehydrate(oldSettings());
    expect(settings.fleetBoardLayout).toBe("tree");
    expect(settings[FLEET_TREE_DEFAULT_MARKER]).toBe(true);
  });

  test("a saved table layout is kept", async () => {
    const settings = await rehydrate(oldSettings("table"));
    expect(settings.fleetBoardLayout).toBe("table");
    expect(settings[FLEET_TREE_DEFAULT_MARKER]).toBe(true);
  });

  test("Cards chosen after the switch is kept on every later load", async () => {
    const first = await rehydrate(oldSettings("cards"));
    // The user picks Cards; the saved profile carries the marker.
    const saved = JSON.parse(JSON.stringify({ ...first, fleetBoardLayout: "cards" }));
    const second = await rehydrate(saved);
    expect(second.fleetBoardLayout).toBe("cards");
    const third = await rehydrate(JSON.parse(JSON.stringify(second)));
    expect(third.fleetBoardLayout).toBe("cards");
  });

  test("running it again changes nothing", () => {
    const settings = oldSettings("cards");
    migrateFleetTreeDefault(settings);
    const once = { ...settings };
    migrateFleetTreeDefault(settings);
    expect(settings).toEqual(once);
    settings.fleetBoardLayout = "cards";
    migrateFleetTreeDefault(settings);
    expect(settings.fleetBoardLayout).toBe("cards");
  });
});
