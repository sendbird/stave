import { expect, test } from "@playwright/test";

test("shows the pane watermark when project is not selected", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByTestId("workspace-pane-host")).toBeVisible();
  await expect(page.getByTestId("pane-watermark")).toBeVisible();
  await expect(page.getByText("Pick a Workspace")).toBeVisible();
  await expect(page.locator("[data-pane-tab-chip]")).toHaveCount(0);
});

test.fixme("shows the pick-a-workspace watermark when project exists without selected workspace", async ({
  page,
}) => {
  await page.addInitScript(() => {
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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "missing-workspace-id",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByTestId("pane-watermark")).toBeVisible();
  await expect(page.getByText("Pick a Workspace")).toBeVisible();
});

test("settings models persist after reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "open-settings" }).click();
  await page.getByRole("button", { name: "Models" }).click();

  const claudeInput = page.locator('input[list="claude-model-options"]');
  await claudeInput.fill("claude-opus-4-6");
  await page.getByRole("button", { name: "close-settings" }).click();

  await page.reload();
  await page.getByRole("button", { name: "open-settings" }).click();
  await page.getByRole("button", { name: "Models" }).click();
  await expect(page.locator('input[list="claude-model-options"]')).toHaveValue(
    "claude-opus-4-6",
  );
});

test("new task button creates a visible task item", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: {
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
          },
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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const taskChips = page.locator('[data-pane-tab-chip^="task:"]');
  await expect(taskChips).toHaveCount(0);
  await page
    .getByTestId("pane-watermark")
    .getByRole("button", { name: "New Task" })
    .click();
  await expect(taskChips).toHaveCount(1);
});

test("prompt input is focused after creating a task", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: {
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
          },
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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page
    .getByTestId("pane-watermark")
    .getByRole("button", { name: "New Task" })
    .click();

  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeFocused();
});

test("empty task keeps starting options next to the prompt input", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: {
            activeTaskId: "task-1",
            openTaskTabIds: ["task-1"],
            activeSurface: { kind: "task", taskId: "task-1" },
            tasks: [
              {
                id: "task-1",
                title: "New Task",
                provider: "claude-code",
                updatedAt: "2026-03-06T01:00:00.000Z",
                unread: false,
                archivedAt: null,
              },
            ],
            messagesByTask: {
              "task-1": [],
            },
          },
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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          activeTaskId: "task-1",
          openTaskTabIds: ["task-1"],
          activeSurface: { kind: "task", taskId: "task-1" },
          tasks: [
            {
              id: "task-1",
              title: "New Task",
              provider: "claude-code",
              updatedAt: "2026-03-06T01:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: {
            "task-1": [],
          },
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByTestId("empty-splash")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What would you like to work on?" }),
  ).toBeVisible();
  const startingOption = page.getByRole("button", { name: "Fix an issue" });
  await expect(startingOption).toHaveCSS("height", "44px");
  await startingOption.click();
  await expect(page.getByRole("textbox", { name: "Prompt" })).toContainText(
    "Investigate and fix an issue in this workspace.",
  );
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeFocused();
  const promptInput = page.locator("[data-prompt-input-root]");
  await expect(promptInput).toHaveCSS("border-top-width", "0px");
  const promptSurfaceShadow = await promptInput.evaluate(
    (element) => getComputedStyle(element.parentElement ?? element).boxShadow,
  );
  expect(promptSurfaceShadow).not.toBe("none");
});

test("shortcut creates a new task in the selected workspace", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: {
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
          },
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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const taskChips = page.locator('[data-pane-tab-chip^="task:"]');

  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "n",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });

  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeFocused();
  await expect(taskChips).toHaveCount(1);
});

