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
import {
  cancelQuitPrompt,
  confirmQuitPrompt,
  hasConfirmedQuit,
  isQuitPromptOpen,
  openQuitPrompt,
  requestRendererQuitConfirmation,
  shouldSkipQuitConfirmation,
} from "./main/quit-state";

const persistenceRuntime = configurePersistenceUserDataPath(app);
process.env.STAVE_USER_DATA_PATH = persistenceRuntime.userDataPath;

if (!app.isPackaged) {
  process.env.STAVE_DEV = "1";
}

let quittingAfterCleanup = false;
let beforeQuitCleanupPromise: Promise<void> | null = null;

function runBeforeQuitCleanup() {
  if (beforeQuitCleanupPromise) {
    return beforeQuitCleanupPromise;
  }

  beforeQuitCleanupPromise = (async () => {
    const results = await Promise.allSettled([
      stopStaveMcpServer(),
      stopHostService(),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[main] before-quit cleanup failed", result.reason);
      }
    }

    resetMainProcessState();
  })();

  return beforeQuitCleanupPromise;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildApplicationMenu());
  registerHandlers();
  createMainWindow();
  void startHostService().catch((error) => {
    console.error("[host-service] failed to start", error);
  });
  void startStaveMcpServer().catch((error) => {
    console.error("[stave-mcp] failed to start local MCP server", error);
  });
});

app.on("before-quit", (event) => {
  if (quittingAfterCleanup) {
    return;
  }

  event.preventDefault();

  // Programmatic quit paths (e.g. update-restart) bypass the user dialog.
  if (shouldSkipQuitConfirmation() || hasConfirmedQuit()) {
    void runBeforeQuitCleanup().finally(() => {
      quittingAfterCleanup = true;
      app.quit();
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
