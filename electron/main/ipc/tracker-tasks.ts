import { ipcMain } from "electron";

import {
  attachTrackerTaskStaveTask,
  configureTrackerTasks,
  getTrackerTaskDetail,
  getTrackerTasksStatus,
  kickoffTrackerTask,
  listTrackerTasks,
  refreshTrackerTasks,
  safeTrackerErrorMessage,
  setTrackerTasksSurfaceVisible,
} from "../tracker-tasks/service";
import {
  TrackerTaskAttachStaveTaskArgsSchema,
  TrackerTaskKickoffArgsSchema,
  TrackerTaskRefArgsSchema,
  TrackerTasksConfigureArgsSchema,
  TrackerTasksListArgsSchema,
  TrackerTasksRefreshArgsSchema,
  TrackerTasksSurfaceVisibleArgsSchema,
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

export function registerTrackerTasksHandlers() {
  ipcMain.handle("tracker-tasks:get-status", () => {
    try {
      return { ok: true, status: getTrackerTasksStatus() };
    } catch (error) {
      // The first status read is what builds the runtime, so a persistence
      // failure surfaces here rather than at startup.
      return trackerFailure(error);
    }
  });

  ipcMain.handle("tracker-tasks:list", (_event, args: unknown) => {
    const parsed = TrackerTasksListArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return { ok: false, items: [], message: "Invalid tracker task list." };
    }
    try {
      return { ok: true, items: listTrackerTasks(parsed.data) };
    } catch (error) {
      return { ...trackerFailure(error), items: [] };
    }
  });

  ipcMain.handle("tracker-tasks:refresh", async (_event, args: unknown) => {
    const parsed = TrackerTasksRefreshArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return { ok: false, message: "Invalid tracker refresh request." };
    }
    try {
      return { ok: true, status: await refreshTrackerTasks(parsed.data) };
    } catch (error) {
      return trackerFailure(error);
    }
  });

  ipcMain.handle("tracker-tasks:get-detail", async (_event, args: unknown) => {
    const parsed = TrackerTaskRefArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid tracker task reference." };
    }
    try {
      return { ok: true, detail: await getTrackerTaskDetail(parsed.data) };
    } catch (error) {
      return trackerFailure(error);
    }
  });

  ipcMain.handle("tracker-tasks:kickoff", async (_event, args: unknown) => {
    const parsed = TrackerTaskKickoffArgsSchema.safeParse(args);
    if (!parsed.success) {
      // The schema also rejects the combinations write-back cannot honour, so
      // this one sentence covers a malformed payload and an impossible one.
      return { ok: false, message: "Invalid tracker kickoff request." };
    }
    try {
      return { ok: true, result: await kickoffTrackerTask(parsed.data) };
    } catch (error) {
      return trackerFailure(error);
    }
  });

  ipcMain.handle("tracker-tasks:attach-stave-task", (_event, args: unknown) => {
    const parsed = TrackerTaskAttachStaveTaskArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid tracker task attachment." };
    }
    try {
      return { ok: true, link: attachTrackerTaskStaveTask(parsed.data) };
    } catch (error) {
      return trackerFailure(error);
    }
  });

  ipcMain.handle(
    "tracker-tasks:set-surface-visible",
    (_event, args: unknown) => {
      const parsed = TrackerTasksSurfaceVisibleArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid tracker surface visibility." };
      }
      try {
        setTrackerTasksSurfaceVisible(parsed.data);
        return { ok: true };
      } catch (error) {
        return trackerFailure(error);
      }
    },
  );

  ipcMain.handle("tracker-tasks:configure", (_event, args: unknown) => {
    const parsed = TrackerTasksConfigureArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid tracker task settings." };
    }
    try {
      configureTrackerTasks(parsed.data);
      return { ok: true, status: getTrackerTasksStatus() };
    } catch (error) {
      return trackerFailure(error);
    }
  });
}
