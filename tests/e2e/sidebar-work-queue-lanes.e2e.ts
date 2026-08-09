import { expect, test } from "@playwright/test";

/**
 * Browser-visible confirmation of the two sidebar views: the sidebar opens on
 * the Projects tree, the header toggle swaps it for the Work queue, and the
 * queue groups workspaces by what they need — a pending approval under "Action
 * required" above an untouched workspace under "Idle".
 */
test("the sidebar header toggle swaps the Projects tree for lane-grouped Work queue", async ({
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

  // The sidebar opens on Projects, and the two views are exclusive: while the
  // tree is showing there is no lane header anywhere in the sidebar.
  await expect(
    sidebar.getByLabel("toggle-project-/tmp/stave-work-queue-lanes"),
  ).toBeVisible();
  await expect(sidebar.getByText("Action required", { exact: true })).toHaveCount(
    0,
  );

  await sidebar.getByLabel("sidebar-view-work-queue", { exact: true }).click();

  // ...and the swap is total: the tree's project rows are gone, not pushed down.
  await expect(
    sidebar.getByLabel("toggle-project-/tmp/stave-work-queue-lanes"),
  ).toHaveCount(0);

  const actionRequiredHeader = sidebar.getByText("Action required", {
    exact: true,
  });
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

  // Collapsing a lane hides its rows but keeps the header, so a long Idle lane
  // can be folded away without losing the count that says how much is there.
  await sidebar.getByLabel("work-queue-lane-idle", { exact: true }).click();
  await expect(idleRow).toHaveCount(0);
  await expect(idleHeader).toBeVisible();
  await expect(blockedRow).toBeVisible();

  // Back to the tree: every workspace the queue listed is reachable again.
  await sidebar.getByLabel("sidebar-view-projects", { exact: true }).click();
  await expect(
    sidebar.getByLabel("toggle-project-/tmp/stave-work-queue-lanes"),
  ).toBeVisible();
  await expect(sidebar.getByText("Action required", { exact: true })).toHaveCount(
    0,
  );
});
