import { expect, test, type Page } from "@playwright/test";

/**
 * The ways into a task's Review and side question that live outside the
 * Review surface itself, clicked in the real components: the turn's
 * changed-files card, Review's decisions that send work back to the agent, and
 * the pane header's Conversation/Review switch. Each case mounts the component on the dev
 * preview's own module instances, so the stores it changes are the app's.
 */
const MODULES = {
  react: "/node_modules/.vite/deps/react.js",
  client: "/node_modules/.vite/deps/react-dom_client.js",
  appStore: "/src/store/app.store.ts",
  reviewMode: "/src/store/task-review-mode-store.ts",
  agentRuns: "/src/store/agent-runs-store.ts",
  fixtures: "/src/dev/agent-run-preview/agent-run-fixtures.ts",
  fileBlocks: "/src/components/session/chat-panel-file-blocks.tsx",
  decisions: "/src/components/review/ReviewDecisions.tsx",
  reviewSurface: "/src/components/review/TaskReviewSurface.tsx",
  paneHeader: "/src/components/panes/PaneHeaderActions.tsx",
  ui: "/src/components/ui/index.ts",
};

async function openPreview(page: Page) {
  await page.goto("/?stavePreview=composer-frame&case=idle", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
}

/** The task's surface mode as the Review store holds it. */
async function surfaceEntry(page: Page, taskId: string) {
  return page.evaluate(async ({ modules, taskId }) => {
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    return useTaskReviewModeStore.getState().byTask[taskId] ?? null;
  }, { modules: MODULES, taskId });
}

test.beforeEach(async ({ page }) => {
  await openPreview(page);
});

test("the turn's changed-files card opens Review on that turn", async ({ page }) => {
  await page.evaluate(async (modules) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useAppStore } = await import(modules.appStore);
    const { ChangedFilesBlock } = await import(modules.fileBlocks);
    const taskId = "entry-card";
    const part = { type: "code_diff", filePath: "src/billing/BillingTable.tsx", oldContent: "a\n", newContent: "b\n", status: "accepted" };
    useAppStore.setState((state: { messagesByTask: Record<string, unknown[]> }) => ({
      messagesByTask: {
        ...state.messagesByTask,
        [taskId]: [{ id: "answer", role: "assistant", providerId: "claude-code", model: "model", content: "", parts: [part], turnId: "turn-7" }],
      },
    }));
    const host = document.createElement("div");
    host.id = "entry-card-host";
    document.body.append(host);
    createRoot(host).render(React.createElement(ChangedFilesBlock, { parts: [part], taskId, messageId: "answer", offerTurnReview: true }));
  }, MODULES);

  const card = page.locator("#entry-card-host");
  await expect(card.getByRole("button", { name: "Open in editor" })).toBeVisible();
  await card.getByRole("button", { name: "Review this turn's changes" }).click();
  expect(await surfaceEntry(page, "entry-card")).toEqual({
    mode: "review",
    scope: { kind: "turn", taskId: "entry-card", turnId: "turn-7" },
  });
});

test("sending comments to the agent returns the task to its conversation", async ({ page }) => {
  await page.evaluate(async (modules) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useAppStore } = await import(modules.appStore);
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    const { ReviewDecisions } = await import(modules.decisions);
    const window_ = window as unknown as { __sendOutcome: string };
    window_.__sendOutcome = "blocked";
    for (const taskId of ["entry-comments"]) {
      useTaskReviewModeStore.getState().openReview(taskId, { kind: "uncommitted" });
    }
    useAppStore.setState((state: { reviewCommentsByTask: Record<string, unknown[]> }) => ({
      reviewCommentsByTask: {
        ...state.reviewCommentsByTask,
        "entry-comments": [{ id: "comment-1", filePath: "src/a.ts", line: 1, side: "new", body: "Keep the header sticky.", createdAt: "2026-10-23T00:00:00.000Z" }],
      },
      submitReviewFeedback: async () => ({ status: window_.__sendOutcome }),
    }));
    const host = document.createElement("div");
    host.id = "entry-comments-host";
    document.body.append(host);
    createRoot(host).render(React.createElement(ReviewDecisions, {
      taskId: "entry-comments", workspaceId: "preview-workspace", scope: { kind: "uncommitted" },
      detail: undefined, read: [], data: null, latestTurnId: null,
    }));
  }, MODULES);

  const decisions = page.locator("#entry-comments-host");
  // A send the app refuses keeps Review, with the reason.
  await decisions.getByRole("button", { name: "Send comments" }).click();
  await expect(decisions.getByRole("alert")).toContainText("The comments were not sent.");
  expect((await surfaceEntry(page, "entry-comments"))?.mode).toBe("review");

  await page.evaluate(() => {
    (window as unknown as { __sendOutcome: string }).__sendOutcome = "sent";
  });
  await decisions.getByRole("button", { name: "Send comments" }).click();
  await expect.poll(async () => (await surfaceEntry(page, "entry-comments"))?.mode).toBe("conversation");
});

