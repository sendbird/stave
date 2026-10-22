import { expect, test, type Page } from "@playwright/test";

/**
 * One assistant message can hold several approvals. Every way of answering
 * from the composer must answer the request on the card that was used, never
 * whichever request happens to be the message's latest.
 */
async function seedTwoApprovals(page: Page) {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/stave-composer-approvals";
    const workspace = {
      id: "ws-approvals",
      name: "approvals",
      updatedAt: "2026-10-22T01:00:00.000Z",
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        { ...workspace, snapshot: { activeTaskId: "", tasks: [], messagesByTask: {} } },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-composer-approvals",
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
    const sent: Array<Record<string, unknown>> = [];
    (window as unknown as { __approvalAnswers: typeof sent }).__approvalAnswers = sent;
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        respondApproval: async (args: Record<string, unknown>) => {
          sent.push(args);
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
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const approval = (requestId: string, description: string, input: string) => ({
      type: "approval" as const,
      requestId,
      toolName: "Bash",
      description,
      input,
      state: "approval-requested" as const,
    });
    useAppStore.setState({
      workspaces: [
        { id: "ws-approvals", name: "approvals", updatedAt: "2026-10-22T01:00:00.000Z" },
      ],
      tasks: [
        {
          id: "task-approvals",
          title: "Two approvals",
          provider: "codex",
          updatedAt: "2026-10-22T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-approvals",
      openTaskTabIds: ["task-approvals"],
      messagesByTask: {
        "task-approvals": [
          {
            id: "m-two-approvals",
            role: "assistant",
            model: "gpt-5.5",
            providerId: "codex",
            content: "",
            turnId: "turn-two-approvals",
            parts: [
              approval("approval-a", "Read the environment file", "cat .env"),
              approval("approval-b", "Run the focused tests", "bun test tests/fleet"),
            ],
          },
        ],
      },
      activeTurnIdsByTask: { "task-approvals": "turn-two-approvals" },
      taskWorkspaceIdById: { "task-approvals": "ws-approvals" },
    } as never);
  });
}

const answers = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __approvalAnswers: Array<Record<string, unknown>> })
        .__approvalAnswers,
  );

test("a queued approval answers its own request, not the message's latest", async ({ page }) => {
  await seedTwoApprovals(page);
  const queue = page.getByRole("region", { name: "Approval queue" });
  // The latest request leads; the other one waits folded below it.
  await expect(queue.locator('[data-approval-request-id="approval-b"]').first()).toBeVisible();
  await queue.getByText("+1 more queued").click();
  const queued = queue.locator('[data-approval-request-id="approval-a"]');
  await expect(queued).toContainText("Read the environment file");
  await queued.getByRole("button", { name: "Allow once" }).click();

  await expect.poll(() => answers(page)).toEqual([
    expect.objectContaining({ requestId: "approval-a", approved: true }),
  ]);
  // The request that was not chosen is still waiting.
  await expect(queue.locator('[data-approval-request-id="approval-b"]')).toBeVisible();
});

test("Enter allows the request on the leading card", async ({ page }) => {
  await seedTwoApprovals(page);
  const queue = page.getByRole("region", { name: "Approval queue" });
  await expect(queue.locator('[data-approval-request-id="approval-b"]').first()).toBeVisible();
  await page.locator("body").click({ position: { x: 900, y: 400 } });
  await page.keyboard.press("Enter");
  await expect.poll(() => answers(page)).toEqual([
    expect.objectContaining({ requestId: "approval-b", approved: true }),
  ]);
});
