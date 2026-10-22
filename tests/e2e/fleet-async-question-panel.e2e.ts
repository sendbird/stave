import { expect, test } from "@playwright/test";

/**
 * A question that did not pause its turn can be answered after the turn
 * ended. A Fleet row answers it then, and its expanded panel must too.
 */
test("a Fleet panel answers a question that outlived its turn, as its row does", async ({ page }) => {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/stave-fleet-async";
    const workspaces = [
      { id: "ws-async-open", name: "open", updatedAt: "2026-10-22T01:00:00.000Z" },
      { id: "ws-async", name: "guide", updatedAt: "2026-10-22T01:00:00.000Z" },
    ];
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify(
        workspaces.map((workspace) => ({
          ...workspace,
          snapshot: { activeTaskId: "", tasks: [], messagesByTask: {} },
        })),
      ),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-fleet-async",
          workspaces,
          activeWorkspaceId: "ws-async-open",
          workspaceBranchById: { "ws-async-open": "main", "ws-async": "guide" },
          workspacePathById: { "ws-async-open": repositoryPath, "ws-async": repositoryPath },
          workspaceDefaultById: { "ws-async-open": true },
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
        },
        version: 0,
      }),
    );
    // The question's notification still waits for an answer.
    window.localStorage.setItem(
      "stave:notifications-fallback:v1",
      JSON.stringify([
        {
          id: "notification-question-async",
          kind: "task.user_input_requested",
          title: "Rewrite the setup guide",
          body: "Which audience should the guide target?",
          repositoryPath,
          repositoryName: "stave-fleet-async",
          workspaceId: "ws-async",
          workspaceName: "guide",
          taskId: "task-async",
          taskTitle: "Rewrite the setup guide",
          turnId: "turn-async",
          providerId: "codex",
          action: null,
          payload: { requestId: "question-async", messageId: "m-async" },
          createdAt: "2026-10-22T00:00:00.000Z",
          readAt: null,
          resolvedAt: null,
          expiresAt: null,
        },
      ]),
    );
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [] },
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
  // The turn that asked has ended; its question still waits.
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const { createEmptyWorkspaceState } = await import(
      "/src/store/workspace-session-state.ts"
    );
    const task = {
      id: "task-async",
      title: "Rewrite the setup guide",
      provider: "codex" as const,
      updatedAt: "2026-10-22T01:00:00.000Z",
      unread: false,
      archivedAt: null,
    };
    useAppStore.setState({
      workspaces: [
        { id: "ws-async-open", name: "open", updatedAt: "2026-10-22T01:00:00.000Z" },
        { id: "ws-async", name: "guide", updatedAt: "2026-10-22T01:00:00.000Z" },
      ],
      taskWorkspaceIdById: { "task-async": "ws-async" },
      workspaceRuntimeCacheById: {
        "ws-async": {
          ...createEmptyWorkspaceState(),
          nativeSessionReadyByTask: {},
          tasks: [task],
          activeTaskId: task.id,
          openTaskTabIds: [task.id],
          messagesByTask: {
            [task.id]: [
              {
                id: "m-async",
                role: "assistant",
                model: "gpt-5.5",
                providerId: "codex",
                content: "",
                turnId: "turn-async",
                parts: [
                  {
                    type: "user_input",
                    requestId: "question-async",
                    toolName: "AskUserQuestion",
                    delivery: "async",
                    state: "input-requested",
                    questions: [
                      {
                        question: "Which audience should the guide target?",
                        header: "Audience",
                        options: [
                          { label: "New users", description: "First run" },
                          { label: "Maintainers", description: "Changing Stave" },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          activeTurnIdsByTask: {},
        },
      },
    } as never);
  });

  await page
    .getByTestId("top-bar")
    .getByRole("button", { name: "Open Fleet View" })
    .click();
  const needs = page.getByRole("region", { name: "Action required" });
  const row = needs.locator('[data-inbox-entry^="interaction:user-input"]');
  await expect(row).toHaveCount(1);
  // The row offers the answers without the turn.
  await expect(row.getByRole("button", { name: /Maintainers/ })).toBeVisible();

  await row.locator("[data-inbox-trigger]").click();
  const panel = page.getByRole("region", { name: "Controls for Rewrite the setup guide" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Which audience should the guide target?");
  await expect(panel).not.toContainText("already answered or expired");
  await expect(panel.getByText("Maintainers").first()).toBeVisible();
});
