import type { LensSessionPresentationRequestPayload } from "../../../src/lib/lens/lens.types";
import { getMainWindow } from "../window";

export function requestLensSessionPresentation(
  payload: LensSessionPresentationRequestPayload,
): boolean {
  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return false;
  }
  renderer.send("lens:present-session", payload);
  return true;
}
