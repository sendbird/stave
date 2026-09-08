import { expect, test } from "@playwright/test";

test("updates the live message clock and stops it at completion", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const taskId = "task-turn-activity";
    const workspaceId = "ws-main";
    const messages = [
      {
        id: "turn-activity-user",
        role: "user",
        model: "user",
        providerId: "user",
        content: "Review Lens diagnostics and finish the implementation.",
        parts: [],
      },
      {
        id: "turn-activity-assistant",
        role: "assistant",
        model: "gpt-5.6-sol",
        providerId: "codex",
        content: "",
        isStreaming: true,
        parts: [
          {
            type: "tool_use",
            toolUseId: "todo-turn-activity",
            toolName: "TodoWrite",
            input: JSON.stringify({
              todos: [
                {
                  content: "Review Lens diagnostics",
                  status: "completed",
                },
                {
                  content: "Verify the stacked activity shelf",
                  status: "in_progress",
                },
              ],
            }),
            state: "input-available",
          },
        ],
      },
    ];
    const workspaceSnapshot = {
      activeTaskId: taskId,
      openTaskTabIds: [taskId],
      activeSurface: { kind: "task", taskId },
      tasks: [
        {
          id: taskId,
          title: "Turn activity monitor",
          provider: "codex",
          updatedAt: "2026-07-25T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { [taskId]: messages },
    };

    (
      window as unknown as {
        api?: Record<string, unknown>;
      }
    ).api = {
      provider: {
        streamTurn: async () => [],
        getCodexModelCatalog: async () => ({
          ok: true,
          models: [],
          detail: "",
        }),
      },
      terminal: {
        runCommand: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
      },
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: workspaceId,
          name: "main",
          updatedAt: "2026-07-25T00:00:00.000Z",
          snapshot: workspaceSnapshot,
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
              id: workspaceId,
              name: "main",
              updatedAt: "2026-07-25T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: { [workspaceId]: "main" },
          workspacePathById: { [workspaceId]: "/tmp/stave-project" },
          workspaceDefaultById: { [workspaceId]: true },
          settings: { codexPlanMode: false },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );
  });

  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("tab", { name: "Turn activity monitor" }),
  ).toBeVisible();

  await page.evaluate(async () => {
    const appStorePath = "/src/store/app.store.ts";
    const storeModule = await import(appStorePath);
    const { createWorkGraph } =
      await import("/src/lib/work-graph/work-graph-reducer.ts");
    const store = storeModule.useAppStore;
    const state = store.getState();
    const taskId = "task-turn-activity";
    const turnId = "turn-active";
    const now = Date.now();

    store.setState({
      messagesByTask: {
        ...state.messagesByTask,
        [taskId]: state.messagesByTask[taskId].map(
          (message: { role: string }) =>
            message.role === "assistant"
              ? {
                  ...message,
                  isStreaming: true,
                  startedAt: new Date(now - 5_000).toISOString(),
                  completedAt: undefined,
                }
              : message,
        ),
      },
      activeTurnIdsByTask: {
        ...state.activeTurnIdsByTask,
        [taskId]: turnId,
      },
      providerTurnActivityByTask: {
        ...state.providerTurnActivityByTask,
        [taskId]: {
          turnId,
          providerId: "codex",
          startedAt: now - 12_000,
          lastEventAt: now,
          stalledAt: null,
          pendingInteraction: null,
          workItemsById: {
            "agent-lens": {
              id: "agent-lens",
              kind: "subagent",
              status: "running",
              title: "Inspect Lens diagnostics",
              detail: "Reviewing CDP event storage and lifecycle cleanup.",
              toolUseId: "tool-agent-lens",
              progressMessages: ["Inspecting diagnostics contracts"],
              startedAt: now - 9_000,
              updatedAt: now,
              elapsedSeconds: 9,
            },
          },
          orderedWorkItemIds: ["agent-lens"],
          workGraph: createWorkGraph({
            turnId,
            providerId: "codex",
            startedAt: now - 12_000,
          }),
        },
      },
    });
  });

  const elapsed = page.getByRole("button", {
    name: "Elapsed time",
    exact: true,
  });
  await expect(elapsed).toBeVisible();
  const initial = await elapsed.textContent();
  await expect.poll(() => elapsed.textContent()).not.toBe(initial);
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const state = useAppStore.getState();
    const taskId = "task-turn-activity";
    useAppStore.setState({
      activeTurnIdsByTask: {},
      messagesByTask: {
        ...state.messagesByTask,
        [taskId]: state.messagesByTask[taskId].map(
          (message: { role: string; startedAt?: string }) =>
            message.role === "assistant"
              ? {
                  ...message,
                  isStreaming: false,
                  completedAt: new Date(
                    Date.parse(message.startedAt!) + 12_000,
                  ).toISOString(),
                }
              : message,
        ),
      },
    });
  });
  await expect(elapsed).toHaveText("12s");
  await page.clock.install();
  await page.clock.fastForward(5_000);
  await expect(elapsed).toHaveText("12s");
});
