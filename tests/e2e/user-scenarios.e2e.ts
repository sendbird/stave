import { expect, test } from "@playwright/test";

const PROMPT_PLACEHOLDER = "Use / for commands, $ for skills, @ to search files (Enter to send)";

test("shows no-project splash when project is not selected", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByTestId("splash-no-project")).toBeVisible();
  await expect(page.getByText("Open a Project")).toBeVisible();
  await expect(page.getByTestId("workspace-bar")).toHaveCount(0);
  await expect(page.getByTestId("task-list")).toHaveCount(0);
});

test.fixme("shows no-workspace splash when project exists without selected workspace", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "missing-workspace-id",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
        activeTaskId: "",
        tasks: [],
        messagesByTask: {},
      },
      version: 0,
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByTestId("splash-no-workspace")).toBeVisible();
  await expect(page.getByText("No Workspace Selected")).toBeVisible();
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
  await expect(page.locator('input[list="claude-model-options"]')).toHaveValue("claude-opus-4-6");
});

test("new task button creates a visible task item", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{
      id: "ws-main",
      name: "main",
      updatedAt: "2026-03-06T01:00:00.000Z",
      snapshot: {
        activeTaskId: "",
        tasks: [],
        messagesByTask: {},
      },
    }]));
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
        activeTaskId: "",
        tasks: [],
        messagesByTask: {},
      },
      version: 0,
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const taskMenus = page.locator('button[aria-label^="task-menu-"]');
  const before = await taskMenus.count();
  await page.getByTestId("session-area").getByRole("button", { name: /New Task/ }).click();
  await expect(taskMenus).toHaveCount(before + 1);
});

test("prompt input is focused after creating a task", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{
      id: "ws-main",
      name: "main",
      updatedAt: "2026-03-06T01:00:00.000Z",
      snapshot: {
        activeTaskId: "",
        tasks: [],
        messagesByTask: {},
      },
    }]));
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
        activeTaskId: "",
        tasks: [],
        messagesByTask: {},
      },
      version: 0,
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByTestId("session-area").getByRole("button", { name: /New Task/ }).click();

  await expect(page.getByPlaceholder(PROMPT_PLACEHOLDER)).toBeFocused();
});

test("empty task keeps the intro card above the prompt input", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{
      id: "ws-main",
      name: "main",
      updatedAt: "2026-03-06T01:00:00.000Z",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "New Task",
          provider: "claude-code",
          updatedAt: "2026-03-06T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        }],
        messagesByTask: {
          "task-1": [],
        },
      },
    }]));
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "New Task",
          provider: "claude-code",
          updatedAt: "2026-03-06T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        }],
        messagesByTask: {
          "task-1": [],
        },
      },
      version: 0,
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByTestId("empty-splash")).toBeVisible();
  await expect(page.getByText("Start this task")).toBeVisible();
  await expect(page.getByPlaceholder(PROMPT_PLACEHOLDER)).toBeVisible();
});

test("shortcut creates a new task in the selected workspace", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{
      id: "ws-main",
      name: "main",
      updatedAt: "2026-03-06T01:00:00.000Z",
      snapshot: {
        activeTaskId: "",
        tasks: [],
        messagesByTask: {},
      },
    }]));
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
        activeTaskId: "",
        tasks: [],
        messagesByTask: {},
      },
      version: 0,
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const taskMenus = page.locator('button[aria-label^="task-menu-"]');

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "n",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }));
  });

  await expect(page.getByPlaceholder(PROMPT_PLACEHOLDER)).toBeFocused();
  await expect(taskMenus).toHaveCount(1);
});

test("archiving the last active task returns the chat area to the splash state", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{
      id: "ws-main",
      name: "main",
      updatedAt: "2026-03-06T01:00:00.000Z",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-03-06T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        }],
        messagesByTask: {
          "task-1": [],
        },
      },
    }]));
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-03-06T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        }],
        messagesByTask: {
          "task-1": [],
        },
      },
      version: 0,
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "archive-task-task-1" }).click();
  await expect(page.getByRole("heading", { name: "Archive Task" })).toBeVisible();
  await page.getByRole("button", { name: "Archive", exact: true }).click();

  await expect(page.getByTestId("empty-splash")).toBeVisible();
});