test("archiving the last active task returns the chat area to the splash state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: {
            activeTaskId: "task-1",
            openTaskTabIds: ["task-1"],
            activeSurface: { kind: "task", taskId: "task-1" },
            tasks: [
              {
                id: "task-1",
                title: "Task 1",
                provider: "claude-code",
                updatedAt: "2026-03-06T01:00:00.000Z",
                unread: false,
                archivedAt: null,
              },
            ],
            messagesByTask: {
              "task-1": [],
            },
          },
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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          activeTaskId: "task-1",
          openTaskTabIds: ["task-1"],
          activeSurface: { kind: "task", taskId: "task-1" },
          tasks: [
            {
              id: "task-1",
              title: "Task 1",
              provider: "claude-code",
              updatedAt: "2026-03-06T01:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: {
            "task-1": [],
          },
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  // Archiving now happens from the task tab chip's context menu.
  const taskChip = page.locator('[data-pane-tab-chip="task:task-1"]');
  await expect(taskChip).toBeVisible();
  await taskChip.click({ button: "right" });
  const archiveMenuItem = page
    .locator(".dv-context-menu-item")
    .filter({ hasText: "Archive" });
  await expect(archiveMenuItem).toBeVisible();
  await archiveMenuItem.click();

  await expect(page.locator('[data-pane-tab-chip^="task:"]')).toHaveCount(0);
  await expect(page.getByTestId("pane-watermark")).toBeVisible();
});

test("shortcut closes the selected task tab", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: {
            activeTaskId: "task-1",
            openTaskTabIds: ["task-1"],
            activeSurface: { kind: "task", taskId: "task-1" },
            tasks: [
              {
                id: "task-1",
                title: "Task 1",
                provider: "claude-code",
                updatedAt: "2026-03-06T01:00:00.000Z",
                unread: false,
                archivedAt: null,
              },
            ],
            messagesByTask: {
              "task-1": [],
            },
          },
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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          activeTaskId: "task-1",
          openTaskTabIds: ["task-1"],
          activeSurface: { kind: "task", taskId: "task-1" },
          tasks: [
            {
              id: "task-1",
              title: "Task 1",
              provider: "claude-code",
              updatedAt: "2026-03-06T01:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: {
            "task-1": [],
          },
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(
    page.locator('[data-pane-tab-chip="task:task-1"]'),
  ).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "w",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });

  // Cmd+W closes the pane tab (the task itself stays un-archived).
  await expect(page.locator('[data-pane-tab-chip^="task:"]')).toHaveCount(0);
  await expect(page.getByTestId("pane-watermark")).toBeVisible();
});

test("stale streaming message does not show responding wave without an active turn", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: {
            activeTaskId: "task-1",
            tasks: [
              {
                id: "task-1",
                title: "Task 1",
                provider: "claude-code",
                updatedAt: "just now",
                unread: false,
              },
            ],
            messagesByTask: {
              "task-1": [
                {
                  id: "task-1-message-1",
                  role: "assistant",
                  model: "claude-code",
                  providerId: "claude-code",
                  content: "Finished response",
                  isStreaming: true,
                  parts: [{ type: "text", text: "Finished response" }],
                },
              ],
            },
          },
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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          activeTaskId: "task-1",
          tasks: [
            {
              id: "task-1",
              title: "Task 1",
              provider: "claude-code",
              updatedAt: "just now",
              unread: false,
            },
          ],
          messagesByTask: {
            "task-1": [
              {
                id: "task-1-message-1",
                role: "assistant",
                model: "claude-code",
                providerId: "claude-code",
                content: "Finished response",
                isStreaming: true,
                parts: [{ type: "text", text: "Finished response" }],
              },
            ],
          },
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByLabel("Responding")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeEnabled();
});

test("streaming-off mode still shows responding wave during active turns", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: {
            activeTaskId: "task-1",
            tasks: [
              {
                id: "task-1",
                title: "Task 1",
                provider: "claude-code",
                updatedAt: "just now",
                unread: false,
              },
            ],
            messagesByTask: {
              "task-1": [
                {
                  id: "task-1-message-1",
                  role: "assistant",
                  model: "claude-code",
                  providerId: "claude-code",
                  content: "Streaming response",
                  isStreaming: true,
                  parts: [{ type: "text", text: "Streaming response" }],
                },
              ],
            },
          },
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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          activeTaskId: "task-1",
          tasks: [
            {
              id: "task-1",
              title: "Task 1",
              provider: "claude-code",
              updatedAt: "just now",
              unread: false,
            },
          ],
          activeTurnIdsByTask: { "task-1": "turn-1" },
          settings: { chatStreamingEnabled: false },
          messagesByTask: {
            "task-1": [
              {
                id: "task-1-message-1",
                role: "assistant",
                model: "claude-code",
                providerId: "claude-code",
                content: "Streaming response",
                isStreaming: true,
                parts: [{ type: "text", text: "Streaming response" }],
              },
            ],
          },
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByLabel("Responding")).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeDisabled();
});

