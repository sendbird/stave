/**
 * Shared quit-confirmation state for the main process.
 *
 * Use `bypassQuitConfirmation()` before calling `app.quit()` in programmatic
 * quit paths (e.g. update-restart) that must not show the user-facing dialog.
 */

import { getMainWindow } from "./window";

export const APP_QUIT_REQUEST_CHANNEL = "window:app-quit-requested";

let _skipConfirmation = false;
let _quitConfirmed = false;
let _quitPromptOpen = false;

export function bypassQuitConfirmation(): void {
  _skipConfirmation = true;
}

export function shouldSkipQuitConfirmation(): boolean {
  return _skipConfirmation;
}

export function hasConfirmedQuit(): boolean {
  return _quitConfirmed;
}

export function isQuitPromptOpen(): boolean {
  return _quitPromptOpen;
}

export function openQuitPrompt(): boolean {
  if (_quitPromptOpen) {
    return false;
  }
  _quitPromptOpen = true;
  return true;
}

export function cancelQuitPrompt(): void {
  _quitPromptOpen = false;
}

export function confirmQuitPrompt(): void {
  _quitPromptOpen = false;
  _quitConfirmed = true;
}

export function requestRendererQuitConfirmation(): boolean {
  const window = getMainWindow();
  if (
    !window ||
    window.isDestroyed() ||
    window.webContents.isDestroyed() ||
    window.webContents.isLoadingMainFrame()
  ) {
    return false;
  }

  try {
    window.webContents.send(APP_QUIT_REQUEST_CHANNEL);
    return true;
  } catch {
    return false;
  }
}
