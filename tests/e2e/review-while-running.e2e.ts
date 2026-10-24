import { expect, test, type Page } from "@playwright/test";

/**
 * Review while its task keeps working, clicked in the real components: the
 * line that says the task runs or waits for you, the side question over
 * Review, and the editor's way back to Review. Each case mounts the component
 * on the dev preview's own module instances, so the stores it changes are the
 * app's.
 */
const MODULES = {
  react: "/node_modules/.vite/deps/react.js",
  client: "/node_modules/.vite/deps/react-dom_client.js",
  appStore: "/src/store/app.store.ts",
  reviewMode: "/src/store/task-review-mode-store.ts",
  sideChat: "/src/store/side-chat-store.ts",
  paneHost: "/src/components/panes/pane-host-controller.ts",
  reviewSurface: "/src/components/review/TaskReviewSurface.tsx",
  editorToolbar: "/src/components/panes/surfaces/editor-surface-toolbar.tsx",
  diffPane: "/src/components/review/ReviewDiffPane.tsx",
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

/** Mounts Review for `taskId` while its mode is review, the way the task surface does. */
async function mountReview(page: Page, taskId: string) {
  await page.evaluate(async ({ modules, taskId }) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useAppStore } = await import(modules.appStore);
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    const { TaskReviewSurface } = await import(modules.reviewSurface);
    useAppStore.setState((state: { tasks: unknown[] }) => ({
      tasks: [...state.tasks, { id: taskId, title: taskId, provider: "claude-code", updatedAt: "2026-10-23T00:00:00.000Z", unread: false }],
    }));
    useTaskReviewModeStore.getState().openReview(taskId);
    const host = document.createElement("div");
    host.id = `${taskId}-surface`;
    host.style.cssText = "position: fixed; inset: 0; display: flex; flex-direction: column;";
    document.body.append(host);
    function Surface() {
      const mode = useTaskReviewModeStore((state: { byTask: Record<string, { mode: string } | undefined> }) => state.byTask[taskId]?.mode ?? "conversation");
      return mode === "review" ? React.createElement(TaskReviewSurface, { taskId }) : null;
    }
    createRoot(host).render(React.createElement(Surface));
  }, { modules: MODULES, taskId });
  return page.locator(`#${taskId}-surface`);
}

async function setRun(page: Page, taskId: string, run: { running: boolean; pending?: "approval" | "user_input" }) {
  await page.evaluate(async ({ modules, taskId, run }) => {
    const { useAppStore } = await import(modules.appStore);
    useAppStore.setState((state: { activeTurnIdsByTask: Record<string, string>; providerTurnActivityByTask: Record<string, unknown> }) => ({
      activeTurnIdsByTask: { ...state.activeTurnIdsByTask, [taskId]: run.running ? "turn-live" : undefined },
      providerTurnActivityByTask: { ...state.providerTurnActivityByTask, [taskId]: { pendingInteraction: run.pending ?? null } },
    }));
  }, { modules: MODULES, taskId, run });
}

const focusRequests = (page: Page) => page.evaluate(async (modules) => {
  const { useAppStore } = await import(modules.appStore);
  return useAppStore.getState().promptFocusNonce as number;
}, MODULES);

test.beforeEach(async ({ page }) => {
  await openPreview(page);
});

test("Review says when its task runs or waits for you, and leads to the conversation to respond", async ({ page }) => {
  const surface = await mountReview(page, "running-review");
  const line = surface.getByTestId("review-task-status");
  await expect(surface.getByTestId("review-back-to-conversation")).toBeVisible();
  await expect(line).toHaveCount(0);

  await page.evaluate(async (modules) => {
    const { useAppStore } = await import(modules.appStore);
    (window as unknown as { stopped: string[] }).stopped = [];
    useAppStore.setState({ abortTaskTurn: ({ taskId }: { taskId: string }) => (window as unknown as { stopped: string[] }).stopped.push(taskId) });
  }, MODULES);
  await setRun(page, "running-review", { running: true });
  await expect(line).toHaveText(/This task is still running\./);
  await line.getByTestId("review-stop-turn").click();
  expect(await page.evaluate(() => (window as unknown as { stopped: string[] }).stopped)).toEqual(["running-review"]);

  // A request made while you review: Review stays, and the line turns to it.
  await setRun(page, "running-review", { running: true, pending: "approval" });
  await expect(line).toHaveAttribute("data-status", "approval");
  await expect(line).toHaveText(/This task is waiting for your approval\./);
  expect((await surfaceEntry(page, "running-review"))?.mode).toBe("review");
  const before = await focusRequests(page);
  await line.getByRole("button", { name: "Respond in conversation" }).click();
  expect((await surfaceEntry(page, "running-review"))?.mode).toBe("conversation");
  expect(await focusRequests(page)).toBe(before + 1);
});