test("source control tab loads status surface", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page
    .getByTestId("workspace-bar")
    .getByRole("button", { name: "Source Control" })
    .click();
  const rightPanel = page.getByTestId("editor-panel");
  await expect(rightPanel).toBeVisible();
  await expect(
    rightPanel.getByRole("heading", { name: "Source Control" }),
  ).toBeVisible();
  await expect(rightPanel.getByRole("tab", { name: /Changes/ })).toBeVisible();
});

test("terminal pane opens with session surface", async ({ page }) => {
  await page.addInitScript(() => {
    const sessions = new Map<string, { output: string }>();

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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
        },
        version: 0,
      }),
    );

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
      },
      terminal: {
        runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
        createSession: async () => {
          const sessionId = "session-1";
          if (!sessions.has(sessionId)) {
            sessions.set(sessionId, { output: "session ready\r\n" });
          }
          return { ok: true, sessionId };
        },
        attachSession: async (args: { sessionId: string }) => {
          const session = sessions.get(args.sessionId);
          if (!session) {
            return { ok: false, stderr: "missing session" };
          }
          const output = session.output;
          session.output = "";
          return {
            ok: true,
            attachmentId: `attach-${args.sessionId}`,
            backlog: output,
          };
        },
        detachSession: async () => ({ ok: true }),
        resumeSessionStream: async () => ({ ok: true }),
        getSlotState: async () => ({ state: "idle" as const }),
        readSession: async (args: { sessionId: string }) => {
          const session = sessions.get(args.sessionId);
          if (!session) {
            return { ok: false, output: "" };
          }
          const output = session.output;
          session.output = "";
          return { ok: true, output };
        },
        writeSession: async () => ({ ok: true }),
        resizeSession: async () => ({ ok: true }),
        closeSession: async (args: { sessionId: string }) => {
          sessions.delete(args.sessionId);
          return { ok: true };
        },
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  const terminalPane = page.getByTestId(/^terminal-surface-/).first();
  await expect(terminalPane).toBeVisible();
  await expect(
    page.locator('[data-pane-tab-chip^="term:"]').filter({
      hasText: "stave-project",
    }),
  ).toBeVisible();
  await expect(terminalPane.locator(".xterm-screen")).toBeVisible();
});

