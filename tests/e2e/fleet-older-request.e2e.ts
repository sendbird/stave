import { expect, test } from "@playwright/test";

/**
 * A question that waits without blocking its turn can be older than the
 * messages a workspace has loaded. Its Fleet row must look for it in the
 * older messages before it says the request is gone.
 */
test("a Fleet row finds a waiting question older than the loaded messages and offers its answers", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/stave-fleet-older";
    const workspaces = [
      { id: "ws-older-open", name: "open", updatedAt: "2026-10-22T01:00:00.000Z" },
      { id: "ws-older", name: "guide", updatedAt: "2026-10-22T01:00:00.000Z" },
    ];
    const question = {
      id: "m-question",
      role: "assistant",
      model: "gpt-5.5",
      providerId: "codex",
      content: "",
      turnId: "turn-older",
      parts: [
        {
          type: "user_input",
          requestId: "question-older",
          toolName: "AskUserQuestion",
          delivery: "async",
          state: "input-requested",
          questions: [
            {
              question: "Which audience should the guide target?",
              header: "Audience",
              options: [
                { label: "New users", description: "People setting Stave up the first time" },
                { label: "Maintainers", description: "People changing Stave itself" },
              ],
            },
          ],
        },
      ],
    };
    const later = Array.from({ length: 129 }, (_, index) => ({
      id: `m-later-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      model: "gpt-5.5",
      providerId: index % 2 === 0 ? "user" : "codex",
      content: `Later message ${index}`,
      parts: [{ type: "text", text: `Later message ${index}` }],
    }));
    const task = {
      id: "task-older",
      title: "Rewrite the setup guide",
      provider: "codex",
      updatedAt: "2026-10-22T01:00:00.000Z",
      unread: false,
      archivedAt: null,
    };
    (window as unknown as { __olderMessages: unknown[] }).__olderMessages = [question, ...later];
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        { ...workspaces[0], snapshot: { activeTaskId: "", tasks: [], messagesByTask: {} } },
        {
          ...workspaces[1],
          snapshot: {
            activeTaskId: task.id,
            tasks: [task],
            messagesByTask: { [task.id]: [question, ...later] },
          },
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-fleet-older",
          workspaces,
          activeWorkspaceId: "ws-older-open",
          workspaceBranchById: { "ws-older-open": "main", "ws-older": "guide" },
          workspacePathById: { "ws-older-open": repositoryPath, "ws-older": repositoryPath },
          workspaceDefaultById: { "ws-older-open": true },
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
        },
        version: 0,
      }),
    );
    window.localStorage.setItem(
      "stave:notifications-fallback:v1",
      JSON.stringify([
        {
          id: "notification-question-older",
          kind: "task.user_input_requested",
          title: "Rewrite the setup guide",
          body: "Which audience should the guide target?",
          repositoryPath,
          repositoryName: "stave-fleet-older",
          workspaceId: "ws-older",
          workspaceName: "guide",
          taskId: "task-older",
          taskTitle: "Rewrite the setup guide",
          turnId: "turn-older",
          providerId: "codex",
          action: null,
          payload: { requestId: "question-older", messageId: "m-question" },
          createdAt: "2026-10-22T00:00:00.000Z",
          readAt: null,
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
        runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
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
  // Another surface loaded only the workspace's latest five messages.
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const { createEmptyWorkspaceState } = await import(
      "/src/store/workspace-session-state.ts"
    );
    const latest = Array.from({ length: 5 }, (_, slot) => {
      const index = 124 + slot;
      return {
        id: `m-later-${index}`,
        role: index % 2 === 0 ? "user" : "assistant",
        model: "gpt-5.5",
        providerId: index % 2 === 0 ? "user" : "codex",
        content: `Later message ${index}`,
        parts: [{ type: "text", text: `Later message ${index}` }],
      };
    });
    useAppStore.setState({
      workspaces: [
        { id: "ws-older-open", name: "open", updatedAt: "2026-10-22T01:00:00.000Z" },
        { id: "ws-older", name: "guide", updatedAt: "2026-10-22T01:00:00.000Z" },
      ],
      taskWorkspaceIdById: { "task-older": "ws-older" },
      workspaceRuntimeCacheById: {
        "ws-older": {
          ...createEmptyWorkspaceState(),
          nativeSessionReadyByTask: {},
          tasks: [
            {
              id: "task-older",
              title: "Rewrite the setup guide",
              provider: "codex",
              updatedAt: "2026-10-22T01:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          activeTaskId: "task-older",
          messagesByTask: { "task-older": latest },
          messageCountByTask: { "task-older": 130 },
          // The turn runs on; the question did not block it.
          activeTurnIdsByTask: { "task-older": "turn-older" },
        },
      },
    } as never);
  });

  // The browser build keeps workspace snapshots in local storage and saves
  // the cached five messages over them; persistence holds every message, so
  // put the full list back once those saves have run.
  await page.waitForTimeout(1_500);
  await page.evaluate(() => {
    const key = "stave:workspace-fallback:v1";
    const rows = JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{
      id: string;
      snapshot: { messagesByTask: Record<string, unknown[]> };
    }>;
    const seeded = (window as unknown as { __olderMessages: unknown[] }).__olderMessages;
    for (const row of rows) {
      if (row.id === "ws-older") row.snapshot.messagesByTask["task-older"] = seeded;
    }
    window.localStorage.setItem(key, JSON.stringify(rows));
  });

  await page
    .getByTestId("top-bar")
    .getByRole("button", { name: "Open Fleet View" })
    .click();
  const needs = page.getByRole("region", { name: "Action required" });
  const row = needs.locator('[data-inbox-entry^="interaction:user-input"]');
  await expect(row).toHaveCount(1);
  await row.locator("[data-inbox-trigger]").focus();

  // The row reads the older messages instead of calling the question gone.
  await expect(row.getByRole("button", { name: /Maintainers/ })).toBeVisible({ timeout: 10_000 });
  await expect(row).not.toContainText("This request was answered or expired.");
  // It is answerable from the row: an async question's answer is sent as a
  // message, which this browser build cannot deliver, so the row stays busy.
  await page.keyboard.press("2");
  await expect(row).toContainText("Sending the answer…");
});