test("a side question opens over Review, and Copy to composer goes to the conversation", async ({ page }) => {
  const surface = await mountReview(page, "aside-review");
  await page.evaluate(async (modules) => {
    const { useSideChatStore } = await import(modules.sideChat);
    useSideChatStore.getState().open("aside-review");
  }, MODULES);
  const panel = surface.getByTestId("side-chat");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Side question" })).toBeFocused();
  expect((await surfaceEntry(page, "aside-review"))?.mode).toBe("review");

  await page.evaluate(async (modules) => {
    const { useSideChatStore } = await import(modules.sideChat);
    useSideChatStore.setState((state: { threadByTask: Record<string, unknown> }) => ({
      threadByTask: {
        ...state.threadByTask,
        "aside-review": [{ id: "x", question: "Why the width?", providerId: "claude-code", status: "answered", answer: "The table overflowed." }],
      },
    }));
  }, MODULES);
  await panel.getByRole("button", { name: "Copy to composer" }).click();
  expect((await surfaceEntry(page, "aside-review"))?.mode).toBe("conversation");
  expect(await page.evaluate(async (modules) => {
    const { useAppStore } = await import(modules.appStore);
    return useAppStore.getState().promptDraftByTask["aside-review"]?.text as string;
  }, MODULES)).toContain("> The table overflowed.");
});

test("an editor diff opened from Review leads back to that task and scope", async ({ page }) => {
  await page.evaluate(async (modules) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useAppStore } = await import(modules.appStore);
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    const { registerPaneHostController } = await import(modules.paneHost);
    const { EditorSurfaceToolbar } = await import(modules.editorToolbar);
    const opened: unknown[] = [];
    (window as unknown as { opened: unknown[] }).opened = opened;
    registerPaneHostController({
      openSurface: (surface: unknown) => { opened.push(surface); return true; },
      closeSurface: () => {},
    } as never);
    useAppStore.setState((state: { tasks: unknown[] }) => ({
      tasks: [...state.tasks, { id: "origin-task", title: "origin-task", provider: "codex", updatedAt: "2026-10-23T00:00:00.000Z", unread: false }],
    }));
    useTaskReviewModeStore.getState().rememberEditorOrigin({
      workspaceId: useAppStore.getState().activeWorkspaceId, editorTabId: "scm-diff:src/billing.ts", taskId: "origin-task", scope: { kind: "branch" },
    });
    const noop = () => {};
    const toolbar = (id: string, tabId: string) => {
      const host = document.createElement("div");
      host.id = id;
      document.body.append(host);
      createRoot(host).render(React.createElement(EditorSurfaceToolbar, {
        tab: { id: tabId, filePath: "src/billing.ts", language: "typescript", content: "", originalContent: "a", isDirty: false },
        absolutePath: "/repo/src/billing.ts", tabIsImage: false, tabIsMarkdown: false, sendToAgentDisabled: true,
        diffMode: true, markdownPreviewMode: false, diffViewMode: "unified", showDiffDisplayControls: true,
        reviewCommentCount: 0, fileReviewCommentCount: 0, canAddReviewComment: false, canSubmitReviewFeedback: false,
        onSave: noop, onToggleDiffMode: noop, onToggleMarkdownPreviewMode: noop, onChangeDiffViewMode: noop,
        onAddReviewComment: noop, onSubmitReviewFeedback: noop, onSubmitFileReviewFeedback: noop, onSendToAgent: noop,
        onBulkClose: noop, onCopyPath: noop, onCopyRelativePath: noop, onCopyBreadcrumbsPath: noop,
      }));
    };
    toolbar("origin-from-review", "scm-diff:src/billing.ts");
    toolbar("origin-plain", "file:src/other.ts");
  }, MODULES);

  await expect(page.locator("#origin-plain").getByTestId("editor-back-to-review")).toHaveCount(0);
  await page.locator("#origin-from-review").getByRole("button", { name: "Back to Review" }).click();
  expect(await surfaceEntry(page, "origin-task")).toEqual({ mode: "review", scope: { kind: "branch" } });
  expect(await page.evaluate(() => (window as unknown as { opened: unknown[] }).opened)).toEqual([{ kind: "task", taskId: "origin-task" }]);

  // The Changes panel opening the same diff takes the tab: it no longer leads to Review.
  await page.evaluate(async (modules) => {
    const { useAppStore } = await import(modules.appStore);
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    useTaskReviewModeStore.getState().forgetEditorOrigin({ workspaceId: useAppStore.getState().activeWorkspaceId, editorTabId: "scm-diff:src/billing.ts" });
  }, MODULES);
  await expect(page.locator("#origin-from-review").getByTestId("editor-back-to-review")).toHaveCount(0);
});

