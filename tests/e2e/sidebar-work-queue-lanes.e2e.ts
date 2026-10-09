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
    const repositoryPath = "/tmp/stave-work-queue-lanes";
    const otherRepositoryPath = "/tmp/stave-work-queue-other";
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
          repositoryPath,
          repositoryName: "stave-work-queue-lanes",
          workspaces: [
            {
              id: blockedWorkspaceId,
              name: "release",
              updatedAt: "2026-08-01T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: blockedWorkspaceId,
          workspaceBranchById: { [blockedWorkspaceId]: "main" },
          workspacePathById: { [blockedWorkspaceId]: repositoryPath },
          workspaceDefaultById: { [blockedWorkspaceId]: true },
          recentRepositories: [
            {
              repositoryPath: otherRepositoryPath,
              repositoryName: "stave-work-queue-other",
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
              workspacePathById: { [idleWorkspaceId]: otherRepositoryPath },
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
    sidebar.getByTestId("toggle-project-/tmp/stave-work-queue-lanes"),
  ).toBeVisible();
  await expect(sidebar.getByText("Action required", { exact: true })).toHaveCount(
    0,
  );

  await sidebar.getByTestId("sidebar-view-work-queue").click();

  // ...and the swap is total: the tree's project rows are gone, not pushed down.
  await expect(
    sidebar.getByTestId("toggle-project-/tmp/stave-work-queue-lanes"),
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

  const blockedRow = sidebar.getByTestId("active-workspace-ws-blocked");
  const idleRow = sidebar.getByTestId("active-workspace-ws-idle");
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
  await sidebar.getByTestId("work-queue-lane-idle").click();
  await expect(idleRow).toHaveCount(0);
  await expect(idleHeader).toBeVisible();
  await expect(blockedRow).toBeVisible();

  // Back to the tree: every workspace the queue listed is reachable again.
  await sidebar.getByTestId("sidebar-view-projects").click();
  await expect(
    sidebar.getByTestId("toggle-project-/tmp/stave-work-queue-lanes"),
  ).toBeVisible();
  await expect(sidebar.getByText("Action required", { exact: true })).toHaveCount(
    0,
  );
});

/**
 * Settling moves a workspace onto the Settled shelf without touching it, and
 * every way out is one step: bring it back from the shelf, or undo a settle.
 */
test("a settled workspace waits on the Settled shelf until it is brought back", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/stave-work-queue-settle";
    const workspaceId = "ws-settle";
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-work-queue-settle",
          workspaces: [{ id: workspaceId, name: "scratch", updatedAt: "2026-08-01T00:00:00.000Z" }],
          activeWorkspaceId: "",
          workspaceBranchById: { [workspaceId]: "main" },
          workspacePathById: { [workspaceId]: repositoryPath },
          workspaceDefaultById: { [workspaceId]: true },
          workspaceSettlementById: {
            [workspaceId]: { settledAt: "2026-08-01T02:00:00.000Z", settledReason: "manual" },
          },
          recentRepositories: [],
          settings: { sidebarNavView: "work-queue" },
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const sidebar = page.getByTestId("project-workspace-sidebar");
  await expect(sidebar).toBeVisible();
  const row = sidebar.getByTestId("active-workspace-ws-settle");

  // The shelf starts folded, and the workspace is in no lane.
  const settledLane = sidebar.getByTestId("work-queue-lane-settled");
  await expect(settledLane).toBeVisible();
  await expect(settledLane).toHaveAttribute("aria-expanded", "false");
  await expect(sidebar.getByText("Idle", { exact: true })).toHaveCount(0);
  await expect(row).toHaveCount(0);

  await settledLane.click();
  await expect(row).toBeVisible();

  // Bring it back: it returns to its lane and the empty shelf disappears.
  await row.hover();
  await sidebar.getByTestId("work-queue-actions-ws-settle").click();
  await page.getByRole("menuitem", { name: "Bring back to the queue" }).click();
  await expect(sidebar.getByText("Idle", { exact: true })).toBeVisible();
  await expect(settledLane).toHaveCount(0);
  await expect(row).toBeVisible();

  // Settle it by hand, then undo from the toast.
  await row.hover();
  await sidebar.getByTestId("work-queue-actions-ws-settle").click();
  await page.getByRole("menuitem", { name: "Settle", exact: true }).click();
  await expect(sidebar.getByTestId("work-queue-lane-settled")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(sidebar.getByText("Idle", { exact: true })).toBeVisible();
  await expect(row).toBeVisible();
});
