import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, type StaveApp } from "./harness/stave-app";

test("notifications keep deduplication and read state across a native restart", async () => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "stave-notification-profile-"));
  let stave: StaveApp | null = null;
  try {
    stave = await launchStave({ userDataDir });
    const first = await stave.page.evaluate(() =>
      window.api.persistence!.createNotification!({
        notification: {
          id: "native-notification",
          kind: "task.turn_completed",
          title: "Native persistence",
          body: "Stored in SQLite",
          projectPath: null,
          projectName: null,
          workspaceId: null,
          workspaceName: null,
          taskId: null,
          taskTitle: null,
          turnId: null,
          providerId: "codex",
          action: null,
          payload: { source: "electron-e2e" },
          dedupeKey: "native-notification-dedupe",
        },
      }),
    );
    expect(first).toMatchObject({
      ok: true,
      inserted: true,
      notification: { id: "native-notification", readAt: null },
    });
    await stave.close();
    stave = null;

    stave = await launchStave({ userDataDir });
    const persisted = await stave.page.evaluate(async () => {
      const listed = await window.api.persistence!.listNotifications!();
      const duplicate = await window.api.persistence!.createNotification!({
        notification: {
          id: "duplicate-native-notification",
          kind: "task.turn_completed",
          title: "Duplicate",
          body: "Should not be stored",
          projectPath: null,
          projectName: null,
          workspaceId: null,
          workspaceName: null,
          taskId: null,
          taskTitle: null,
          turnId: null,
          providerId: "codex",
          action: null,
          payload: {},
          dedupeKey: "native-notification-dedupe",
        },
      });
      const read = await window.api.persistence!.markNotificationRead!({
        id: "native-notification",
        readAt: "2026-09-25T00:00:00.000Z",
      });
      return { listed, duplicate, read };
    });
    expect(persisted.listed).toMatchObject({
      ok: true,
      notifications: [{ id: "native-notification", readAt: null }],
    });
    expect(persisted.duplicate).toMatchObject({
      ok: true,
      inserted: false,
      notification: { id: "native-notification" },
    });
    expect(persisted.read).toMatchObject({
      ok: true,
      notification: {
        id: "native-notification",
        readAt: "2026-09-25T00:00:00.000Z",
      },
    });
    await stave.close();
    stave = null;

    stave = await launchStave({ userDataDir });
    const afterRestart = await stave.page.evaluate(() =>
      window.api.persistence!.listNotifications!({ unreadOnly: true }),
    );
    expect(afterRestart).toEqual({ ok: true, notifications: [] });
    const cleared = await stave.page.evaluate(() =>
      window.api.persistence!.clearNotificationHistory!(),
    );
    expect(cleared).toEqual({ ok: true, count: 1 });
  } finally {
    await stave?.close();
    await rm(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
});
