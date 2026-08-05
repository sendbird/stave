import { expect, test } from "@playwright/test";

/**
 * Browser-visible confirmation for removing rows from the sidebar
 * "Active workspaces" list: the hover `×` hides a row the user considers
 * unimportant, the removal survives a reload, the current workspace never
 * offers removal, and Settings can restore every hidden row.
 */
test("Active workspaces rows can be dismissed, persist, and be restored", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Reloads re-run this script; keep the persisted store so the dismissal
    // written by the app is what the second load rehydrates from.
    if (window.localStorage.getItem("stave-store")) {
      return;
    }
    const projectPath = "/tmp/stave-active-dismiss";
    const otherProjectPath = "/tmp/stave-active-other";
    const currentWorkspaceId = "ws-current";
    const otherWorkspaceId = "ws-other";
    const emptySnapshot = {
      activeTaskId: "",
      tasks: [],
      messagesByTask: {},
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: currentWorkspaceId,
          name: "current",
          updatedAt: "2026-08-01T01:00:00.000Z",
          snapshot: emptySnapshot,
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath,
          projectName: "stave-active-dismiss",
          workspaces: [
            {
              id: currentWorkspaceId,
              name: "current",
              updatedAt: "2026-08-01T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: currentWorkspaceId,
          workspaceBranchById: { [currentWorkspaceId]: "main" },
          workspacePathById: { [currentWorkspaceId]: projectPath },
          workspaceDefaultById: { [currentWorkspaceId]: true },
          recentProjects: [
            {
              projectPath: otherProjectPath,
              projectName: "stave-active-other",
              lastOpenedAt: "2026-08-01T00:00:00.000Z",
              defaultBranch: "main",
              workspaces: [
                {
                  id: otherWorkspaceId,
                  name: "other",
                  updatedAt: "2026-08-01T00:00:00.000Z",
                },
              ],
              activeWorkspaceId: otherWorkspaceId,
              workspaceBranchById: { [otherWorkspaceId]: "main" },
              workspacePathById: { [otherWorkspaceId]: otherProjectPath },
              workspaceDefaultById: { [otherWorkspaceId]: true },
            },
          ],
          ...emptySnapshot,
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const sidebar = page.getByTestId("project-workspace-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText("Active workspaces")).toBeVisible();

  const currentRow = sidebar.getByLabel("active-workspace-ws-current", { exact: true });
  const otherRow = sidebar.getByLabel("active-workspace-ws-other", { exact: true });
  await expect(currentRow).toBeVisible();
  await expect(otherRow).toBeVisible();

  // The workspace the user is standing in is the "you are here" marker and
  // never offers removal.
  await expect(
    sidebar.getByLabel("dismiss-active-workspace-ws-current"),
  ).toHaveCount(0);

  // Hover reveals the × on other rows; clicking it removes the row.
  await otherRow.hover();
  const dismissButton = sidebar.getByLabel("dismiss-active-workspace-ws-other");
  await expect(dismissButton).toBeVisible();
  await dismissButton.click();
  await expect(otherRow).toHaveCount(0);
  await expect(currentRow).toBeVisible();

  // The removal is persisted state, not view state: it survives a reload.
  await page.reload();
  await expect(sidebar.getByLabel("active-workspace-ws-current", { exact: true })).toBeVisible();
  await expect(sidebar.getByLabel("active-workspace-ws-other", { exact: true })).toHaveCount(0);

  // Settings offers a recovery hatch that restores every hidden row.
  await page.getByRole("button", { name: "open-settings" }).click();
  await page.getByRole("button", { name: "Design" }).click();
  const restoreButton = page.getByRole("button", {
    name: "Restore 1 hidden workspace",
  });
  await expect(restoreButton).toBeVisible();
  await restoreButton.click();
  await expect(restoreButton).toHaveCount(0);
  await page.getByRole("button", { name: "back-to-app" }).click();

  await expect(sidebar.getByLabel("active-workspace-ws-other", { exact: true })).toBeVisible();
});
