import { expect, test } from "@playwright/test";

/**
 * The notification bell answers an approval with Fleet's words and keys:
 * "A Allow" / "D Deny" with key hints, and A on a focused row allows once.
 */
test("the bell's approval row shows Fleet's Allow and Deny and answers to A", async ({ page }) => {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/stave-bell-approval";
    const workspace = { id: "ws-bell", name: "deploy", updatedAt: "2026-10-22T01:00:00.000Z" };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([{ ...workspace, snapshot: { activeTaskId: "", tasks: [], messagesByTask: {} } }]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-bell-approval",
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
    window.localStorage.setItem(
      "stave:notifications-fallback:v1",
      JSON.stringify([
        {
          id: "notification-approval",
          kind: "task.approval_requested",
          title: "Ship the release",
          body: "Bash: Publish the release build",
          repositoryPath,
          repositoryName: "stave-bell-approval",
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          taskId: "task-ship",
          taskTitle: "Ship the release",
          turnId: "turn-ship",
          providerId: "codex",
          action: { type: "approval", requestId: "approval-ship", messageId: "message-ship" },
          payload: {},
          createdAt: "2026-10-22T00:50:00.000Z",
          readAt: null,
          resolvedAt: null,
          expiresAt: null,
        },
      ]),
    );
    const sent: unknown[] = [];
    (window as unknown as { __bellAnswers: unknown[] }).__bellAnswers = sent;
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
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState({
      tasks: [
        {
          id: "task-ship",
          title: "Ship the release",
          provider: "codex" as const,
          updatedAt: "2026-10-22T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-ship",
      messagesByTask: {
        "task-ship": [
          {
            id: "message-ship",
            role: "assistant" as const,
            model: "gpt-5.5",
            providerId: "codex" as const,
            content: "",
            turnId: "turn-ship",
            parts: [
              {
                type: "approval" as const,
                requestId: "approval-ship",
                toolName: "Bash",
                description: "Publish the release build",
                state: "approval-requested" as const,
              },
            ],
          },
        ],
      },
      activeTurnIdsByTask: { "task-ship": "turn-ship" },
    } as never);
  });

  await page.getByRole("button", { name: "notifications" }).click();
  const bell = page.getByRole("dialog").filter({ hasText: "Notifications" });
  const row = bell.locator("li", { hasText: "Ship the release" }).filter({ has: page.locator("kbd") });
  await expect(row).toHaveCount(1);
  const allow = row.getByRole("button", { name: "Allow the request in Ship the release once" });
  const deny = row.getByRole("button", { name: "Deny the request in Ship the release" });
  await expect(allow).toHaveAttribute("aria-keyshortcuts", "A");
  await expect(deny).toHaveAttribute("aria-keyshortcuts", "D");
  await expect(allow).toHaveText("AAllow");
  await expect(deny).toHaveText("DDeny");
  await expect(bell.getByText("Allow once", { exact: true })).toHaveCount(0);

  const trigger = row.locator("[data-inbox-trigger]");
  await expect(trigger).toHaveAttribute("aria-keyshortcuts", "A D");
  await trigger.focus();
  await page.keyboard.press("a");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __bellAnswers: unknown[] }).__bellAnswers.length))
    .toBe(1);
  const [answer] = await page.evaluate(() => (window as unknown as { __bellAnswers: unknown[] }).__bellAnswers);
  expect(answer).toMatchObject({ requestId: "approval-ship", approved: true });
});
