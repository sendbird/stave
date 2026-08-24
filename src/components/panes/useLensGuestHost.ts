import { useEffect } from "react";
import {
  ensureLensGuest,
  focusLensGuest,
  releaseLensGuest,
} from "@/lib/lens/lens-guest-host";

/**
 * The window's side of Lens guest lifetime.
 *
 * Every Lens page in the app is a `<webview>` this window owns, including the
 * ones no panel is showing: an agent calling `stave_lens_*` opens sessions main
 * cannot create for itself. So guest lifetime is driven entirely by main, from
 * one place, rather than by whichever panel happens to be mounted:
 *
 * - `lens:guest-required` — mount a guest and bind it back by WebContents id.
 * - `lens:session-closed` — the session is gone; removing the element is what
 *   destroys the page.
 * - `lens:focus-guest` — hand a guest native DOM focus before main dispatches
 *   agent input to it, and say whether it worked.
 *
 * Mounted once, at the app root, above the pane tree — it must outlive every
 * panel, because a Lens tab that is not currently rendered still has a live
 * page behind it.
 */
export function useLensGuestHost(): void {
  useEffect(() => {
    const lens = window.api?.lens;
    if (!lens) {
      return;
    }

    let disposed = false;

    const unsubscribeGuestRequests = lens.subscribeGuestRequests?.(
      (payload) => {
        void (async () => {
          try {
            const guestWebContentsId = await ensureLensGuest({
              workspaceId: payload.workspaceId,
              lensSessionId: payload.lensSessionId,
              partition: payload.partition,
            });
            if (disposed) {
              return;
            }

            const result = await lens.bindGuest?.({
              workspaceId: payload.workspaceId,
              lensSessionId: payload.lensSessionId,
              sessionScope: payload.sessionScope,
              projectKey: payload.projectKey,
              guestWebContentsId,
            });

            if (!result?.ok) {
              // Main refused the guest, so nothing owns it. Leaving the element
              // in the document would keep a page alive that no session can
              // reach, close, or navigate.
              releaseLensGuest(payload);
            }
          } catch (error) {
            releaseLensGuest(payload);
            lens.reportGuestMountFailure?.({
              workspaceId: payload.workspaceId,
              lensSessionId: payload.lensSessionId,
              message:
                error instanceof Error ? error.message : String(error),
            });
          }
        })();
      },
    );

    const unsubscribeSessionClosed = lens.subscribeSessionClosed?.((payload) => {
      releaseLensGuest(payload);
    });

    const unsubscribeFocusRequests = lens.subscribeGuestFocusRequests?.(
      (payload) => {
        const focused = focusLensGuest(payload);
        lens.reportGuestFocus?.({
          requestId: payload.requestId,
          ok: focused,
          message: focused
            ? undefined
            : "No Lens guest is mounted for that session",
        });
      },
    );

    return () => {
      disposed = true;
      unsubscribeGuestRequests?.();
      unsubscribeSessionClosed?.();
      unsubscribeFocusRequests?.();
    };
  }, []);
}