test("shortcut archives the selected task", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{
      id: "ws-main",
      name: "main",
      updatedAt: "2026-03-06T01:00:00.000Z",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-03-06T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        }],
        messagesByTask: {
          "task-1": [],
        },
      },
    }]));
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-03-06T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        }],
        messagesByTask: {
          "task-1": [],
        },
      },
      version: 0,
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "w",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }));
  });

  await expect(page.getByTestId("empty-splash")).toBeVisible();
});

test("stale streaming message does not show responding wave without an active turn", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{
      id: "ws-main",
      name: "main",
      updatedAt: "2026-03-06T01:00:00.000Z",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [{ id: "task-1", title: "Task 1", provider: "claude-code", updatedAt: "just now", unread: false }],
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
    }]));
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
        activeTaskId: "task-1",
        tasks: [{ id: "task-1", title: "Task 1", provider: "claude-code", updatedAt: "just now", unread: false }],
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
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByLabel("Responding")).toHaveCount(0);
  await expect(page.getByPlaceholder(PROMPT_PLACEHOLDER)).toBeEnabled();
});

test("streaming-off mode still shows responding wave during active turns", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{
      id: "ws-main",
      name: "main",
      updatedAt: "2026-03-06T01:00:00.000Z",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [{ id: "task-1", title: "Task 1", provider: "claude-code", updatedAt: "just now", unread: false }],
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
    }]));
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
        activeTaskId: "task-1",
        tasks: [{ id: "task-1", title: "Task 1", provider: "claude-code", updatedAt: "just now", unread: false }],
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
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByLabel("Responding")).toHaveCount(1);
  await expect(page.getByPlaceholder(PROMPT_PLACEHOLDER)).toBeDisabled();
});

test("source control tab loads status surface", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.keyboard.press("Control+b");
  const rightPanel = page.getByTestId("editor-panel");
  await rightPanel.getByTitle("changes").click();
  await expect(rightPanel.getByText(/Branch:\s.+\|\sChanges \(\d+\)/)).toBeVisible();
});

test("terminal dock opens with session surface", async ({ page }) => {
  await page.addInitScript(() => {
    const sessions = new Map<string, { output: string }>();

    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
      },
      version: 0,
    }));

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
  await expect(page.getByTestId("terminal-dock")).toBeVisible();
  await expect(page.getByTestId("terminal-dock").getByText("stave-project")).toBeVisible();
  await expect(page.getByTestId("terminal-dock")).toContainText("session ready");
});

test("workspace switch restores per-workspace task snapshot", async ({ page }) => {
  await page.addInitScript(() => {
    const rows = [
      {
        id: "ws-alpha",
        name: "alpha",
        updatedAt: "2026-03-06T01:00:00.000Z",
        snapshot: {
          activeTaskId: "alpha-task-1",
          tasks: [{ id: "alpha-task-1", title: "Alpha Task", provider: "claude-code", updatedAt: "just now", unread: false }],
          messagesByTask: { "alpha-task-1": [] },
        },
      },
      {
        id: "ws-beta",
        name: "beta",
        updatedAt: "2026-03-06T00:00:00.000Z",
        snapshot: {
          activeTaskId: "beta-task-1",
          tasks: [{ id: "beta-task-1", title: "Beta Task", provider: "codex", updatedAt: "just now", unread: false }],
          messagesByTask: { "beta-task-1": [] },
        },
      },
    ];
    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify(rows));
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [
          { id: "ws-alpha", name: "alpha", updatedAt: "2026-03-06T01:00:00.000Z" },
          { id: "ws-beta", name: "beta", updatedAt: "2026-03-06T00:00:00.000Z" },
        ],
        activeWorkspaceId: "ws-alpha",
        workspaceBranchById: { "ws-alpha": "main", "ws-beta": "beta" },
        workspacePathById: { "ws-alpha": "/tmp/stave-project", "ws-beta": "/tmp/stave-project/.stave/workspaces/beta" },
        workspaceDefaultById: { "ws-alpha": true, "ws-beta": false },
      },
      version: 0,
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const topBar = page.getByTestId("top-bar");
  await expect(topBar.getByRole("button", { name: "alpha", exact: true })).toBeVisible();
  await expect(topBar.getByRole("button", { name: /^beta/ })).toBeVisible();
  await expect(page.getByText("Alpha Task")).toBeVisible();

  await topBar.getByRole("button", { name: /^beta/ }).click();
  await expect(page.getByText("Beta Task")).toBeVisible();

  await topBar.getByRole("button", { name: "alpha", exact: true }).click();
  await expect(page.getByText("Alpha Task")).toBeVisible();
});

