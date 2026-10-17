import { describe, expect, test } from "bun:test";
import type { JiraConnectorSettings } from "../src/lib/jira-connector/types";
import type { TrackerIssuesSettings } from "../src/lib/tracker-issues/settings";
import { migrateJiraSingleSwitch } from "../src/lib/tracker-issues/jira-single-switch-migration";

/** Settings as saved through 0.27.3: Jira polled only when both switches were on. */
function oldSettings(args: { connector: boolean; source: unknown }) {
  return {
    jiraConnector: {
      enabled: args.connector,
      siteUrl: "https://acme.atlassian.net",
      authMode: "cloud-api-token",
      jql: "assignee = currentUser()",
      maxResults: 25,
      repositoryMappings: [{ jiraProjectKey: "ABC", staveProjectPath: "/repo" }],
    },
    trackerIssues: {
      defaultView: "assigned-open",
      refreshIntervalSeconds: 120,
      defaultKickoffStartMode: "stage",
      sourceEnabled: { jira: args.source, crane: false },
    },
  } as Record<string, unknown>;
}

/** Runs the real store rehydration, which calls the migration before normalizing. */
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
  const state = { ...useAppStore.getInitialState(), settings } as never as {
    settings: { jiraConnector: JiraConnectorSettings; trackerIssues: TrackerIssuesSettings };
  };
  createAppStorePersistenceOptions().onRehydrateStorage()(state as never);
  return state.settings;
}

describe("temporary migration: jira-single-switch", () => {
  const cases = [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ] as const;

  for (const [connector, source] of cases) {
    test(`connector ${connector} AND source ${source} rehydrates as ${connector && source}`, async () => {
      const settings = await rehydrate(oldSettings({ connector, source }));
      expect(settings.jiraConnector.enabled).toBe(connector && source);
      expect(settings.trackerIssues.sourceEnabled).toEqual({ crane: false });
      // The rest of both rows survives the conversion.
      expect(settings.jiraConnector.siteUrl).toBe("https://acme.atlassian.net");
      expect(settings.jiraConnector.repositoryMappings).toHaveLength(1);
      expect(settings.trackerIssues.refreshIntervalSeconds).toBe(120);
      expect(settings.trackerIssues.defaultKickoffStartMode).toBe("stage");
    });
  }

  test("a saved Jira source flag that is not a boolean read as on, the old default", () => {
    const settings = oldSettings({ connector: true, source: "yes" });
    migrateJiraSingleSwitch(settings);
    expect((settings.jiraConnector as { enabled: boolean }).enabled).toBe(true);
  });

  test("a profile saved without the connector stays off and loses the retired flag", async () => {
    const settings = oldSettings({ connector: true, source: true });
    delete settings.jiraConnector;
    const rehydrated = await rehydrate(settings);
    expect(rehydrated.jiraConnector.enabled).toBe(false);
    expect(rehydrated.trackerIssues.sourceEnabled).toEqual({ crane: false });
  });

  test("running it again changes nothing", () => {
    const settings = oldSettings({ connector: true, source: false });
    migrateJiraSingleSwitch(settings);
    const once = structuredClone(settings);
    migrateJiraSingleSwitch(settings);
    expect(settings).toEqual(once);

    // A migrated profile where the user later turned Jira on keeps it on.
    (settings.jiraConnector as { enabled: boolean }).enabled = true;
    migrateJiraSingleSwitch(settings);
    expect((settings.jiraConnector as { enabled: boolean }).enabled).toBe(true);
  });
});
