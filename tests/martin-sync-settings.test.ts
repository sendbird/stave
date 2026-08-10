import { describe, expect, test } from "bun:test";

import {
  DEFAULT_MARTIN_SYNC_SETTINGS,
  normalizeMartinSyncSettings,
} from "../src/lib/martin-sync/types";
import { settingDefinitions } from "../src/components/layout/settings-dialog.registry";
import { defaultSettings } from "../src/store/app-settings";

describe("martin sync settings", () => {
  test("defaults are factual-on, interpretive-off, master-off", () => {
    expect(DEFAULT_MARTIN_SYNC_SETTINGS).toEqual({
      enabled: false,
      prOpened: true,
      taskCompleted: true,
      resourceLinks: true,
      turnSummaries: false,
    });
  });

  test("app settings carry the Martin sync defaults", () => {
    expect(defaultSettings.martinSync).toEqual(
      DEFAULT_MARTIN_SYNC_SETTINGS,
    );
  });

  test("the setting definition is sensitive and excluded from export", () => {
    const definition = settingDefinitions.find(
      (candidate) => candidate.key === "martinSync",
    );
    expect(definition?.sectionId).toBe("integrations");
    expect(definition?.sensitivity).toBe("sensitive");
    expect(definition?.importExport).toBe("exclude");
  });

  test("normalize returns defaults for garbage", () => {
    expect(normalizeMartinSyncSettings(undefined)).toEqual(
      DEFAULT_MARTIN_SYNC_SETTINGS,
    );
    expect(normalizeMartinSyncSettings("nope")).toEqual(
      DEFAULT_MARTIN_SYNC_SETTINGS,
    );
    expect(normalizeMartinSyncSettings(null)).toEqual(
      DEFAULT_MARTIN_SYNC_SETTINGS,
    );
  });

  test("normalize salvages known booleans and drops unknown keys", () => {
    expect(
      normalizeMartinSyncSettings({
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
