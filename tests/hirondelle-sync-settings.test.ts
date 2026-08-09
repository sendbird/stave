import { describe, expect, test } from "bun:test";

import {
  DEFAULT_HIRONDELLE_SYNC_SETTINGS,
  normalizeHirondelleSyncSettings,
} from "../src/lib/hirondelle-sync/types";
import { settingDefinitions } from "../src/components/layout/settings-dialog.registry";
import { defaultSettings } from "../src/store/app-settings";

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

  test("app settings carry the Hirondelle sync defaults", () => {
    expect(defaultSettings.hirondelleSync).toEqual(
      DEFAULT_HIRONDELLE_SYNC_SETTINGS,
    );
  });

  test("the setting definition is sensitive and excluded from export", () => {
    const definition = settingDefinitions.find(
      (candidate) => candidate.key === "hirondelleSync",
    );
    expect(definition?.sectionId).toBe("integrations");
    expect(definition?.sensitivity).toBe("sensitive");
    expect(definition?.importExport).toBe("exclude");
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
