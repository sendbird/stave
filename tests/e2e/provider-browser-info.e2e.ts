import { expect, test } from "@playwright/test";

const connectedBrowserTab = {
  providerId: "codex",
  status: "connected",
  requestedAt: "2026-08-11T05:00:00.000Z",
  lastUpdatedAt: "2026-08-11T05:00:01.000Z",
};

test("shows provider-native browser connection metadata in Information", async ({
  page,
}) => {
  await page.addInitScript((browserTab) => {
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [] },
      terminal: {
        runCommand: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
      },
    };
    const task = {
      id: "task-1",
      title: "Provider browser task",
      provider: "codex",
      updatedAt: "2026-08-11T05:00:01.000Z",
      unread: false,
      archivedAt: null,
    };
    const workspaceInformation = { connectedBrowserTab: browserTab };
    const snapshot = {
      activeTaskId: "task-1",
      openTaskTabIds: ["task-1"],
      activeSurface: { kind: "task", taskId: "task-1" },
      tasks: [task],
      messagesByTask: { "task-1": [] },
      workspaceInformation,
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-08-11T05:00:01.000Z",
          snapshot,
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaces: [
            {
              id: "ws-main",
              name: "main",
              updatedAt: "2026-08-11T05:00:01.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          ...snapshot,
        },
        version: 0,
      }),
    );
  }, connectedBrowserTab);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page
    .getByTestId("workspace-bar")
    .getByRole("button", { name: "Information" })
    .click();

  const card = page.getByLabel("Connected browser tab");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Codex");
  await expect(card).toContainText("Connected");
  await expect(card).toContainText("native browser tools");
  await expect(card).not.toContainText("http");
});
