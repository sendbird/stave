import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { StoreApi } from "zustand";
import type { AppState } from "@/store/app-store.types";
import type { AppNotificationCreateInput } from "@/lib/notifications/notification.types";
import { APP_NOTIFICATION_KINDS } from "@/lib/notifications/notification.types";

const playPreset = mock((_options: { preset: string; volume: number }) => true);
const playCustom = mock((_options: { dataUrl: string; volume: number }) => true);
const showToast = mock(() => {});
const originalWindow = globalThis.window;
let inserted = true;
let persistenceFails = false;

mock.module("@/lib/notifications/notification-sound", () => ({
  playNotificationSound: playPreset,
  playCustomNotificationSound: playCustom,
}));
mock.module("@/lib/db/notifications.db", () => ({
  createNotification: async ({ notification }: { notification: AppNotificationCreateInput }) => {
    if (persistenceFails) return { notification: null, inserted: false };
    return { notification: { ...notification, createdAt: "2026-10-08T00:00:00Z", readAt: null }, inserted };
  },
}));
mock.module("@/store/app-notification-builders", () => ({ showNotificationToast: showToast }));

const { createAppStoreNotificationRuntime } = await import("@/store/app-store-notification-runtime");

function notification(kind: AppNotificationCreateInput["kind"]): AppNotificationCreateInput {
  return {
    id: kind, kind, title: "Update", body: "Details",
    repositoryPath: null, repositoryName: null, workspaceId: null, workspaceName: null,
    taskId: null, taskTitle: null, turnId: null, providerId: null, action: null, payload: {},
  };
}

function runtime(settings: Partial<AppState["settings"]> = {}) {
  let state = {
    notifications: [],
    activeWorkspaceId: "ws-1",
    activeAppSurface: { kind: "workspace" },
    activeSurface: { kind: "task", taskId: "task-1" },
    settings: {
      nativeNotificationsEnabled: false,
      notificationSoundEnabled: true,
      notificationSoundVolume: 0.4,
      notificationSoundPreset: "bell",
      notificationSoundMode: "preset",
      notificationSoundCustomAudioData: null,
      ...settings,
    },
  } as unknown as AppState;
  return createAppStoreNotificationRuntime({
    get: () => state,
    set: ((patch: (value: AppState) => Partial<AppState>) => {
      state = { ...state, ...patch(state) };
    }) as StoreApi<AppState>["setState"],
  });
}

beforeEach(() => {
  playPreset.mockClear();
  playCustom.mockClear();
  showToast.mockClear();
  inserted = true;
  persistenceFails = false;
  globalThis.window = { api: {} } as unknown as Window & typeof globalThis;
});

afterAll(() => {
  globalThis.window = originalWindow;
  mock.restore();
});

describe("the shared notification sound", () => {
  test("completion, approvals, questions and run attention use the selected preset and volume", async () => {
    const subject = runtime();
    for (const kind of APP_NOTIFICATION_KINDS) {
      await subject.persistNotifications([notification(kind)]);
    }
    expect(playPreset).toHaveBeenCalledTimes(APP_NOTIFICATION_KINDS.length);
    for (const [options] of playPreset.mock.calls) {
      expect(options).toEqual({ preset: "bell", volume: 0.4 });
    }
    expect(playCustom).not.toHaveBeenCalled();
  });

  test("one off switch silences every notification kind but preserves the toast", async () => {
    const subject = runtime({ notificationSoundEnabled: false });
    for (const kind of APP_NOTIFICATION_KINDS) {
      await subject.persistNotifications([notification(kind)]);
    }
    expect(playPreset).not.toHaveBeenCalled();
    expect(playCustom).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(APP_NOTIFICATION_KINDS.length);
  });

  test("custom audio applies to both completion and attention", async () => {
    const subject = runtime({ notificationSoundMode: "custom", notificationSoundCustomAudioData: "data:audio/wav;base64,AA==" });
    await subject.persistNotifications([notification("task.turn_completed"), notification("task.user_input_requested")]);
    expect(playCustom).toHaveBeenCalledTimes(2);
    expect(playCustom).toHaveBeenCalledWith({ dataUrl: "data:audio/wav;base64,AA==", volume: 0.4 });
    expect(playPreset).not.toHaveBeenCalled();
  });

  test("missing custom audio falls back to the preset", async () => {
    await runtime({ notificationSoundMode: "custom" }).persistNotifications([notification("task.approval_requested")]);
    expect(playPreset).toHaveBeenCalledWith({ preset: "bell", volume: 0.4 });
    expect(playCustom).not.toHaveBeenCalled();
  });

  test("a repeated agent-run notification is not announced again", async () => {
    const subject = runtime();
    await subject.persistNotifications([notification("agent_run.blocked")]);
    inserted = false;
    await subject.persistNotifications([notification("agent_run.blocked")]);
    expect(playPreset).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  test("an unsuccessful persistence write stays quiet", async () => {
    persistenceFails = true;
    await runtime().persistNotifications([notification("task.turn_completed")]);
    expect(playPreset).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