test("source control actions update status and history surfaces", async ({ page }) => {
  await page.addInitScript(() => {
    const scmState = {
      branch: "main",
      items: [{ code: " M", path: "README.md" }],
      history: [] as Array<{ hash: string; relativeDate: string; subject: string }>,
    };

    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
      },
      version: 0,
    }));

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
          scmState.items = scmState.items.map((item) => ({ ...item, code: "M " }));
          return { ok: true, code: 0, stdout: "", stderr: "" };
        },
        unstageAll: async () => {
          scmState.items = scmState.items.map((item) => ({ ...item, code: " M" }));
          return { ok: true, code: 0, stdout: "", stderr: "" };
        },
        commit: async (args: { message: string }) => {
          if (!args.message.trim()) {
            return { ok: false, code: 1, stdout: "", stderr: "Commit message is required." };
          }
          scmState.history = [{ hash: "abc1234", relativeDate: "just now", subject: args.message }, ...scmState.history];
          scmState.items = [];
          return { ok: true, code: 0, stdout: "committed", stderr: "" };
        },
        stageFile: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
        unstageFile: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
        discardFile: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
        getDiff: async () => ({ ok: true, content: "diff --git a/README.md b/README.md\n", stderr: "" }),
        mergeBranch: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
        rebaseBranch: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
        cherryPick: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.keyboard.press("Control+b");
  const rightPanel = page.getByTestId("editor-panel");
  await expect(rightPanel.getByText("Source Control")).toBeVisible();
  await expect(rightPanel.getByRole("tab", { name: /Changes/ })).toBeVisible();
  await expect(rightPanel.getByRole("tab", { name: /History/ })).toBeVisible();
  await expect(rightPanel.getByText("1 file changed")).toBeVisible();
  const changeRow = rightPanel.getByRole("button", { name: /README\.md/ }).first();
  await changeRow.hover();
  await expect(rightPanel.getByRole("button", { name: /^Stage$/ })).toBeVisible();

  await rightPanel.getByRole("button", { name: "Stage All", exact: true }).click();
  await changeRow.hover();
  await expect(rightPanel.getByRole("button", { name: /^Unstage$/ })).toBeVisible();

  const commitInput = rightPanel.getByPlaceholder(/Commit staged changes/);
  await commitInput.fill("feat: save snapshot");
  await rightPanel.getByRole("button", { name: "Commit" }).click();

  await expect(commitInput).toHaveCount(0);
  await expect(rightPanel.getByText("Working tree is clean.")).toBeVisible();
  await rightPanel.getByRole("tab", { name: /History/ }).click();
  await expect(rightPanel.getByText("1 recent commit")).toBeVisible();
  await expect(rightPanel.getByText("feat: save snapshot")).toBeVisible();
});

test("terminal sessions stream output over push channel when available", async ({ page }) => {
  await page.addInitScript(() => {
    const sessions = new Map<string, { output: string }>();
    const outputSubscribers = new Set<
      (payload: { sessionId: string; output: string }) => void
    >();
    const testState = {
      createCalls: 0,
      readCalls: 0,
      closeCalls: 0,
    };

    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
      },
      version: 0,
    }));

    (window as unknown as { __terminalTest?: typeof testState }).__terminalTest = testState;
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
            if (!sessions.has(sessionId)) {
              return;
            }
            const output = `session ${testState.createCalls} ready\r\n`;
            for (const subscriber of outputSubscribers) {
              subscriber({ sessionId, output });
            }
          }, 10);
          return { ok: true, sessionId };
        },
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

  await expect(page.getByTestId("terminal-dock")).toBeVisible();
  await expect(page.getByTestId("terminal-dock").getByText("stave-project")).toBeVisible();
  await expect(page.getByTestId("terminal-dock")).toContainText("session 1 ready");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __terminalTest: { readCalls: number } }).__terminalTest.readCalls))
    .toBe(0);

  await page.getByRole("button", { name: "new-terminal-tab" }).click();
  await expect(page.getByRole("button", { name: "stave-project 2", exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __terminalTest: { createCalls: number } }).__terminalTest.createCalls))
    .toBeGreaterThanOrEqual(2);
});
