import { expect, test } from "@playwright/test";

test("notification history cleanup confirms and removes unresolved attention", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const workspaceId = "ws-notification-history";
    const taskId = "task-notification-history";
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: workspaceId,
          name: "notification-history",
          updatedAt: "2026-07-25T09:00:00.000Z",
          snapshot: {
            activeTaskId: taskId,
            tasks: [
              {
                id: taskId,
                title: "Notification cleanup",
                provider: "codex",
                updatedAt: "2026-07-25T09:00:00.000Z",
                unread: false,
                archivedAt: null,
              },
            ],
            messagesByTask: { [taskId]: [] },
            activeSurface: { kind: "task", taskId },
          },
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-notification-history",
          projectName: "stave-notification-history",
          workspaces: [
            {
              id: workspaceId,
              name: "notification-history",
              updatedAt: "2026-07-25T09:00:00.000Z",
            },
          ],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: { [workspaceId]: "main" },
          workspacePathById: {
            [workspaceId]: "/tmp/stave-notification-history",
          },
          workspaceDefaultById: { [workspaceId]: true },
        },
        version: 0,
      }),
    );
    const notificationRows = [
      {
        id: "notification-complete",
        kind: "task.turn_completed",
        title: "Finished run",
        body: "The run completed.",
        projectPath: "/tmp/stave-notification-history",
        projectName: "stave-notification-history",
        workspaceId,
        workspaceName: "notification-history",
        taskId,
        taskTitle: "Finished run",
        turnId: "turn-complete",
        providerId: "codex",
        action: null,
        payload: {},
        createdAt: "2026-07-25T09:01:00.000Z",
        readAt: "2026-07-25T09:02:00.000Z",
        resolvedAt: null,
        expiresAt: "2026-08-01T09:02:00.000Z",
      },
      {
        id: "notification-approval",
        kind: "task.approval_requested",
        title: "Approval required",
        body: "Allow the pending command.",
        projectPath: "/tmp/stave-notification-history",
        projectName: "stave-notification-history",
        workspaceId,
        workspaceName: "notification-history",
        taskId,
        taskTitle: "Approval required",
        turnId: "turn-approval",
        providerId: "codex",
        action: {
          type: "approval",
          requestId: "approval-1",
          messageId: "message-1",
        },
        payload: {},
        createdAt: "2026-07-25T09:03:00.000Z",
        readAt: "2026-07-25T09:04:00.000Z",
        resolvedAt: null,
        expiresAt: null,
      },
    ];
    window.localStorage.setItem(
      "stave:notifications-fallback:v1",
      JSON.stringify(notificationRows),
    );

    const unsubscribe = () => {};
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
      },
      terminal: {
        runCommand: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
      },
      sourceControl: {
        getStatus: async () => ({
          ok: true,
          branch: "main",
          items: [],
          hasConflicts: false,
          stderr: "",
        }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
      persistence: {
        listNotifications: async () => ({
          ok: true,
          notifications: [...notificationRows],
        }),
        createNotification: async () => ({
          ok: false,
          inserted: false,
          notification: null,
        }),
        markNotificationRead: async () => ({
          ok: false,
          notification: null,
        }),
        markAllNotificationsRead: async () => ({ ok: true, count: 0 }),
        pruneNotifications: async () => ({ ok: true, count: 0 }),
        clearNotificationHistory: async () => {
          const before = notificationRows.length;
          for (
            let index = notificationRows.length - 1;
            index >= 0;
            index -= 1
          ) {
            const row = notificationRows[index];
            if (row.readAt || row.resolvedAt) {
              notificationRows.splice(index, 1);
            }
          }
          return { ok: true, count: before - notificationRows.length };
        },
      },
      window: {
        subscribeZoomChanges: () => unsubscribe,
      },
    };
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await page.getByRole("button", { name: "notifications" }).click();
  await page.getByRole("button", { name: /History/ }).click();
  await expect(page.getByText("Finished run", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Approval required", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Clear history" }).click();
  const cleanupDialog = page.getByRole("dialog", {
    name: "Clear notification history?",
  });
  await expect(cleanupDialog).toBeVisible();
  await expect(
    cleanupDialog.getByText("Clear notification history?", { exact: true }),
  ).toBeVisible();
  await expect(
    cleanupDialog.getByText(/including approval and input requests/),
  ).toBeVisible();

  const promptInput = page.locator("[data-prompt-input-root]");
  await expect(promptInput).toBeVisible();
  const promptInputBox = await promptInput.boundingBox();
  expect(promptInputBox).not.toBeNull();
  const overlayCoversPromptInput = await cleanupDialog
    .locator("..")
    .evaluate(
      (overlay, point) =>
        overlay.contains(document.elementFromPoint(point.x, point.y)),
      {
        x: promptInputBox!.x + promptInputBox!.width / 2,
        y: promptInputBox!.y + promptInputBox!.height / 2,
      },
    );
  expect(overlayCoversPromptInput).toBe(true);

  await cleanupDialog.getByRole("button", { name: "Clear history" }).click();

  await page.getByRole("button", { name: "notifications" }).click();
  await page.getByRole("button", { name: /History/ }).click();
  await expect(page.getByText("Finished run", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Approval required", { exact: true }),
  ).toHaveCount(0);
});
