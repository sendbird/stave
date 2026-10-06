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
          repositoryPath: null,
          repositoryName: null,
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
    // A read notification expires a while after `readAt`, and startup prunes
    // expired rows; a fixed past date would let that prune race the restart.
    const readAt = new Date().toISOString();
    const persisted = await stave.page.evaluate(async (readAt) => {
      const listed = await window.api.persistence!.listNotifications!();
      const duplicate = await window.api.persistence!.createNotification!({
        notification: {
          id: "duplicate-native-notification",
          kind: "task.turn_completed",
          title: "Duplicate",
          body: "Should not be stored",
          repositoryPath: null,
          repositoryName: null,
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
        readAt,
      });
      return { listed, duplicate, read };
    }, readAt);
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
        readAt,
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
