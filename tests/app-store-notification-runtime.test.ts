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

function runtime(settings: Partial<AppState["settings"]> = {}, extra: Partial<AppState> = {}) {
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
    ...extra,
  } as unknown as AppState;
  const subject = createAppStoreNotificationRuntime({
    get: () => state,
    set: ((patch: (value: AppState) => Partial<AppState>) => {
      state = { ...state, ...patch(state) };
    }) as StoreApi<AppState>["setState"],
  });
  return { ...subject, readState: () => state };
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

  test("a repeated Tars notification stays quiet across hydration and refresh", async () => {
    const subject = runtime();
    await subject.persistNotifications([notification("tars.decision_requested")]);
    inserted = false;
    await subject.persistNotifications([notification("tars.decision_requested")]);
    expect(playPreset).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  test.each(APP_NOTIFICATION_KINDS)("restores a dedupe hit for %s without announcing it", async (kind) => {
    const showNative = mock(async () => ({ ok: true }));
    globalThis.window = { api: { notifications: { showNative } } } as unknown as Window & typeof globalThis;
    // A fresh renderer has not hydrated the row already stored before restart.
    const subject = runtime({ nativeNotificationsEnabled: true });
    inserted = false;
    await subject.persistNotifications([{ ...notification(kind), dedupeKey: kind }]);

    expect(subject.readState().notifications.map((item) => item.id)).toEqual([kind]);
    expect([playPreset.mock.calls.length, showNative.mock.calls.length, showToast.mock.calls.length]).toEqual([0, 0, 0]);
  });

  test("an unsuccessful persistence write stays quiet", async () => {
    persistenceFails = true;
    await runtime().persistNotifications([notification("task.turn_completed")]);
    expect(playPreset).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe("OS notifications", () => {
  const originalDocument = globalThis.document;
  afterAll(() => {
    globalThis.document = originalDocument;
  });

  async function nativeCall(focused: boolean, workspaceId: string | null, kind: AppNotificationCreateInput["kind"] = "task.approval_requested") {
    const calls: Array<{ notificationId: string; suppress?: boolean }> = [];
    globalThis.window = { api: { notifications: {
      showNative: async (args: { notificationId: string; suppress?: boolean }) => { calls.push(args); return { ok: true }; },
    } } } as unknown as Window & typeof globalThis;
    globalThis.document = { hasFocus: () => focused } as unknown as Document;
    await runtime({ nativeNotificationsEnabled: true }).persistNotifications([
      { ...notification(kind), workspaceId },
    ]);
    return calls;
  }

  test("are sent only while the Stave window is not focused, for any workspace", async () => {
    // Focused, even on another workspace: the toast and the bell already say it.
    expect((await nativeCall(true, "ws-elsewhere"))[0]?.suppress).toBe(true);
    expect((await nativeCall(true, "ws-1"))[0]?.suppress).toBe(true);
    // Away from the window: the OS says it, even for the open workspace.
    expect((await nativeCall(false, "ws-1"))[0]?.suppress).toBe(false);
    expect((await nativeCall(false, null))[0]?.suppress).toBe(false);
  });

  test("the sound and the toast do not depend on focus", async () => {
    await nativeCall(true, "ws-elsewhere");
    expect(playPreset).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalled();
  });

  test("Tars follows the same window focus policy and desktop toggle", async () => {
    expect((await nativeCall(true, "ws-1", "tars.decision_requested"))[0]?.suppress).toBe(true);
    expect((await nativeCall(false, "ws-1", "tars.result_ready"))[0]?.suppress).toBe(false);
    const native = mock(async () => ({ ok: true }));
    globalThis.window = { api: { notifications: { showNative: native } } } as unknown as Window & typeof globalThis;
    await runtime({ nativeNotificationsEnabled: false }).persistNotifications([notification("tars.blocked")]);
    expect(native).not.toHaveBeenCalled();
  });
});


test("native resolved events update the pending card without delivering a second response", () => {
  let receive: ((payload: unknown) => void) | undefined;
  let deliveries = 0;
  globalThis.window = { api: { notifications: { subscribeNativeResolved: (listener: (payload: unknown) => void) => { receive = listener; return () => {}; } },
    provider: { respondApproval: async () => { deliveries++; return { ok: true }; } },
  } } as unknown as Window & typeof globalThis;
  const subject = runtime({}, { messagesByTask: { task: [{ id: "message", role: "assistant", content: "", parts: [
    { type: "approval", requestId: "request", state: "approval-requested", toolName: "tool", input: "", description: "Check" },
  ] }] }, workspaceSnapshotVersion: 0, workspaceRuntimeCacheById: {} } as unknown as Partial<AppState>);
  const payload = { workspaceId: "ws-1", taskId: "task", turnId: "turn", requestId: "request", messageId: "message", response: { type: "approval", approved: true } };
  receive?.({ ...payload, scope: "always" });
  expect(subject.readState().messagesByTask.task![0]!.parts[0]).toMatchObject({ state: "approval-requested" });
  receive?.(payload);
  expect(subject.readState().messagesByTask.task![0]!.parts[0]).toMatchObject({ state: "approval-responded", resolution: { scope: "once", source: "user" } });
  receive?.({ ...payload, response: { type: "approval", approved: false } });
  expect(subject.readState().messagesByTask.task![0]!.parts[0]).toMatchObject({ resolution: { decision: "allowed" } });
  expect(deliveries).toBe(0);
});

test("a notification answer clears Needs you and restarts the stall timer, like an in-app answer", async () => {
  let receive: ((payload: unknown) => void) | undefined;
  globalThis.window = { api: { notifications: { subscribeNativeResolved: (listener: (payload: unknown) => void) => { receive = listener; return () => {}; } } } } as unknown as Window & typeof globalThis;
  const stallTimers: unknown[] = [];
  const { createAppStoreNotificationRuntime: create } = await import("@/store/app-store-notification-runtime");
  const { createWorkGraph } = await import("@/lib/work-graph/work-graph-reducer");
  let state = {
    notifications: [], activeWorkspaceId: "ws-1", settings: { nativeNotificationsEnabled: false },
    workspaceSnapshotVersion: 0, workspaceRuntimeCacheById: {},
    messagesByTask: { task: [{ id: "message", role: "assistant", turnId: "turn", content: "", parts: [
      { type: "user_input", requestId: "question", state: "input-requested", toolName: "ask", questions: [{ key: "scope", question: "Which?", header: "Scope", options: [] }] },
    ] }] },
    providerTurnActivityByTask: { task: { turnId: "turn", lastEventAt: 1, stalledAt: 5, pendingInteraction: "user_input", workGraph: createWorkGraph({ turnId: "turn", providerId: "codex", startedAt: 1 }) } },
  } as unknown as AppState;
  create({
    get: () => state,
    set: ((patch: (value: AppState) => Partial<AppState>) => { state = { ...state, ...patch(state) }; }) as StoreApi<AppState>["setState"],
    scheduleProviderTurnStallTimer: (args: unknown) => { stallTimers.push(args); },
  } as never);
  receive?.({ workspaceId: "ws-1", taskId: "task", turnId: "turn", requestId: "question", messageId: "message", response: { type: "answer", answers: { scope: "all" } } });
  expect(state.messagesByTask.task![0]!.parts[0]).toMatchObject({ state: "input-responded" });
  expect(state.providerTurnActivityByTask.task).toMatchObject({ pendingInteraction: null, stalledAt: null });
  expect(stallTimers).toEqual([expect.objectContaining({ taskId: "task", turnId: "turn" })]);
});

test("Tars-managed updates persist in history without toast, sound or native delivery", async () => {
  const showNative = mock(() => Promise.resolve({ ok: true }));
  globalThis.window = { api: { notifications: { showNative } } } as unknown as Window & typeof globalThis;
  const subject = runtime({ nativeNotificationsEnabled: true });
  await subject.persistNotifications([{ ...notification("task.turn_completed"), readAt: "2026-11-18T00:00:00Z", payload: { tarsManaged: true, responsibilityId: "work" } }]);
  expect(subject.readState().notifications).toHaveLength(1);
  expect(playPreset).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
  expect(showNative).not.toHaveBeenCalled();
});
