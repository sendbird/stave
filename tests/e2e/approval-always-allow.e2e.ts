import { expect, test, type Page } from "@playwright/test";

/**
 * "Always allow" follows one rule on every approval surface: it shows
 * wherever the runtime honors the grant, and Stave keeps the grant as a
 * trusted approval the answered card can remove again. The approval card
 * answers Cmd/Ctrl+Enter as Allow once only while focus is inside it.
 */
type SeededApproval = {
  requestId: string;
  description: string;
  input: string;
  trustedToolEntry?: string;
};

const KEYS_A: SeededApproval = {
  requestId: "approval-keys",
  description: "Run the focused tests",
  input: "bun test tests/fleet",
  trustedToolEntry: "bash:bun test tests/fleet",
};
const KEYS_B: SeededApproval = {
  requestId: "approval-other",
  description: "List the build output",
  input: "ls dist",
  trustedToolEntry: "bash:ls dist",
};
const ALWAYS: SeededApproval = {
  requestId: "approval-always",
  description: "Run the type check",
  input: "bun run typecheck",
  trustedToolEntry: "bash:bun run typecheck",
};
const PLAIN: SeededApproval = {
  requestId: "approval-plain",
  description: "Send the input",
  input: "y",
};

async function installApi(page: Page, repositoryPath: string) {
  await page.addInitScript((path) => {
    const workspace = { id: "ws-always", name: "always", updatedAt: "2026-11-03T01:00:00.000Z" };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([{ ...workspace, snapshot: { activeTaskId: "", tasks: [], messagesByTask: {} } }]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath: path,
          repositoryName: "stave-always",
          workspaces: [workspace],
          activeWorkspaceId: workspace.id,
          workspaceBranchById: { [workspace.id]: "main" },
          workspacePathById: { [workspace.id]: path },
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
      terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
      sourceControl: {
        getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
    };
  }, repositoryPath);
}

async function seedApprovals(page: Page, approvals: SeededApproval[]) {
  await installApi(page, "/tmp/stave-always");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(async (seeded) => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState((state) => ({
      workspaces: [{ id: "ws-always", name: "always", updatedAt: "2026-11-03T01:00:00.000Z" }],
      settings: { ...state.settings, trustedTools: [] },
      tasks: [{
        id: "task-always", title: "Always allow", provider: "codex",
        updatedAt: "2026-11-03T01:00:00.000Z", unread: false, archivedAt: null,
      }],
      activeTaskId: "task-always",
      openTaskTabIds: ["task-always"],
      messagesByTask: {
        "task-always": [{
          id: "m-always", role: "assistant", model: "gpt-5.5", providerId: "codex", content: "",
          turnId: "turn-always",
          parts: seeded.map((entry) => ({
            type: "approval" as const,
            requestId: entry.requestId,
            toolName: "bash",
            description: entry.description,
            input: entry.input,
            ...(entry.trustedToolEntry ? { supportsAllowAlways: true, trustedToolEntry: entry.trustedToolEntry } : {}),
            state: "approval-requested" as const,
          })),
        }],
      },
      activeTurnIdsByTask: { "task-always": "turn-always" },
      taskWorkspaceIdById: { "task-always": "ws-always" },
    }) as never);
  }, approvals);
}

/** The reply's steps are folded under its summary line; open them to reach the cards. */
async function openReplySteps(page: Page) {
  const summary = page.getByRole("button", { name: /Finished/ }).first();
  await expect(summary).toBeVisible();
  if ((await summary.getAttribute("aria-expanded")) !== "true") {
    await summary.click();
  }
}

const answers = (page: Page) =>
  page.evaluate(() => (window as unknown as { __approvalAnswers: Array<Record<string, unknown>> }).__approvalAnswers);
const trustedTools = (page: Page) =>
  page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    return useAppStore.getState().settings.trustedTools;
  });
/** The approval card in the conversation (the composer row is a `div`). */
const transcriptCard = (page: Page, requestId: string) =>
  page.locator(`section[data-approval-request-id="${requestId}"]`);

