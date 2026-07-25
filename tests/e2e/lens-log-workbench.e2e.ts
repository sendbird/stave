import { expect, test } from "@playwright/test";

test("Lens buffers paused logs, reveals entry details, and clears persisted history", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const workspaceId = "ws-lens-logs";
    const taskId = "task-lens-logs";
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: workspaceId,
          name: "lens-logs",
          updatedAt: "2026-07-25T09:00:00.000Z",
          snapshot: {
            activeTaskId: taskId,
            tasks: [
              {
                id: taskId,
                title: "Inspect Lens logs",
                provider: "codex",
                updatedAt: "2026-07-25T09:00:00.000Z",
                unread: false,
                archivedAt: null,
              },
            ],
            messagesByTask: { [taskId]: [] },
            activeSurface: { kind: "task", taskId },
          },
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-lens-logs",
          projectName: "stave-lens-logs",
          workspaces: [
            {
              id: workspaceId,
              name: "lens-logs",
              updatedAt: "2026-07-25T09:00:00.000Z",
            },
          ],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: { [workspaceId]: "main" },
          workspacePathById: { [workspaceId]: "/tmp/stave-lens-logs" },
          workspaceDefaultById: { [workspaceId]: true },
        },
        version: 0,
      }),
    );

    type ConsoleEntry = {
      id: string;
      level: "log" | "warn" | "error" | "info" | "debug";
      text: string;
      timestamp: string;
      source?: string;
      lineNumber?: number;
      columnNumber?: number;
      executionContextId?: number;
      argumentCount?: number;
      hasObjectArguments?: boolean;
      hasStackTrace?: boolean;
      captureSource?: "cdp" | "electron";
    };
    type NetworkEntry = {
      entryId: string;
      requestId: string;
      state: "pending" | "complete" | "failed";
      url: string;
      method: string;
      status?: number;
      statusText?: string;
      resourceType?: "xhr";
      mimeType?: string;
      responseSize?: number;
      startedAt?: string;
      durationMs?: number;
      fromCache?: boolean;
      requestHeaders?: Record<string, string[]>;
      responseHeaders?: Record<string, string[]>;
      hasRequestBody?: boolean;
      hasResponseBody?: boolean;
      detailAvailable?: boolean;
      captureSource?: "cdp" | "webRequest";
      completedAt?: string;
      timestamp: string;
    };
    type ConsoleListener = (payload: {
      workspaceId: string;
      lensSessionId: string;
      entry: ConsoleEntry;
    }) => void;
    type NetworkListener = (payload: {
      workspaceId: string;
      lensSessionId: string;
      entry: NetworkEntry;
    }) => void;

    const consoleListeners = new Set<ConsoleListener>();
    const networkListeners = new Set<NetworkListener>();
    let resolveConsoleSnapshot: (() => void) | null = null;
    let resolveNetworkSnapshot: (() => void) | null = null;
    const networkStates = new Map<string, NetworkEntry["state"]>();
    let lensSessionId = "default";
    const testState = {
      clearConsoleCalls: 0,
      clearNetworkCalls: 0,
      captureCalls: [] as boolean[],
      consoleDetailCalls: [] as string[],
      objectPropertyCalls: [] as string[],
      networkDetailCalls: [] as string[],
      networkBodyCalls: [] as Array<"request" | "response">,
      networkBodyEntryCalls: [] as string[],
      getConsoleListenerCount: () => consoleListeners.size,
      getNetworkListenerCount: () => networkListeners.size,
      resolveConsoleSnapshot: () => resolveConsoleSnapshot?.(),
      resolveNetworkSnapshot: () => resolveNetworkSnapshot?.(),
      emitConsole(entry: ConsoleEntry) {
        for (const listener of consoleListeners) {
          listener({ workspaceId, lensSessionId, entry });
        }
      },
      emitNetwork(entry: NetworkEntry) {
        networkStates.set(entry.entryId, entry.state);
        for (const listener of networkListeners) {
          listener({ workspaceId, lensSessionId, entry });
        }
      },
    };

    Object.assign(window, { __lensLogTestState: testState });
    const unsubscribe = () => {};
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
      lens: {
        openSession: async (args: {
          workspaceId: string;
          lensSessionId: string;
        }) => {
          lensSessionId = args.lensSessionId;
          return {
            ok: true,
            created: true,
            session: {
              ...args,
              url: "https://example.com/dashboard",
              title: "Example dashboard",
              isLoading: false,
              managedByMcp: false,
              sessionScope: "workspace",
            },
          };
        },
        closeSession: async () => ({ ok: true, closed: true }),
        setBounds: async () => ({ ok: true }),
        setVisible: async () => ({ ok: true }),
        getState: async () => ({
          ok: true,
          state: {
            url: "https://example.com/dashboard",
            title: "Example dashboard",
            canGoBack: false,
            canGoForward: false,
            isLoading: false,
          },
          annotationModeActive: false,
          boxInspectModeActive: false,
        }),
        getAnnotations: async () => ({ ok: true, annotations: [] }),
        listDownloads: async () => ({ ok: true, entries: [] }),
        getConsoleLog: () =>
          new Promise((resolve) => {
            resolveConsoleSnapshot = () =>
              resolve({
                ok: true,
                entries: [
                  {
                    id: "console-initial",
                    level: "info",
                    text: "Stale boot snapshot",
                    timestamp: "2026-07-25T09:00:01.000Z",
                    source: "app.ts",
                    lineNumber: 41,
                    columnNumber: 7,
                    executionContextId: 12,
                    argumentCount: 2,
                    hasObjectArguments: true,
                    hasStackTrace: true,
                    captureSource: "cdp",
                  },
                ],
              });
          }),
        getConsoleEntryDetail: async (args: { entryId: string }) => {
          testState.consoleDetailCalls.push(args.entryId);
          return {
            ok: true,
            detail: {
              entryId: args.entryId,
              executionContextId: 12,
              executionContext: {
                id: 12,
                name: "dashboard",
                origin: "https://example.com",
                frameId: "frame-main",
                isDefault: true,
              },
              arguments: [
                {
                  type: "object",
                  subtype: "object",
                  description: "Object",
                  objectHandle: "object-root",
                  preview: {
                    description: "Object",
                    overflow: false,
                    properties: [
                      {
                        name: "project",
                        type: "string",
                        value: "stave",
                      },
                    ],
                  },
                },
                {
                  type: "string",
                  value: "request finished",
                },
              ],
              stackTrace: {
                description: "async",
                callFrames: [
                  {
                    functionName: "loadProjects",
                    url: "https://example.com/app.ts",
                    lineNumber: 42,
                    columnNumber: 7,
                    scriptId: "script-main",
                  },
                ],
                parent: {
                  description: "Promise.then",
                  callFrames: [
                    {
                      functionName: "bootstrap",
                      url: "https://example.com/bootstrap.ts",
                      lineNumber: 11,
                      columnNumber: 3,
                      scriptId: "script-bootstrap",
                    },
                  ],
                },
              },
            },
          };
        },
        getConsoleObjectProperties: async (args: {
          entryId: string;
          objectHandle: string;
        }) => {
          testState.objectPropertyCalls.push(args.objectHandle);
          if (args.objectHandle === "object-root") {
            return {
              ok: true,
              properties: {
                entryId: args.entryId,
                objectHandle: args.objectHandle,
                overflow: false,
                properties: [
                  {
                    name: "nested",
                    type: "object",
                    subtype: "object",
                    value: "Object",
                    objectHandle: "object-nested",
                    preview: {
                      description: "Object",
                      overflow: false,
                      properties: [
                        {
                          name: "ready",
                          type: "boolean",
                          value: "true",
                        },
                      ],
                    },
                  },
                ],
              },
            };
          }
          return {
            ok: true,
            properties: {
              entryId: args.entryId,
              objectHandle: args.objectHandle,
              overflow: false,
              properties: [
                {
                  name: "ready",
                  type: "boolean",
                  value: "true",
                },
              ],
            },
          };
        },
        getNetworkLog: () =>
          new Promise((resolve) => {
            resolveNetworkSnapshot = () =>
              resolve({
                ok: true,
                entries: [
                  {
                    entryId: "request-initial:0",
                    requestId: "request-initial",
                    state: "pending",
                    url: "https://example.com/api/projects?limit=25",
                    method: "GET",
                    resourceType: "xhr",
                    startedAt: "2026-07-25T09:00:01.875Z",
                    detailAvailable: false,
                    captureSource: "cdp",
                    timestamp: "2026-07-25T09:00:01.875Z",
                  },
                ],
              });
          }),
        getNetworkEntryDetail: async (args: { entryId: string }) => {
          testState.networkDetailCalls.push(args.entryId);
          if (networkStates.get(args.entryId) === "pending") {
            return {
              ok: false,
              message: "Network detail is unavailable while pending.",
            };
          }
          return {
            ok: true,
            detail: {
              entryId: args.entryId,
              requestId: "request-initial",
              requestHeaders: {
                Accept: ["application/json"],
                Authorization: ["[redacted]"],
              },
              responseHeaders: {
                "Content-Type": ["application/json"],
                "X-Request-Id": ["trace-123"],
              },
              initiator: {
                type: "script",
                url: "https://example.com/app.ts",
                lineNumber: 88,
                columnNumber: 4,
                stack: {
                  description: "fetch",
                  callFrames: [
                    {
                      functionName: "fetchProjects",
                      url: "https://example.com/app.ts",
                      lineNumber: 88,
                      columnNumber: 4,
                      scriptId: "script-main",
                    },
                  ],
                },
              },
              timing: {
                requestTimestamp: 100,
                wallTime: 1_753_434_001,
                responseTimestamp: 100.105,
                finishedTimestamp: 100.125,
                proxyStart: -1,
                proxyEnd: -1,
                dnsStart: 0,
                dnsEnd: 5,
                connectStart: 5,
                connectEnd: 20,
                sslStart: 8,
                sslEnd: 20,
                sendStart: 20,
                sendEnd: 22,
                receiveHeadersStart: 100,
                receiveHeadersEnd: 105,
              },
              redirects: [
                {
                  url: "https://example.com/api/legacy-projects",
                  status: 302,
                  statusText: "Found",
                  timestamp: 99.9,
                },
              ],
              protocol: "h2",
              remoteAddress: "203.0.113.10:443",
              connectionId: 17,
              connectionReused: true,
              priority: "High",
              fromServiceWorker: false,
              requestBody: {
                kind: "json",
                mimeType: "application/json",
                size: 4096,
                capturedBytes: 1024,
                truncated: true,
                redacted: true,
              },
              responseBody: {
                kind: "json",
                mimeType: "application/json",
                size: 2048,
                capturedBytes: 2048,
                truncated: false,
                redacted: false,
              },
            },
          };
        },
        getNetworkBody: async (args: {
          entryId: string;
          kind: "request" | "response";
        }) => {
          testState.networkBodyCalls.push(args.kind);
          testState.networkBodyEntryCalls.push(`${args.entryId}:${args.kind}`);
          if (networkStates.get(args.entryId) === "pending") {
            return {
              ok: false,
              message: "Network body is unavailable while pending.",
            };
          }
          if (args.entryId === "request-live:0") {
            return {
              ok: true,
              body: {
                kind: "json",
                mimeType: "application/json",
                content: '{"status":"complete"}',
                size: 21,
                capturedBytes: 21,
                truncated: false,
                redacted: false,
              },
            };
          }
          if (args.kind === "request") {
            return {
              ok: true,
              body: {
                kind: "json",
                mimeType: "application/json",
                content: '{"query":"projects","token":"[redacted]","tail":"…"}',
                size: 4096,
                capturedBytes: 1024,
                truncated: true,
                redacted: true,
              },
            };
          }
          return {
            ok: true,
            body: {
              kind: "json",
              mimeType: "application/json",
              content: '{"projects":[{"id":"project-1"}]}',
              size: 2048,
              capturedBytes: 2048,
              truncated: false,
              redacted: false,
            },
          };
        },
        getDiagnosticsCaptureState: async () => ({
          ok: true,
          state: {
            enabled: false,
            host: "example.com",
            message: "Full diagnostics capture is off.",
          },
        }),
        setDiagnosticsCapture: async (args: { enabled: boolean }) => {
          testState.captureCalls.push(args.enabled);
          return {
            ok: true,
            state: {
              enabled: args.enabled,
              host: "example.com",
              message: args.enabled
                ? "Capturing diagnostic detail for example.com."
                : "Full diagnostics capture stopped.",
            },
          };
        },
        clearConsoleLog: async () => {
          testState.clearConsoleCalls += 1;
          return { ok: true };
        },
        clearNetworkLog: async () => {
          testState.clearNetworkCalls += 1;
          return { ok: true };
        },
        subscribeNavigationEvents: () => unsubscribe,
        subscribeStateChangedEvents: () => unsubscribe,
        subscribeDownloadEvents: () => unsubscribe,
        subscribeAnnotationEvents: () => unsubscribe,
        subscribeVisualCommentShortcutEvents: () => unsubscribe,
        subscribeConsoleEvents: (listener: ConsoleListener) => {
          consoleListeners.add(listener);
          return () => consoleListeners.delete(listener);
        },
        subscribeNetworkEvents: (listener: NetworkListener) => {
          networkListeners.add(listener);
          return () => networkListeners.delete(listener);
        },
      },
      window: {
        subscribeZoomChanges: () => unsubscribe,
      },
    };
  });

  const reactKeyWarnings: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes("Encountered two children with the same key")
    ) {
      reactKeyWarnings.push(message.text());
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Lens", exact: true }).click();
  await expect(page.getByTestId("lens-surface-panel")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __lensLogTestState: {
              getConsoleListenerCount: () => number;
              getNetworkListenerCount: () => number;
            };
          }
        ).__lensLogTestState.getConsoleListenerCount(),
      ),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __lensLogTestState: {
              getNetworkListenerCount: () => number;
            };
          }
        ).__lensLogTestState.getNetworkListenerCount(),
      ),
    )
    .toBe(1);
  await page.evaluate(() => {
    const state = (
      window as unknown as {
        __lensLogTestState: {
          emitConsole: (entry: {
            id: string;
            level: "info";
            text: string;
            timestamp: string;
            source: string;
            lineNumber: number;
            columnNumber: number;
            executionContextId: number;
            argumentCount: number;
            hasObjectArguments: boolean;
            hasStackTrace: boolean;
            captureSource: "cdp";
          }) => void;
          emitNetwork: (entry: {
            entryId: string;
            requestId: string;
            state: "complete";
            url: string;
            method: string;
            status: number;
            statusText: string;
            resourceType: "xhr";
            mimeType: string;
            responseSize: number;
            startedAt: string;
            durationMs: number;
            fromCache: boolean;
            requestHeaders: Record<string, string[]>;
            responseHeaders: Record<string, string[]>;
            hasRequestBody: boolean;
            hasResponseBody: boolean;
            detailAvailable: boolean;
            captureSource: "cdp";
            completedAt: string;
            timestamp: string;
          }) => void;
          resolveConsoleSnapshot: () => void;
          resolveNetworkSnapshot: () => void;
        };
      }
    ).__lensLogTestState;
    state.emitConsole({
      id: "console-initial",
      level: "info",
      text: "Boot complete { project: 'stave' }",
      timestamp: "2026-07-25T09:00:01.100Z",
      source: "app.ts",
      lineNumber: 42,
      columnNumber: 7,
      executionContextId: 12,
      argumentCount: 2,
      hasObjectArguments: true,
      hasStackTrace: true,
      captureSource: "cdp",
    });
    state.emitConsole({
      id: "console-live-during-snapshot",
      level: "info",
      text: "Console arrived during snapshot",
      timestamp: "2026-07-25T09:00:01.200Z",
      source: "app.ts",
      lineNumber: 43,
      columnNumber: 1,
      executionContextId: 12,
      argumentCount: 0,
      hasObjectArguments: false,
      hasStackTrace: false,
      captureSource: "cdp",
    });
    state.emitNetwork({
      entryId: "request-initial:0",
      requestId: "request-initial",
      state: "complete",
      url: "https://example.com/api/projects?limit=25",
      method: "GET",
      status: 200,
      statusText: "HTTP/1.1 200 OK",
      resourceType: "xhr",
      mimeType: "application/json",
      responseSize: 2048,
      startedAt: "2026-07-25T09:00:01.875Z",
      durationMs: 125,
      fromCache: false,
      requestHeaders: {
        Accept: ["application/json"],
        Authorization: ["[redacted]"],
      },
      responseHeaders: {
        "Content-Type": ["application/json"],
      },
      hasRequestBody: true,
      hasResponseBody: true,
      detailAvailable: true,
      captureSource: "cdp",
      completedAt: "2026-07-25T09:00:02.000Z",
      timestamp: "2026-07-25T09:00:02.000Z",
    });
    state.resolveConsoleSnapshot();
    state.resolveNetworkSnapshot();
  });

  const addressInput = page.getByPlaceholder(
    "http://localhost:3000 or https://example.com",
  );
  const addressGeometryBeforeFocus = await addressInput.evaluate((input) => {
    const group = input.closest<HTMLElement>("[data-slot='input-group']");
    if (!group) {
      throw new Error("Lens address input group is missing");
    }
    const rect = group.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  });
  await addressInput.focus();
  await expect(addressInput).toBeFocused();
  const addressFocusState = await addressInput.evaluate((input) => {
    const group = input.closest<HTMLElement>("[data-slot='input-group']");
    if (!group) {
      throw new Error("Lens address input group is missing");
    }
    const inputStyle = getComputedStyle(input);
    const groupStyle = getComputedStyle(group);
    const rect = group.getBoundingClientRect();
    return {
      inputBackground: inputStyle.backgroundColor,
      overflowX: groupStyle.overflowX,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    };
  });
  expect(addressFocusState.inputBackground).toBe("rgba(0, 0, 0, 0)");
  expect(addressFocusState.overflowX).toBe("hidden");
  expect(addressFocusState.rect).toEqual(addressGeometryBeforeFocus);

  await page.getByRole("button", { name: "Show console" }).click();
  await expect(
    page.getByText("Boot complete { project: 'stave' }", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Console arrived during snapshot", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Stale boot snapshot", { exact: true }),
  ).toHaveCount(0);

  const enableFullCapture = page.getByRole("button", {
    name: "Enable full diagnostics capture for the current host",
  });
  await expect(enableFullCapture).toBeVisible();
  await enableFullCapture.click();
  await expect(
    page.getByText("Full capture · example.com", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __lensLogTestState: { captureCalls: boolean[] };
            }
          ).__lensLogTestState.captureCalls,
      ),
    )
    .toEqual([true]);

  const initialConsoleRow = page
    .getByText("Boot complete { project: 'stave' }", { exact: true })
    .locator("xpath=ancestor::button");
  const consoleDetail = page.getByTestId("lens-console-entry-detail");
  await expect(consoleDetail).toHaveCount(0);
  await initialConsoleRow.click();
  await expect(consoleDetail).toBeVisible();
  await expect(initialConsoleRow).toHaveAttribute("aria-pressed", "true");
  await expect(initialConsoleRow).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Hide console details" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText("Console arrived during snapshot", { exact: true }),
  ).toBeVisible();
  const consoleListBox = await page
    .getByTestId("lens-console-entry-list")
    .boundingBox();
  const consoleWorkbenchBox = await page
    .getByTestId("lens-console-log-workbench")
    .boundingBox();
  const consoleDetailBox = await consoleDetail.boundingBox();
  expect(consoleListBox).not.toBeNull();
  expect(consoleWorkbenchBox).not.toBeNull();
  expect(consoleDetailBox).not.toBeNull();
  expect(consoleListBox!.width).toBeGreaterThan(consoleWorkbenchBox!.width / 2);
  expect(consoleDetailBox!.x).toBeGreaterThanOrEqual(
    consoleListBox!.x + consoleListBox!.width - 1,
  );
  await page.getByRole("button", { name: "Hide console details" }).click();
  await expect(consoleDetail).toHaveCount(0);
  await expect(initialConsoleRow).toHaveAttribute("aria-expanded", "false");
  await initialConsoleRow.focus();
  await initialConsoleRow.press("Enter");
  await expect(consoleDetail).toBeVisible();
  await page.getByRole("button", { name: "Hide console details" }).click();
  await initialConsoleRow.focus();
  await initialConsoleRow.press("Space");
  await expect(consoleDetail).toBeVisible();
  await expect(
    consoleDetail.getByText("app.ts", { exact: true }),
  ).toBeVisible();
  await expect(consoleDetail.getByText("42", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __lensLogTestState: { consoleDetailCalls: string[] };
            }
          ).__lensLogTestState.consoleDetailCalls,
      ),
    )
    .toEqual(["console-initial", "console-initial", "console-initial"]);

  const consoleMessageTab = consoleDetail.getByRole("tab", {
    name: "Message",
  });
  const consoleArgumentsTab = consoleDetail.getByRole("tab", {
    name: "Arguments",
  });
  await expect(consoleMessageTab).toHaveAttribute("aria-selected", "true");
  await consoleMessageTab.focus();
  await consoleMessageTab.press("ArrowRight");
  await expect(consoleArgumentsTab).toBeFocused();
  await expect(consoleArgumentsTab).toHaveAttribute("aria-selected", "true");
  await expect(consoleDetail.getByText("project: stave")).toBeVisible();
  await consoleDetail.getByRole("button", { name: "Expand [0]" }).click();
  await expect(
    consoleDetail.getByText("nested", { exact: true }),
  ).toBeVisible();
  await consoleDetail.getByRole("button", { name: "Expand nested" }).click();
  await expect(consoleDetail.getByText("ready", { exact: true })).toBeVisible();
  await expect(consoleDetail.getByText("true", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __lensLogTestState: { objectPropertyCalls: string[] };
            }
          ).__lensLogTestState.objectPropertyCalls,
      ),
    )
    .toEqual(["object-root", "object-nested"]);

  await consoleDetail.getByRole("tab", { name: "Stack" }).click();
  await expect(
    consoleDetail.getByText("loadProjects", { exact: true }),
  ).toBeVisible();
  await expect(
    consoleDetail.getByText("bootstrap", { exact: true }),
  ).toBeVisible();
  await consoleDetail.getByRole("tab", { name: "Context" }).click();
  await expect(
    consoleDetail.getByText("dashboard", { exact: true }),
  ).toBeVisible();
  await expect(consoleDetail.getByText("cdp", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Pause console log" }).click();
  await page.evaluate(() => {
    const state = (
      window as unknown as {
        __lensLogTestState: {
          emitConsole: (entry: {
            id: string;
            level: "log";
            text: string;
            timestamp: string;
            source: string;
            lineNumber: number;
            captureSource: "cdp";
          }) => void;
        };
      }
    ).__lensLogTestState;
    for (let index = 0; index < 205; index += 1) {
      state.emitConsole({
        id: `console-buffered-${index}`,
        level: "log",
        text: `buffered console ${index}`,
        timestamp: new Date(
          Date.parse("2026-07-25T09:01:00.000Z") + index * 1_000,
        ).toISOString(),
        source: "worker.ts",
        lineNumber: index + 1,
        captureSource: "cdp",
      });
    }
  });
  await expect(page.getByText("200 buffered", { exact: true })).toBeVisible();
  await expect(
    page.getByText("buffered console 204", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Resume console log" }).click();
  await expect(
    page.getByText("buffered console 204", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("buffered console 0", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Clear console log" }).click();
  await expect(
    page.getByText("No console entries.", { exact: true }),
  ).toBeVisible();
  await expect(consoleDetail).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __lensLogTestState: { clearConsoleCalls: number };
            }
          ).__lensLogTestState.clearConsoleCalls,
      ),
    )
    .toBe(1);

  await page.getByRole("button", { name: "Show network" }).click();
  await expect(
    page.getByText("Full capture · example.com", { exact: true }),
  ).toBeVisible();

  const networkDetail = page.getByTestId("lens-network-entry-detail");
  const liveRequestUrl = "https://example.com/api/live-projects";
  await page.evaluate((url) => {
    const state = (
      window as unknown as {
        __lensLogTestState: {
          emitNetwork: (entry: {
            entryId: string;
            requestId: string;
            state: "pending";
            url: string;
            method: string;
            resourceType: "xhr";
            detailAvailable: boolean;
            captureSource: "cdp";
            timestamp: string;
          }) => void;
        };
      }
    ).__lensLogTestState;
    state.emitNetwork({
      entryId: "request-live:0",
      requestId: "request-live",
      state: "pending",
      url,
      method: "POST",
      resourceType: "xhr",
      detailAvailable: true,
      captureSource: "cdp",
      timestamp: "2026-07-25T09:02:00.000Z",
    });
  }, liveRequestUrl);
  await expect(page.getByText(liveRequestUrl, { exact: true })).toBeVisible();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Request pending")).toBeVisible();
  await page.getByText(liveRequestUrl, { exact: true }).click();
  await expect(networkDetail).toBeVisible();
  const selectedLiveNetworkRow = page
    .getByText(liveRequestUrl, { exact: true })
    .locator("xpath=ancestor::button");
  await expect(selectedLiveNetworkRow).toHaveAttribute("aria-pressed", "true");
  await expect(selectedLiveNetworkRow).toHaveAttribute("aria-expanded", "true");
  const networkListBox = await page
    .getByTestId("lens-network-entry-list")
    .boundingBox();
  const networkWorkbenchBox = await page
    .getByTestId("lens-network-log-workbench")
    .boundingBox();
  const networkDetailBox = await networkDetail.boundingBox();
  expect(networkListBox).not.toBeNull();
  expect(networkWorkbenchBox).not.toBeNull();
  expect(networkDetailBox).not.toBeNull();
  expect(networkListBox!.width).toBeGreaterThan(networkWorkbenchBox!.width / 2);
  expect(networkDetailBox!.x).toBeGreaterThanOrEqual(
    networkListBox!.x + networkListBox!.width - 1,
  );
  await expect(
    networkDetail.getByText("Network detail is unavailable while pending.", {
      exact: true,
    }),
  ).toBeVisible();
  await networkDetail.getByRole("tab", { name: "Response" }).click();
  await expect(
    networkDetail.getByText("Network body is unavailable while pending.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __lensLogTestState: { networkBodyEntryCalls: string[] };
            }
          ).__lensLogTestState.networkBodyEntryCalls,
      ),
    )
    .toEqual(["request-live:0:response"]);

  await page.evaluate((url) => {
    const state = (
      window as unknown as {
        __lensLogTestState: {
          emitNetwork: (entry: {
            entryId: string;
            requestId: string;
            state: "complete";
            url: string;
            method: string;
            status: number;
            statusText: string;
            resourceType: "xhr";
            responseSize: number;
            durationMs: number;
            detailAvailable: boolean;
            captureSource: "cdp";
            completedAt: string;
            timestamp: string;
          }) => void;
        };
      }
    ).__lensLogTestState;
    state.emitNetwork({
      entryId: "request-live:0",
      requestId: "request-live",
      state: "complete",
      url,
      method: "POST",
      status: 204,
      statusText: "No Content",
      resourceType: "xhr",
      responseSize: 0,
      durationMs: 80,
      detailAvailable: true,
      captureSource: "cdp",
      completedAt: "2026-07-25T09:02:00.080Z",
      timestamp: "2026-07-25T09:02:00.080Z",
    });
  }, liveRequestUrl);
  await expect(page.getByText("Pending", { exact: true })).toHaveCount(0);
  await expect(page.getByText("204", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Request duration 80 ms")).toBeVisible();
  await expect(page.getByText(liveRequestUrl, { exact: true })).toHaveCount(1);
  await expect(
    networkDetail.getByText("Network body is unavailable while pending.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(networkDetail.getByText(/"status": "complete"/)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __lensLogTestState: {
                networkBodyEntryCalls: string[];
                networkDetailCalls: string[];
              };
            }
          ).__lensLogTestState,
      ),
    )
    .toMatchObject({
      networkBodyEntryCalls: [
        "request-live:0:response",
        "request-live:0:response",
      ],
      networkDetailCalls: ["request-live:0", "request-live:0"],
    });
  await networkDetail.getByRole("tab", { name: "Headers" }).click();
  await page.getByRole("button", { name: "Hide network details" }).click();

  await expect(
    page.getByText("https://example.com/api/projects?limit=25", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByText("https://example.com/api/projects?limit=25", { exact: true })
    .click();
  await expect(networkDetail).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hide network details" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    networkDetail.getByText("request-initial", { exact: true }),
  ).toBeVisible();
  await expect(
    networkDetail.getByText("2.0 KB", { exact: true }),
  ).toBeVisible();
  await expect(
    networkDetail.getByText("125 ms", { exact: true }),
  ).toBeVisible();
  await expect(
    networkDetail.getByText(/Authorization: \[redacted\]/),
  ).toBeVisible();
  await expect(
    networkDetail.getByText("203.0.113.10:443", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __lensLogTestState: { networkDetailCalls: string[] };
            }
          ).__lensLogTestState.networkDetailCalls,
      ),
    )
    .toEqual(["request-live:0", "request-live:0", "request-initial:0"]);

  const headersTab = networkDetail.getByRole("tab", { name: "Headers" });
  const payloadTab = networkDetail.getByRole("tab", { name: "Payload" });
  await expect(headersTab).toHaveAttribute("aria-selected", "true");
  await headersTab.focus();
  await headersTab.press("ArrowRight");
  await expect(payloadTab).toBeFocused();
  await expect(payloadTab).toHaveAttribute("aria-selected", "true");
  await expect(
    networkDetail.getByText("Sensitive fields redacted", { exact: true }),
  ).toBeVisible();
  await expect(
    networkDetail.getByText("Truncated", { exact: true }),
  ).toBeVisible();
  await expect(
    networkDetail.getByText(/"token": "\[redacted\]"/),
  ).toBeVisible();

  const responseTab = networkDetail.getByRole("tab", { name: "Response" });
  await payloadTab.press("ArrowRight");
  await expect(responseTab).toBeFocused();
  await expect(responseTab).toHaveAttribute("aria-selected", "true");
  await expect(networkDetail.getByText(/"id": "project-1"/)).toBeVisible();

  await networkDetail.getByRole("tab", { name: "Initiator" }).click();
  await expect(
    networkDetail.getByText("fetchProjects", { exact: true }),
  ).toBeVisible();
  await expect(
    networkDetail.getByText("https://example.com/api/legacy-projects", {
      exact: false,
    }),
  ).toBeVisible();

  await networkDetail.getByRole("tab", { name: "Timing" }).click();
  await expect(
    networkDetail.getByText("Raw timestamps", { exact: true }),
  ).toBeVisible();
  await expect(
    networkDetail.getByText("Request monotonic", { exact: true }),
  ).toBeVisible();
  await expect(
    networkDetail.getByText("Waterfall", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __lensLogTestState: {
                networkBodyCalls: Array<"request" | "response">;
              };
            }
          ).__lensLogTestState.networkBodyCalls,
      ),
    )
    .toEqual(["response", "response", "request", "response"]);

  await page
    .getByRole("button", { name: "Stop full diagnostics capture" })
    .click();
  await expect(
    page.getByText("Full capture · example.com", { exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __lensLogTestState: { captureCalls: boolean[] };
            }
          ).__lensLogTestState.captureCalls,
      ),
    )
    .toEqual([true, false]);

  await page.getByRole("button", { name: "Clear network log" }).click();
  await expect(
    page.getByText("No network entries.", { exact: true }),
  ).toBeVisible();
  await expect(networkDetail).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __lensLogTestState: { clearNetworkCalls: number };
            }
          ).__lensLogTestState.clearNetworkCalls,
      ),
    )
    .toBe(1);
  expect(reactKeyWarnings).toEqual([]);
});
