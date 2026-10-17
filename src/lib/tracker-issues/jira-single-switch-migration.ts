// temporary-migration: jira-single-switch
/**
 * Through 0.27.3 Jira had two switches and polled only when both were on:
 * `jiraConnector.enabled` (default off) AND `trackerIssues.sourceEnabled.jira`
 * (default on). Jira now uses only `jiraConnector.enabled`, the switch in
 * Settings → Integrations. This writes the old effective value (the AND) into
 * that switch and drops `sourceEnabled.jira`, so Jira stays on or off exactly
 * as it ran. A saved `sourceEnabled.jira` marks a profile written before this
 * change; a value that is not a boolean read as on, the old default. It runs on
 * the saved settings before rehydration normalizes them, and only while the
 * retired key is still present, so running it again changes nothing.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Rewrites saved settings in place. */
export function migrateJiraSingleSwitch(settings: Record<string, unknown>): void {
  const trackerIssues = asRecord(settings.trackerIssues);
  const sourceEnabled = asRecord(trackerIssues?.sourceEnabled);
  if (!trackerIssues || !sourceEnabled || !Object.hasOwn(sourceEnabled, "jira")) {
    return;
  }
  const { jira: retiredJira, ...rest } = sourceEnabled;
  settings.trackerIssues = { ...trackerIssues, sourceEnabled: rest };

  // A profile saved without the connector ran with its default: off, which is
  // also what rehydration fills in, so there is nothing to write.
  const connector = asRecord(settings.jiraConnector);
  if (connector) {
    settings.jiraConnector = {
      ...connector,
      enabled: connector.enabled === true && retiredJira !== false,
    };
  }
}
// end temporary-migration: jira-single-switch
