import { expect, test, type Page } from "@playwright/test";

type CliSessionHarnessOptions = {
  slowResizeMs?: number;
};

type CliSessionCounts = {
  create: number;
  attach: number;
  resume: number;
};

async function installCliSessionHarness(
  page: Page,
  options: CliSessionHarnessOptions = {},
) {
  await page.addInitScript((args: CliSessionHarnessOptions) => {
    const outputListeners = new Set<
      (payload: { sessionId: string; output: string }) => void
    >();
    const sessions = new Map<
      string,
      {
        screenState: string;
        backlog: string;
        activeAttachmentId: string | null;
        streamReady: boolean;
      }
    >();
    let nextAttachmentId = 1;
    const testState = {
      createCliSessionCallCount: 0,
      attachSessionCallCount: 0,
      resumeSessionStreamCallCount: 0,
      resizeSessionCallCount: 0,
      deliveredOutputLog: [] as string[],
      resizeCalls: [] as Array<{ cols: number; rows: number }>,
      getSessionState: (sessionId: string) => {
        const session = sessions.get(sessionId);
        return session
          ? {
              activeAttachmentId: session.activeAttachmentId,
              streamReady: session.streamReady,
              backlog: session.backlog,
            }
          : null;
      },
      getResizeState: () => ({
        count: testState.resizeSessionCallCount,
        lastResize:
          testState.resizeCalls.length > 0
            ? testState.resizeCalls[testState.resizeCalls.length - 1]
            : null,
      }),
      emitOutput: (sessionId: string, output: string) => {
        const session = sessions.get(sessionId);
        if (!session || !output) {
          return;
        }
        session.screenState += output;
        if (session.activeAttachmentId && session.streamReady) {
          for (const listener of outputListeners) {
            listener({ sessionId, output });
          }
          return;
        }
        session.backlog += output;
      },
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-04-10T01:00:00.000Z",
          snapshot: {
            activeTaskId: "task-1",
            tasks: [
              {
                id: "task-1",
                title: "Task 1",
                provider: "claude-code",
                updatedAt: "2026-04-10T01:00:00.000Z",
                unread: false,
                archivedAt: null,
              },
            ],
            messagesByTask: { "task-1": [] },
            cliSessionTabs: [],
            activeCliSessionTabId: null,
            activeSurface: { kind: "task", taskId: "task-1" },
          },
        },
        {
          id: "ws-feature",
          name: "feature",
          updatedAt: "2026-04-10T00:30:00.000Z",
          snapshot: {
            activeTaskId: "task-2",
            tasks: [
              {
                id: "task-2",
                title: "Feature Task",
                provider: "codex",
                updatedAt: "2026-04-10T00:30:00.000Z",
                unread: false,
                archivedAt: null,
              },
            ],
            messagesByTask: { "task-2": [] },
            cliSessionTabs: [],
            activeCliSessionTabId: null,
            activeSurface: { kind: "task", taskId: "task-2" },
          },
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
              id: "ws-main",
              name: "main",
              updatedAt: "2026-04-10T01:00:00.000Z",
            },
            {
              id: "ws-feature",
              name: "feature",
              updatedAt: "2026-04-10T00:30:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: {
            "ws-main": "main",
            "ws-feature": "feature",
          },
          workspacePathById: {
            "ws-main": "/tmp/stave-project",
            "ws-feature": "/tmp/stave-project/.stave/workspaces/feature",
          },
          workspaceDefaultById: {
            "ws-main": true,
            "ws-feature": false,
          },
          activeTaskId: "task-1",
          tasks: [
            {
              id: "task-1",
              title: "Task 1",
              provider: "claude-code",
              updatedAt: "2026-04-10T01:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: { "task-1": [] },
          cliSessionTabs: [],
          activeCliSessionTabId: null,
          activeSurface: { kind: "task", taskId: "task-1" },
        },
        version: 0,
      }),
    );

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
      },
      terminal: {
        createCliSession: async () => {
          testState.createCliSessionCallCount += 1;
          const sessionId = "cli-session-1";
          if (!sessions.has(sessionId)) {
            sessions.set(sessionId, {
              screenState: "cli ready\r\n",
              backlog: "",
              activeAttachmentId: null,
              streamReady: false,
            });
          }
          return { ok: true, sessionId };
        },
        attachSession: async (attachArgs: { sessionId: string }) => {
          testState.attachSessionCallCount += 1;
          const session = sessions.get(attachArgs.sessionId);
          if (!session) {
            return { ok: false, stderr: "missing session" };
          }
          const attachmentId = `attach-${nextAttachmentId++}`;
          session.activeAttachmentId = attachmentId;
          session.streamReady = false;
          const backlog = session.backlog;
          session.backlog = "";
          return {
            ok: true,
            attachmentId,
            screenState: session.screenState,
            backlog,
          };
        },
        detachSession: async (detachArgs: {
          sessionId: string;
          attachmentId?: string;
        }) => {
          const session = sessions.get(detachArgs.sessionId);
          if (!session) {
            return { ok: false, stderr: "missing session" };
          }
          const capturedAttachmentId = session.activeAttachmentId;
          if (
            detachArgs.attachmentId &&
            capturedAttachmentId !== detachArgs.attachmentId
          ) {
            return { ok: true };
          }
          await new Promise((resolve) => window.setTimeout(resolve, 75));
          if (session.activeAttachmentId === capturedAttachmentId) {
            session.activeAttachmentId = null;
            session.streamReady = false;
          }
          return { ok: true };
        },
        resumeSessionStream: async (resumeArgs: {
          sessionId: string;
          attachmentId: string;
        }) => {
          testState.resumeSessionStreamCallCount += 1;
          const session = sessions.get(resumeArgs.sessionId);
          if (!session) {
            return { ok: false, stderr: "missing session" };
          }
          if (session.activeAttachmentId === resumeArgs.attachmentId) {
            session.streamReady = true;
            if (session.backlog) {
              const output = session.backlog;
              session.backlog = "";
              for (const listener of outputListeners) {
                listener({
                  sessionId: resumeArgs.sessionId,
                  output,
                });
              }
            }
          }
          return { ok: true };
        },
        getSlotState: async (_slotArgs: { slotKey: string }) => {
          const sessionId = "cli-session-1";
          const session = sessions.get(sessionId);
          if (!session) {
            return { state: "idle" as const };
          }
          return {
            state: session.activeAttachmentId
              ? ("running" as const)
              : ("background" as const),
            sessionId,
          };
        },
        readSession: async (readArgs: { sessionId: string }) => {
          const session = sessions.get(readArgs.sessionId);
          if (!session) {
            return { ok: false, output: "" };
          }
          const output = session.backlog;
          session.backlog = "";
          return { ok: true, output };
        },
        writeSession: async () => ({ ok: true }),
        resizeSession: async (resizeArgs: { cols: number; rows: number }) => {
          testState.resizeSessionCallCount += 1;
          testState.resizeCalls.push({
            cols: resizeArgs.cols,
            rows: resizeArgs.rows,
          });
          if ((args.slowResizeMs ?? 0) > 0) {
            await new Promise((resolve) =>
              window.setTimeout(resolve, args.slowResizeMs),
            );
          }
          return { ok: true };
        },
        closeSession: async () => ({ ok: true }),
        subscribeSessionOutput: (
          listener: (payload: { sessionId: string; output: string }) => void,
        ) => {
          const wrapped = (payload: { sessionId: string; output: string }) => {
            testState.deliveredOutputLog.push(payload.output);
            listener(payload);
          };
          outputListeners.add(wrapped);
          return () => {
            outputListeners.delete(wrapped);
          };
        },
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
        getHistory: async () => ({
          ok: true,
          items: [],
          stderr: "",
        }),
      },
    };

    (
      window as unknown as {
        __staveTestState?: typeof testState;
      }
    ).__staveTestState = testState;
  }, { slowResizeMs: options.slowResizeMs ?? 0 });
}

