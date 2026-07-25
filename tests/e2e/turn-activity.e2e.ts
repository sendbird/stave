import { expect, test } from "@playwright/test";

test("monitors active agents and tasks in a stacked composer shelf", async ({
  page,
}, testInfo) => {
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

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("tab", { name: "Turn activity monitor" }),
  ).toBeVisible();

  await page.evaluate(async () => {
    const appStorePath = "/src/store/app.store.ts";
    const storeModule = await import(appStorePath);
    const store = storeModule.useAppStore;
    const state = store.getState();
    const taskId = "task-turn-activity";
    const turnId = "turn-active";
    const now = Date.now();

    store.setState({
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
        },
      },
    });
  });

  const activity = page.getByTestId("turn-activity");
  await expect(activity).toBeVisible();
  await expect(activity).toHaveAccessibleName("Turn activity");
  await expect(activity.getByTestId("turn-activity-orb")).toBeVisible();
  await expect(activity).toContainText("Inspect Lens diagnostics");
  await expect(activity).toContainText("+2");
  await expect(
    activity.getByText("Verify the stacked activity shelf"),
  ).toBeHidden();
  await expect(activity.locator(".animate-spin")).toHaveCount(0);
  await expect(page.getByText(/^Running ·/)).toHaveCount(0);

  const stack = page.getByTestId("turn-activity-stack");
  const promptInput = page.locator("[data-prompt-input-root]");
  const conversation = page.getByTestId(
    "conversation-scroll-task-turn-activity",
  );
  await stack.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  const layout = await page.evaluate(() => {
    const activityElement = document.querySelector<HTMLElement>(
      '[data-testid="turn-activity"]',
    );
    const stackElement = document.querySelector<HTMLElement>(
      '[data-testid="turn-activity-stack"]',
    );
    const promptElement = document.querySelector<HTMLElement>(
      "[data-prompt-input-root]",
    );
    const conversationElement = document.querySelector<HTMLElement>(
      '[data-testid="conversation-scroll-task-turn-activity"]',
    );
    if (
      !activityElement ||
      !stackElement ||
      !promptElement ||
      !conversationElement
    ) {
      return null;
    }
    return {
      activity: activityElement.getBoundingClientRect().toJSON(),
      prompt: promptElement.getBoundingClientRect().toJSON(),
      conversation: conversationElement.getBoundingClientRect().toJSON(),
      stackPosition: window.getComputedStyle(stackElement).position,
      activityShadow: window.getComputedStyle(activityElement).boxShadow,
      promptShadow: window.getComputedStyle(
        promptElement.parentElement as HTMLElement,
      ).boxShadow,
    };
  });

  expect(layout).not.toBeNull();
  expect(layout?.stackPosition).toBe("relative");
  expect(layout?.activityShadow).toContain("inset");
  expect(layout?.promptShadow).not.toBe("none");
  expect(layout?.activity.width).toBeLessThan(layout?.prompt.width ?? 0);
  expect(
    Math.round((layout?.prompt.width ?? 0) - (layout?.activity.width ?? 0)),
  ).toBe(24);
  expect(layout?.activity.left).toBeGreaterThan(layout?.prompt.left ?? 0);
  expect(layout?.activity.bottom).toBeLessThan(layout?.prompt.top ?? 0);
  expect(
    Math.round((layout?.prompt.top ?? 0) - (layout?.activity.bottom ?? 0)),
  ).toBe(4);
  expect(layout?.conversation.bottom).toBeLessThanOrEqual(
    layout?.activity.top ?? 0,
  );
  await expect(stack).toBeVisible();
  await expect(promptInput).toBeVisible();
  await expect(conversation).toBeVisible();

  const expand = activity.getByRole("button", {
    name: "Expand turn activity",
  });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expand.click();
  await expect(
    activity.getByText("Verify the stacked activity shelf"),
  ).toBeVisible();
  await expect(activity.getByText("Review Lens diagnostics")).toBeVisible();

  const collapse = activity.getByRole("button", {
    name: "Minimize turn activity",
  });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  await expect(
    activity.getByText("Verify the stacked activity shelf"),
  ).toBeHidden();

  await activity.screenshot({
    path: testInfo.outputPath("turn-activity.png"),
  });
});
