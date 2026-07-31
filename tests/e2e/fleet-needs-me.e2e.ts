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

  const needs = page.getByRole("region", { name: "Needs me" });
  await expect(needs).toContainText("2 actionable items");
  const items = needs.getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Approve deployment");
  await expect(items.nth(1)).toContainText("Review summary");
  await expect(
    items.nth(0).getByRole("button", { name: "Dismiss" }),
  ).toBeVisible();
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
    path: testInfo.outputPath("fleet-needs-me.png"),
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
  await expect(
    controls.getByRole("button", { name: "Approve" }),
  ).toBeVisible();
  await expect(
    controls.getByRole("button", { name: "Reject" }),
  ).toBeVisible();
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

  await items.nth(1).getByRole("button", { name: "Mark reviewed" }).click();
  await expect(needs).toContainText("1 actionable item");
  await expect(needs).toContainText("Fleet fixture");
  await expect(needs).not.toContainText("Review summary");
});