async function openWorkspaceCliSession(page: Page) {
  await page.getByRole("button", { name: "New CLI Session" }).first().click();
  await page
    .getByRole("menuitem")
    .filter({ hasText: "Claude · Workspace" })
    .click();
  await page.getByRole("button", { name: "Claude Workspace", exact: true }).click();
}

async function expectCliSessionCounts(
  page: Page,
  expected: CliSessionCounts,
) {
  await expect
    .poll(async () =>
      page.evaluate(() => ({
        create:
          (
            window as unknown as {
              __staveTestState?: { createCliSessionCallCount?: number };
            }
          ).__staveTestState?.createCliSessionCallCount ?? 0,
        attach:
          (
            window as unknown as {
              __staveTestState?: { attachSessionCallCount?: number };
            }
          ).__staveTestState?.attachSessionCallCount ?? 0,
        resume:
          (
            window as unknown as {
              __staveTestState?: { resumeSessionStreamCallCount?: number };
            }
          ).__staveTestState?.resumeSessionStreamCallCount ?? 0,
      })))
    .toEqual(expected);
}

async function expectCliSessionStreamReady(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => (
        (
          window as unknown as {
            __staveTestState?: {
              getSessionState?: (sessionId: string) => {
                activeAttachmentId: string | null;
                streamReady: boolean;
                backlog: string;
              } | null;
            };
          }
        ).__staveTestState?.getSessionState?.("cli-session-1")?.streamReady ??
        false
      )))
    .toBe(true);
}

