import type { JiraConnectorSettings } from "@/lib/jira-connector/types";
import type { TrackerIssuesSettings } from "@/lib/tracker-issues/settings";

interface JiraGateSettings {
  jiraConnector: JiraConnectorSettings;
  trackerIssues: TrackerIssuesSettings;
}

/**
 * Jira polls only while both `jiraConnector.enabled` and
 * `trackerIssues.sourceEnabled.jira` are on (see `buildJiraSource` in
 * electron/main/tracker-issues/service.ts). Settings → Integrations owns the
 * single switch for that pair: it reads the effective AND and writes both, and
 * Issues → Sources only shows the result and links to Integrations.
 */
export function isJiraSourceEnabled(settings: JiraGateSettings): boolean {
  return settings.jiraConnector.enabled && settings.trackerIssues.sourceEnabled.jira;
}

/** Settings patch that turns Jira on or off through both keys that gate it. */
export function buildJiraEnablementPatch(args: {
  settings: JiraGateSettings;
  enabled: boolean;
}): JiraGateSettings {
  const { jiraConnector, trackerIssues } = args.settings;
  return {
    jiraConnector: { ...jiraConnector, enabled: args.enabled },
    trackerIssues: {
      ...trackerIssues,
      sourceEnabled: { ...trackerIssues.sourceEnabled, jira: args.enabled },
    },
  };
}
