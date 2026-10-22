import { expect, test, type Locator } from "@playwright/test";

async function measureTextContrast(locator: Locator) {
  return locator.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) {
      return 0;
    }
    const readColor = (value: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
    const luminance = (channels: number[]) => {
      const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const foreground = luminance(readColor(style.color));
    const background = luminance(readColor(style.backgroundColor));
    return (
      (Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05)
    );
  });
}

test("Fleet keeps durable needs actionable across cold workspace state", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/stave-fleet-needs";
    const workspaceId = "ws-fleet-needs";
    const taskId = "task-fleet-needs";
    const workspaceSnapshot = {
      activeTaskId: taskId,
      openTaskTabIds: [taskId],
      activeSurface: { kind: "task", taskId },
      tasks: [
        {
          id: taskId,
          title: "Fleet fixture",
          provider: "codex",
          updatedAt: "2026-07-26T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        [taskId]: [
          {
            id: "message-approval",
            role: "assistant",
            model: "gpt-5",
            providerId: "codex",
            content: "",
            startedAt: "2026-07-26T01:09:00.000Z",
            parts: [
              {
                type: "approval",
                toolName: "Bash",
                description:
                  "Run the production deployment after the verification checks pass.",
                requestId: "approval-deploy",
                state: "approval-requested",
              },
            ],
          },
        ],
      },
      activeTurnIdsByTask: { [taskId]: "turn-approval" },
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: workspaceId,
          name: "fleet-needs",
          updatedAt: "2026-07-26T01:00:00.000Z",
          snapshot: workspaceSnapshot,
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-fleet-needs",
          workspaces: [
            {
              id: workspaceId,
              name: "fleet-needs",
              updatedAt: "2026-07-26T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: { [workspaceId]: "main" },
          workspacePathById: { [workspaceId]: repositoryPath },
          workspaceDefaultById: { [workspaceId]: true },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );
    window.localStorage.setItem(
      "stave:notifications-fallback:v1",
      JSON.stringify([
        {
          id: "notification-result",
          kind: "task.turn_completed",
          title: "Review summary",
          body: "The provider turn completed.",
          repositoryPath,
          repositoryName: "stave-fleet-needs",
          workspaceId,
          workspaceName: "fleet-needs",
          taskId,
          taskTitle: "Review summary",
          turnId: "turn-result",
          providerId: "codex",
          action: null,
          payload: {},
          createdAt: "2026-07-26T01:05:00.000Z",
          readAt: null,
          resolvedAt: null,
          expiresAt: null,
        },
        {
          id: "notification-approval",
          kind: "task.approval_requested",
          title: "Approve deployment",
          body: "Allow the deployment command.",
          repositoryPath,
          repositoryName: "stave-fleet-needs",
          workspaceId,
          workspaceName: "fleet-needs",
          taskId,
          taskTitle: "Approve deployment",
          turnId: "turn-approval",
          providerId: "codex",
          action: {
            type: "approval",
            requestId: "approval-deploy",
            messageId: "message-approval",
          },
          payload: {},
          createdAt: "2026-07-26T01:10:00.000Z",
          readAt: "2026-07-26T01:11:00.000Z",
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
        runCommand: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
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
  await page
    .getByTestId("top-bar")
    .getByRole("button", { name: "Open Fleet View" })
    .click();

  const needs = page.getByRole("region", { name: "Action required" });
  // The rail is layout-level, so it stays mounted regardless of board filter.
  await expect(needs).toBeVisible();
  // Blocking needs lead; a completed-turn result is only "in review" and
  // stays folded so it cannot crowd out the item an agent is stalled on.
  const items = needs.getByRole("listitem");
  await expect(items).toHaveCount(1);
  await expect(items.nth(0)).toContainText("Approve deployment");
  await expect(
    items.nth(0).getByRole("button", { name: "Dismiss" }),
  ).toBeVisible();

  const reviewToggle = needs.getByRole("button", { name: /In review/ });
  await expect(reviewToggle).toHaveAttribute("aria-expanded", "false");
  await reviewToggle.click();
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toContainText("Review summary");
  await reviewToggle.click();
  await expect(items).toHaveCount(1);

  // The board renders the workspace as a card, not a full-width row.
  const workspaceCard = page.getByRole("article", {
    name: /fleet-needs workspace in stave-fleet-needs/,
  });
  await expect(workspaceCard).toBeVisible();
  await expect(workspaceCard).toContainText("Fleet fixture");
  await expect(
    workspaceCard.getByRole("button", { name: "Open fleet-needs workspace" }),
  ).toBeVisible();

  // The attention rail stacks above the board on a phone-width viewport, and
  // the auto-fill card minimum must shrink instead of forcing horizontal
  // clipping behind the app chrome.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(workspaceCard).toBeVisible();
  const narrowLayout = await workspaceCard.evaluate((cardElement) => {
    const root = cardElement.closest<HTMLElement>(
      '[data-fleet-view-root="true"]',
    );
    if (!root) {
      throw new Error("Fleet layout root was not found");
    }
    const board = root.querySelector<HTMLElement>(
      '[data-fleet-board-scroll="true"]',
    );
    const boardRect = board?.getBoundingClientRect();
    const cardRect = cardElement.getBoundingClientRect();
    return {
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      boardClientWidth: board?.clientWidth ?? 0,
      boardScrollWidth: board?.scrollWidth ?? 0,
      cardLeft: cardRect.left,
      cardRight: cardRect.right,
      boardLeft: boardRect?.left ?? 0,
      boardRight: boardRect?.right ?? 0,
    };
  });
  expect(narrowLayout.rootScrollWidth).toBeLessThanOrEqual(
    narrowLayout.rootClientWidth + 1,
  );
  expect(narrowLayout.boardScrollWidth).toBeLessThanOrEqual(
    narrowLayout.boardClientWidth + 1,
  );
  expect(narrowLayout.cardLeft).toBeGreaterThanOrEqual(
    narrowLayout.boardLeft - 1,
  );
  expect(narrowLayout.cardRight).toBeLessThanOrEqual(
    narrowLayout.boardRight + 1,
  );
  await page.setViewportSize({ width: 1440, height: 900 });

  const approvalTrigger = items.nth(0).getByRole("button", {
    name: /Open approval for .+ in fleet-needs/,
  });
  await approvalTrigger.click();
  const controls = page.getByRole("region", {
    name: "Controls for Fleet fixture",
  });
  await expect(controls).toBeVisible();
  await expect(controls).toBeFocused();
  await expect(
    controls.getByRole("region", { name: "Task execution summary" }),
  ).toBeVisible();
  await expect(controls).toContainText(
    "Run the production deployment after the verification checks pass.",
  );
  await expect(controls).toContainText(
    "This request was already answered or expired.",
  );
  await expect(
    controls.getByRole("button", { name: "Allow once" }),
  ).toHaveCount(0);
  await expect(controls.getByRole("button", { name: "Deny" })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("fleet-action-required.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(controls).toBeHidden();
  await expect(approvalTrigger).toBeFocused();

  await page.evaluate(async () => {
    const storeModule = await import("/src/store/app.store.ts");
    const turnStatus = await import("/src/lib/providers/turn-status.ts");
    const store = storeModule.useAppStore;
    const state = store.getState();
    const taskId = "task-fleet-needs";
    const turnId = "turn-approval";
    store.setState({
      activeTurnIdsByTask: {
        ...state.activeTurnIdsByTask,
        [taskId]: turnId,
      },
      // The runtime's own constructor, so the snapshot carries its work graph.
      providerTurnActivityByTask: turnStatus.startProviderTurnActivity({
        activityByTask: state.providerTurnActivityByTask,
        taskId,
        turnId,
        providerId: "codex",
        pendingInteraction: "approval",
        now: Date.now() - 12_000,
      }),
    });
  });
  await expect(
    items.nth(0).getByRole("button", { name: "Dismiss" }),
  ).toHaveCount(0);
  await approvalTrigger.click();
  await expect(controls).toBeVisible();
  await expect(controls).toBeFocused();
  await expect(controls).not.toContainText(
    "This request was already answered or expired.",
  );
  await expect(
    controls.getByRole("button", { name: "Allow once" }),
  ).toBeVisible();
  await expect(controls.getByRole("button", { name: "Deny" })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Stop" })).toBeVisible();
  const approvalButton = controls.getByRole("button", { name: "Allow once" });
  await expect
    .poll(() => measureTextContrast(approvalButton))
    .toBeGreaterThanOrEqual(4.5);
  await page.screenshot({
    path: testInfo.outputPath("fleet-live-approval-controls.png"),
    fullPage: true,
  });
  const darkPanelBackground = await controls.evaluate(
    (element) => window.getComputedStyle(element).backgroundColor,
  );
  await page.evaluate(async () => {
    const storeModule = await import("/src/store/app.store.ts");
    storeModule.useAppStore.getState().updateSettings({
      patch: { themeMode: "light", customThemeId: null },
    });
  });
  const lightPanelBackground = await controls.evaluate(
    (element) => window.getComputedStyle(element).backgroundColor,
  );
  expect(lightPanelBackground).not.toBe(darkPanelBackground);
  await expect
    .poll(() => measureTextContrast(approvalButton))
    .toBeGreaterThanOrEqual(4.5);
  await page.screenshot({
    path: testInfo.outputPath("fleet-live-approval-controls-light.png"),
    fullPage: true,
  });
  await page.evaluate(async () => {
    const storeModule = await import("/src/store/app.store.ts");
    storeModule.useAppStore.getState().updateSettings({
      patch: { themeMode: "dark", customThemeId: null },
    });
  });
  await page.keyboard.press("Escape");
  await expect(controls).toBeHidden();
  await expect(approvalTrigger).toBeFocused();

  // Remove the blocking interaction so the header's "Review queue" action
  // selects the folded result. The first disclosure click must then really
  // close it and clear that hidden selection; previously this click was a no-op.
  await page.evaluate(async () => {
    const storeModule = await import("/src/store/app.store.ts");
    const store = storeModule.useAppStore;
    const state = store.getState();
    const taskId = "task-fleet-needs";
    const nextActiveTurnIdsByTask = { ...state.activeTurnIdsByTask };
    const nextProviderTurnActivityByTask = {
      ...state.providerTurnActivityByTask,
    };
    delete nextActiveTurnIdsByTask[taskId];
    delete nextProviderTurnActivityByTask[taskId];
    store.setState({
      activeTurnIdsByTask: nextActiveTurnIdsByTask,
      providerTurnActivityByTask: nextProviderTurnActivityByTask,
      messagesByTask: { ...state.messagesByTask, [taskId]: [] },
      notifications: state.notifications.filter(
        (notification) => notification.id !== "notification-approval",
      ),
    });
  });
  await page.getByRole("button", { name: "Review queue" }).click();
  await expect(reviewToggle).toHaveAttribute("aria-expanded", "true");
  await expect(items).toHaveCount(1);
  await reviewToggle.click();
  await expect(reviewToggle).toHaveAttribute("aria-expanded", "false");
  await expect(items).toHaveCount(0);

  // Marking the completed-turn result reviewed clears it from the rail, and the
  // "In review" group disappears with its last member.
  await reviewToggle.click();
  await items.nth(0).getByRole("button", { name: "Mark read" }).click();
  await expect(items).toHaveCount(0);
  await expect(needs).not.toContainText("Review summary");
  await expect(reviewToggle).toHaveCount(0);
  await expect(needs).toContainText("No action required");
});

test("answers a question and two approvals across three workspaces from Fleet rows with the keyboard", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/stave-fleet-rows";
    const workspaces = ["ws-rows-one", "ws-rows-two", "ws-rows-three"].map(
      (id, index) => ({
        id,
        name: ["deploy", "docs", "search"][index]!,
        updatedAt: "2026-10-22T01:00:00.000Z",
      }),
    );
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
          repositoryName: "stave-fleet-rows",
          workspaces,
          activeWorkspaceId: "ws-rows-one",
          workspaceBranchById: Object.fromEntries(
            workspaces.map((workspace) => [workspace.id, workspace.name]),
          ),
          workspacePathById: Object.fromEntries(
            workspaces.map((workspace) => [workspace.id, repositoryPath]),
          ),
          workspaceDefaultById: { "ws-rows-one": true },
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
        },
        version: 0,
      }),
    );
    const sent: Array<Record<string, unknown>> = [];
    (window as unknown as { __fleetAnswers: typeof sent }).__fleetAnswers = sent;
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        respondApproval: async (args: Record<string, unknown>) => {
          sent.push({ kind: "approval", ...args });
          return { ok: true };
        },
        respondUserInput: async (args: Record<string, unknown>) => {
          sent.push({ kind: "user-input", ...args });
          return { ok: true };
        },
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
  // One request per workspace, each in a running turn: the open workspace's
  // own session, and two workspaces another surface already loaded.
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const { createEmptyWorkspaceState } = await import(
      "/src/store/workspace-session-state.ts"
    );
    const task = (id: string, title: string) => ({
      id,
      title,
      provider: "codex" as const,
      updatedAt: "2026-10-22T01:00:00.000Z",
      unread: false,
      archivedAt: null,
    });
    const message = (id: string, turnId: string, part: Record<string, unknown>) => ({
      id,
      role: "assistant" as const,
      model: "gpt-5.5",
      providerId: "codex" as const,
      content: "",
      turnId,
      parts: [part],
    });
    const cached = (taskValue: ReturnType<typeof task>, messages: unknown[], turnId: string) => ({
      ...createEmptyWorkspaceState(),
      nativeSessionReadyByTask: {},
      tasks: [taskValue],
      activeTaskId: taskValue.id,
      messagesByTask: { [taskValue.id]: messages },
      activeTurnIdsByTask: { [taskValue.id]: turnId },
    });
    // The browser build lists only the worktrees it can find, so the three
    // workspaces are restated after hydration.
    useAppStore.setState({
      workspaces: [
        { id: "ws-rows-one", name: "deploy", updatedAt: "2026-10-22T01:00:00.000Z" },
        { id: "ws-rows-two", name: "docs", updatedAt: "2026-10-22T01:00:00.000Z" },
        { id: "ws-rows-three", name: "search", updatedAt: "2026-10-22T01:00:00.000Z" },
      ],
      tasks: [task("task-deploy", "Ship the release")],
      activeTaskId: "task-deploy",
      messagesByTask: {
        "task-deploy": [
          message("m-deploy", "turn-deploy", {
            type: "approval",
            requestId: "approval-deploy",
            toolName: "Bash",
            description: "Publish the release build",
            input: "bun run release",
            state: "approval-requested",
          }),
        ],
      },
      activeTurnIdsByTask: { "task-deploy": "turn-deploy" },
      taskWorkspaceIdById: {
        "task-deploy": "ws-rows-one",
        "task-docs": "ws-rows-two",
        "task-search": "ws-rows-three",
      },
      workspaceRuntimeCacheById: {
        "ws-rows-two": cached(
          task("task-docs", "Rewrite the setup guide"),
          [
            message("m-docs", "turn-docs", {
              type: "user_input",
              requestId: "question-docs",
              toolName: "AskUserQuestion",
              state: "input-requested",
              questions: [
                {
                  question: "Which audience should the guide target?",
                  header: "Audience",
                  options: [
                    { label: "New users" },
                    { label: "Maintainers" },
                  ],
                },
              ],
            }),
          ],
          "turn-docs",
        ),
        "ws-rows-three": cached(
          task("task-search", "Tune the search index"),
          [
            message("m-search", "turn-search", {
              type: "approval",
              requestId: "approval-search",
              toolName: "Bash",
              description: "Drop the stale index",
              input: "rm -rf .cache/search",
              state: "approval-requested",
            }),
          ],
          "turn-search",
        ),
      },
    });
  });
  await page
    .getByTestId("top-bar")
    .getByRole("button", { name: "Open Fleet View" })
    .click();

  const needs = page.getByRole("region", { name: "Action required" });
  const rows = needs.locator("[data-fleet-attention-row]");
  await expect(rows).toHaveCount(3);
  // Each request is answerable in its row: two approval cards and one question.
  await expect(needs.locator('[data-fleet-inline-answer="approval"]')).toHaveCount(2);
  await expect(
    needs.locator('[data-fleet-inline-answer="short-question"]'),
  ).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("fleet-inline-answers.png"),
    fullPage: true,
  });

  const rowFor = (title: string) =>
    rows.filter({ hasText: title }).getByRole("button", { name: new RegExp(title) }).first();

  // Keyboard only: focus a row, answer it, and focus moves on to the next.
  await rowFor("Rewrite the setup guide").focus();
  await page.keyboard.press("2");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Rewrite the setup guide" })).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? ""))
    .toMatch(/^fleet-attention-trigger-interaction:approval:/);

  await rowFor("Ship the release").focus();
  await page.keyboard.press("a");
  await expect(rows).toHaveCount(1);
  await rowFor("Tune the search index").focus();
  await page.keyboard.press("d");
  await expect(rows).toHaveCount(0);
  await expect(needs).toContainText("No action required");

  const sent = await page.evaluate(
    () => (window as unknown as { __fleetAnswers: unknown[] }).__fleetAnswers,
  );
  expect(sent).toEqual([
    {
      kind: "user-input",
      turnId: "turn-docs",
      requestId: "question-docs",
      answers: { "Which audience should the guide target?": "Maintainers" },
    },
    { kind: "approval", turnId: "turn-deploy", requestId: "approval-deploy", approved: true },
    { kind: "approval", turnId: "turn-search", requestId: "approval-search", approved: false },
  ]);
  // Each task records the answer exactly as if it had been given there, and
  // Fleet never switched the workspace.
  const recorded = await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const state = useAppStore.getState();
    return {
      activeWorkspaceId: state.activeWorkspaceId,
      deploy: state.messagesByTask["task-deploy"]?.[0]?.parts[0],
      docs: state.workspaceRuntimeCacheById["ws-rows-two"]?.messagesByTask["task-docs"]?.[0]?.parts[0],
      search: state.workspaceRuntimeCacheById["ws-rows-three"]?.messagesByTask["task-search"]?.[0]?.parts[0],
    };
  });
  expect(recorded.activeWorkspaceId).toBe("ws-rows-one");
  expect(recorded.deploy).toMatchObject({ state: "approval-responded" });
  expect(recorded.search).toMatchObject({ state: "output-denied" });
  expect(recorded.docs).toMatchObject({
    state: "input-responded",
    answers: { "Which audience should the guide target?": "Maintainers" },
  });
});