test("workspace switch restores per-workspace task snapshot", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const rows = [
      {
        id: "ws-alpha",
        name: "alpha",
        updatedAt: "2026-03-06T01:00:00.000Z",
        snapshot: {
          activeTaskId: "alpha-task-1",
          tasks: [
            {
              id: "alpha-task-1",
              title: "Alpha Task",
              provider: "claude-code",
              updatedAt: "just now",
              unread: false,
            },
          ],
          messagesByTask: { "alpha-task-1": [] },
        },
      },
      {
        id: "ws-beta",
        name: "beta",
        updatedAt: "2026-03-06T00:00:00.000Z",
        snapshot: {
          activeTaskId: "beta-task-1",
          tasks: [
            {
              id: "beta-task-1",
              title: "Beta Task",
              provider: "codex",
              updatedAt: "just now",
              unread: false,
            },
          ],
          messagesByTask: { "beta-task-1": [] },
        },
      },
    ];
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify(rows),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaces: [
            {
              id: "ws-alpha",
              name: "alpha",
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
            {
              id: "ws-beta",
              name: "beta",
              updatedAt: "2026-03-06T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-alpha",
          workspaceBranchById: { "ws-alpha": "main", "ws-beta": "beta" },
          workspacePathById: {
            "ws-alpha": "/tmp/stave-project",
            "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
          },
          workspaceDefaultById: { "ws-alpha": true, "ws-beta": false },
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const alphaWorkspaceButton = page.getByRole("button", {
    name: "Open workspace Default",
  });
  const betaWorkspaceButton = page.getByRole("button", {
    name: "Open workspace beta",
  });
  const alphaTaskChip = page
    .locator('[data-pane-tab-chip^="task:"]')
    .filter({ hasText: "Alpha Task" });
  const betaTaskChip = page
    .locator('[data-pane-tab-chip^="task:"]')
    .filter({ hasText: "Beta Task" });
  await expect(alphaWorkspaceButton).toBeVisible();
  await expect(betaWorkspaceButton).toBeVisible();
  await expect(alphaTaskChip).toBeVisible();

  await betaWorkspaceButton.click();
  await expect(betaTaskChip).toBeVisible();

  await alphaWorkspaceButton.click();
  await expect(alphaTaskChip).toBeVisible();
});

test("workspace switch with an open terminal keeps the active task surface visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const rows = [
      {
        id: "ws-alpha",
        name: "alpha",
        updatedAt: "2026-03-06T01:00:00.000Z",
        snapshot: {
          activeTaskId: "alpha-task-1",
          tasks: [
            {
              id: "alpha-task-1",
              title: "Alpha Task",
              provider: "claude-code",
              updatedAt: "just now",
              unread: false,
            },
          ],
          messagesByTask: { "alpha-task-1": [] },
        },
      },
      {
        id: "ws-beta",
        name: "beta",
        updatedAt: "2026-03-06T00:00:00.000Z",
        snapshot: {
          activeTaskId: "beta-task-1",
          tasks: [
            {
              id: "beta-task-1",
              title: "Beta Task",
              provider: "codex",
              updatedAt: "just now",
              unread: false,
            },
          ],
          messagesByTask: { "beta-task-1": [] },
        },
      },
    ];
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify(rows),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaces: [
            {
              id: "ws-alpha",
              name: "alpha",
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
            {
              id: "ws-beta",
              name: "beta",
              updatedAt: "2026-03-06T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-alpha",
          workspaceBranchById: { "ws-alpha": "main", "ws-beta": "beta" },
          workspacePathById: {
            "ws-alpha": "/tmp/stave-project",
            "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
          },
          workspaceDefaultById: { "ws-alpha": true, "ws-beta": false },
        },
        version: 0,
      }),
    );

    const sessions = new Map<string, { output: string }>();
    let sessionCounter = 0;
    const terminalMock = {
      // ok:false keeps refreshWorkspaces from pruning the seeded workspaces
      // (an ok git-worktree list without beta would remove it).
      runCommand: async () => ({ ok: false, code: 1, stdout: "", stderr: "" }),
      createSession: async () => {
        sessionCounter += 1;
        const sessionId = `session-${sessionCounter}`;
        sessions.set(sessionId, { output: "session ready\r\n" });
        return { ok: true, sessionId };
      },
      attachSession: async (args: { sessionId: string }) => {
        const session = sessions.get(args.sessionId);
        if (!session) {
          return { ok: false, stderr: "missing session" };
        }
        const output = session.output;
        session.output = "";
        return {
          ok: true,
          attachmentId: `attach-${args.sessionId}`,
          backlog: output,
        };
      },
      detachSession: async () => ({ ok: true }),
      resumeSessionStream: async () => ({ ok: true }),
      getSlotState: async () => ({ state: "idle" as const }),
      readSession: async (args: { sessionId: string }) => {
        const session = sessions.get(args.sessionId);
        if (!session) {
          return { ok: false, output: "" };
        }
        const output = session.output;
        session.output = "";
        return { ok: true, output };
      },
      writeSession: async () => ({ ok: true }),
      resizeSession: async () => ({ ok: true }),
      closeSession: async (args: { sessionId: string }) => {
        sessions.delete(args.sessionId);
        return { ok: true };
      },
    };

    // Let the dev api bridge install (it powers workspace switching in the
    // web harness), but keep terminal + provider calls on in-page mocks by
    // re-merging them over every window.api assignment.
    type ApiShape = Record<string, unknown> & {
      terminal?: Record<string, unknown>;
      provider?: Record<string, unknown>;
    };
    let apiValue: ApiShape | undefined;
    const mergeMocks = (value: ApiShape | undefined): ApiShape | undefined => {
      if (!value) {
        return value;
      }
      return {
        ...value,
        provider: { ...value.provider, streamTurn: async () => [] },
        terminal: { ...value.terminal, ...terminalMock },
      };
    };
    Object.defineProperty(window, "api", {
      configurable: true,
      get: () => apiValue,
      set: (value: ApiShape | undefined) => {
        apiValue = mergeMocks(value);
      },
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const alphaWorkspaceButton = page.getByRole("button", {
    name: "Open workspace Default",
  });
  const betaWorkspaceButton = page.getByRole("button", {
    name: "Open workspace beta",
  });
  const alphaTaskChip = page
    .locator('[data-pane-tab-chip^="task:"]')
    .filter({ hasText: "Alpha Task" });
  const betaTaskChip = page
    .locator('[data-pane-tab-chip^="task:"]')
    .filter({ hasText: "Beta Task" });
  const sessionArea = page.getByTestId("session-area");

  await expect(alphaTaskChip).toBeVisible();
  await expect(sessionArea).toBeVisible();

  // Open a terminal tab in alpha, then re-activate the task chat.
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(page.getByTestId(/^terminal-surface-/).first()).toBeVisible();
  await alphaTaskChip.click();
  await expect(sessionArea).toBeVisible();

  // Bounce between workspaces with the terminal tab open; the active task
  // surface must never be left blank. Regression guard for the
  // terminal-tab + workspace-switch blank screen report.
  for (let round = 0; round < 3; round += 1) {
    await betaWorkspaceButton.click();
    await expect(betaTaskChip).toBeVisible();
    await expect(sessionArea).toBeVisible();

    await alphaWorkspaceButton.click();
    await expect(alphaTaskChip).toBeVisible();
    await expect(sessionArea).toBeVisible();
    await expect(
      page.locator('[data-pane-tab-chip^="term:"]').first(),
    ).toBeVisible();
  }
});

test("source control actions update status and history surfaces", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const scmState = {
      branch: "main",
      items: [{ code: " M", path: "README.md" }],
      history: [] as Array<{
        hash: string;
        relativeDate: string;
        subject: string;
      }>,
    };

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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
        },
        version: 0,
      }),
    );

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
      },
      terminal: {
        runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
      },
      sourceControl: {
        getStatus: async () => ({
          ok: true,
          branch: scmState.branch,
          items: scmState.items,
          hasConflicts: false,
          stderr: "",
        }),
        getHistory: async () => ({
          ok: true,
          items: scmState.history,
          stderr: "",
        }),
        stageAll: async () => {
          scmState.items = scmState.items.map((item) => ({
            ...item,
            code: "M ",
          }));
          return { ok: true, code: 0, stdout: "", stderr: "" };
        },
        unstageAll: async () => {
          scmState.items = scmState.items.map((item) => ({
            ...item,
            code: " M",
          }));
          return { ok: true, code: 0, stdout: "", stderr: "" };
        },
        commit: async (args: { message: string }) => {
          if (!args.message.trim()) {
            return {
              ok: false,
              code: 1,
              stdout: "",
              stderr: "Commit message is required.",
            };
          }
          scmState.history = [
            {
              hash: "abc1234",
              relativeDate: "just now",
              subject: args.message,
            },
            ...scmState.history,
          ];
          scmState.items = [];
          return { ok: true, code: 0, stdout: "committed", stderr: "" };
        },
        stageFile: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
        unstageFile: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
        discardFile: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
        getDiff: async () => ({
          ok: true,
          content: "diff --git a/README.md b/README.md\n",
          stderr: "",
        }),
        mergeBranch: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
        rebaseBranch: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
        cherryPick: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page
    .getByTestId("workspace-bar")
    .getByRole("button", { name: "Source Control" })
    .click();
  const rightPanel = page.getByTestId("editor-panel");
  await expect(rightPanel.getByText("Source Control")).toBeVisible();
  await expect(rightPanel.getByRole("tab", { name: /Changes/ })).toBeVisible();
  await expect(rightPanel.getByRole("tab", { name: /History/ })).toBeVisible();
  await expect(rightPanel.getByText("1 changed")).toBeVisible();
  const autoRefreshButton = rightPanel.getByRole("button", {
    name: "Auto refresh options",
  });
  await expect(autoRefreshButton).toBeVisible();
  await expect(autoRefreshButton).toContainText("Off");
  await expect
    .poll(async () => (await autoRefreshButton.boundingBox())?.width ?? 0)
    .toBeGreaterThan(40);
  await autoRefreshButton.click();
  await page.getByRole("menuitem", { name: "Every 10 seconds" }).click();
  await expect(autoRefreshButton).toContainText("10s");
  const changeRow = rightPanel
    .getByRole("button", { name: /README\.md/ })
    .first();
  await changeRow.hover();
  await expect(
    rightPanel.getByRole("button", { name: /^Stage$/ }),
  ).toBeVisible();

  await rightPanel
    .getByRole("button", { name: "Stage All", exact: true })
    .click();
  await changeRow.hover();
  await expect(
    rightPanel.getByRole("button", { name: /^Unstage$/ }),
  ).toBeVisible();

  const commitInput = rightPanel.getByPlaceholder(/Commit staged changes/);
  await commitInput.fill("feat: save snapshot");
  await rightPanel.getByRole("button", { name: "Commit" }).click();

  await expect(commitInput).toHaveCount(0);
  await expect(rightPanel.getByText("Working tree is clean.")).toBeVisible();
  await rightPanel.getByRole("tab", { name: /History/ }).click();
  await expect(rightPanel.getByText("1 recent commit")).toBeVisible();
  await expect(rightPanel.getByText("feat: save snapshot")).toBeVisible();
});

