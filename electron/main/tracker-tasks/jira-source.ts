import {
  toTrackerTaskDetailFromJira,
  toTrackerTaskFromJira,
} from "../../../src/lib/jira-connector/mapping";
import type {
  JiraConnectorPublicStatus,
  JiraConnectorSettings,
} from "../../../src/lib/jira-connector/types";
import type {
  TrackerSourceAdapter,
  TrackerSourceListResult,
} from "../../../src/lib/tracker-tasks/source";
import type {
  TrackerSourceAvailability,
  TrackerTask,
  TrackerTaskDetail,
} from "../../../src/lib/tracker-tasks/types";

/**
 * Everything the adapter needs from the main-process connector, injected so the
 * adapter can be exercised without an Electron runtime - and so the credential
 * stays behind `listIssues`/`getIssue` instead of being handed to the caller.
 */
export interface JiraTrackerSourceDeps {
  getSettings(): JiraConnectorSettings;
  getStatus(): Promise<JiraConnectorPublicStatus>;
  listIssues(args: { signal: AbortSignal; nextPageToken?: string }): Promise<{
    issues: unknown[];
    truncated: boolean;
    nextPageToken: string | null;
  }>;
  getIssue(args: { key: string; signal: AbortSignal }): Promise<unknown>;
}

export function createJiraTrackerSource(
  deps: JiraTrackerSourceDeps,
): TrackerSourceAdapter {
  function siteUrlFrom(status: JiraConnectorPublicStatus): string {
    return status.siteUrl ?? deps.getSettings().siteUrl;
  }

  return {
    sourceId: "jira",
    capabilities: {
      // Jira write-back would need a transition or comment permission the read
      // scope does not imply, so a run started from a Jira ticket is tracked
      // only in Stave.
      kickoffWriteBack: false,
      detail: true,
    },

    async availability(): Promise<TrackerSourceAvailability> {
      if (!deps.getSettings().enabled) {
        return "disabled";
      }
      const status = await deps.getStatus();
      if (!status.secureStorageAvailable) {
        return "secure_storage_unavailable";
      }
      if (!status.configured || !siteUrlFrom(status)) {
        return "not_configured";
      }
      return "ready";
    },

    async listTasks(args: {
      signal: AbortSignal;
    }): Promise<TrackerSourceListResult> {
      const status = await deps.getStatus();
      const siteUrl = siteUrlFrom(status);
      const tasks: TrackerTask[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;
      // Same row and page budgets as Crane: follow the continuation page
      // instead of treating the first search reply as the whole list.
      const maxTasks = 200;
      const maxPages = 8;

      for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
        const page = await deps.listIssues({
          signal: args.signal,
          nextPageToken: cursor,
        });
        for (const issue of page.issues) {
          if (tasks.length >= maxTasks) break;
          const task = toTrackerTaskFromJira(issue, siteUrl);
          // A row this build cannot read is dropped rather than failing the
          // page: one unusable issue type must not empty the whole list.
          if (task) tasks.push(task);
        }
        if (tasks.length >= maxTasks) {
          return { tasks, truncated: true };
        }
        if (!page.nextPageToken || !page.truncated) {
          return { tasks, truncated: false };
        }
        if (seenCursors.has(page.nextPageToken)) {
          return { tasks, truncated: true };
        }
        seenCursors.add(page.nextPageToken);
        cursor = page.nextPageToken;
      }
      return { tasks, truncated: true };
    },

    async getTask(args: {
      ref: string;
      signal: AbortSignal;
    }): Promise<TrackerTaskDetail> {
      const status = await deps.getStatus();
      const issue = await deps.getIssue({
        key: args.ref,
        signal: args.signal,
      });
      const detail = toTrackerTaskDetailFromJira(issue, siteUrlFrom(status));
      if (!detail) {
        throw new Error("The Jira issue could not be read.");
      }
      return detail;
    },
  };
}

/**
 * Default wiring against the main-process singleton. Kept in a factory so
 * importing this module does not pull the Electron-backed service in.
 */
export async function createDefaultJiraTrackerSource(): Promise<TrackerSourceAdapter> {
  const service = await import("../jira-connector/service");
  return createJiraTrackerSource({
    getSettings: () => service.getJiraConnectorSettings(),
    getStatus: () => service.loadJiraConnectorStatus(),
    listIssues: (args) => service.listJiraIssuesForCurrentUser(args),
    getIssue: (args) => service.getJiraIssue(args),
  });
}
