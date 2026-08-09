import { describe, expect, test } from "bun:test";

import {
  DEFAULT_HIRONDELLE_SYNC_SETTINGS,
  normalizeHirondelleSyncSettings,
} from "../src/lib/hirondelle-sync/types";

describe("hirondelle sync settings", () => {
  test("defaults are factual-on, interpretive-off, master-off", () => {
    expect(DEFAULT_HIRONDELLE_SYNC_SETTINGS).toEqual({
      enabled: false,
      prOpened: true,
      taskCompleted: true,
      resourceLinks: true,
      turnSummaries: false,
    });
  });

  test("normalize returns defaults for garbage", () => {
    expect(normalizeHirondelleSyncSettings(undefined)).toEqual(
      DEFAULT_HIRONDELLE_SYNC_SETTINGS,
    );
    expect(normalizeHirondelleSyncSettings("nope")).toEqual(
      DEFAULT_HIRONDELLE_SYNC_SETTINGS,
    );
    expect(normalizeHirondelleSyncSettings(null)).toEqual(
      DEFAULT_HIRONDELLE_SYNC_SETTINGS,
    );
  });

  test("normalize salvages known booleans and drops unknown keys", () => {
    expect(
      normalizeHirondelleSyncSettings({
        enabled: true,
        turnSummaries: true,
        futureField: "from-a-newer-build",
      }),
    ).toEqual({
      enabled: true,
      prOpened: true,
      taskCompleted: true,
      resourceLinks: true,
      turnSummaries: true,
    });
  });
});
