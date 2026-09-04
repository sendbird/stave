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
    const { createWorkGraph } = await import(
      "/src/lib/work-graph/work-graph-reducer.ts"
    );
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
          workGraph: createWorkGraph({
            turnId,
            providerId: "codex",
            startedAt: now - 12_000,
          }),
        },
      },
    });
  });

  const activity = page.getByTestId("turn-activity");
  await expect(activity).toBeVisible();
  await expect(activity).toHaveAccessibleName("Turn activity");
  await expect(activity.getByTestId("turn-activity-loader")).toBeVisible();
  await expect(
    activity.getByTestId("turn-activity-loader").locator(".stave-loader"),
  ).toHaveAttribute(
    "data-loader-variant",
    "handoff",
  );
  const executionSummary = activity.getByRole("region", {
    name: "Task execution summary",
  });
  await expect(executionSummary).toBeVisible();
  await expect(executionSummary).toContainText("Elapsed");
  await expect(executionSummary).toContainText("Verification");
  await expect(activity).toContainText("Inspect Lens diagnostics");
  await expect(activity).toContainText("2 running · 1 done");
  await expect(
    activity.getByText("Verify the stacked activity shelf"),
  ).toBeVisible();
  await expect(activity.getByText("Review Lens diagnostics")).toBeVisible();
  await expect(
    activity.getByRole("button", { name: "Completed (1)" }),
  ).toHaveCount(0);
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
      activityBottomLeftRadius:
        window.getComputedStyle(activityElement).borderBottomLeftRadius,
      activityBottomRightRadius:
        window.getComputedStyle(activityElement).borderBottomRightRadius,
      activityTopLeftRadius:
        window.getComputedStyle(activityElement).borderTopLeftRadius,
      promptShadow: window.getComputedStyle(
        promptElement.parentElement as HTMLElement,
      ).boxShadow,
      headlineBottom:
        activityElement
          .querySelector<HTMLElement>("p[aria-live]")
          ?.getBoundingClientRect().bottom ?? null,
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
  // The shelf tucks under the composer: squared bottom corners, rounded top,
  // and its bottom edge sits below the prompt input's top edge.
  expect(layout?.activityBottomLeftRadius).toBe("0px");
  expect(layout?.activityBottomRightRadius).toBe("0px");
  expect(layout?.activityTopLeftRadius).not.toBe("0px");
  expect(layout?.activity.bottom).toBeGreaterThan(layout?.prompt.top ?? 0);
  expect(
    Math.round((layout?.activity.bottom ?? 0) - (layout?.prompt.top ?? 0)),
  ).toBe(12);
  // Only the shelf's padding may sit under the composer. The composer's focus
  // ring is a 3px outward spread on `.prompt-input-shell`, so shelf text has to
  // clear the prompt's top edge by more than that or the ring would clip it.
  expect(layout?.headlineBottom).not.toBeNull();
  expect(
    Math.round((layout?.prompt.top ?? 0) - (layout?.headlineBottom ?? 0)),
  ).toBeGreaterThan(3);
  expect(layout?.conversation.bottom).toBeLessThanOrEqual(
    layout?.activity.top ?? 0,
  );
  await expect(stack).toBeVisible();
  await expect(promptInput).toBeVisible();
  await expect(conversation).toBeVisible();
  await activity.screenshot({
    path: testInfo.outputPath("turn-activity-expanded-summary.png"),
  });

  const collapse = activity.getByRole("button", {
    name: "Minimize turn activity",
  });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  const expand = activity.getByRole("button", {
    name: "Expand turn activity",
  });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(
    activity.getByText("Verify the stacked activity shelf"),
  ).toBeHidden();
  await expand.click();
  await expect(
    activity.getByText("Verify the stacked activity shelf"),
  ).toBeVisible();
  await expect(activity.getByText("Review Lens diagnostics")).toBeVisible();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  await expect(
    activity.getByText("Verify the stacked activity shelf"),
  ).toBeHidden();
  await expect(activity.getByText("Review Lens diagnostics")).toBeHidden();

  await activity.screenshot({
    path: testInfo.outputPath("turn-activity.png"),
  });

  await page.evaluate(async () => {
    const appStorePath = "/src/store/app.store.ts";
    const storeModule = await import(appStorePath);
    const store = storeModule.useAppStore;
    const state = store.getState();
    const taskId = "task-turn-activity";
    const messages = state.messagesByTask[taskId] ?? [];
    store.setState({
      messagesByTask: {
        ...state.messagesByTask,
        [taskId]: messages.map((message) =>
          message.id === "turn-activity-assistant"
            ? {
                ...message,
                parts: [
                  ...message.parts,
                  {
                    type: "user_input",
                    toolName: "request_user_input",
                    requestId: "turn-activity-input",
                    questions: [
                      {
                        key: "scope",
                        header: "Scope",
                        question: "Which scope should be used?",
                        options: [
                          {
                            label: "Focused",
                            description: "Keep the change focused.",
                          },
                          {
                            label: "Broader cleanup",
                            description: "Update adjacent surfaces too.",
                          },
                        ],
                      },
                      {
                        key: "context",
                        header: "Additional context",
                        question: "Anything else the agent should know?",
                        inputType: "text",
                        options: [],
                        required: false,
                        placeholder: "Add optional context",
                      },
                    ],
                    state: "input-requested",
                  },
                ],
              }
            : message,
        ),
      },
      providerTurnActivityByTask: {
        ...state.providerTurnActivityByTask,
        [taskId]: {
          ...state.providerTurnActivityByTask[taskId]!,
          pendingInteraction: "user_input",
        },
      },
    });
  });

  // The shelf used to unmount here, which replayed its enter/exit animation
  // every time an interaction opened or resolved. It now stays mounted and only
  // drops the row that would duplicate the card.
  await expect(activity).toBeVisible();
  await expect(activity).toContainText("Waiting for your input");
  await expect(activity.getByText("Input needed")).toHaveCount(0);
  await expect(page.getByTestId("turn-activity-list")).toHaveCount(0);
  const userInputComposer = page.getByTestId("user-input-composer");
  await expect(userInputComposer).toBeVisible();
  await expect(page.getByText("Keep the change focused.").last()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue" }).last(),
  ).toBeVisible();

  const focusedOption = userInputComposer.getByRole("radio", {
    name: /Focused/,
  });
  const broaderOption = userInputComposer.getByRole("radio", {
    name: /Broader cleanup/,
  });
  await focusedOption.focus();
  await page.keyboard.press("ArrowDown");
  await expect(broaderOption).toBeChecked();

  const questionLayout = await page.evaluate(() => {
    const activityElement = document.querySelector<HTMLElement>(
      '[data-testid="turn-activity"]',
    );
    const composerElement = document.querySelector<HTMLElement>(
      '[data-testid="user-input-composer"]',
    );
    const optionElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="user-input-composer"] label:has(input[type="radio"])',
      ),
    );
    const questionFieldsets = Array.from(
      composerElement?.querySelectorAll<HTMLElement>("fieldset") ?? [],
    );
    if (!activityElement || !composerElement) {
      return null;
    }
    const activityBox = activityElement.getBoundingClientRect();
    const composerBox = composerElement.getBoundingClientRect();
    const firstQuestionBox = questionFieldsets[0]?.getBoundingClientRect();
    const contextSection = questionFieldsets[1]?.parentElement;
    const contextSectionBox = contextSection?.getBoundingClientRect();
    const contextLegendBox =
      questionFieldsets[1]?.querySelector("legend")?.getBoundingClientRect() ??
      null;
    const contextBorderWidth = contextSection
      ? Number.parseFloat(
          window.getComputedStyle(contextSection).borderTopWidth,
        )
      : 0;
    return {
      overlap: Math.round(activityBox.bottom - composerBox.top),
      composerWidth: composerBox.width,
      composerClientWidth: composerElement.clientWidth,
      composerScrollWidth: composerElement.scrollWidth,
      contextDividerGapBefore:
        firstQuestionBox && contextSectionBox
          ? Math.round(contextSectionBox.top - firstQuestionBox.bottom)
          : null,
      contextDividerGapAfter:
        contextSectionBox && contextLegendBox
          ? Math.round(
              contextLegendBox.top - contextSectionBox.top - contextBorderWidth,
            )
          : null,
      optionHeights: optionElements.map(
        (element) => element.getBoundingClientRect().height,
      ),
      shadow: window.getComputedStyle(composerElement).boxShadow,
    };
  });
  expect(questionLayout).not.toBeNull();
  expect(questionLayout?.overlap).toBe(12);
  expect(questionLayout?.composerScrollWidth).toBeLessThanOrEqual(
    questionLayout?.composerClientWidth ?? 0,
  );
  expect(questionLayout?.optionHeights.every((height) => height >= 44)).toBe(
    true,
  );
  expect(questionLayout?.contextDividerGapBefore).toBe(16);
  expect(questionLayout?.contextDividerGapAfter).toBe(16);
  expect(questionLayout?.shadow).not.toBe("none");

  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
  });
  const lightBackground = await userInputComposer.evaluate(
    (element) => window.getComputedStyle(element).backgroundColor,
  );
  await userInputComposer.screenshot({
    path: testInfo.outputPath("ask-user-question-light-desktop.png"),
  });
  await stack.locator("xpath=..").screenshot({
    path: testInfo.outputPath("ask-user-question-stack-light-desktop.png"),
  });

  await page.setViewportSize({ width: 375, height: 800 });
  await expect(userInputComposer).toBeVisible();
  const narrowLayout = await userInputComposer.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(narrowLayout.width).toBeLessThanOrEqual(375);
  expect(narrowLayout.scrollWidth).toBeLessThanOrEqual(
    narrowLayout.clientWidth,
  );
  await userInputComposer.screenshot({
    path: testInfo.outputPath("ask-user-question-light-375.png"),
  });

  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
  });
  const darkBackground = await userInputComposer.evaluate(
    (element) => window.getComputedStyle(element).backgroundColor,
  );
  expect(darkBackground).not.toBe(lightBackground);
  await userInputComposer.screenshot({
    path: testInfo.outputPath("ask-user-question-dark-375.png"),
  });
});

