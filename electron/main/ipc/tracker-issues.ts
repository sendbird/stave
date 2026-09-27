import { ipcMain } from "electron";

import {
  attachTrackerIssueStaveTask,
  configureTrackerIssues,
  getTrackerIssueDetail,
  getTrackerIssuesStatus,
  kickoffTrackerIssue,
  listTrackerIssues,
  refreshTrackerIssues,
  safeTrackerErrorMessage,
  setTrackerIssuesSurfaceVisible,
} from "../tracker-issues/service";
import {
  TrackerIssueAttachStaveTaskArgsSchema,
  TrackerIssueKickoffArgsSchema,
  TrackerIssueRefArgsSchema,
  TrackerIssuesConfigureArgsSchema,
  TrackerIssuesListArgsSchema,
  TrackerIssuesRefreshArgsSchema,
  TrackerIssuesSurfaceVisibleArgsSchema,
} from "./schemas";

/**
 * Every failure that leaves this module is derived from an error code.
 *
 * A tracker error can quote the JQL, the site URL, or the tail of a request
 * that carried a credential, so the upstream sentence never crosses the
 * boundary — `safeTrackerErrorMessage` is the only writer of these strings.
 */
function trackerFailure(error: unknown) {
  return { ok: false as const, message: safeTrackerErrorMessage(error) };
}

export function registerTrackerIssuesHandlers() {
  ipcMain.handle("tracker-issues:get-status", () => {
    try {
      return { ok: true, status: getTrackerIssuesStatus() };
    } catch (error) {
      // The first status read is what builds the runtime, so a persistence
      // failure surfaces here rather than at startup.
      return trackerFailure(error);
    }
  });

  ipcMain.handle("tracker-issues:list", (_event, args: unknown) => {
    const parsed = TrackerIssuesListArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return { ok: false, items: [], message: "Invalid tracker issue list." };
    }
    try {
      return { ok: true, items: listTrackerIssues(parsed.data) };
    } catch (error) {
      return { ...trackerFailure(error), items: [] };
    }
  });

  ipcMain.handle("tracker-issues:refresh", async (_event, args: unknown) => {
    const parsed = TrackerIssuesRefreshArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return { ok: false, message: "Invalid tracker refresh request." };
    }
    try {
      return { ok: true, status: await refreshTrackerIssues(parsed.data) };
    } catch (error) {
      return trackerFailure(error);
    }
  });

  ipcMain.handle("tracker-issues:get-detail", async (_event, args: unknown) => {
    const parsed = TrackerIssueRefArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid tracker issue reference." };
    }
    try {
      return { ok: true, detail: await getTrackerIssueDetail(parsed.data) };
    } catch (error) {
      return trackerFailure(error);
    }
  });

  ipcMain.handle("tracker-issues:kickoff", async (_event, args: unknown) => {
    const parsed = TrackerIssueKickoffArgsSchema.safeParse(args);
    if (!parsed.success) {
      // The schema also rejects the combinations write-back cannot honour, so
      // this one sentence covers a malformed payload and an impossible one.
      return { ok: false, message: "Invalid tracker kickoff request." };
    }
    try {
      return { ok: true, result: await kickoffTrackerIssue(parsed.data) };
    } catch (error) {
      return trackerFailure(error);
    }
  });

  ipcMain.handle("tracker-issues:attach-stave-task", (_event, args: unknown) => {
    const parsed = TrackerIssueAttachStaveTaskArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid tracker issue attachment." };
    }
    try {
      return { ok: true, link: attachTrackerIssueStaveTask(parsed.data) };
    } catch (error) {
      return trackerFailure(error);
    }
  });

  ipcMain.handle(
    "tracker-issues:set-surface-visible",
    (_event, args: unknown) => {
      const parsed = TrackerIssuesSurfaceVisibleArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid tracker surface visibility." };
      }
      try {
        setTrackerIssuesSurfaceVisible(parsed.data);
        return { ok: true };
      } catch (error) {
        return trackerFailure(error);
      }
    },
  );

  ipcMain.handle("tracker-issues:configure", async (_event, args: unknown) => {
    const parsed = TrackerIssuesConfigureArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid tracker issue settings." };
    }
    try {
      const status = await configureTrackerIssues(parsed.data);
      return { ok: true, status };
    } catch (error) {
      return trackerFailure(error);
    }
  });
}