async function emitCliSessionOutput(page: Page, output: string) {
  await page.evaluate((nextOutput) => {
    (
      window as unknown as {
        __staveTestState?: {
          emitOutput: (sessionId: string, output: string) => void;
        };
      }
    ).__staveTestState?.emitOutput("cli-session-1", nextOutput);
  }, output);
}

async function expectCliDeliveredOutput(page: Page, fragment: string) {
  await expect
    .poll(async () =>
      page.evaluate(() => (
        (
          window as unknown as {
            __staveTestState?: { deliveredOutputLog?: string[] };
          }
        ).__staveTestState?.deliveredOutputLog?.join("") ?? ""
      )))
    .toContain(fragment);
}

async function cliViewportMatchesTerminalToken(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector(
      '[data-testid="cli-session-panel"] .xterm-viewport',
    );
    if (!(viewport instanceof HTMLElement)) {
      return false;
    }

    const probe = document.createElement("div");
    probe.style.display = "none";
    probe.style.backgroundColor = "var(--color-terminal)";
    document.documentElement.appendChild(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();

    return getComputedStyle(viewport).backgroundColor === expected;
  });
}

async function getCliResizeState(page: Page) {
  return page.evaluate(() => (
    (
      window as unknown as {
        __staveTestState?: {
          getResizeState?: () => {
            count: number;
            lastResize: { cols: number; rows: number } | null;
          };
        };
      }
    ).__staveTestState?.getResizeState?.() ?? { count: 0, lastResize: null }
  ));
}

test("settings modal and workspace modal open", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "open-settings" }).click();
  await expect(page.getByText("Settings")).toBeVisible();
  await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  await page.getByRole("button", { name: "close-settings" }).click();

  await page.getByRole("button", { name: "new-workspace" }).click();
  await expect(page.getByText("Create New Workspace")).toBeVisible();
  await expect(page.getByText("Create From Branch")).toBeVisible();
});

