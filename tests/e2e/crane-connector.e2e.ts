import { expect, test, type Page } from "@playwright/test";

const CONNECTOR_STATUS = {
  runtimeState: "unpaired",
  paired: false,
  connector: null,
  lastHeartbeatAt: null,
  lastErrorCode: null,
  activeJobId: null,
  secureStorageAvailable: true,
} as const;

function seedCraneConnector(
  page: Page,
  options?: { craneKickoffTask?: boolean; managedTask?: boolean },
) {
  return page.addInitScript((payload) => {
    const { craneKickoffTask, initialStatus, managedTask } = payload;
    const workspaceSnapshot = {
      activeTaskId: "task-crane-settings",
      openTaskTabIds: ["task-crane-settings"],
      activeSurface: {
        kind: "task",
        taskId: "task-crane-settings",
      },
      tasks: [
        {
          id: "task-crane-settings",
          title: "Crane connector settings",
          provider: "codex",
          updatedAt: "2026-07-26T00:00:00.000Z",
          unread: false,
          archivedAt: null,
          ...(managedTask
            ? {
                controlMode: "managed",
                controlOwner: "stave",
              }
            : {}),
          ...(managedTask || craneKickoffTask
            ? {
                sourceContexts: [{
                  type: "retrieved_context",
                  sourceId: "crane:ATL-1",
                  title: craneKickoffTask
                    ? "Crane ATL-1 · Interactive kickoff"
                    : "Crane ATL-1 · Verify takeover",
                  content: "Task-scoped Crane issue material.",
                }],
              }
            : {}),
        },
      ],
      messagesByTask: { "task-crane-settings": [] },
    };
    const project = {
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      lastOpenedAt: "2026-07-26T00:00:00.000Z",
      defaultBranch: "main",
      workspaces: [
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-07-26T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main",
      workspaceBranchById: { "ws-main": "main" },
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceDefaultById: { "ws-main": true },
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-07-26T00:00:00.000Z",
          snapshot: workspaceSnapshot,
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: project.projectPath,
          projectName: project.projectName,
          workspaces: project.workspaces,
          activeWorkspaceId: "ws-main",
          workspaceBranchById: project.workspaceBranchById,
          workspacePathById: project.workspacePathById,
          workspaceDefaultById: project.workspaceDefaultById,
          recentProjects: [project],
          draftProvider: "codex",
          settings: {
            autoRoutingEnabled: true,
            modelCodex: "gpt-5.6",
            providerTimeoutMs: 43_200_000,
            codexFileAccess: "workspace-write",
            codexNetworkAccess: false,
            codexApprovalPolicy: "on-request",
            craneConnector: {
              enabled: false,
              baseUrl: "https://atelier.delight-tools.ai",
              pollIntervalSeconds: 15,
              projectMappings: [],
            },
          },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );

    type ApprovalRequest = {
      job: {
        version: 1;
        id: string;
        kind: "run_task";
        connectorId: string;
        issue: {
          id: string;
          key: string;
          title: string;
          description: string;
          href: string;
          updatedAt: string;
        };
        instruction: string;
        requestedAt: string;
        expiresAt: string;
      };
      leaseExpiresAt: string;
    };
    let status: {
      runtimeState: string;
      paired: boolean;
      connector: null | {
        id: string;
        name: string;
        protocolVersion: number;
        appVersion: string;
        capabilities: string[];
        createdAt: string;
        lastSeenAt: string | null;
      };
      lastHeartbeatAt: string | null;
      lastErrorCode: string | null;
      activeJobId: string | null;
      secureStorageAvailable: boolean;
    } = { ...initialStatus };
    let approvalListener:
      | ((request: ApprovalRequest) => void)
      | null = null;
    const testState = {
      pairCalls: [] as unknown[],
      configureCalls: [] as unknown[],
      approveCalls: [] as unknown[],
      declineCalls: [] as unknown[],
      disconnectCalls: 0,
      takeOverCalls: [] as unknown[],
      emitApproval: (request: ApprovalRequest) => {
        approvalListener?.(request);
      },
    };
    (
      window as unknown as {
        craneConnectorTestState: typeof testState;
        api?: Record<string, unknown>;
      }
    ).craneConnectorTestState = testState;
    (
      window as unknown as {
        craneConnectorTestState: typeof testState;
        api?: Record<string, unknown>;
      }
    ).api = {
      provider: {
        streamTurn: async () => [],
      },
      craneConnector: {
        getStatus: async () => ({ ok: true, status }),
        configure: async (args: { enabled: boolean }) => {
          testState.configureCalls.push(args);
          status = {
            ...status,
            runtimeState: args.enabled ? "connected" : "disabled",
          };
          return { ok: true, status };
        },
        pair: async (args: unknown) => {
          testState.pairCalls.push(args);
          status = {
            ...status,
            runtimeState: "connected",
            paired: true,
            connector: {
              id: "connector-e2e",
              name: "Stave E2E",
              protocolVersion: 1,
              appVersion: "1.0.0",
              capabilities: ["run_task"],
              createdAt: "2026-07-26T00:00:00.000Z",
              lastSeenAt: "2026-07-26T00:00:00.000Z",
            },
          };
          return { ok: true, status };
        },
        disconnect: async () => {
          testState.disconnectCalls += 1;
          status = {
            ...initialStatus,
            runtimeState: "unpaired",
          };
          return { ok: true, status };
        },
        approve: async (args: unknown) => {
          testState.approveCalls.push(args);
          return {
            ok: true,
            status: {
              ...status,
              runtimeState: "running",
              activeJobId: "job-e2e",
            },
            workspaceId: "ws-main",
            taskId: "task-crane-settings",
          };
        },
        decline: async (args: unknown) => {
          testState.declineCalls.push(args);
          return { ok: true, status };
        },
        subscribeStatus: () => () => {},
        subscribeApprovalRequests: (
          listener: (request: ApprovalRequest) => void,
        ) => {
          approvalListener = listener;
          return () => {
            if (approvalListener === listener) {
              approvalListener = null;
            }
          };
        },
        subscribeJobUpdates: () => () => {},
      },
      taskControl: {
        takeOver: async (args: unknown) => {
          testState.takeOverCalls.push(args);
          return {
            ok: true,
            workspaceId: "ws-main",
            taskId: "task-crane-settings",
            released: true,
            craneReceiptPending: false,
          };
        },
      },
      shell: {
        openExternal: async () => ({ ok: true }),
      },
    };
  }, {
    craneKickoffTask: options?.craneKickoffTask === true,
    initialStatus: CONNECTOR_STATUS,
    managedTask: options?.managedTask === true,
  });
}

test("Crane settings pair explicitly and keep the connector off by default", async ({
  page,
}, testInfo) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await seedCraneConnector(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            craneConnectorTestState: { configureCalls: unknown[] };
          }
        ).craneConnectorTestState.configureCalls,
    ),
  ).toEqual([]);

  await page.getByRole("button", { name: "open-settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings
    .getByRole("textbox", { name: "Search settings" })
    .fill("crane");
  await settings
    .getByRole("button", { name: /Crane connector.*Integrations/ })
    .click();

  const card = settings.locator("#settings-field-crane-connector");
  await expect(card).toBeFocused();
  await expect(card).toContainText("Not paired");
  const pollingSwitch = card.getByRole("switch", {
    name: "Enable outbound polling",
  });
  await expect(pollingSwitch).toHaveAttribute("aria-checked", "false");

  await card
    .getByRole("textbox", { name: "Connector name" })
    .fill("Stave E2E");
  await card
    .getByLabel("One-time pairing code")
    .fill("stp_test-only-pairing-code");
  await card.getByRole("button", { name: "Pair securely" }).click();

  await expect(card).toContainText("Connected");
  await expect(pollingSwitch).toHaveAttribute("aria-checked", "true");
  await pollingSwitch.click();
  await expect(pollingSwitch).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(() =>
      page.evaluate(
        () => {
          const state = (
            window as unknown as {
              craneConnectorTestState: {
                configureCalls: unknown[];
                disconnectCalls: number;
              };
            }
          ).craneConnectorTestState;
          return {
            lastConfigureCall: state.configureCalls.at(-1),
            disconnectCalls: state.disconnectCalls,
          };
        },
      ),
    )
    .toMatchObject({
      lastConfigureCall: {
        enabled: false,
        baseUrl: "https://atelier.delight-tools.ai",
        pollIntervalSeconds: 15,
      },
      disconnectCalls: 0,
    });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              craneConnectorTestState: { pairCalls: unknown[] };
            }
          ).craneConnectorTestState.pairCalls,
      ),
    )
    .toEqual([
      {
        baseUrl: "https://atelier.delight-tools.ai",
        code: "stp_test-only-pairing-code",
        name: "Stave E2E",
      },
    ]);
  const persistedSettings = await page.evaluate(
    () => window.localStorage.getItem("stave-store") ?? "",
  );
  expect(persistedSettings).not.toContain("stp_test-only-pairing-code");

  await card.screenshot({
    path: testInfo.outputPath("crane-connector-settings.png"),
  });
  expect(pageErrors.map((error) => error.message)).toEqual([]);
});

