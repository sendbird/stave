import { app, Menu } from "electron";
import { registerHandlers } from "./main/ipc";
import { startHostService, stopHostService } from "./main/host-service-client";
import { configurePersistenceUserDataPath } from "./main/runtime-profile";
import { resetMainProcessState } from "./main/state";
import {
  startStaveMcpServer,
  stopStaveMcpServer,
} from "./main/stave-mcp-server";
import { createMainWindow, getMainWindow } from "./main/window";
import { buildApplicationMenu } from "./main/application-menu";
import { requestRendererPersistenceFlush } from "./main/persistence-flush-gate";
import { confirmPersistenceBeforeQuit } from "./main/quit-persistence-policy";
import {
  cancelQuitPrompt,
  confirmQuitPrompt,
  hasConfirmedQuit,
  isQuitPromptOpen,
  openQuitPrompt,
  requestRendererQuitConfirmation,
  shouldSkipQuitConfirmation,
} from "./main/quit-state";
import { stopCraneConnectorRuntime } from "./main/crane-connector/service";
import { stopMartinSyncRuntime } from "./main/martin-sync/service";
import {
  startTrackerTasksRuntime,
  stopTrackerTasksRuntime,
} from "./main/tracker-tasks/service";

const persistenceRuntime = configurePersistenceUserDataPath(app);
process.env.STAVE_USER_DATA_PATH = persistenceRuntime.userDataPath;

if (!app.isPackaged) {
  process.env.STAVE_DEV = "1";
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let quittingAfterCleanup = false;
let beforeQuitCleanupPromise: Promise<boolean> | null = null;

function runBeforeQuitCleanup() {
  if (beforeQuitCleanupPromise) {
    return beforeQuitCleanupPromise;
  }

  beforeQuitCleanupPromise = (async () => {
    // Renderer-owned state (drafts, tabs, layout, information) reaches SQLite
    // through a debounced flush. Give it a bounded chance to land *before* the
    // store is compacted and closed below, instead of the old blocking
    // `upsert-workspace-sync` round-trip.
    const mayQuit = await confirmPersistenceBeforeQuit({
      flush: () => requestRendererPersistenceFlush(),
      choose: async () => {
        const { dialog } = await import("electron");
        const options = {
          type: "warning" as const,
          buttons: ["Keep Stave open", "Retry saving", "Quit without saving"],
          defaultId: 0,
          cancelId: 0,
          title: "Changes have not been saved",
          message: "Stave could not save your latest workspace changes.",
          detail:
            "Keep Stave open to preserve your current work, or retry saving before quitting.",
        };
        const window = getMainWindow();
        const result =
          window && !window.isDestroyed()
            ? await dialog.showMessageBox(window, options)
            : await dialog.showMessageBox(options);
        return result.response === 1
          ? "retry"
          : result.response === 2
            ? "quit"
            : "stay";
      },
    });
    if (!mayQuit) return false;

    const results = await Promise.allSettled([
      Promise.resolve(stopCraneConnectorRuntime()),
      Promise.resolve(stopMartinSyncRuntime()),
      Promise.resolve(stopTrackerTasksRuntime()),
      stopStaveMcpServer(),
      stopHostService(),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[main] before-quit cleanup failed", result.reason);
      }
    }

    await resetMainProcessState({ compactPersistence: true });
    return true;
  })();

  return beforeQuitCleanupPromise;
}

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) {
      return;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildApplicationMenu());
    registerHandlers();
    createMainWindow();
    startTrackerTasksRuntime();
    void startHostService().catch((error) => {
      console.error("[host-service] failed to start", error);
    });
    void startStaveMcpServer().catch((error) => {
      console.error("[stave-mcp] failed to start local MCP server", error);
    });
  });
}

app.on("before-quit", (event) => {
  if (!hasSingleInstanceLock) {
    return;
  }
  if (quittingAfterCleanup) {
    return;
  }

  event.preventDefault();

  // Programmatic quit paths (e.g. update-restart) bypass the user dialog.
  if (shouldSkipQuitConfirmation() || hasConfirmedQuit()) {
    void runBeforeQuitCleanup()
      .then((mayQuit) => {
        if (mayQuit) {
          quittingAfterCleanup = true;
          app.quit();
        } else beforeQuitCleanupPromise = null;
      })
      .catch((error) => {
        beforeQuitCleanupPromise = null;
        console.error("[main] could not finish quit cleanup", error);
      });
    return;
  }

  if (isQuitPromptOpen()) {
    if (requestRendererQuitConfirmation()) {
      return;
    }
    cancelQuitPrompt();
  }

  // Guard against multiple concurrent dialogs (e.g. rapid Cmd+Q).
  if (!openQuitPrompt()) {
    return;
  }

  if (requestRendererQuitConfirmation()) {
    return;
  }

  // Fall back to a native dialog when the renderer cannot receive the request.
  void showQuitConfirmation().then((confirmed) => {
    if (!confirmed) {
      cancelQuitPrompt();
      return;
    }
    confirmQuitPrompt();
    app.quit(); // re-trigger before-quit, this time confirmation is already set
  });
});

async function showQuitConfirmation(): Promise<boolean> {
  const { dialog } = await import("electron");
  const window = getMainWindow();
  const parentWindow = window && !window.isDestroyed() ? window : null;

  const options = {
    type: "question" as const,
    buttons: ["Quit", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Quit Stave",
    message: "Are you sure you want to quit?",
    detail:
      "Any running tasks will be stopped and unsaved changes may be lost.",
  };

  const { response } = parentWindow
    ? await dialog.showMessageBox(parentWindow, options)
    : await dialog.showMessageBox(options);

  return response === 0;
}
