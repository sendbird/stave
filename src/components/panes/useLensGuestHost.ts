import { useEffect } from "react";
import { isLensGuestPointerTarget } from "@/lib/lens/lens-guest-interaction";
import {
  acquireLensGuestPointerPassthrough,
  ensureLensGuest,
  focusLensGuest,
  parkLensGuestsOutsideWorkspace,
  releaseLensGuest,
  releaseLensGuestPointerPassthrough,
  resetLensGuestPointerPassthrough,
  restoreLensGuestFocus,
} from "@/lib/lens/lens-guest-host";
import { useAppStore } from "@/store/app.store";

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
 * - `lens:restore-guest-focus` — give that focus back so a parked guest cannot
 *   keep the caret in another workspace's PromptInput.
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
              // The host tore down while the guest was attaching. It is mounted
              // now and bound to nothing, so release it rather than leave a
              // live WebContents orphaned in the document.
              releaseLensGuest(payload);
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
              message: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      },
    );

    const unsubscribeSessionClosed = lens.subscribeSessionClosed?.(
      (payload) => {
        releaseLensGuest(payload);
      },
    );

    const unsubscribeFocusRequests = lens.subscribeGuestFocusRequests?.(
      (payload) => {
        const focused = focusLensGuest(payload, payload.requestId);
        lens.reportGuestFocus?.({
          requestId: payload.requestId,
          ok: focused,
          message: focused
            ? undefined
            : "No Lens guest is mounted for that session",
        });
      },
    );

    const unsubscribeFocusRestoreRequests =
      lens.subscribeGuestFocusRestoreRequests?.((payload) => {
        restoreLensGuestFocus(payload.borrowRequestId);
        lens.reportGuestFocusRestore?.({
          requestId: payload.requestId,
        });
      });

    const unsubscribeWorkspace = useAppStore.subscribe((state, previous) => {
      if (state.activeWorkspaceId === previous.activeWorkspaceId) {
        return;
      }
      parkLensGuestsOutsideWorkspace(state.activeWorkspaceId);
    });

    const endPointerPassthrough = (event: PointerEvent) => {
      releaseLensGuestPointerPassthrough(event.pointerId);
    };
    const resetPointerPassthrough = () => {
      resetLensGuestPointerPassthrough();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (isLensGuestPointerTarget(target)) {
        return;
      }
      acquireLensGuestPointerPassthrough(event.pointerId);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", endPointerPassthrough, true);
    window.addEventListener("pointercancel", endPointerPassthrough, true);
    window.addEventListener("blur", resetPointerPassthrough);
    document.addEventListener("visibilitychange", resetPointerPassthrough);

    return () => {
      disposed = true;
      unsubscribeGuestRequests?.();
      unsubscribeSessionClosed?.();
      unsubscribeFocusRequests?.();
      unsubscribeFocusRestoreRequests?.();
      unsubscribeWorkspace();
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", endPointerPassthrough, true);
      window.removeEventListener("pointercancel", endPointerPassthrough, true);
      window.removeEventListener("blur", resetPointerPassthrough);
      document.removeEventListener(
        "visibilitychange",
        resetPointerPassthrough,
      );
      resetLensGuestPointerPassthrough();
    };
  }, []);
}
