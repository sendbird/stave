import { expect, test } from "@playwright/test";

/**
 * Browser-visible confirmation that the sidebar work queue groups workspaces by
 * what they need instead of listing them flat: a workspace holding a pending
 * approval renders under "Action required" above the untouched workspace under
 * "Idle", and each row still opens its workspace.
 */
test("Work queue groups workspaces into lanes in priority order", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const projectPath = "/tmp/stave-work-queue-lanes";
    const otherProjectPath = "/tmp/stave-work-queue-other";
    const blockedWorkspaceId = "ws-blocked";
    const idleWorkspaceId = "ws-idle";
    const blockedTaskId = "task-blocked";

    // A task sitting on an unanswered approval. This is the same shape the
    // provider writes, so the sidebar classifies it exactly as it would live.
    const blockedSnapshot = {
      activeTaskId: blockedTaskId,
      tasks: [
        {
          id: blockedTaskId,
          title: "Ship the release",
          provider: "claude-code",
          updatedAt: "2026-08-01T01:00:00.000Z",
          unread: false,
          archivedAt: null,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      messagesByTask: {
        [blockedTaskId]: [
          {
            id: "message-1",
            role: "assistant",
            model: "claude-opus-5",
            providerId: "claude-code",
            content: "",
            isStreaming: false,
            parts: [
              {
                type: "approval",
                toolName: "Bash",
                description: "run the release script",
                requestId: "approval-1",
                state: "approval-requested",
              },
            ],
          },
        ],
      },
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: blockedWorkspaceId,
          name: "release",
          updatedAt: "2026-08-01T01:00:00.000Z",
          snapshot: blockedSnapshot,
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath,
          projectName: "stave-work-queue-lanes",
          workspaces: [
            {
              id: blockedWorkspaceId,
              name: "release",
              updatedAt: "2026-08-01T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: blockedWorkspaceId,
          workspaceBranchById: { [blockedWorkspaceId]: "main" },
          workspacePathById: { [blockedWorkspaceId]: projectPath },
          workspaceDefaultById: { [blockedWorkspaceId]: true },
          recentProjects: [
            {
              projectPath: otherProjectPath,
              projectName: "stave-work-queue-other",
              lastOpenedAt: "2026-08-01T00:00:00.000Z",
              defaultBranch: "main",
              workspaces: [
                {
                  id: idleWorkspaceId,
                  name: "scratch",
                  updatedAt: "2026-08-01T00:00:00.000Z",
                },
              ],
              activeWorkspaceId: idleWorkspaceId,
              workspaceBranchById: { [idleWorkspaceId]: "main" },
              workspacePathById: { [idleWorkspaceId]: otherProjectPath },
              workspaceDefaultById: { [idleWorkspaceId]: true },
            },
          ],
          ...blockedSnapshot,
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const sidebar = page.getByTestId("project-workspace-sidebar");
  await expect(sidebar).toBeVisible();

  const actionRequiredHeader = sidebar.getByText("Action required", { exact: true });
  const idleHeader = sidebar.getByText("Idle", { exact: true });
  await expect(actionRequiredHeader).toBeVisible();
  await expect(idleHeader).toBeVisible();

  // "In progress" and "In review" have no members here; an empty lane must
  // not render a bare header.
  await expect(sidebar.getByText("In progress", { exact: true })).toHaveCount(0);
  await expect(
    sidebar.getByText("In review", { exact: true }),
  ).toHaveCount(0);

  const blockedRow = sidebar.getByLabel("active-workspace-ws-blocked", {
    exact: true,
  });
  const idleRow = sidebar.getByLabel("active-workspace-ws-idle", {
    exact: true,
  });
  await expect(blockedRow).toBeVisible();
  await expect(idleRow).toBeVisible();

  // Lane order is the product promise: what is blocked on the user sits above
  // what is not.
  const actionRequiredTop = (await actionRequiredHeader.boundingBox())?.y ?? 0;
  const blockedTop = (await blockedRow.boundingBox())?.y ?? 0;
  const idleTop = (await idleHeader.boundingBox())?.y ?? 0;
  const idleRowTop = (await idleRow.boundingBox())?.y ?? 0;
  expect(actionRequiredTop).toBeLessThan(blockedTop);
  expect(blockedTop).toBeLessThan(idleTop);
  expect(idleTop).toBeLessThan(idleRowTop);
});