test("asking for changes on a stage returns the task to its conversation", async ({ page }) => {
  await page.evaluate(async (modules) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    const { useAgentRunsStore } = await import(modules.agentRuns);
    const { buildAgentRunFixtures } = await import(modules.fixtures);
    const { ReviewDecisions } = await import(modules.decisions);
    const detail = structuredClone(buildAgentRunFixtures(new Date("2026-10-22T09:00:00.000Z")).signOff);
    const reproduce = detail.stages.find((record: { stageId: string }) => record.stageId === "reproduce");
    reproduce.startHeadSha = "a".repeat(40);
    reproduce.endedAt = "2026-10-22T09:20:00.000Z";
    const scope = { kind: "stage", agentRunId: detail.agentRun.id, stageId: "reproduce", attempt: 1 };
    const calls: string[] = [];
    (window as unknown as { __runCalls: string[] }).__runCalls = calls;
    useAgentRunsStore.setState({
      runCommand: async (command: string) => {
        calls.push(command);
        return { ok: true };
      },
    });
    useTaskReviewModeStore.getState().openReview("entry-stage", scope);
    const host = document.createElement("div");
    host.id = "entry-stage-host";
    document.body.append(host);
    createRoot(host).render(React.createElement(ReviewDecisions, {
      taskId: "entry-stage", workspaceId: "preview-workspace", scope, detail, read: [], data: null, latestTurnId: null,
    }));
  }, MODULES);

  const decisions = page.locator("#entry-stage-host");
  await decisions.getByRole("button", { name: "Ask for changes" }).click();
  await decisions.getByRole("textbox").fill("Keep the header row sticky while it scrolls.");
  expect((await surfaceEntry(page, "entry-stage"))?.mode).toBe("review");
  await decisions.getByRole("button", { name: "Send and run again" }).click();
  await expect.poll(async () => (await surfaceEntry(page, "entry-stage"))?.mode).toBe("conversation");
  expect(await page.evaluate(() => (window as unknown as { __runCalls: string[] }).__runCalls)).toEqual(["requestChanges"]);
});

test("the pane header shows the task's mode switch and keeps side questions in the composer", async ({ page }) => {
  await page.evaluate(async (modules) => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const { default: React } = await import(moduleUrl("react"));
    const { default: { createRoot } } = await import(moduleUrl("react-dom_client"));
    const { useAppStore } = await import(modules.appStore);
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    const { PaneHeaderActions } = await import(modules.paneHeader);
    const task = (id: string, provider: string) => ({ id, title: id, provider, updatedAt: "2026-10-23T00:00:00.000Z", unread: false });
    useAppStore.setState((state: { tasks: unknown[] }) => ({
      tasks: [...state.tasks, task("entry-claude", "claude-code"), task("entry-cursor", "cursor")],
      messageCountByTask: { "entry-claude": 1, "entry-cursor": 1 },
    }));
    useTaskReviewModeStore.getState().openReview("entry-claude");
    const header = (id: string, panelId: string) => {
      const host = document.createElement("div");
      host.id = id;
      document.body.append(host);
      createRoot(host).render(React.createElement(PaneHeaderActions, {
        activePanel: { id: panelId }, group: { id: `${id}-group` }, panels: [], isGroupActive: false,
        api: {}, containerApi: {}, headerPosition: "top",
      }));
    };
    header("entry-header-claude", "task:entry-claude");
    header("entry-header-cursor", "task:entry-cursor");
    header("entry-header-terminal", "terminal:entry-terminal");
  }, MODULES);

  // Every task gets the switch, whatever its provider; a terminal tab gets none.
  const claude = page.locator("#entry-header-claude").getByTestId("pane-header-mode-switch");
  await expect(claude.getByRole("button", { name: /^Review/ })).toHaveAttribute("aria-pressed", "true");
  await expect(claude.getByRole("button", { name: "Conversation" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#entry-header-cursor").getByTestId("pane-header-mode-switch")).toBeVisible();
  await expect(page.locator("#entry-header-terminal").getByTestId("pane-header-mode-switch")).toHaveCount(0);
  await expect(page.locator("#entry-header-claude").getByTestId("pane-header-side-question")).toHaveCount(0);
  await expect(page.locator("#entry-header-cursor").getByTestId("pane-header-side-question")).toHaveCount(0);
  await expect(page.locator("#entry-header-terminal").getByTestId("pane-header-side-question")).toHaveCount(0);
});

test("the pane header switches Review, and Review's Conversation goes back to the composer", async ({ page }) => {
  await page.evaluate(async (modules) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useAppStore } = await import(modules.appStore);
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    const { PaneHeaderActions } = await import(modules.paneHeader);
    const { TaskReviewSurface } = await import(modules.reviewSurface);
    useAppStore.setState((state: { tasks: unknown[] }) => ({
      tasks: [...state.tasks, { id: "entry-toggle", title: "entry-toggle", provider: "kiro", updatedAt: "2026-10-23T00:00:00.000Z", unread: false }],
    }));
    const header = document.createElement("div");
    header.id = "entry-toggle-header";
    const surface = document.createElement("div");
    surface.id = "entry-toggle-surface";
    document.body.append(header, surface);
    createRoot(header).render(React.createElement(PaneHeaderActions, {
      activePanel: { id: "task:entry-toggle" }, group: { id: "entry-toggle-group" }, panels: [], isGroupActive: true,
      api: {}, containerApi: {}, headerPosition: "top",
    }));
    function Surface() {
      const mode = useTaskReviewModeStore((state: { byTask: Record<string, { mode: string } | undefined> }) => state.byTask["entry-toggle"]?.mode ?? "conversation");
      return mode === "review" ? React.createElement(TaskReviewSurface, { taskId: "entry-toggle" }) : null;
    }
    createRoot(surface).render(React.createElement(Surface));
  }, MODULES);

  // Review needs no side question support: a task on any provider gets the switch.
  const header = page.locator("#entry-toggle-header");
  await expect(header.getByRole("button", { name: "Side question" })).toHaveCount(0);
  const toggle = header.getByTestId("pane-header-mode-switch").getByRole("button", { name: /^Review/ });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const back = page.locator("#entry-toggle-surface").getByTestId("review-back-to-conversation");
  await expect(back).toBeVisible();

  const focusRequests = () => page.evaluate(async (modules) => {
    const { useAppStore } = await import(modules.appStore);
    return useAppStore.getState().promptFocusNonce as number;
  }, MODULES);
  const before = await focusRequests();
  await back.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect((await surfaceEntry(page, "entry-toggle"))?.mode).toBe("conversation");
  expect(await focusRequests()).toBe(before + 1);
});

