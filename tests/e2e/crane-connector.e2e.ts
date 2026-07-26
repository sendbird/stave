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

function seedCraneConnector(page: Page) {
  return page.addInitScript((initialStatus) => {
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
      shell: {
        openExternal: async () => ({ ok: true }),
      },
    };
  }, CONNECTOR_STATUS);
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
    dialog.getByText("Approval applies to this job only."),
  ).toBeVisible();

  await dialog.screenshot({
    path: testInfo.outputPath("crane-dispatch-approval.png"),
  });
  await dialog
    .getByRole("button", { name: "Approve and run locally" })
    .click();
  await expect(dialog).toBeHidden();

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
          codexFileAccess: "workspace-write",
          codexNetworkAccess: false,
          codexApprovalPolicy: "on-request",
          advisorTarget: null,
        },
      },
    ]);
  expect(pageErrors.map((error) => error.message)).toEqual([]);
});
