import type { BrowserSessionState } from "./browser-manager";
import { lensCaptureLane } from "./browser-capture-lane";
import { acquireLensCapturePaint } from "./browser-capture-paint";
import { isCdpPageSleeping } from "./browser-cdp-controller";

/** A preview must neither overlap capture nor make a successful action fail. */
export async function captureLensPreview(
  session: BrowserSessionState,
): Promise<string | undefined> {
  const guest = session.webContents;
  if (
    guest.isDestroyed() ||
    lensCaptureLane.isBusy(guest.id) ||
    isCdpPageSleeping(guest.id)
  )
    return;
  const documentId = session.documentId;
  return lensCaptureLane
    .run(
      guest.id,
      async (context) => {
        const release = await acquireLensCapturePaint(guest.id, context.signal);
        try {
          context.assertActive();
          if (guest.isDestroyed() || session.documentId !== documentId) return;
          const image = await guest.capturePage(undefined, {
            stayHidden: true,
            stayAwake: true,
          });
          context.assertActive();
          if (
            guest.isDestroyed() ||
            image.isEmpty() ||
            session.documentId !== documentId
          )
            return;
          const preview = image
            .resize({ width: Math.min(640, image.getSize().width) })
            .toJPEG(60);
          if (preview.byteLength <= 256_000)
            return `data:image/jpeg;base64,${preview.toString("base64")}`;
        } finally {
          release();
        }
      },
      { timeoutMs: 1500 },
    )
    .catch(() => undefined);
}
