import { expect, test } from "@playwright/test";

test("Fleet keeps durable needs actionable across cold workspace state", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const projectPath = "/tmp/stave-fleet-needs";
    const workspaceId = "ws-fleet-needs";
    const taskId = "task-fleet-needs";
    const workspaceSnapshot = {
      activeTaskId: taskId,
      openTaskTabIds: [taskId],
      activeSurface: { kind: "task", taskId },
      tasks: [
        {
          id: taskId,
          title: "Fleet fixture",
          provider: "codex",
          updatedAt: "2026-07-26T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { [taskId]: [] },
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: workspaceId,
          name: "fleet-needs",
          updatedAt: "2026-07-26T01:00:00.000Z",
          snapshot: workspaceSnapshot,
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath,
          projectName: "stave-fleet-needs",
          workspaces: [
            {
              id: workspaceId,
              name: "fleet-needs",
              updatedAt: "2026-07-26T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: { [workspaceId]: "main" },
          workspacePathById: { [workspaceId]: projectPath },
          workspaceDefaultById: { [workspaceId]: true },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );
    window.localStorage.setItem(
      "stave:notifications-fallback:v1",
      JSON.stringify([
        {
          id: "notification-result",
          kind: "task.turn_completed",
          title: "Review summary",
          body: "The provider turn completed.",
          projectPath,
          projectName: "stave-fleet-needs",
          workspaceId,
          workspaceName: "fleet-needs",
          taskId,
          taskTitle: "Review summary",
          turnId: "turn-result",
          providerId: "codex",
          action: null,
          payload: {},
          createdAt: "2026-07-26T01:05:00.000Z",
          readAt: null,
          resolvedAt: null,
          expiresAt: null,
        },
        {
          id: "notification-approval",
          kind: "task.approval_requested",
          title: "Approve deployment",
          body: "Allow the deployment command.",
          projectPath,
          projectName: "stave-fleet-needs",
          workspaceId,
          workspaceName: "fleet-needs",
          taskId,
          taskTitle: "Approve deployment",
          turnId: "turn-approval",
          providerId: "codex",
          action: {
            type: "approval",
            requestId: "approval-deploy",
            messageId: "message-approval",
          },
          payload: {},
          createdAt: "2026-07-26T01:10:00.000Z",
          readAt: "2026-07-26T01:11:00.000Z",
          resolvedAt: null,
          expiresAt: null,
        },
      ]),
    );

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
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page
    .getByTestId("top-bar")
    .getByRole("button", { name: "open-fleet-view" })
    .click();

  const needs = page.getByRole("region", { name: "Needs me" });
  await expect(needs).toContainText("2 actionable items");
  const items = needs.getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Approve deployment");
  await expect(items.nth(1)).toContainText("Review summary");
  await expect(
    items.nth(0).getByRole("button", { name: "Dismiss" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("fleet-needs-me.png"),
    fullPage: true,
  });

  await items.nth(1).getByRole("button", { name: "Mark reviewed" }).click();
  await expect(needs).toContainText("1 actionable item");
  await expect(needs).toContainText("Approve deployment");
  await expect(needs).not.toContainText("Review summary");
});
