import { NativeNotificationResolvedSchema } from "@/lib/notifications/native-notification-contract";
import { applyApprovalState, applyUserInputState } from "@/store/editor.utils";
import { buildApprovalResolution } from "@/lib/approvals/approval-resolution";
import { markProviderTurnInteractionResolved } from "@/lib/providers/turn-status";
import { approvalInteractionId, userInputInteractionId } from "@/lib/work-graph/work-graph-reducer";
import { remainingPendingInteraction } from "@/store/provider-message.utils";
import type { StoreApi } from "zustand";
import { createNotification as createPersistedNotification } from "@/lib/db/notifications.db";
import { mergeNotificationIntoList } from "@/lib/notifications/notification-state";
import {
  playCustomNotificationSound,
  playNotificationSound,
} from "@/lib/notifications/notification-sound";
import type { AppNotificationCreateInput } from "@/lib/notifications/notification.types";
import {
  isAgentRunAttentionNotificationKind,
  isNotificationAttentionKind,
} from "@/lib/notifications/notification.types";
import { showNotificationToast } from "@/store/app-notification-builders";
import type { AppState } from "@/store/app-store.types";
import { createNotificationAttentionSync } from "@/store/notification-attention-sync";

type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createAppStoreNotificationRuntime(args: {
  set: StoreSet;
  get: StoreGet;
  /** Restarts a turn's stall timer once a notification answer lets it resume. */
  scheduleProviderTurnStallTimer?: (args: { taskId: string; turnId: string; lastEventAt: number }) => void;
}) {
  const { set, get } = args;
  queueMicrotask(() => {
    if (typeof window !== "undefined") {
      void window.api?.notifications?.setActionsEnabled?.({ enabled: get().settings.notificationActionsEnabled });
    }
  });
  const attentionSync = createNotificationAttentionSync({
    getNotifications: () => get().notifications,
    markRead: async (args) => { await get().markNotificationRead(args); },
    getReviewSurface: () => {
      const state = get();
      return {
        activeWorkspaceId: state.activeWorkspaceId,
        visibleTaskId:
          state.activeAppSurface.kind === "workspace" &&
          state.activeSurface.kind === "task"
            ? state.activeSurface.taskId
            : null,
        windowFocused:
          typeof document !== "undefined" &&
          typeof document.hasFocus === "function" &&
          document.hasFocus(),
      };
    },
  });

  if (typeof window !== "undefined") window.api?.notifications?.subscribeNativeResolved?.((value) => {
    const parsed = NativeNotificationResolvedSchema.safeParse(value);
    if (!parsed.success) return;
    const update = parsed.data;
    const resolvedAt = Date.now();
    let resolved = false;
    set((state) => {
      const active = state.activeWorkspaceId === update.workspaceId;
      const cached = state.workspaceRuntimeCacheById[update.workspaceId];
      const session = active ? state : cached;
      if (!session) return state;
      const part = session.messagesByTask[update.taskId]?.find(message => message.id === update.messageId)?.parts.find(part =>
        (part.type === "approval" || part.type === "user_input") && part.requestId === update.requestId);
      if (!part || (part.type === "approval" ? part.state !== "approval-requested" : part.type === "user_input" && part.state !== "input-requested")) return state;
      const target = { messagesByTask: session.messagesByTask, workspaceSnapshotVersion: state.workspaceSnapshotVersion,
        taskId: update.taskId, messageId: update.messageId, requestId: update.requestId };
      const patch = update.response.type === "approval"
        ? applyApprovalState({ ...target, approved: update.response.approved,
          resolution: buildApprovalResolution({ approved: update.response.approved, source: "user", scope: "once", decidedAt: resolvedAt }) })
        : applyUserInputState({ ...target, answers: update.response.answers });
      // As an in-app answer does: the turn stops showing "Needs you" unless another prompt is still open.
      const providerTurnActivityByTask = markProviderTurnInteractionResolved({
        activityByTask: state.providerTurnActivityByTask ?? {},
        taskId: update.taskId,
        turnId: update.turnId,
        now: resolvedAt,
        interactionId: update.response.type === "approval" ? approvalInteractionId(update.requestId) : userInputInteractionId(update.requestId),
        remaining: remainingPendingInteraction(patch.messagesByTask[update.taskId], update.turnId),
      });
      resolved = true;
      if (active) return { ...patch, providerTurnActivityByTask };
      if (!cached) return state;
      return { workspaceRuntimeCacheById: { ...state.workspaceRuntimeCacheById,
        [update.workspaceId]: { ...cached, messagesByTask: patch.messagesByTask } }, providerTurnActivityByTask };
    });
    // The provider resumes after the answer; the stall net counts from now.
    if (resolved) args.scheduleProviderTurnStallTimer?.({ taskId: update.taskId, turnId: update.turnId, lastEventAt: resolvedAt });
    const state = get();
    const session = state.activeWorkspaceId === update.workspaceId ? state : state.workspaceRuntimeCacheById[update.workspaceId];
    if (session) attentionSync.syncTaskInteractions({ taskId: update.taskId, messages: session.messagesByTask[update.taskId] ?? [] });
  });

  const persistNotification = async (
    notification: AppNotificationCreateInput,
  ) => {
    try {
      const result = await createPersistedNotification({ notification });
      if (!result.notification) {
        return null;
      }
      const notificationId = result.notification.id;
      set((state) => ({
        notifications: mergeNotificationIntoList({
          notifications: state.notifications,
          notification: result.notification!,
        }),
      }));
      // Only the writer that inserted the row may announce it.
      if (!result.inserted) {
        return result.notification;
      }
      if (result.notification.payload.tarsManaged === true) {
        attentionSync.noteTurnOutcome(result.notification);
        return result.notification;
      }
      const {
        nativeNotificationsEnabled,
        notificationSoundEnabled,
        notificationSoundVolume,
        notificationSoundPreset,
        notificationSoundMode,
        notificationSoundCustomAudioData,
      } = get().settings;
      const isAttentionKind =
        isNotificationAttentionKind(result.notification.kind) ||
        isAgentRunAttentionNotificationKind(result.notification.kind);
      const isCompletionKind =
        result.notification.kind === "task.turn_completed" ||
        result.notification.kind === "task.turn_failed" ||
        result.notification.kind === "agent_run.completed";
      // One configured sound; the notification kind decides when it plays:
      // "AI needs you" (question or approval request) and turn completion.
      if ((isAttentionKind || isCompletionKind) && notificationSoundEnabled) {
        if (
          notificationSoundMode === "custom" &&
          notificationSoundCustomAudioData
        ) {
          playCustomNotificationSound({
            dataUrl: notificationSoundCustomAudioData,
            volume: notificationSoundVolume,
          });
        } else {
          playNotificationSound({
            preset: notificationSoundPreset,
            volume: notificationSoundVolume,
          });
        }
      }
      if (nativeNotificationsEnabled) {
        // The OS notification is for when Stave is not in front of you. While
        // its window has focus, the in-app toast, the bell and the sound say
        // it already, whichever workspace the notification belongs to.
        const isFocused =
          typeof document !== "undefined" &&
          typeof document.hasFocus === "function" &&
          document.hasFocus();
        await window.api?.notifications?.setActionsEnabled?.({ enabled: get().settings.notificationActionsEnabled });
        void window.api?.notifications?.showNative?.({
          notificationId: result.notification.id,
          title: result.notification.title,
          body: result.notification.body,
          suppress: isFocused,
        });
      }
      showNotificationToast(result.notification, {
        onOpen: () =>
          void get().openNotificationContext({
            notificationId,
            targetSurface: "task",
          }),
      });
      attentionSync.noteTurnOutcome(result.notification);
      return result.notification;
    } catch (error) {
      console.error("[notifications] failed to persist notification", error);
      return null;
    }
  };

  const persistNotifications = async (
    notifications: AppNotificationCreateInput[],
  ) => {
    for (const notification of notifications) {
      await persistNotification(notification);
    }
  };

  registeredPersistNotifications = persistNotifications;
  return {
    attentionSync,
    persistNotifications,
  };
}

let registeredPersistNotifications:
  | ((notifications: AppNotificationCreateInput[]) => Promise<void>)
  | null = null;

/**
 * Raises notifications from outside the app store — the agent run watcher, for
 * example — through the same path as turn notifications: stored once per
 * dedupe key, with the sound, the OS notification and the toast.
 */
export function persistRendererNotifications(
  notifications: AppNotificationCreateInput[],
) {
  return registeredPersistNotifications?.(notifications) ?? Promise.resolve();
}