test("terminal sessions stream output over push channel when available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const sessions = new Map<string, { output: string }>();
    const outputSubscribers = new Set<
      (payload: { sessionId: string; output: string }) => void
    >();
    const testState = {
      createCalls: 0,
      readCalls: 0,
      closeCalls: 0,
      pushedOutput: "",
      subscriberDeliveries: 0,
    };

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
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
        },
        version: 0,
      }),
    );

    (
      window as unknown as { __terminalTest?: typeof testState }
    ).__terminalTest = testState;
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
      },
      terminal: {
        runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
        createSession: async () => {
          testState.createCalls += 1;
          const sessionId = `session-${testState.createCalls}`;
          sessions.set(sessionId, { output: "" });
          window.setTimeout(() => {
            const output = `session ${testState.createCalls} ready\r\n`;
            testState.pushedOutput += output;
            for (const subscriber of outputSubscribers) {
              testState.subscriberDeliveries += 1;
              subscriber({ sessionId, output });
            }
          }, 10);
          return { ok: true, sessionId };
        },
        attachSession: async (args: { sessionId: string }) => {
          if (!sessions.has(args.sessionId)) {
            return { ok: false, stderr: "missing session" };
          }
          return {
            ok: true,
            attachmentId: `attach-${args.sessionId}`,
            backlog: "",
          };
        },
        detachSession: async () => ({ ok: true }),
        resumeSessionStream: async () => ({ ok: true }),
        getSlotState: async () => ({ state: "idle" as const }),
        readSession: async (args: { sessionId: string }) => {
          testState.readCalls += 1;
          const session = sessions.get(args.sessionId);
          if (!session) {
            return { ok: false, output: "" };
          }
          const output = session.output;
          session.output = "";
          return { ok: true, output };
        },
        subscribeSessionOutput: (
          listener: (payload: { sessionId: string; output: string }) => void,
        ) => {
          outputSubscribers.add(listener);
          return () => {
            outputSubscribers.delete(listener);
          };
        },
        setSessionDeliveryMode: async () => ({ ok: true }),
        writeSession: async () => ({ ok: true }),
        resizeSession: async () => ({ ok: true }),
        closeSession: async (args: { sessionId: string }) => {
          testState.closeCalls += 1;
          sessions.delete(args.sessionId);
          return { ok: true };
        },
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Terminal", exact: true }).click();

  const terminalPane = page.getByTestId(/^terminal-surface-/).first();
  await expect(terminalPane).toBeVisible();
  await expect(
    page.locator('[data-pane-tab-chip^="term:"]').filter({
      hasText: "stave-project",
    }),
  ).toBeVisible();
  await expect(terminalPane.locator(".xterm-screen")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __terminalTest: { pushedOutput: string };
            }
          ).__terminalTest.pushedOutput,
      ),
    )
    .toContain("session 1 ready");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __terminalTest: { subscriberDeliveries: number };
            }
          ).__terminalTest.subscriberDeliveries,
      ),
    )
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __terminalTest: { readCalls: number } })
            .__terminalTest.readCalls,
      ),
    )
    .toBe(0);

  await page
    .getByRole("button", { name: "Create new pane tab" })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "New Terminal" }).click();
  await expect(
    page.locator('[data-pane-tab-chip^="term:"]').filter({
      hasText: "stave-project 2",
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __terminalTest: { createCalls: number } })
            .__terminalTest.createCalls,
      ),
    )
    .toBeGreaterThanOrEqual(2);
});