test("Crane approval defaults to local runtime settings and is job-scoped", async ({
  page,
}, testInfo) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await seedCraneConnector(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.evaluate(() => {
    (
      window as unknown as {
        craneConnectorTestState: {
          emitApproval: (request: unknown) => void;
        };
      }
    ).craneConnectorTestState.emitApproval({
      job: {
        version: 1,
        id: "job-e2e",
        kind: "run_task",
        connectorId: "connector-e2e",
        issue: {
          id: "issue-e2e",
          key: "CRANE-42",
          title: "Verify local dispatch",
          description: "Remote issue text stays untrusted.",
          href: "https://atelier.delight-tools.ai/apps/crane/task/CRANE-42",
          updatedAt: "2026-07-26T00:00:00.000Z",
        },
        instruction: "Run the focused connector checks.",
        requestedAt: "2026-07-26T00:01:00.000Z",
        expiresAt: "2027-07-27T00:01:00.000Z",
      },
      leaseExpiresAt: "2027-07-26T00:16:00.000Z",
    });
  });

  const dialog = page.getByRole("dialog", {
    name: "Run CRANE-42 in Stave?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Verify local dispatch")).toBeVisible();
  await expect(
    dialog.getByText("Run the focused connector checks."),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Decline" })).toBeFocused();
  await expect(
    dialog.getByRole("combobox", { name: "Provider" }),
  ).toContainText("Codex");
  await expect(
    dialog.getByText(
      "Run approval is job-scoped; only this local project preference is remembered.",
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("combobox", { name: "Stave project" }),
  ).toContainText("stave-project");
  await expect(
    dialog.getByRole("switch", {
      name: "Remember for CRANE issues",
    }),
  ).toBeChecked();

  await dialog.screenshot({
    path: testInfo.outputPath("crane-dispatch-approval.png"),
  });
  await dialog
    .getByRole("button", { name: "Approve and run locally" })
    .click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const persisted = JSON.parse(
          window.localStorage.getItem("stave-store") ?? "{}",
        ) as {
          state?: {
            settings?: {
              craneConnector?: {
                projectMappings?: unknown[];
              };
            };
          };
        };
        return persisted.state?.settings?.craneConnector?.projectMappings;
      }),
    )
    .toEqual([
      {
        craneTeamKey: "CRANE",
        staveProjectPath: "/tmp/stave-project",
      },
    ]);

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              craneConnectorTestState: { approveCalls: unknown[] };
            }
          ).craneConnectorTestState.approveCalls,
      ),
    )
    .toEqual([
      {
        jobId: "job-e2e",
        projectPath: "/tmp/stave-project",
        workspace: {
          strategy: "new",
          branchName: "crane/crane-42",
        },
        runtime: {
          provider: "codex",
          model: "gpt-5.6",
          providerTimeoutMs: 43_200_000,
          codexFileAccess: "workspace-write",
          codexNetworkAccess: false,
          codexApprovalPolicy: "on-request",
          advisorTarget: null,
        },
      },
    ]);
  expect(pageErrors.map((error) => error.message)).toEqual([]);
});

