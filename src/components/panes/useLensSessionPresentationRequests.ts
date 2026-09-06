import { useEffect } from "react";
import { toast } from "@/lib/notifications/toast";
import { resolveLensPresentationRequestPolicy } from "@/lib/lens/lens-agent-presentation";
import type { LensSessionPresentationRequestPayload } from "@/lib/lens/lens.types";
import { useAppStore } from "@/store/app.store";
import { presentLensSession } from "@/components/panes/pane-host-controller";

/** Give a queued pane host a few chances to mount before giving up. */
const MAX_PRESENTATION_ATTEMPTS = 5;

function presentationKey(
  payload: LensSessionPresentationRequestPayload,
): string {
  return `${payload.workspaceId}\u0000${payload.lensSessionId}`;
}

/**
 * Bridges main-process Lens presentation requests into the active workspace.
 * Automatic requests never switch workspaces; they wait until their workspace
 * is active so background agent activity cannot pull the user away.
 */
export function useLensSessionPresentationRequests(): void {
  useEffect(() => {
    let disposed = false;
    let pendingFlushTimer: number | null = null;
    const pendingBySession = new Map<
      string,
      LensSessionPresentationRequestPayload
    >();
    // A pending request is re-flushed on every workspace/settings change. Cap
    // the attempts so a request that can never present (workspace gone, host
    // never mounts) is abandoned instead of retried for the whole app session.
    const attemptsBySession = new Map<string, number>();

    const forget = (key: string) => {
      pendingBySession.delete(key);
      attemptsBySession.delete(key);
    };

    const presentRequest = async (
      payload: LensSessionPresentationRequestPayload,
      options?: { verifyDeferredSession?: boolean },
    ) => {
      if (disposed) {
        return;
      }
      const key = presentationKey(payload);
      const state = useAppStore.getState();

      // The workspace can be closed or disposed between the request and the
      // flush; without this the entry would be retried on every store change.
      if (
        !state.workspaces.some(
          (workspace) => workspace.id === payload.workspaceId,
        )
      ) {
        forget(key);
        return;
      }

      const policy = resolveLensPresentationRequestPolicy({
        payload,
        activeWorkspaceId: state.activeWorkspaceId,
        mode: state.settings.lensAgentPresentationMode,
      });

      if (!policy) {
        forget(key);
        return;
      }
      if (policy.deferUntilWorkspaceActive) {
        pendingBySession.set(key, payload);
        return;
      }
      if (payload.requestKind === "agent-activity") {
        pendingBySession.set(key, payload);
      }
      if (options?.verifyDeferredSession) {
        const listSessions = window.api?.lens?.listSessions;
        if (listSessions) {
          try {
            const result = await listSessions({
              workspaceId: payload.workspaceId,
            });
            if (disposed || !result.ok) {
              return;
            }
            const sessionStillExists = result.sessions?.some(
              (session) =>
                session.lensSessionId === payload.lensSessionId,
            );
            if (!sessionStillExists) {
              forget(key);
              return;
            }
          } catch (error) {
            console.error(
              "[lens] Failed to verify deferred presentation",
              error,
            );
            return;
          }
        }
      }

      try {
        const presented = await presentLensSession(payload, {
          placement: policy.placement,
          allowWorkspaceSwitch: policy.allowWorkspaceSwitch,
        });
        if (disposed) {
          return;
        }
        if (presented) {
          forget(key);
        } else if (pendingBySession.has(key)) {
          const attempts = (attemptsBySession.get(key) ?? 0) + 1;
          if (attempts >= MAX_PRESENTATION_ATTEMPTS) {
            forget(key);
          } else {
            attemptsBySession.set(key, attempts);
          }
        }
        const reason = payload.reason?.trim();
        if (
          presented &&
          payload.requestKind !== "agent-activity" &&
          reason
        ) {
          toast.info("Lens opened for agent", { description: reason });
        }
      } catch (error) {
        console.error("[lens] Failed to present session", error);
      }
    };

    const schedulePendingFlush = () => {
      if (pendingFlushTimer !== null) {
        window.clearTimeout(pendingFlushTimer);
      }
      pendingFlushTimer = window.setTimeout(() => {
        pendingFlushTimer = null;
        const activeWorkspaceId = useAppStore.getState().activeWorkspaceId;
        for (const payload of pendingBySession.values()) {
          if (payload.workspaceId === activeWorkspaceId) {
            void presentRequest(payload, {
              verifyDeferredSession: true,
            });
          }
        }
      }, 0);
    };

    const unsubscribe = window.api?.lens?.subscribePresentationRequests?.(
      (payload) => {
        void presentRequest(payload);
      },
    );
    const unsubscribeStore = useAppStore.subscribe((state, previousState) => {
      if (
        state.activeWorkspaceId === previousState.activeWorkspaceId &&
        state.workspaces === previousState.workspaces &&
        state.settings.lensAgentPresentationMode ===
          previousState.settings.lensAgentPresentationMode
      ) {
        return;
      }
      schedulePendingFlush();
    });

    return () => {
      disposed = true;
      if (pendingFlushTimer !== null) {
        window.clearTimeout(pendingFlushTimer);
      }
      pendingBySession.clear();
      attemptsBySession.clear();
      unsubscribe?.();
      unsubscribeStore();
    };
  }, []);
}
