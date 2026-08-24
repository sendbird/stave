import { isLensGuestPartition } from "./browser-session-profile";

/**
 * Web preferences a Lens guest is allowed to run with. Every one of these is
 * forced from main rather than read off the tag, because the tag is authored in
 * the renderer and the renderer is the side of the boundary that untrusted page
 * content can reach first.
 *
 * `nodeIntegrationInSubFrames` and `webviewTag` are included even though
 * neither is on by default: an attach clamp that only fixes the defaults it
 * remembers is a clamp that fails silently when a default changes.
 */
export type LensGuestWebPreferences = {
  preload: string;
  contextIsolation: true;
  nodeIntegration: false;
  nodeIntegrationInSubFrames: false;
  sandbox: true;
  webSecurity: true;
  allowRunningInsecureContent: false;
  webviewTag: false;
  /** Guest partition, forced to the value main resolved for the session. */
  partition: string;
};

export type LensWebviewAttachDecision =
  | { allow: false; reason: string }
  | { allow: true; webPreferences: LensGuestWebPreferences };

/**
 * Decide whether a `<webview>` may attach, and with which preferences.
 *
 * Enabling `webviewTag` on the host window means any script running in the app
 * renderer can put a `<webview>` in the DOM. This is the single place that
 * decides what such a tag is permitted to become: anything not pointed at a
 * Lens partition is refused outright, and anything that is gets exactly the
 * preferences below regardless of what the tag asked for.
 *
 * Pure so it can be tested without an Electron window.
 */
export function decideLensWebviewAttach(args: {
  /** The tag's `partition` attribute, verbatim and untrusted. */
  requestedPartition: unknown;
  /** Preload path resolved by main for Lens guests. */
  guestPreloadPath: string;
}): LensWebviewAttachDecision {
  const { requestedPartition, guestPreloadPath } = args;

  if (!isLensGuestPartition(requestedPartition)) {
    return {
      allow: false,
      reason:
        typeof requestedPartition === "string" && requestedPartition.length > 0
          ? `partition "${requestedPartition}" is not a Lens partition`
          : "no Lens partition was requested",
    };
  }

  if (!guestPreloadPath) {
    return { allow: false, reason: "no Lens guest preload path is available" };
  }

  return {
    allow: true,
    webPreferences: {
      preload: guestPreloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      partition: requestedPartition,
    },
  };
}

/**
 * Apply a decision to the mutable preferences object Electron hands to
 * `will-attach-webview`.
 *
 * Assigns rather than replaces, because Electron reads the same object back;
 * and deletes nothing, because every key that matters is overwritten. Keys
 * Electron adds later are covered by the explicit list above, not by omission.
 */
export function applyLensWebviewPreferences(
  target: Record<string, unknown>,
  preferences: LensGuestWebPreferences,
): void {
  for (const [key, value] of Object.entries(preferences)) {
    target[key] = value;
  }
}
