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

    type LensPresentationCall = {
      workspaceId: string;
      lensSessionId?: string;
      presented: boolean;
    };
    type LensPresentationPayload = {
      workspaceId: string;
      lensSessionId: string;
      reason?: string;
      requestKind?: "explicit" | "agent-activity";
      activityKind?: "visual" | "interaction";
      toolName?: string;
    };
    const lensPresentationCalls: LensPresentationCall[] = [];
    const lensOpenCalls: Array<{
      workspaceId: string;
      lensSessionId: string;
    }> = [];
    let lensPresentationListener:
      ((payload: LensPresentationPayload) => void) | null = null;
    let releaseLensOpen: (() => void) | null = null;
    const lensOpenGate = new Promise<void>((resolve) => {
      releaseLensOpen = resolve;
    });
    Object.assign(window, {
      __lensPresentationCalls: lensPresentationCalls,
      __lensOpenCalls: lensOpenCalls,
      __presentLensSession: (payload: LensPresentationPayload) => {
        if (!lensPresentationListener) {
          throw new Error("Lens presentation subscriber is not ready");
        }
        lensPresentationListener(payload);
      },
      __releaseLensOpen: () => releaseLensOpen?.(),
      __lensVisibilityMarker: 0,
    });

    const unsubscribe = () => {};
    const lensMock = {
      openSession: async (args: {
        workspaceId: string;
        lensSessionId: string;
      }) => {
        lensOpenCalls.push(args);
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
      setPresented: async (args: LensPresentationCall) => {
        lensPresentationCalls.push(args);
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
      subscribePresentationRequests: (
        listener: (payload: LensPresentationPayload) => void,
      ) => {
        lensPresentationListener = listener;
        return () => {
          if (lensPresentationListener === listener) {
            lensPresentationListener = null;
          }
        };
      },
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
  await page.evaluate(() => {
    const target = window as unknown as {
      __presentLensSession: (payload: {
        workspaceId: string;
        lensSessionId: string;
        requestKind: "agent-activity";
        activityKind: "visual";
        toolName: string;
      }) => void;
    };
    target.__presentLensSession({
      workspaceId: "ws-alpha",
      lensSessionId: "automatic-lens",
      requestKind: "agent-activity",
      activityKind: "visual",
      toolName: "stave_lens_screenshot",
    });
  });
  const automaticLensSurface = page.getByTestId("lens-surface-panel");
  await expect(automaticLensSurface).toBeVisible();
  await expect(sessionArea).toBeVisible();
  // The split separator and resize sash are Dockview's own, painted just left
  // of the Lens pane. They need no Lens cooperation anymore: the guest is a DOM
  // element positioned over a placeholder that sits *inside* the pane content,
  // so it cannot reach across the sash the way a native view stacked over the
  // whole window could. This asserts the separator is present and themed, and —
  // the point — that no gutter compensation is applied to the placeholder.
  const lensSplitBorder = await automaticLensSurface.evaluate((element) => {
    const lensRect = element.getBoundingClientRect();
    const view = Array.from(
      document.querySelectorAll<HTMLElement>(".dv-view"),
    ).find((candidate) => {
      const candidateRect = candidate.getBoundingClientRect();
      return (
        Math.abs(candidateRect.left - lensRect.left) < 1 &&
        Math.abs(candidateRect.width - lensRect.width) < 1
      );
    });
    if (!view) {
      return null;
    }
    const separatorView = view.previousElementSibling
      ? view
      : view.nextElementSibling;
    if (!(separatorView instanceof HTMLElement)) {
      return null;
    }
    const separatorStyle = getComputedStyle(separatorView, "::before");
    const themeBorder = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--border");
    const placeholder = element.querySelector<HTMLElement>(
      "[data-lens-guest-placeholder]",
    );
    return {
      side: separatorView === view ? "left" : "right",
      separatorWidth: separatorStyle.width,
      usesThemeBorder: separatorStyle.backgroundColor === themeBorder.trim(),
      gutters: view.getAttribute("data-lens-split-gutters"),
      // The placeholder fills its pane content with no inset — there is no
      // gutter to carve out.
      placeholderLeftInset: placeholder
        ? Math.round(placeholder.getBoundingClientRect().left - lensRect.left)
        : null,
    };
  });
  expect(lensSplitBorder).toEqual({
    side: "left",
    separatorWidth: "1px",
    usesThemeBorder: true,
    gutters: null,
    placeholderLeftInset: 0,
  });
  const [taskBounds, lensBounds, taskGroupIsActive] = await Promise.all([
    sessionArea.boundingBox(),
    automaticLensSurface.boundingBox(),
    alphaTaskChip.evaluate((element) =>
      Boolean(element.closest(".dv-active-group")),
    ),
  ]);
  expect(taskBounds).not.toBeNull();
  expect(lensBounds).not.toBeNull();
  expect(taskGroupIsActive).toBe(true);
  expect(lensBounds!.x).toBeGreaterThanOrEqual(
    taskBounds!.x + taskBounds!.width,
  );
  await page
    .getByRole("button", { name: "close-pane-lens:automatic-lens" })
    .click();
  await expect(automaticLensSurface).toHaveCount(0);

  await page.evaluate(() => {
    const target = window as unknown as {
      __presentLensSession: (payload: {
        workspaceId: string;
        lensSessionId: string;
        reason?: string;
        requestKind?: "explicit" | "agent-activity";
      }) => void;
    };
    target.__presentLensSession({
      workspaceId: "ws-alpha",
      lensSessionId: "agent-lens",
      reason: "Verify the page",
      requestKind: "explicit",
    });
  });
  await expect(page.getByTestId("lens-surface-panel")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const target = window as unknown as {
          __lensOpenCalls: Array<{
            workspaceId: string;
            lensSessionId: string;
          }>;
        };
        return target.__lensOpenCalls.at(-1);
      }),
    )
    .toMatchObject({
      workspaceId: "ws-alpha",
      lensSessionId: "agent-lens",
    });

  // Resolve the pending native view creation from the same task click that
  // hides Lens, then switch workspaces before Dockview's layout settles. This
  // used to restore the selected task tab with an empty tabpanel.
  await alphaTaskChip.evaluate((element) => {
    element.addEventListener(
      "click",
      () => {
        const target = window as unknown as {
          __lensPresentationCalls: Array<{ presented: boolean }>;
          __releaseLensOpen: () => void;
          __lensVisibilityMarker: number;
        };
        target.__lensVisibilityMarker = target.__lensPresentationCalls.length;
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
      __lensPresentationCalls: Array<{
        workspaceId: string;
        lensSessionId?: string;
        presented: boolean;
      }>;
    };
    return {
      presentationAfterTaskActivation: target.__lensPresentationCalls.slice(
        target.__lensVisibilityMarker,
      ),
      presentation: target.__lensPresentationCalls
        .filter((call) => call.workspaceId === "ws-alpha")
        .at(-1),
    };
  });

  // A Lens tab that is no longer on screen stops being presented. The guest
  // page stays alive and parked; only the panel's claim on the screen ends —
  // reported to main as a presentation change, the sole geometry/visibility
  // signal that survives the move to a DOM-hosted guest.
  expect(finalLensState.presentationAfterTaskActivation.length).toBeGreaterThan(
    0,
  );
  expect(
    finalLensState.presentationAfterTaskActivation.every(
      (call) => call.presented === false,
    ),
  ).toBe(true);
  expect(finalLensState.presentation?.presented).toBe(false);
});
