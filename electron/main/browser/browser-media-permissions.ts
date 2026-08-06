import type { Session, WebContents } from "electron";

interface LensPermissionRequestDecision {
  isOwnedLensPage: boolean;
  permission: string;
  mediaTypes?: readonly string[];
}

interface LensPermissionCheckDecision {
  isOwnedLensPage: boolean;
  permission: string;
  mediaType?: string;
}

type LensPermissionSession = Pick<
  Session,
  "setPermissionCheckHandler" | "setPermissionRequestHandler"
>;

type LensAudioWebContents = Pick<WebContents, "setAudioMuted">;

export function shouldGrantLensPermissionRequest(
  decision: LensPermissionRequestDecision,
): boolean {
  if (!decision.isOwnedLensPage) {
    return false;
  }

  if (decision.permission === "speaker-selection") {
    return true;
  }

  return (
    decision.permission === "media" &&
    decision.mediaTypes !== undefined &&
    decision.mediaTypes.length > 0 &&
    decision.mediaTypes.every((mediaType) => mediaType === "audio")
  );
}

export function shouldGrantLensPermissionCheck(
  decision: LensPermissionCheckDecision,
): boolean {
  return (
    decision.isOwnedLensPage &&
    decision.permission === "media" &&
    (decision.mediaType === undefined ||
      decision.mediaType === "unknown" ||
      decision.mediaType === "audio")
  );
}

export function enableLensPageAudioOutput(
  webContents: LensAudioWebContents,
): void {
  webContents.setAudioMuted(false);
}

export function installLensAudioPermissionHandlers(
  session: LensPermissionSession,
  isOwnedLensPage: (webContents: WebContents | null) => boolean,
): void {
  session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      callback(
        shouldGrantLensPermissionRequest({
          isOwnedLensPage: isOwnedLensPage(webContents),
          permission,
          mediaTypes:
            "mediaTypes" in details ? details.mediaTypes : undefined,
        }),
      );
    },
  );

  session.setPermissionCheckHandler(
    (webContents, permission, _requestingOrigin, details) =>
      shouldGrantLensPermissionCheck({
        isOwnedLensPage: isOwnedLensPage(webContents),
        permission,
        mediaType: details.mediaType,
      }),
  );
}