test("keeps activity rows mounted while their status changes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const taskId = "task-turn-activity-height";
    const workspaceId = "ws-main";
    const workspaceSnapshot = {
      activeTaskId: taskId,
      openTaskTabIds: [taskId],
      activeSurface: { kind: "task", taskId },
      tasks: [
        {
          id: taskId,
          title: "Turn activity height",
          provider: "codex",
          updatedAt: "2026-07-25T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { [taskId]: [] },
    };

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        getCodexModelCatalog: async () => ({
          ok: true,
          models: [],
          detail: "",
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
    page.getByRole("tab", { name: "Turn activity height" }),
  ).toBeVisible();

  // Each round is one realistic provider flush. A tool changing status should
  // keep the same DOM row and natural list height; only a genuinely new or
  // removed activity should change the shelf's footprint.
  const applyRound = async (
    round: Array<{ id: string; status: "running" | "completed" }>,
  ) => {
    await page.evaluate(async (workItems) => {
      const storeModule = await import("/src/store/app.store.ts");
      const { createWorkGraph } = await import(
        "/src/lib/work-graph/work-graph-reducer.ts"
      );
      const store = storeModule.useAppStore;
      const taskId = "task-turn-activity-height";
      const turnId = "turn-height";
      const now = Date.now();
      store.setState({
        activeTurnIdsByTask: {
          ...store.getState().activeTurnIdsByTask,
          [taskId]: turnId,
        },
        providerTurnActivityByTask: {
          ...store.getState().providerTurnActivityByTask,
          [taskId]: {
            turnId,
            providerId: "codex",
            startedAt: now - 5_000,
            lastEventAt: now,
            stalledAt: null,
            pendingInteraction: null,
            workItemsById: Object.fromEntries(
              workItems.map((item) => [
                item.id,
                {
                  id: item.id,
                  kind: "tool",
                  status: item.status,
                  title: `Tool ${item.id}`,
                  detail: `working on ${item.id}`,
                  progressMessages: [],
                  startedAt: now - 1_000,
                  updatedAt: now,
                },
              ]),
            ),
            orderedWorkItemIds: workItems.map((item) => item.id),
            workGraph: createWorkGraph({
              turnId,
              providerId: "codex",
              startedAt: now - 5_000,
            }),
          },
        },
      });
    }, round);
    // Outlast the row-content throttle.
    await page.waitForTimeout(200);
    const box = await page.getByTestId("turn-activity").boundingBox();
    return box?.height ?? 0;
  };

  const activity = page.getByTestId("turn-activity");
  const list = page.getByTestId("turn-activity-list");
  const rowA = activity.locator('[data-turn-activity-item-id="work:a"]');
  const runningHeight = await applyRound([{ id: "a", status: "running" }]);
  await expect(activity).toBeVisible();
  await expect(rowA).toBeVisible();
  await rowA.evaluate((element) => {
    element.setAttribute("data-instance-marker", "row-a");
  });

  const completedHeight = await applyRound([{ id: "a", status: "completed" }]);
  await expect(rowA).toHaveAttribute("data-instance-marker", "row-a");
  expect(Math.abs(completedHeight - runningHeight)).toBeLessThanOrEqual(1);
  await expect(
    activity.getByRole("button", { name: "Completed (1)" }),
  ).toHaveCount(0);
  await expect(list).not.toHaveAttribute("style", /height/);

  const twoRowHeight = await applyRound([
    { id: "a", status: "completed" },
    { id: "b", status: "running" },
  ]);
  expect(twoRowHeight).toBeGreaterThan(runningHeight);
  const twoCompletedHeight = await applyRound([
    { id: "a", status: "completed" },
    { id: "b", status: "completed" },
  ]);
  expect(Math.abs(twoCompletedHeight - twoRowHeight)).toBeLessThanOrEqual(1);

  // When the producer really removes an item, the list returns to its natural
  // height instead of retaining a blank peak-height floor.
  const prunedHeight = await applyRound([{ id: "b", status: "completed" }]);
  expect(prunedHeight).toBeLessThan(twoCompletedHeight);
  expect(Math.abs(prunedHeight - completedHeight)).toBeLessThanOrEqual(1);
});
