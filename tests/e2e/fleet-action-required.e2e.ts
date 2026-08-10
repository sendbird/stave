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
    const projectPath = "/tmp/stave-fleet-needs";
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
          projectPath,
          projectName: "stave-fleet-needs",
          workspaces: [
            {
              id: workspaceId,
              name: "fleet-needs",
              updatedAt: "2026-07-26T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: { [workspaceId]: "main" },
          workspacePathById: { [workspaceId]: projectPath },
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
          projectPath,
          projectName: "stave-fleet-needs",
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
          projectPath,
          projectName: "stave-fleet-needs",
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
    .getByRole("button", { name: "open-fleet-view" })
    .click();

  const needs = page.getByRole("region", { name: "Action required" });
  // The rail is layout-level, so it stays mounted regardless of board filter.
  await expect(needs).toBeVisible();
  // Blocking needs lead; a completed-turn result is only "worth a look" and
  // stays folded so it cannot crowd out the item an agent is stalled on.
  const items = needs.getByRole("listitem");
  await expect(items).toHaveCount(1);
  await expect(items.nth(0)).toContainText("Approve deployment");
  await expect(
    items.nth(0).getByRole("button", { name: "Dismiss" }),
  ).toBeVisible();

  const reviewToggle = needs.getByRole("button", { name: /Worth a look/ });
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
  await expect(controls.getByRole("button", { name: "Approve" })).toHaveCount(
    0,
  );
  await expect(controls.getByRole("button", { name: "Reject" })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("fleet-action-required.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(controls).toBeHidden();
  await expect(approvalTrigger).toBeFocused();

  await page.evaluate(async () => {
    const storeModule = await import("/src/store/app.store.ts");
    const store = storeModule.useAppStore;
    const state = store.getState();
    const taskId = "task-fleet-needs";
    const turnId = "turn-approval";
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
          pendingInteraction: "approval",
          workItemsById: {},
          orderedWorkItemIds: [],
        },
      },
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
  await expect(controls.getByRole("button", { name: "Approve" })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Reject" })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Stop" })).toBeVisible();
  const approvalButton = controls.getByRole("button", { name: "Approve" });
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
  // "Worth a look" group disappears with its last member.
  await reviewToggle.click();
  await items.nth(0).getByRole("button", { name: "Mark reviewed" }).click();
  await expect(items).toHaveCount(0);
  await expect(needs).not.toContainText("Review summary");
  await expect(reviewToggle).toHaveCount(0);
  await expect(needs).toContainText("Nothing blocked");
});