test("right panel tabs switch", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
      },
      version: 0,
    }));

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
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
        getHistory: async () => ({
          ok: true,
          items: [],
          stderr: "",
        }),
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByTestId("workspace-bar").getByRole("button", { name: "Explorer" }).click();
  const rightPanel = page.getByTestId("editor-panel");
  await expect(rightPanel).toBeVisible();
  await expect(rightPanel.getByRole("heading", { name: "Explorer" })).toBeVisible();

  await page.getByTestId("workspace-bar").getByRole("button", { name: "Changes" }).click();
  await expect(rightPanel.getByRole("heading", { name: "Source Control" })).toBeVisible();
  await expect(rightPanel.getByRole("tab", { name: /Changes/ })).toBeVisible();

  await page.getByTestId("workspace-bar").getByRole("button", { name: "Information" }).click();
  await expect(rightPanel.getByRole("heading", { name: "Information" })).toBeVisible();
});

test("terminal dock opens with the shared surface inset", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-04-10T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
      },
      version: 0,
    }));

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
      },
      terminal: {
        createSession: async () => ({ ok: true, sessionId: "session-terminal-1" }),
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
        getHistory: async () => ({
          ok: true,
          items: [],
          stderr: "",
        }),
        listBranches: async () => ({
          ok: true,
          current: "main",
          branches: ["main"],
          remoteBranches: [],
          worktreePathByBranch: { main: "/tmp/stave-project" },
          stderr: "",
        }),
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByTestId("workspace-bar").getByRole("button", { name: "Terminal" }).click();

  const terminalDock = page.getByTestId("terminal-dock");
  await expect(terminalDock).toBeVisible();
  await expect(page.getByRole("button", { name: "new-terminal-tab" })).toBeVisible();
  await expect(page.getByRole("button", { name: "hide-terminal" })).toBeVisible();

  const terminalSurface = terminalDock.locator("[data-terminal-surface]").first();
  await terminalSurface.waitFor({ state: "attached" });

  const padding = await terminalSurface.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      top: styles.paddingTop,
      right: styles.paddingRight,
      bottom: styles.paddingBottom,
      left: styles.paddingLeft,
    };
  });
  expect(padding).toEqual({
    top: "16px",
    right: "20px",
    bottom: "16px",
    left: "20px",
  });
});

test("cli session keeps the renderer alive and refocuses after switching back", async ({ page }) => {
  await installCliSessionHarness(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await openWorkspaceCliSession(page);
  await expect(page.getByTestId("cli-session-panel")).toBeVisible();
  await expect(page.getByTestId("cli-session-panel").locator(".xterm")).toHaveCount(1);
  await expectCliSessionCounts(page, { create: 1, attach: 1, resume: 1 });
  await page.getByRole("button", { name: /Task 1/ }).first().click();
  await expect(page.getByTestId("cli-session-panel")).toBeHidden();
  await expect(page.getByText("Task 1")).toBeVisible();

  // Switch back to the CLI session surface.
  await page.getByRole("button", { name: "Claude Workspace", exact: true }).click();
  await expect(page.getByTestId("cli-session-panel").locator(".xterm")).toHaveCount(1);
  await expectCliSessionCounts(page, { create: 1, attach: 2, resume: 2 });
  const terminalSurface = page.getByTestId("cli-session-panel").locator("[data-terminal-surface]").first();
  await expect
    .poll(async () =>
      terminalSurface.evaluate((element) => {
        const textarea = element.querySelector(".xterm-helper-textarea");
        return textarea instanceof HTMLElement
          && document.activeElement === textarea;
      },
      )
    )
    .toBe(true);
  await expect
    .poll(async () =>
      terminalSurface.evaluate((element) =>
        Boolean(element.querySelector(".xterm-screen")),
      ))
    .toBe(true);
  await expectCliSessionStreamReady(page);
  await emitCliSessionOutput(page, "after reattach\r\n");
  await expectCliDeliveredOutput(page, "after reattach");
});

test("cli session viewport background follows the active terminal theme token", async ({ page }) => {
  await installCliSessionHarness(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await openWorkspaceCliSession(page);
  await expect(page.getByTestId("cli-session-panel")).toBeVisible();
  await expect(page.getByTestId("cli-session-panel").locator(".xterm-viewport")).toHaveCount(1);

  await expect.poll(async () => cliViewportMatchesTerminalToken(page)).toBe(true);

  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
  });
  await expect.poll(async () => cliViewportMatchesTerminalToken(page)).toBe(true);

  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
  });
  await expect.poll(async () => cliViewportMatchesTerminalToken(page)).toBe(true);
});

