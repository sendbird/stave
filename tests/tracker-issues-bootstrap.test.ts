import { afterEach, describe, expect, test } from "bun:test";
import type { JiraConnectorSettings } from "../src/lib/jira-connector/types";

const originalWindow = globalThis.window;

function memoryStorage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  };
}

/** A profile saved through 0.27.3 with Jira on through both of its old switches. */
const savedProfile = JSON.stringify({
  state: {
    settings: {
      jiraConnector: {
        enabled: true,
        siteUrl: "https://acme.atlassian.net",
        authMode: "cloud-api-token",
        jql: "project = ABC",
        maxResults: 25,
        repositoryMappings: [],
      },
      trackerIssues: {
        defaultView: "assigned-open",
        refreshIntervalSeconds: 300,
        defaultKickoffStartMode: "run",
        sourceEnabled: { jira: true, crane: true },
      },
    },
  },
  version: 0,
});

let restoreSettings: (() => void) | null = null;

/**
 * Boots against a 0.27.3 profile through the store's own rehydrate callback
 * (which runs the jira-single-switch migration before normalizing). The
 * callback is called directly, like the migration tests do, because in the
 * shared test process the store may already exist without its persist API.
 */
async function bootWith(api: Record<string, unknown>) {
  (globalThis as { window?: unknown }).window = {
    localStorage: memoryStorage(),
    location: { href: "https://stave.test/" },
    api,
  };
  const { useAppStore } = await import("../src/store/app.store");
  const { createAppStorePersistenceOptions } = await import("../src/store/app-store-persistence");
  const previousSettings = useAppStore.getState().settings;
  restoreSettings = () => useAppStore.setState({ settings: previousSettings });
  const savedSettings = (JSON.parse(savedProfile) as { state: { settings: Record<string, unknown> } }).state.settings;
  const initial = useAppStore.getInitialState();
  const state = { ...initial, settings: { ...initial.settings, ...savedSettings } } as never as {
    settings: typeof initial.settings;
  };
  createAppStorePersistenceOptions().onRehydrateStorage()(state as never);
  useAppStore.setState({ settings: state.settings });
  const bootstrap = await import("../src/lib/tracker-issues/bootstrap");
  bootstrap.resetTrackerIssuesBootstrap();
  const teardown = bootstrap.bootstrapTrackerIssuesClient();
  return { teardown, useAppStore };
}

function trackerIssuesApi(configured: unknown[]) {
  return {
    configure: async (settings: unknown) => {
      configured.push(settings);
      return { ok: true };
    },
  };
}

afterEach(() => {
  restoreSettings?.();
  restoreSettings = null;
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("tracker issues bootstrap", () => {
  test("sends the rehydrated Jira connector settings to main once at startup", async () => {
    const jiraConfigured: JiraConnectorSettings[] = [];
    const trackerConfigured: unknown[] = [];
    const { teardown, useAppStore } = await bootWith({
      trackerIssues: trackerIssuesApi(trackerConfigured),
      jiraConnector: {
        configure: async (settings: JiraConnectorSettings) => {
          jiraConfigured.push(settings);
          return { ok: true, status: {} };
        },
      },
    });
    try {
      expect(jiraConfigured).toHaveLength(1);
      // The saved settings, after the jira-single-switch migration ran.
      expect(jiraConfigured[0]).toMatchObject({
        enabled: true,
        siteUrl: "https://acme.atlassian.net",
        jql: "project = ABC",
        maxResults: 25,
      });
      expect(trackerConfigured).toEqual([
        expect.objectContaining({ sourceEnabled: { crane: true } }),
      ]);

      // Later edits are pushed by Settings → Integrations, not again here.
      const settings = useAppStore.getState().settings;
      useAppStore.setState({
        settings: { ...settings, jiraConnector: { ...settings.jiraConnector, jql: "project = XYZ" } },
      });
      expect(jiraConfigured).toHaveLength(1);
    } finally {
      teardown();
    }
  });

  test("starts without error when the bridge has no Jira configure", async () => {
    const trackerConfigured: unknown[] = [];
    const { teardown } = await bootWith({
      trackerIssues: trackerIssuesApi(trackerConfigured),
      jiraConnector: {},
    });
    try {
      expect(trackerConfigured).toHaveLength(1);
    } finally {
      teardown();
    }
  });

  test("a rejected Jira configure does not break startup", async () => {
    const trackerConfigured: unknown[] = [];
    const { teardown } = await bootWith({
      trackerIssues: trackerIssuesApi(trackerConfigured),
      jiraConnector: { configure: () => Promise.reject(new Error("ipc down")) },
    });
    try {
      await Promise.resolve();
      expect(trackerConfigured).toHaveLength(1);
    } finally {
      teardown();
    }
  });
});
