import { app, Menu, type MenuItemConstructorOptions } from "electron";

/**
 * Build the application menu.
 *
 * The previous implementation used `Menu.setApplicationMenu(null)` which
 * completely disables standard OS keyboard shortcuts (Cmd+C, Cmd+V, Cmd+A,
 * Cmd+Z, etc.) on macOS. Even with a frameless window the menu must exist
 * for these accelerators to be dispatched to the focused webContents.
 *
 * The menu is kept minimal and hidden — it only exists so that Electron's
 * accelerator routing works correctly.
 */
export function buildApplicationMenu(): Menu {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        // Quit is handled via the before-quit event with confirmation dialog.
        // We keep the menu item so Cmd+Q still triggers app.quit().
        { role: "quit" },
      ],
    });
  }

  // Edit menu — provides Cmd+Z, Cmd+X, Cmd+C, Cmd+V, Cmd+A to every
  // focused webContents automatically via role accelerators.
  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "pasteAndMatchStyle" },
      { role: "delete" },
      { role: "selectAll" },
      ...(isMac
        ? [
            { type: "separator" } as MenuItemConstructorOptions,
            {
              label: "Speech",
              submenu: [
                { role: "startSpeaking" } as MenuItemConstructorOptions,
                { role: "stopSpeaking" } as MenuItemConstructorOptions,
              ],
            } as MenuItemConstructorOptions,
          ]
        : []),
    ],
  });

  // View menu — minimal, zoom shortcuts are handled in window.ts
  // but we add reload for development convenience.
  if (!app.isPackaged) {
    template.push({
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    });
  }

  // Window menu
  template.push({
    label: "Window",
    submenu: [
      { role: "minimize" },
      ...(isMac
        ? [
            { role: "zoom" } as MenuItemConstructorOptions,
            { type: "separator" } as MenuItemConstructorOptions,
            { role: "front" } as MenuItemConstructorOptions,
          ]
        : [{ role: "close" } as MenuItemConstructorOptions]),
    ],
  });

  return Menu.buildFromTemplate(template);
}