test("Cmd/Ctrl+Enter allows only the request whose card holds focus, and Esc never denies", async ({ page }) => {
  await seedApprovals(page, [KEYS_A, KEYS_B]);
  await openReplySteps(page);
  const cardA = transcriptCard(page, KEYS_A.requestId);
  const cardB = transcriptCard(page, KEYS_B.requestId);
  await expect(cardA).toBeVisible();
  await expect(cardB).toBeVisible();
  // The hint is on Allow once, with the shortcut named for assistive technology.
  await expect(cardA.getByRole("button", { name: /Allow once/ })).toHaveAttribute(
    "aria-keyshortcuts",
    /^(Meta|Control)\+Enter$/,
  );

  // Outside every card the key answers nothing: with focus on the page, and
  // with focus on a control outside the cards.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.getByRole("button", { name: "Show details" }).focus();
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.waitForTimeout(300);
  expect(await answers(page)).toEqual([]);

  // With focus on card A's Deny button, the shortcut still means Allow once,
  // and only for card A.
  await cardA.getByRole("button", { name: "Deny" }).focus();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect.poll(() => answers(page)).toEqual([
    { turnId: "turn-always", requestId: KEYS_A.requestId, approved: true },
  ]);
  await expect(cardB.getByRole("button", { name: /Allow once/ })).toBeEnabled();

  // Escape inside a card is never a denial.
  await cardB.getByRole("button", { name: "Deny" }).focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  expect((await answers(page)).filter((answer) => answer.requestId === KEYS_B.requestId)).toEqual([]);
});

test("Always allow on the composer row keeps a trusted approval the answered card removes", async ({ page }) => {
  await seedApprovals(page, [ALWAYS]);
  const queue = page.getByRole("region", { name: "Approval queue" });
  // A button beside Allow once, with the row's details still folded.
  const always = queue.getByRole("button", { name: "Always allow" });
  await expect(always).toBeVisible();
  await expect(queue.getByRole("button", { name: "Show details" })).toHaveAttribute("aria-expanded", "false");
  // The card in the conversation offers the same choice.
  await openReplySteps(page);
  await expect(transcriptCard(page, ALWAYS.requestId).getByRole("button", { name: "Always allow" })).toBeVisible();

  await always.click();
  await expect.poll(() => answers(page)).toEqual([
    { turnId: "turn-always", requestId: ALWAYS.requestId, approved: true, scope: "always" },
  ]);
  await expect.poll(() => trustedTools(page)).toEqual(["bash:bun run typecheck"]);

  const card = transcriptCard(page, ALWAYS.requestId);
  await expect(card).toContainText("Always allowed");
  await expect(card).toContainText("Trusted: Bash: bun run typecheck");
  await card.getByRole("button", { name: "Remove Bash: bun run typecheck from trusted approvals" }).click();
  await expect.poll(() => trustedTools(page)).toEqual([]);
  const removed = card.getByRole("status").filter({ hasText: "Removed from trusted approvals" });
  await expect(removed).toBeVisible();
  await expect(removed).toBeFocused();
});

test("a request whose grant nobody keeps offers no Always allow on the row or the card", async ({ page }) => {
  await seedApprovals(page, [PLAIN]);
  const queue = page.getByRole("region", { name: "Approval queue" });
  await expect(queue.locator(`[data-approval-request-id="${PLAIN.requestId}"]`)).toBeVisible();
  await expect(queue.getByRole("button", { name: "Always allow" })).toHaveCount(0);
  await queue.getByRole("button", { name: "Show details" }).click();
  await expect(queue).not.toContainText(/always allow/i);
  await openReplySteps(page);
  await expect(transcriptCard(page, PLAIN.requestId)).toBeVisible();
  await expect(transcriptCard(page, PLAIN.requestId).getByRole("button", { name: "Always allow" })).toHaveCount(0);
});

test("a subagent's request names it on the card and in the row's details, beside the risk", async ({ page }) => {
  await seedApprovals(page, [PLAIN]);
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState((state) => {
      const [message] = state.messagesByTask["task-always"] ?? [];
      return {
        messagesByTask: {
          "task-always": [{
            ...message!,
            parts: [
              {
                type: "tool_use", toolUseId: "spawn-explore", toolName: "Agent", agentId: "agent-explore",
                input: JSON.stringify({ subagent_type: "Explore", description: "Map the settings" }),
                state: "output-available", output: "done",
              },
              ...message!.parts.map((part) =>
                part.type === "approval" ? { ...part, ownerAgentId: "agent-explore", risk: "network-access" } : part),
            ],
          }],
        },
      } as never;
    });
  });
  const queue = page.getByRole("region", { name: "Approval queue" });
  await expect(queue.locator("[data-approval-risk]")).toHaveText("Network access");
  await queue.getByRole("button", { name: "Show details" }).click();
  await expect(queue.locator("[data-approval-requester]")).toHaveText("· requested by Explore");
  await page.getByRole("button", { name: /Ran 1 agent|Finished/ }).first().click();
  const card = transcriptCard(page, PLAIN.requestId);
  await expect(card).toContainText(/bash\s*· requested by Explore/);
  await expect(card).toContainText(/Network access\s*·\s*Needs your approval/);
});