test("Comment in editor brings the editor forward every time, and remembers the way back", async ({ page }) => {
  await page.evaluate(async (modules) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useAppStore } = await import(modules.appStore);
    const { registerPaneHostController } = await import(modules.paneHost);
    const { ReviewDiffPane } = await import(modules.diffPane);
    const record = window as unknown as { opened: unknown[]; diffs: string[] };
    record.opened = [];
    record.diffs = [];
    registerPaneHostController({
      openSurface: (surface: unknown) => { record.opened.push(surface); return true; },
      closeSurface: () => {},
    } as never);
    // The editor's own open: the tab is already the active one the second time, so it selects nothing new.
    useAppStore.setState({ openDiffInEditor: async ({ editorTabId }: { editorTabId: string }) => { record.diffs.push(editorTabId); } });
    const file = { path: "src/billing.ts", status: "M", additions: 1, deletions: 1 };
    const data = { files: [file], contents: new Map([["src/billing.ts", { oldContent: "a\n", newContent: "b\n" }]]), limits: [], baseSha: null, headSha: null, baseRef: null };
    const host = document.createElement("div");
    host.id = "comment-host";
    document.body.append(host);
    createRoot(host).render(React.createElement(ReviewDiffPane, {
      taskId: "comment-task", workspaceId: useAppStore.getState().activeWorkspaceId,
      scope: { kind: "turn", taskId: "comment-task", turnId: "turn-3" }, cwd: null, data, file,
    }));
  }, MODULES);

  const comment = page.locator("#comment-host").getByRole("button", { name: "Comment in editor" });
  await comment.click();
  await comment.click();
  const tabId = "chat-diff:review:turn-3:src/billing.ts";
  await expect.poll(() => page.evaluate(() => (window as unknown as { opened: unknown[] }).opened.length)).toBe(2);
  expect(await page.evaluate(() => (window as unknown as { opened: unknown[] }).opened)).toEqual([
    { kind: "editor", editorTabId: tabId },
    { kind: "editor", editorTabId: tabId },
  ]);
  expect(await page.evaluate(async ({ modules, tabId }) => {
    const { useAppStore } = await import(modules.appStore);
    const { editorOriginKey, useTaskReviewModeStore } = await import(modules.reviewMode);
    return useTaskReviewModeStore.getState().originByEditorTab[editorOriginKey(useAppStore.getState().activeWorkspaceId, tabId)];
  }, { modules: MODULES, tabId })).toEqual({ taskId: "comment-task", scope: { kind: "turn", taskId: "comment-task", turnId: "turn-3" } });

  // Switching workspaces while the editor reads the file: nothing opens in the other workspace.
  await page.evaluate(async (modules) => {
    const { useAppStore } = await import(modules.appStore);
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    useTaskReviewModeStore.setState({ originByEditorTab: {} });
    useAppStore.setState({
      openDiffInEditor: async ({ isStale }: { isStale?: () => boolean }) => {
        useAppStore.setState({ activeWorkspaceId: "another-workspace" });
        (window as unknown as { staleSeen: boolean }).staleSeen = Boolean(isStale?.());
      },
    });
  }, MODULES);
  await comment.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { staleSeen?: boolean }).staleSeen)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { opened: unknown[] }).opened.length)).toBe(2);
  expect(await page.evaluate(async (modules) => {
    const { useTaskReviewModeStore } = await import(modules.reviewMode);
    return Object.keys(useTaskReviewModeStore.getState().originByEditorTab).length;
  }, MODULES)).toBe(0);
});