test("inactive managed task offers Take Over above the composer", async ({
  page,
}, testInfo) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await seedCraneConnector(page, { managedTask: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const takeOver = page.getByRole("button", {
    name: "Take over managed task",
  });
  await expect(takeOver).toBeVisible();
  await expect(takeOver).toBeEnabled();
  await expect(page.getByText("Managed by Stave")).toBeVisible();
  await expect(
    page.getByText(
      "The managed run ended. Take over to continue directly in this task.",
    ),
  ).toBeVisible();
  const prompt = page.locator('[data-prompt-lexical-editor="true"]');
  await expect(prompt).toHaveAttribute("contenteditable", "false");
  await expect(
    page.getByText("Crane ATL-1 · Verify takeover"),
  ).toBeVisible();

  await takeOver.locator("xpath=..").screenshot({
    path: testInfo.outputPath("managed-task-takeover.png"),
  });
  await takeOver.click();
  await expect(takeOver).toBeHidden();
  await expect(prompt).toHaveAttribute("contenteditable", "true");
  await expect(
    page.getByText("Crane ATL-1 · Verify takeover"),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              craneConnectorTestState: { takeOverCalls: unknown[] };
            }
          ).craneConnectorTestState.takeOverCalls,
      ),
    )
    .toEqual([
      {
        workspaceId: "ws-main",
        taskId: "task-crane-settings",
      },
    ]);
  expect(pageErrors.map((error) => error.message)).toEqual([]);
});

test("Crane kickoff is interactive from the first task turn", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await seedCraneConnector(page, { craneKickoffTask: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const prompt = page.locator('[data-prompt-lexical-editor="true"]');
  await expect(prompt).toHaveAttribute("contenteditable", "true");
  await expect(
    page.getByText("Crane ATL-1 · Interactive kickoff"),
  ).toBeVisible();
  await expect(page.getByText("Managed by Stave")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Take over managed task" }),
  ).toHaveCount(0);
  expect(pageErrors.map((error) => error.message)).toEqual([]);
});
