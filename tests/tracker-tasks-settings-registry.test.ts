import { describe, expect, test } from "bun:test";

import { settingDefinitions } from "../src/components/layout/settings-dialog.registry";
import {
  matchesSettingsSection,
  settingsSectionGroups,
  settingsSections,
} from "../src/components/layout/settings-dialog.schema";
import {
  DEFAULT_JIRA_CONNECTOR_SETTINGS,
  DEFAULT_JIRA_JQL,
  normalizeJiraConnectorSettings,
} from "../src/lib/jira-connector/types";
import {
  DEFAULT_TRACKER_TASKS_SETTINGS,
  normalizeTrackerTasksSettings,
} from "../src/lib/tracker-tasks/settings";
import { defaultSettings } from "../src/store/app-settings";

function definitionFor(key: string) {
  return settingDefinitions.find((candidate) => candidate.key === key);
}

describe("tracker tasks and Jira settings registry", () => {
  test("the Jira connector definition is sensitive and never exported", () => {
    const definition = definitionFor("jiraConnector");
    expect(definition?.sectionId).toBe("integrations");
    // The site URL plus the mapping table describe a private tracker, and the
    // credential it pairs with lives in the main-process vault, so an export
    // could never round-trip the row anyway.
    expect(definition?.sensitivity).toBe("sensitive");
    expect(definition?.importExport).toBe("exclude");
  });

  test("the tracker tasks definition is plain and exportable", () => {
    const definition = definitionFor("trackerTasks");
    expect(definition?.sectionId).toBe("tasks");
    expect(definition?.sensitivity).toBe("plain");
    expect(definition?.importExport).toBe("include");
  });

  test("every definition points at a section that exists", () => {
    const sectionIds = new Set(settingsSections.map((section) => section.id));
    for (const definition of settingDefinitions) {
      expect(sectionIds.has(definition.sectionId)).toBe(true);
    }
  });

  test("the tasks section is declared and grouped", () => {
    const section = settingsSections.find(
      (candidate) => candidate.id === "tasks",
    );
    expect(section?.label).toBe("Tasks");
    expect(
      settingsSectionGroups.some((group) => group.ids.includes("tasks")),
    ).toBe(true);
    // Search has to find the surface by the words people actually type.
    expect(matchesSettingsSection(section!, "tickets")).toBe(true);
    expect(matchesSettingsSection(section!, "tracker")).toBe(true);
    expect(matchesSettingsSection(section!, "kickoff")).toBe(true);
  });

  test("Integrations search reaches the Jira card", () => {
    const section = settingsSections.find(
      (candidate) => candidate.id === "integrations",
    );
    expect(matchesSettingsSection(section!, "jira")).toBe(true);
    expect(matchesSettingsSection(section!, "jql")).toBe(true);
    expect(matchesSettingsSection(section!, "api token")).toBe(true);
  });

  test("app defaults carry both slices", () => {
    expect(defaultSettings.jiraConnector).toEqual({
      ...DEFAULT_JIRA_CONNECTOR_SETTINGS,
      projectMappings: [],
    });
    expect(defaultSettings.jiraConnector.jql).toBe(DEFAULT_JIRA_JQL);
    expect(defaultSettings.trackerTasks).toEqual(
      DEFAULT_TRACKER_TASKS_SETTINGS,
    );
  });

  test("defaults round-trip through their normalizers", () => {
    expect(
      normalizeJiraConnectorSettings(defaultSettings.jiraConnector),
    ).toEqual({ ...DEFAULT_JIRA_CONNECTOR_SETTINGS, projectMappings: [] });
    expect(normalizeTrackerTasksSettings(defaultSettings.trackerTasks)).toEqual(
      DEFAULT_TRACKER_TASKS_SETTINGS,
    );
    // The registry schemas are the import path, so they must accept the same
    // documents the normalizers emit.
    expect(
      definitionFor("jiraConnector")?.schema.safeParse(
        defaultSettings.jiraConnector,
      ).success,
    ).toBe(true);
    expect(
      definitionFor("trackerTasks")?.schema.safeParse(
        defaultSettings.trackerTasks,
      ).success,
    ).toBe(true);
  });

  test("a corrupt Jira blob is salvaged rather than thrown away", () => {
    const salvaged = normalizeJiraConnectorSettings({
      enabled: true,
      siteUrl: "https://tracker.example.com/jira/",
      authMode: "cloud-api-token",
      jql: "assignee = currentUser()",
      maxResults: 25,
      projectMappings: [
        { jiraProjectKey: "PLAT", staveProjectPath: "/tmp/platform" },
        { jiraProjectKey: 42, staveProjectPath: "" },
        "not a mapping",
      ],
    });
    // The readable row survives; only the two unreadable ones are dropped.
    expect(salvaged.enabled).toBe(true);
    expect(salvaged.siteUrl).toBe("https://tracker.example.com/jira");
    expect(salvaged.maxResults).toBe(25);
    expect(salvaged.projectMappings).toEqual([
      { jiraProjectKey: "PLAT", staveProjectPath: "/tmp/platform" },
    ]);
  });

  test("unreadable Jira and tasks blobs fall back without throwing", () => {
    for (const blob of [undefined, null, "nope", 12, []]) {
      expect(() => normalizeJiraConnectorSettings(blob)).not.toThrow();
      expect(normalizeJiraConnectorSettings(blob)).toEqual({
        ...DEFAULT_JIRA_CONNECTOR_SETTINGS,
        projectMappings: [],
      });
      expect(() => normalizeTrackerTasksSettings(blob)).not.toThrow();
      expect(normalizeTrackerTasksSettings(blob)).toEqual(
        DEFAULT_TRACKER_TASKS_SETTINGS,
      );
    }
  });

  test("one bad tasks field does not reset the fields beside it", () => {
    expect(
      normalizeTrackerTasksSettings({
        defaultView: "recently-done",
        // Written by a build with a wider range than this one accepts.
        refreshIntervalSeconds: 86_400,
        defaultKickoffStartMode: "stage",
      }),
    ).toEqual({
      defaultView: "recently-done",
      refreshIntervalSeconds:
        DEFAULT_TRACKER_TASKS_SETTINGS.refreshIntervalSeconds,
      defaultKickoffStartMode: "stage",
    });
  });
});