async function seedFleet(page: Page, args: { managed: boolean }) {
  await page.addInitScript((managed) => {
    const repositoryPath = "/tmp/stave-fleet-always";
    const workspaceId = "ws-fleet-always";
    const taskId = "task-fleet-always";
    const snapshot = {
      activeTaskId: taskId,
      openTaskTabIds: [taskId],
      activeSurface: { kind: "task", taskId },
      tasks: [{
        id: taskId, title: "Fleet always", provider: "codex", updatedAt: "2026-11-03T01:00:00.000Z",
        unread: false, archivedAt: null,
        // A delegated child: managed through its host, and still shown in
        // Fleet because only the parent's owner can answer it.
        ...(managed ? { controlMode: "managed", controlOwner: "external", parentTaskId: "task-fleet-parent" } : {}),
      }],
      messagesByTask: {
        [taskId]: [{
          id: "message-fleet-approval", role: "assistant", model: "gpt-5.5", providerId: "codex", content: "",
          turnId: "turn-fleet-always", startedAt: "2026-11-03T01:09:00.000Z",
          parts: [{
            type: "approval", toolName: "bash", description: "Run the focused tests",
            input: "bun test tests/fleet", requestId: "approval-fleet",
            supportsAllowAlways: true, trustedToolEntry: "bash:bun test tests/fleet",
            state: "approval-requested",
          }],
        }],
      },
      activeTurnIdsByTask: { [taskId]: "turn-fleet-always" },
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([{ id: workspaceId, name: "fleet-always", updatedAt: "2026-11-03T01:00:00.000Z", snapshot }]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-fleet-always",
          workspaces: [{ id: workspaceId, name: "fleet-always", updatedAt: "2026-11-03T01:00:00.000Z" }],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: { [workspaceId]: "main" },
          workspacePathById: { [workspaceId]: repositoryPath },
          workspaceDefaultById: { [workspaceId]: true },
          ...snapshot,
        },
        version: 0,
      }),
    );
    window.localStorage.setItem(
      "stave:notifications-fallback:v1",
      JSON.stringify([{
        id: "notification-fleet-always", kind: "task.approval_requested", title: "Fleet always",
        body: "bash: Run the focused tests", repositoryPath, repositoryName: "stave-fleet-always",
        workspaceId, workspaceName: "fleet-always", taskId, taskTitle: "Fleet always", turnId: "turn-fleet-always",
        providerId: "codex",
        action: { type: "approval", requestId: "approval-fleet", messageId: "message-fleet-approval" },
        payload: {}, createdAt: "2026-11-03T01:10:00.000Z", readAt: null, resolvedAt: null, expiresAt: null,
      }]),
    );
    const sent: Array<Record<string, unknown>> = [];
    (window as unknown as { __approvalAnswers: typeof sent }).__approvalAnswers = sent;
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        respondApproval: async (request: Record<string, unknown>) => {
          sent.push(request);
          return { ok: true };
        },
      },
      terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
      sourceControl: {
        getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
    };
  }, args.managed);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // The snapshot's turn is cold on load; mark it live, as the runtime would.
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const turnStatus = await import("/src/lib/providers/turn-status.ts");
    const state = useAppStore.getState();
    useAppStore.setState({
      activeTurnIdsByTask: { ...state.activeTurnIdsByTask, "task-fleet-always": "turn-fleet-always" },
      providerTurnActivityByTask: turnStatus.startProviderTurnActivity({
        activityByTask: state.providerTurnActivityByTask,
        taskId: "task-fleet-always",
        turnId: "turn-fleet-always",
        providerId: "codex",
        pendingInteraction: "approval",
        now: Date.now() - 12_000,
      }),
    });
  });
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  const needs = page.getByRole("region", { name: "Action required" });
  const row = needs.locator('[data-inbox-entry^="interaction:approval"]');
  await expect(row).toHaveCount(1);
  await row.locator("[data-inbox-trigger]").click();
  const panelCard = row.locator('section[data-approval-request-id="approval-fleet"]');
  await expect(panelCard).toBeVisible();
  return panelCard;
}

test("the Fleet panel offers Always allow by the same rule and answers its focused card's shortcut", async ({ page }) => {
  const card = await seedFleet(page, { managed: false });
  await expect(card.getByRole("button", { name: "Always allow" })).toBeVisible();
  await card.getByRole("button", { name: "Deny" }).focus();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect.poll(() => answers(page)).toEqual([
    expect.objectContaining({ requestId: "approval-fleet", approved: true }),
  ]);
  expect((await answers(page))[0]?.scope).toBeUndefined();
});

test("the Fleet panel of a task answered through its host does not offer Always allow", async ({ page }) => {
  const card = await seedFleet(page, { managed: true });
  await expect(card.getByRole("button", { name: /Allow once/ })).toBeVisible();
  await expect(card.getByRole("button", { name: "Always allow" })).toHaveCount(0);
});
