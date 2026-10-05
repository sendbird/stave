import { app, Menu, type MenuItemConstructorOptions } from "electron";
import { tMain } from "./i18n";

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
 *
 * Role items carry explicit labels because Electron localizes role labels by
 * the OS language, not by Stave's display-language setting. Rebuild the menu
 * after the main-process locale changes.
 */
export function buildApplicationMenu(): Menu {
  const isMac = process.platform === "darwin";
  const appName = app.name;

  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: appName,
      submenu: [
        { role: "about", label: tMain("menu.about", { appName }) },
        { type: "separator" },
        { role: "services", label: tMain("menu.services") },
        { type: "separator" },
        { role: "hide", label: tMain("menu.hide", { appName }) },
        { role: "hideOthers", label: tMain("menu.hideOthers") },
        { role: "unhide", label: tMain("menu.showAll") },
        { type: "separator" },
        // Quit is handled via the before-quit event with confirmation dialog.
        // We keep the menu item so Cmd+Q still triggers app.quit().
        { role: "quit", label: tMain("menu.quit", { appName }) },
      ],
    });
  }

  // Edit menu — provides Cmd+Z, Cmd+X, Cmd+C, Cmd+V, Cmd+A to every
  // focused webContents automatically via role accelerators.
  template.push({
    label: tMain("menu.edit"),
    submenu: [
      { role: "undo", label: tMain("menu.undo") },
      { role: "redo", label: tMain("menu.redo") },
      { type: "separator" },
      { role: "cut", label: tMain("menu.cut") },
      { role: "copy", label: tMain("menu.copy") },
      { role: "paste", label: tMain("menu.paste") },
      { role: "pasteAndMatchStyle", label: tMain("menu.pasteAndMatchStyle") },
      { role: "delete", label: tMain("menu.delete") },
      { role: "selectAll", label: tMain("menu.selectAll") },
      ...(isMac
        ? [
            { type: "separator" } as MenuItemConstructorOptions,
            {
              label: tMain("menu.speech"),
              submenu: [
                { role: "startSpeaking", label: tMain("menu.startSpeaking") } as MenuItemConstructorOptions,
                { role: "stopSpeaking", label: tMain("menu.stopSpeaking") } as MenuItemConstructorOptions,
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
      label: tMain("menu.view"),
      submenu: [
        { role: "reload", label: tMain("menu.reload") },
        { role: "forceReload", label: tMain("menu.forceReload") },
        { role: "toggleDevTools", label: tMain("menu.toggleDevTools") },
      ],
    });
  }

  // Window menu
  template.push({
    label: tMain("menu.window"),
    submenu: [
      { role: "minimize", label: tMain("menu.minimize") },
      ...(isMac
        ? [
            { role: "zoom", label: tMain("menu.zoom") } as MenuItemConstructorOptions,
            { type: "separator" } as MenuItemConstructorOptions,
            { role: "front", label: tMain("menu.bringAllToFront") } as MenuItemConstructorOptions,
          ]
        : [{ role: "close", label: tMain("menu.close") } as MenuItemConstructorOptions]),
    ],
  });

  return Menu.buildFromTemplate(template);
}