test("the bell and Fleet share one inbox: one read state, and ten requests answered from the keyboard", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/stave-fleet-inbox";
    const workspace = { id: "ws-inbox", name: "inbox", updatedAt: "2026-10-22T01:00:00.000Z" };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([{ ...workspace, snapshot: { activeTaskId: "", tasks: [], messagesByTask: {} } }]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-fleet-inbox",
          workspaces: [workspace],
          activeWorkspaceId: workspace.id,
          workspaceBranchById: { [workspace.id]: "main" },
          workspacePathById: { [workspace.id]: repositoryPath },
          workspaceDefaultById: { [workspace.id]: true },
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
        },
        version: 0,
      }),
    );
    // A finished turn nobody has read yet: the same entry in the bell and Fleet.
    window.localStorage.setItem(
      "stave:notifications-fallback:v1",
      JSON.stringify([
        {
          id: "notification-result",
          kind: "task.turn_completed",
          title: "Summarize the release",
          body: "The provider turn completed.",
          repositoryPath,
          repositoryName: "stave-fleet-inbox",
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          taskId: "task-summary",
          taskTitle: "Summarize the release",
          turnId: "turn-summary",
          providerId: "codex",
          action: null,
          payload: {},
          createdAt: "2026-10-22T00:50:00.000Z",
          readAt: null,
          resolvedAt: null,
          expiresAt: null,
        },
      ]),
    );
    const sent: unknown[] = [];
    (window as unknown as { __fleetAnswers: unknown[] }).__fleetAnswers = sent;
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        respondApproval: async (args: unknown) => {
          sent.push(args);
          return { ok: true };
        },
      },
      terminal: {
        runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
      },
      sourceControl: {
        getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // Ten tasks, each blocked on an approval in a running turn.
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const ids = Array.from({ length: 10 }, (_, index) => index + 1);
    useAppStore.setState({
      tasks: ids.map((index) => ({
        id: `task-${index}`,
        title: `Release step ${index}`,
        provider: "codex" as const,
        updatedAt: "2026-10-22T01:00:00.000Z",
        unread: false,
        archivedAt: null,
      })),
      activeTaskId: "task-1",
      messagesByTask: Object.fromEntries(
        ids.map((index) => [
          `task-${index}`,
          [
            {
              id: `message-${index}`,
              role: "assistant" as const,
              model: "gpt-5.5",
              providerId: "codex" as const,
              content: "",
              turnId: `turn-${index}`,
              parts: [
                {
                  type: "approval" as const,
                  requestId: `approval-${index}`,
                  toolName: "Bash",
                  description: `Run release step ${index}`,
                  state: "approval-requested" as const,
                },
              ],
            },
          ],
        ]),
      ),
      activeTurnIdsByTask: Object.fromEntries(ids.map((index) => [`task-${index}`, `turn-${index}`])),
    } as never);
  });
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  const needs = page.getByRole("region", { name: "Action required" });
  const rows = needs.locator("[data-fleet-attention-row]");
  await expect(rows).toHaveCount(10);

  // One read state: unread in Fleet and in the bell, read in both after the bell.
  const reviewToggle = needs.getByRole("button", { name: /In review/ });
  await reviewToggle.click();
  const fleetResult = needs.locator('[data-inbox-entry^="turn:result-ready"]');
  await expect(fleetResult).toHaveAttribute("data-unread", "true");
  await page.getByRole("button", { name: "notifications" }).click();
  const bell = page.getByRole("dialog").filter({ hasText: "Notifications" });
  const bellResult = bell.locator('[data-inbox-entry^="turn:result-ready"]');
  await expect(bellResult).toHaveAttribute("data-unread", "true");
  await bellResult.getByRole("button", { name: "Mark read" }).click();
  await expect(fleetResult).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Keyboard only: focus the first row, then Down / Up move between rows and
  // A allows each request once; focus moves on after every answer.
  const triggerIds = await rows.evaluateAll((elements) =>
    elements.map((element) => element.querySelector("[data-inbox-trigger]")?.id ?? ""),
  );
  const focusedId = () => page.evaluate(() => document.activeElement?.id ?? "");
  await rows.first().locator("[data-inbox-trigger]").focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(focusedId).toBe(triggerIds[1]);
  await page.keyboard.press("ArrowUp");
  await expect.poll(focusedId).toBe(triggerIds[0]);
  for (let answered = 0; answered < 10; answered += 1) {
    await page.keyboard.press("a");
    await expect(rows).toHaveCount(9 - answered);
  }
  await expect(needs).toContainText("No action required");
  const sent = await page.evaluate(
    () => (window as unknown as { __fleetAnswers: unknown[] }).__fleetAnswers,
  );
  expect(sent).toHaveLength(10);
});