test("cli session resumes streaming after a slow reattach resize", async ({ page }) => {
  await installCliSessionHarness(page, { slowResizeMs: 80 });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await openWorkspaceCliSession(page);
  await expect(page.getByTestId("cli-session-panel")).toBeVisible();
  await expectCliSessionCounts(page, { create: 1, attach: 1, resume: 1 });

  await page.getByRole("button", { name: /Task 1/ }).first().click();
  await expect(page.getByTestId("cli-session-panel")).toBeHidden();

  await page.getByRole("button", { name: "Claude Workspace", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.setViewportSize({ width: 1360, height: 860 });

  await expect(page.getByTestId("cli-session-panel")).toBeVisible();
  await expect(page.getByTestId("cli-session-panel").locator(".xterm")).toHaveCount(1);
  await expectCliSessionCounts(page, { create: 1, attach: 2, resume: 2 });
  await expect
    .poll(async () => (await getCliResizeState(page)).count)
    .toBeGreaterThanOrEqual(2);

  const resizeState = await getCliResizeState(page);
  expect(resizeState.lastResize?.cols ?? 0).toBeGreaterThan(0);
  expect(resizeState.lastResize?.rows ?? 0).toBeGreaterThan(0);

  await expectCliSessionStreamReady(page);
  await emitCliSessionOutput(page, "after slow resize\r\n");
  await expectCliDeliveredOutput(page, "after slow resize");
});

test("scripts manager waits for default scope and keeps draft entries dirty", async ({ page }) => {
  await page.addInitScript(() => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        recentProjects: [{
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          lastOpenedAt: "2026-04-05T12:00:00.000Z",
          taskCount: 0,
          workspaceCount: 1,
          gitBranch: "main",
        }],
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-04-05T12:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "feat-scripts" },
        workspacePathById: { "ws-main": "/tmp/stave-project/.stave/workspaces/feat-scripts" },
        workspaceDefaultById: { "ws-main": false },
      },
      version: 0,
    }));

    (window as unknown as { api?: Record<string, unknown> }).api = {
      fs: {
        readFile: async ({ rootPath }: { rootPath: string }) => {
          if (rootPath.includes("/.stave/workspaces/feat-scripts")) {
            await sleep(500);
            return { ok: true, content: "{\"version\":2}", revision: "ws-rev" };
          }
          await sleep(50);
          return {
            ok: false,
            stderr: "ENOENT: no such file or directory",
            content: "",
            revision: null,
          };
        },
        writeFile: async () => ({ ok: true, revision: "rev-1" }),
        createDirectory: async () => ({ ok: true, alreadyExists: true }),
      },
      scripts: {
        getConfig: async () => ({
          ok: true,
          config: {
            actions: [],
            services: [],
            hooks: {},
            targets: {
              workspace: { id: "workspace", label: "Workspace", cwd: "workspace", env: {} },
              project: { id: "project", label: "Project", cwd: "project", env: {} },
            },
            legacyPhases: { setup: [], run: [], teardown: [] },
          },
        }),
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
        getHistory: async () => ({
          ok: true,
          items: [],
          stderr: "",
        }),
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "open-settings" }).click();
  await page.getByRole("button", { name: "Projects" }).click();

  await expect(page.getByText("Loading scripts manager...")).toBeVisible();
  await page.waitForTimeout(150);
  await expect(page.getByRole("button", { name: "Add Action" })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Add Action" })).toBeVisible();
  await page.getByRole("button", { name: "Add Action" }).click();

  await expect(page.getByText("Action 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Discard" })).toBeEnabled();
});
