import { expect, test } from "@playwright/test";

/**
 * The expanded sidebar chrome row must share a baseline with the top bar so
 * their bottom hairlines read as one continuous window-chrome line.
 */
test("expanded sidebar chrome hairline continues the top bar", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const workspaceId = "workspace-1";
    const workspace = {
      id: workspaceId,
      name: "main",
      updatedAt: "2026-07-31T00:00:00.000Z",
    };
    const workspaceSnapshot = {
      activeTaskId: "",
      openTaskTabIds: [],
      tasks: [],
      messagesByTask: {},
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([{ ...workspace, snapshot: workspaceSnapshot }]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          defaultBranch: "main",
          workspaces: [workspace],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: { [workspaceId]: "main" },
          workspacePathById: { [workspaceId]: "/tmp/stave-project" },
          workspaceDefaultById: { [workspaceId]: true },
          settings: { autoRoutingEnabled: true },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const sidebar = page.getByTestId("project-workspace-sidebar");
  const chrome = page.getByTestId("project-workspace-sidebar-chrome");
  const topBar = page.getByTestId("top-bar");

  await expect(sidebar).toBeVisible();
  await expect(chrome).toBeVisible();
  await expect(topBar).toBeVisible();
  await expect(
    chrome.getByLabel("collapse-project-list", { exact: true }),
  ).toBeVisible();

  const alignment = await page.evaluate(() => {
    const chromeRect = document
      .querySelector<HTMLElement>(
        "[data-testid='project-workspace-sidebar-chrome']",
      )
      ?.getBoundingClientRect();
    const topBarRect = document
      .querySelector<HTMLElement>("[data-testid='top-bar']")
      ?.getBoundingClientRect();
    if (!chromeRect || !topBarRect) {
      return null;
    }
    return {
      chromeHeight: chromeRect.height,
      topBarHeight: topBarRect.height,
      chromeBottom: chromeRect.bottom,
      topBarBottom: topBarRect.bottom,
    };
  });

  expect(alignment).not.toBeNull();
  expect(alignment?.chromeHeight).toBe(alignment?.topBarHeight);
  expect(alignment?.chromeBottom).toBe(alignment?.topBarBottom);
});
