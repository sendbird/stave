import { useEffect } from "react";
import { toast } from "sonner";
import { resolveLensPresentationRequestPolicy } from "@/lib/lens/lens-agent-presentation";
import type { LensSessionPresentationRequestPayload } from "@/lib/lens/lens.types";
import { useAppStore } from "@/store/app.store";
import { presentLensSession } from "@/components/panes/pane-host-controller";

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

    const presentRequest = async (
      payload: LensSessionPresentationRequestPayload,
      options?: { verifyDeferredSession?: boolean },
    ) => {
      if (disposed) {
        return;
      }
      const key = presentationKey(payload);
      const state = useAppStore.getState();
      const policy = resolveLensPresentationRequestPolicy({
        payload,
        activeWorkspaceId: state.activeWorkspaceId,
        mode: state.settings.lensAgentPresentationMode,
      });

      if (!policy) {
        pendingBySession.delete(key);
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
              pendingBySession.delete(key);
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
          pendingBySession.delete(key);
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
      unsubscribe?.();
      unsubscribeStore();
    };
  }, []);
}