test("signing off a stage from Review returns the task to its conversation and confirms it", async ({ page }) => {
  await page.evaluate(async (modules) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    const { useAgentRunsStore } = await import(modules.agentRuns);
    const { buildAgentRunFixtures } = await import(modules.fixtures);
    const { ReviewDecisions } = await import(modules.decisions);
    const { Toaster } = await import(modules.ui);
    const detail = structuredClone(buildAgentRunFixtures(new Date("2026-10-22T09:00:00.000Z")).signOff);
    const reproduce = detail.stages.find((record: { stageId: string }) => record.stageId === "reproduce");
    reproduce.startHeadSha = "a".repeat(40);
    reproduce.endedAt = "2026-10-22T09:20:00.000Z";
    const scope = { kind: "stage", agentRunId: detail.agentRun.id, stageId: "reproduce", attempt: 1 };
    const window_ = window as unknown as { __runCalls: string[]; __runOk: boolean };
    window_.__runCalls = [];
    window_.__runOk = false;
    useAgentRunsStore.setState({
      runCommand: async (command: string) => {
        window_.__runCalls.push(command);
        return { ok: window_.__runOk };
      },
    });
    useTaskReviewModeStore.getState().openReview("entry-sign-off", scope);
    const host = document.createElement("div");
    host.id = "entry-sign-off-host";
    document.body.append(host);
    createRoot(host).render(React.createElement(React.Fragment, null,
      React.createElement(Toaster),
      React.createElement(ReviewDecisions, {
        taskId: "entry-sign-off", workspaceId: "preview-workspace", scope, detail, read: [], data: null, latestTurnId: null,
      })));
  }, MODULES);

  const decisions = page.locator("#entry-sign-off-host");
  // A sign-off the run refuses keeps Review open.
  await decisions.getByRole("button", { name: "Sign off" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __runCalls: string[] }).__runCalls.length)).toBe(1);
  expect((await surfaceEntry(page, "entry-sign-off"))?.mode).toBe("review");

  await page.evaluate(() => {
    (window as unknown as { __runOk: boolean }).__runOk = true;
  });
  await decisions.getByRole("button", { name: "Sign off" }).click();
  await expect.poll(async () => (await surfaceEntry(page, "entry-sign-off"))?.mode).toBe("conversation");
  await expect(page.getByText("Signed off. The run continues.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __runCalls: string[] }).__runCalls)).toEqual(["signOff", "signOff"]);
});
