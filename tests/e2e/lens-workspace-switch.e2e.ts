import { expect, test } from "@playwright/test";

test("workspace switch with an open Lens keeps the active task surface visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const rows = [
      {
        id: "ws-alpha",
        name: "alpha",
        updatedAt: "2026-03-06T01:00:00.000Z",
        snapshot: {
          activeTaskId: "alpha-task-1",
          tasks: [
            {
              id: "alpha-task-1",
              title: "Alpha Task",
              provider: "claude-code",
              updatedAt: "just now",
              unread: false,
            },
          ],
          messagesByTask: { "alpha-task-1": [] },
        },
      },
      {
        id: "ws-beta",
        name: "beta",
        updatedAt: "2026-03-06T00:00:00.000Z",
        snapshot: {
          activeTaskId: "beta-task-1",
          tasks: [
            {
              id: "beta-task-1",
              title: "Beta Task",
              provider: "codex",
              updatedAt: "just now",
              unread: false,
            },
          ],
          messagesByTask: { "beta-task-1": [] },
        },
      },
    ];
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify(rows),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaces: [
            {
              id: "ws-alpha",
              name: "alpha",
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
            {
              id: "ws-beta",
              name: "beta",
              updatedAt: "2026-03-06T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-alpha",
          workspaceBranchById: { "ws-alpha": "main", "ws-beta": "beta" },
          workspacePathById: {
            "ws-alpha": "/tmp/stave-project",
            "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
          },
          workspaceDefaultById: { "ws-alpha": true, "ws-beta": false },
        },
        version: 0,
      }),
    );

    type LensVisibilityCall = {
      workspaceId: string;
      lensSessionId?: string;
      visible: boolean;
    };
    type LensBoundsCall = {
      workspaceId: string;
      lensSessionId?: string;
      bounds: { x: number; y: number; width: number; height: number };
    };
    const lensVisibilityCalls: LensVisibilityCall[] = [];
    const lensBoundsCalls: LensBoundsCall[] = [];
    let releaseLensOpen: (() => void) | null = null;
    const lensOpenGate = new Promise<void>((resolve) => {
      releaseLensOpen = resolve;
    });
    Object.assign(window, {
      __lensVisibilityCalls: lensVisibilityCalls,
      __lensBoundsCalls: lensBoundsCalls,
      __releaseLensOpen: () => releaseLensOpen?.(),
      __lensVisibilityMarker: 0,
    });

    const unsubscribe = () => {};
    const lensMock = {
      openSession: async (args: {
        workspaceId: string;
        lensSessionId: string;
      }) => {
        await lensOpenGate;
        return {
          ok: true,
          created: true,
          session: {
            ...args,
            url: "https://example.com",
            title: "Example",
            isLoading: false,
            managedByMcp: false,
            sessionScope: "workspace" as const,
          },
        };
      },
      closeSession: async () => ({ ok: true, closed: true }),
      setBounds: async (args: LensBoundsCall) => {
        lensBoundsCalls.push(args);
        return { ok: true };
      },
      setVisible: async (args: LensVisibilityCall) => {
        lensVisibilityCalls.push(args);
        return { ok: true };
      },
      getState: async () => ({
        ok: true,
        state: {
          url: "https://example.com",
          title: "Example",
          canGoBack: false,
          canGoForward: false,
          isLoading: false,
        },
        annotationModeActive: false,
        boxInspectModeActive: false,
      }),
      getAnnotations: async () => ({ ok: true, annotations: [] }),
      listDownloads: async () => ({ ok: true, entries: [] }),
      subscribeNavigationEvents: () => unsubscribe,
      subscribeDownloadEvents: () => unsubscribe,
      subscribeAnnotationEvents: () => unsubscribe,
      subscribeConsoleEvents: () => unsubscribe,
      subscribeNetworkEvents: () => unsubscribe,
      subscribeVisualCommentShortcutEvents: () => unsubscribe,
      subscribeStateChangedEvents: () => unsubscribe,
    };
    const terminalMock = {
      runCommand: async () => ({
        ok: false,
        code: 1,
        stdout: "",
        stderr: "",
      }),
    };

    type ApiShape = Record<string, unknown> & {
      lens?: Record<string, unknown>;
      provider?: Record<string, unknown>;
      terminal?: Record<string, unknown>;
    };
    let apiValue: ApiShape | undefined;
    const mergeMocks = (value: ApiShape | undefined): ApiShape | undefined => {
      if (!value) {
        return value;
      }
      return {
        ...value,
        lens: { ...value.lens, ...lensMock },
        provider: { ...value.provider, streamTurn: async () => [] },
        terminal: { ...value.terminal, ...terminalMock },
      };
    };
    Object.defineProperty(window, "api", {
      configurable: true,
      get: () => apiValue,
      set: (value: ApiShape | undefined) => {
        apiValue = mergeMocks(value);
      },
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const alphaWorkspaceButton = page.getByRole("button", {
    name: "Open workspace Default",
  });
  const betaWorkspaceButton = page.getByRole("button", {
    name: "Open workspace beta",
  });
  const alphaTaskChip = page
    .locator('[data-pane-tab-chip^="task:"]')
    .filter({ hasText: "Alpha Task" });
  const betaTaskChip = page
    .locator('[data-pane-tab-chip^="task:"]')
    .filter({ hasText: "Beta Task" });
  const sessionArea = page.getByTestId("session-area");

  await expect(alphaTaskChip).toBeVisible();
  await page.getByRole("button", { name: "Lens", exact: true }).click();
  await expect(page.getByTestId("lens-surface-panel")).toBeVisible();

  // Resolve the pending native view creation from the same click that hides
  // Lens, then switch workspaces before Dockview's layout settles. This used
  // to restore the selected task tab with an empty tabpanel.
  await alphaTaskChip.evaluate((element) => {
    element.addEventListener(
      "click",
      () => {
        const target = window as unknown as {
          __lensVisibilityCalls: Array<{ visible: boolean }>;
          __releaseLensOpen: () => void;
          __lensVisibilityMarker: number;
        };
        target.__lensVisibilityMarker = target.__lensVisibilityCalls.length;
        target.__releaseLensOpen();
      },
      { once: true },
    );
  });
  await alphaTaskChip.click();
  await expect(sessionArea).toBeVisible();
  await betaWorkspaceButton.click();
  await expect(betaTaskChip).toBeVisible();
  await expect(sessionArea).toBeVisible();

  await alphaWorkspaceButton.click();
  await expect(alphaTaskChip).toBeVisible();
  await expect(sessionArea).toBeVisible();

  const finalLensState = await page.evaluate(() => {
    const target = window as unknown as {
      __lensVisibilityMarker: number;
      __lensVisibilityCalls: Array<{
        workspaceId: string;
        lensSessionId?: string;
        visible: boolean;
      }>;
      __lensBoundsCalls: Array<{
        workspaceId: string;
        lensSessionId?: string;
        bounds: { x: number; y: number; width: number; height: number };
      }>;
    };
    return {
      visibilityAfterTaskActivation: target.__lensVisibilityCalls.slice(
        target.__lensVisibilityMarker,
      ),
      visibility: target.__lensVisibilityCalls
        .filter((call) => call.workspaceId === "ws-alpha")
        .at(-1),
      bounds: target.__lensBoundsCalls
        .filter((call) => call.workspaceId === "ws-alpha")
        .at(-1),
    };
  });

  expect(finalLensState.visibilityAfterTaskActivation.length).toBeGreaterThan(
    0,
  );
  expect(
    finalLensState.visibilityAfterTaskActivation.every(
      (call) => call.visible === false,
    ),
  ).toBe(true);
  expect(finalLensState.visibility?.visible).toBe(false);
  expect(finalLensState.bounds?.bounds).toEqual({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
});
