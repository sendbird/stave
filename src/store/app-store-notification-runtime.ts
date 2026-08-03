import type { StoreApi } from "zustand";
import { createNotification as createPersistedNotification } from "@/lib/db/notifications.db";
import { mergeNotificationIntoList } from "@/lib/notifications/notification-state";
import {
  playCustomAttentionNotificationSound,
  playCustomNotificationSound,
  playAttentionNotificationSound,
  playNotificationSound,
} from "@/lib/notifications/notification-sound";
import type { AppNotificationCreateInput } from "@/lib/notifications/notification.types";
import { isNotificationAttentionKind } from "@/lib/notifications/notification.types";
import { showNotificationToast } from "@/store/app-notification-builders";
import type { AppState } from "@/store/app-store.types";
import { createNotificationAttentionSync } from "@/store/notification-attention-sync";

type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createAppStoreNotificationRuntime(args: {
  set: StoreSet;
  get: StoreGet;
}) {
  const { set, get } = args;
  const attentionSync = createNotificationAttentionSync({
    getNotifications: () => get().notifications,
    markRead: (args) => get().markNotificationRead(args),
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
      const unreadCount = get().notifications.filter(
        (item) => !item.readAt,
      ).length;
      void window.api?.notifications?.setBadge?.({ count: unreadCount });
      const {
        nativeNotificationsEnabled,
        notificationSoundEnabled,
        notificationSoundVolume,
        notificationSoundPreset,
        notificationSoundMode,
        notificationSoundCustomAudioData,
        attentionNotificationSoundEnabled,
        attentionNotificationSoundVolume,
        attentionNotificationSoundPreset,
        attentionNotificationSoundMode,
        attentionNotificationSoundCustomAudioData,
      } = get().settings;
      const isAttentionKind = isNotificationAttentionKind(
        result.notification.kind,
      );
      const isCompletionKind =
        result.notification.kind === "task.turn_completed" ||
        result.notification.kind === "task.turn_failed";
      if (isAttentionKind && attentionNotificationSoundEnabled) {
        // "AI needs you" cue: question (user_input) or approval request. Uses a
        // dedicated player instance so its cooldown is independent from the
        // completion sound's.
        if (
          attentionNotificationSoundMode === "custom" &&
          attentionNotificationSoundCustomAudioData
        ) {
          playCustomAttentionNotificationSound({
            dataUrl: attentionNotificationSoundCustomAudioData,
            volume: attentionNotificationSoundVolume,
          });
        } else {
          playAttentionNotificationSound({
            preset: attentionNotificationSoundPreset,
            volume: attentionNotificationSoundVolume,
          });
        }
      } else if (isCompletionKind && notificationSoundEnabled) {
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
        const isFocused =
          typeof document !== "undefined" &&
          typeof document.hasFocus === "function" &&
          document.hasFocus();
        const sameWorkspace =
          !result.notification.workspaceId ||
          result.notification.workspaceId === get().activeWorkspaceId;
        void window.api?.notifications?.showNative?.({
          notificationId: result.notification.id,
          title: result.notification.title,
          body: result.notification.body,
          suppress: isFocused && sameWorkspace,
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

  return {
    attentionSync,
    persistNotifications,
  };
}
