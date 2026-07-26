import { describe, expect, test } from "bun:test";
import { CraneConnectorHttpError } from "../electron/main/crane-connector/http-client";
import { CraneConnectorRuntime } from "../electron/main/crane-connector/runtime";
import type { LocalCraneJobBinding } from "../electron/persistence/crane-job-binding-store";

const NOW = new Date("2026-07-26T00:02:00.000Z");
const CONNECTOR = {
  id: "connector-1",
  name: "Local Stave",
  protocolVersion: 1,
  appVersion: "1.0.0",
  capabilities: ["run_task"],
  createdAt: "2026-07-26T00:00:00.000Z",
  lastSeenAt: "2026-07-26T00:00:00.000Z",
} as const;
const JOB = {
  version: 1,
  id: "job-1",
  kind: "run_task",
  connectorId: CONNECTOR.id,
  issue: {
    id: "issue-1",
    key: "CRANE-42",
    title: "Fix the connector",
    description: "Keep all output local.",
    href: "https://atelier.delight-tools.ai/apps/crane/task/CRANE-42",
    updatedAt: "2026-07-26T00:00:00.000Z",
  },
  instruction: "Start with a regression test.",
  requestedAt: "2026-07-26T00:01:00.000Z",
  expiresAt: "2026-07-27T00:01:00.000Z",
} as const;

function createHarness(options?: {
  heartbeatError?: CraneConnectorHttpError;
  heartbeatJobState?: string;
  receiptFailures?: Partial<Record<string, number>>;
  secureStorageAvailable?: boolean;
  unauthorized?: boolean;
}) {
  const bindings = new Map<string, LocalCraneJobBinding>();
  const receipts: Array<{ state: string; errorCode?: string }> = [];
  const approvals: unknown[] = [];
  const statuses: unknown[] = [];
  const jobUpdates: unknown[] = [];
  const timers: Array<() => void> = [];
  const runCalls: unknown[] = [];
  const releasedTasks: unknown[] = [];
  const receiptFailures = { ...options?.receiptFailures };
  let nextDelivered = false;
  let cleared = false;
  let exchangeCalls = 0;
  let taskCompleted = false;
  let credential:
    | {
        baseUrl: string;
        connector: typeof CONNECTOR;
        secret: string;
      }
    | null = {
    baseUrl: "https://atelier.delight-tools.ai",
    connector: CONNECTOR,
    secret: "stc_test-only-connector-secret",
  };
  const leases = new Map([
    [
      JOB.id,
      {
        jobId: JOB.id,
        connectorId: CONNECTOR.id,
        leaseId: "stl_test-only-lease",
        expiresAt: "2026-07-26T00:17:00.000Z",
      },
    ],
  ]);
  const vault = {
    isSecureStorageAvailable: () =>
      options?.secureStorageAvailable !== false,
    getCredential: async () => credential,
    getMetadata: async () =>
      credential
        ? {
            baseUrl: credential.baseUrl,
            connector: credential.connector,
          }
        : null,
    saveCredential: async (value: typeof credential) => {
      credential = value;
    },
    clear: async () => {
      cleared = true;
      credential = null;
      leases.clear();
      return true;
    },
    putLease: async (lease: {
      jobId: string;
      connectorId: string;
      leaseId: string;
      expiresAt: string;
    }) => {
      leases.set(lease.jobId, lease);
    },
    getLease: async (jobId: string) => leases.get(jobId) ?? null,
    deleteLease: async (jobId: string) => leases.delete(jobId),
  };
  const http = {
    getNextJob: async () => {
      if (options?.unauthorized) {
        throw new CraneConnectorHttpError("unauthorized", 401);
      }
      if (nextDelivered) {
        return null;
      }
      nextDelivered = true;
      return { job: JOB, retryAfterMs: 0 };
    },
    claimJob: async () => ({
      job: JOB,
      leaseId: "stl_test-only-lease",
      leaseExpiresAt: "2026-07-26T00:17:00.000Z",
      nextSequence: 1,
      retryAfterMs: 15_000,
    }),
    postReceipt: async (args: {
      receipt: { state: string; errorCode?: string; sequence: number };
    }) => {
      const remainingFailures =
        receiptFailures[args.receipt.state] ?? 0;
      if (remainingFailures > 0) {
        receiptFailures[args.receipt.state] =
          remainingFailures - 1;
        throw new CraneConnectorHttpError(
          "network_unavailable",
          0,
        );
      }
      receipts.push({
        state: args.receipt.state,
        ...(args.receipt.errorCode
          ? { errorCode: args.receipt.errorCode }
          : {}),
      });
      return {
        ok: true,
        duplicate: false,
        jobState: args.receipt.state,
        sequence: args.receipt.sequence,
        nextSequence: args.receipt.sequence + 1,
      };
    },
    heartbeat: async () => {
      if (options?.heartbeatError) {
        throw options.heartbeatError;
      }
      return {
        ok: true,
        jobState:
          options?.heartbeatJobState ?? "awaiting_local_approval",
        leaseExpiresAt: "2026-07-26T00:17:00.000Z",
        retryAfterMs: 15_000,
      };
    },
    revokeSelf: async () => ({ ok: true }),
    exchangePairingCode: async () => {
      exchangeCalls += 1;
      throw new Error("not used");
    },
  };
  const persistence = {
    getCraneJobBinding: (jobId: string) => bindings.get(jobId) ?? null,
    listActiveCraneJobBindings: (connectorId: string) =>
      [...bindings.values()].filter(
        (binding) =>
          binding.connectorId === connectorId &&
          (binding.pendingReceipt !== null ||
            !["declined", "completed", "failed", "cancelled"].includes(
              binding.state,
            )),
      ),
    upsertCraneJobBinding: (binding: LocalCraneJobBinding) => {
      bindings.set(binding.jobId, structuredClone(binding));
      return structuredClone(binding);
    },
    pruneCraneJobBindings: () => 0,
  };
  const runtime = new CraneConnectorRuntime({
    vault,
    persistence,
    appVersion: "1.0.0",
    createHttpClient: () => http,
    listKnownProjects: async () => [
      {
        projectPath: "/tmp/project",
        projectName: "project",
        defaultBranch: "main",
        activeWorkspaceId: "workspace-default",
        defaultWorkspaceId: "workspace-default",
        workspaces: [
          {
            id: "workspace-default",
            name: "Default Workspace",
            updatedAt: NOW.toISOString(),
            path: "/tmp/project",
            branch: "main",
            isDefault: true,
          },
        ],
      },
    ],
    createWorkspace: async () => ({
      workspaceId: "workspace-crane",
      workspaceName: "crane/crane-42",
      workspacePath: "/tmp/project/.stave/workspaces/crane-42",
      branch: "crane/crane-42",
      projectPath: "/tmp/project",
      projectName: "project",
    }),
    runTask: async (args: unknown) => {
      runCalls.push(args);
      return {
        workspaceId: "workspace-crane",
        taskId: "task-crane",
        taskTitle: "Crane CRANE-42",
        turnId: "turn-crane",
        provider: "codex",
        model: "gpt-5.6",
      };
    },
    getTaskStatus: async () => ({
      workspaceId: "workspace-crane",
      taskId: "task-crane",
      title: "Crane CRANE-42",
      provider: "codex",
      updatedAt: NOW.toISOString(),
      activeTurnId: taskCompleted ? null : "turn-crane",
      latestTurnId: "turn-crane",
      latestTurnCompletedAt: taskCompleted ? NOW.toISOString() : null,
      latestTurnError: null,
      messageCount: 2,
      latestAssistantText: "sensitive output that must stay local",
      pendingApprovals: [],
      pendingUserInputs: [],
    }),
    releaseTaskControl: async (args: unknown) => {
      releasedTasks.push(args);
      return { released: true };
    },
    emitStatus: (status: unknown) => statuses.push(status),
    emitApproval: (approval: unknown) => approvals.push(approval),
    emitJobUpdate: (update: unknown) => jobUpdates.push(update),
    now: () => NOW,
    random: () => 0.5,
    setTimer: (callback: () => void) => {
      timers.push(callback);
      return callback as unknown as NodeJS.Timeout;
    },
    clearTimer: (timer: NodeJS.Timeout) => {
      const index = timers.indexOf(timer as unknown as () => void);
      if (index >= 0) {
        timers.splice(index, 1);
      }
    },
  } as ConstructorParameters<typeof CraneConnectorRuntime>[0]);

  async function runNextTimer() {
    const callback = timers.shift();
    if (!callback) {
      throw new Error("Expected a scheduled connector cycle.");
    }
    callback();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await Bun.sleep(0);
    }
  }

  return {
    approvals,
    bindings,
    get cleared() {
      return cleared;
    },
    get exchangeCalls() {
      return exchangeCalls;
    },
    jobUpdates,
    leases,
    receipts,
    releasedTasks,
    runCalls,
    runtime,
    runNextTimer,
    statuses,
    timers,
    setTaskCompleted: () => {
      taskCompleted = true;
    },
  };
}

describe("CraneConnectorRuntime", () => {
  test("does no work while disabled", async () => {
    const harness = createHarness();

    await harness.runtime.configure({
      enabled: false,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });

    expect(harness.timers).toHaveLength(0);
    expect(harness.statuses).toHaveLength(0);
    expect(harness.receipts).toHaveLength(0);
  });

  test("claims once, waits for approval, and reports status only", async () => {
    const harness = createHarness();
    await harness.runtime.configure({
      enabled: true,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });
    await harness.runNextTimer();

    expect(harness.receipts.map((receipt) => receipt.state)).toEqual([
      "received",
      "awaiting_local_approval",
    ]);
    expect(harness.approvals).toHaveLength(1);
    expect(harness.runCalls).toHaveLength(0);

    const approved = await harness.runtime.approve({
      jobId: JOB.id,
      projectPath: "/tmp/project",
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
        advisorTarget: {
          providerId: "claude-code",
          model: "claude-fable-5",
        },
      },
    });

    expect(approved).toMatchObject({
      workspaceId: "workspace-crane",
      taskId: "task-crane",
    });
    expect(harness.receipts.map((receipt) => receipt.state)).toEqual([
      "received",
      "awaiting_local_approval",
      "running",
    ]);
    expect(harness.runCalls[0]).toMatchObject({
      prompt:
        "Work on the locally approved Crane issue CRANE-42. Use the attached Crane retrieved context as task material.",
      provider: "codex",
      runtimeOptions: {
        model: "gpt-5.6",
        codexFileAccess: "workspace-write",
        codexNetworkAccess: false,
        codexApprovalPolicy: "on-request",
        advisorTarget: {
          providerId: "claude-code",
          model: "claude-fable-5",
        },
      },
      retrievedContextParts: [
        expect.objectContaining({ sourceId: "crane:CRANE-42" }),
      ],
    });

    harness.setTaskCompleted();
    await harness.runNextTimer();
    expect(harness.receipts.at(-1)).toEqual({ state: "completed" });
    expect(harness.releasedTasks).toEqual([
      {
        workspaceId: "workspace-crane",
        taskId: "task-crane",
      },
    ]);
    expect(JSON.stringify(harness.receipts)).not.toContain(
      "sensitive output",
    );
    expect(harness.bindings.get(JOB.id)?.state).toBe("completed");
  });

  test("recovers the received receipt before requesting approval", async () => {
    const harness = createHarness({
      receiptFailures: { received: 1 },
    });
    await harness.runtime.configure({
      enabled: true,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });

    await harness.runNextTimer();
    expect(harness.bindings.get(JOB.id)).toMatchObject({
      state: "received",
      pendingReceipt: { state: "received" },
    });
    expect(harness.approvals).toHaveLength(0);

    harness.runtime.shutdown();
    await harness.runtime.configure({
      enabled: true,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });
    expect(harness.approvals).toHaveLength(0);

    await harness.runNextTimer();
    expect(harness.receipts.map((receipt) => receipt.state)).toEqual([
      "received",
      "awaiting_local_approval",
    ]);
    expect(harness.bindings.get(JOB.id)).toMatchObject({
      state: "awaiting_local_approval",
      pendingReceipt: null,
    });
    expect(harness.approvals).toHaveLength(1);
  });

  test("retries a terminal receipt before releasing its lease", async () => {
    const harness = createHarness({
      receiptFailures: { completed: 1 },
    });
    await harness.runtime.configure({
      enabled: true,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });
    await harness.runNextTimer();
    await harness.runtime.approve({
      jobId: JOB.id,
      projectPath: "/tmp/project",
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
    });
    harness.setTaskCompleted();

    await harness.runNextTimer();
    expect(harness.bindings.get(JOB.id)).toMatchObject({
      state: "completed",
      pendingReceipt: { state: "completed" },
    });
    expect(harness.leases.has(JOB.id)).toBe(true);

    await harness.runNextTimer();
    expect(harness.receipts.at(-1)).toEqual({ state: "completed" });
    expect(harness.bindings.get(JOB.id)).toMatchObject({
      state: "completed",
      pendingReceipt: null,
    });
    expect(harness.leases.has(JOB.id)).toBe(false);
  });

  test("does not duplicate local work when the running receipt needs retry", async () => {
    const harness = createHarness({
      receiptFailures: { running: 1 },
    });
    await harness.runtime.configure({
      enabled: true,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });
    await harness.runNextTimer();

    await expect(
      harness.runtime.approve({
        jobId: JOB.id,
        projectPath: "/tmp/project",
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
      }),
    ).rejects.toMatchObject({ code: "network_unavailable" });
    expect(harness.runCalls).toHaveLength(1);
    expect(harness.bindings.get(JOB.id)).toMatchObject({
      state: "running",
      pendingReceipt: { state: "running" },
    });

    await harness.runNextTimer();

    expect(harness.runCalls).toHaveLength(1);
    expect(harness.bindings.get(JOB.id)).toMatchObject({
      state: "running",
      pendingReceipt: null,
    });
    expect(harness.jobUpdates.at(-1)).toMatchObject({
      jobId: JOB.id,
      state: "running",
    });
  });

  test("restores a claimed approval without creating duplicate work", async () => {
    const harness = createHarness();
    await harness.runtime.configure({
      enabled: true,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });
    await harness.runNextTimer();
    harness.runtime.shutdown();

    const approvalCount = harness.approvals.length;
    await harness.runtime.configure({
      enabled: true,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });

    expect(harness.approvals.length).toBe(approvalCount + 1);
    expect(harness.receipts.map((receipt) => receipt.state)).toEqual([
      "received",
      "awaiting_local_approval",
    ]);
    expect(harness.runCalls).toHaveLength(0);
  });

  test("drops invalid credentials after server authorization failure", async () => {
    const harness = createHarness({ unauthorized: true });
    await harness.runtime.configure({
      enabled: true,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });
    await harness.runNextTimer();

    expect(harness.cleared).toBe(true);
    expect(harness.runtime.getStatus()).toMatchObject({
      runtimeState: "unpaired",
      paired: false,
      lastErrorCode: "connector_unauthorized",
    });
  });

  test("dismisses pending local approval when connector authorization is revoked", async () => {
    const harness = createHarness({
      heartbeatError: new CraneConnectorHttpError("unauthorized", 401),
    });
    await harness.runtime.configure({
      enabled: true,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });
    await harness.runNextTimer();

    await harness.runNextTimer();

    expect(harness.bindings.get(JOB.id)).toMatchObject({
      state: "cancelled",
      errorCode: "connector_unauthorized",
    });
    expect(harness.jobUpdates.at(-1)).toMatchObject({
      jobId: JOB.id,
      state: "cancelled",
      errorCode: "connector_unauthorized",
    });
    expect(harness.cleared).toBe(true);
    expect(harness.runtime.getStatus()).toMatchObject({
      runtimeState: "unpaired",
      paired: false,
      activeJobId: null,
      lastErrorCode: "connector_unauthorized",
    });
  });

  test("fails before exchanging a pairing code without secure storage", async () => {
    const harness = createHarness({ secureStorageAvailable: false });

    await expect(
      harness.runtime.pair({
        baseUrl: "https://atelier.delight-tools.ai",
        code: "stp_test-only-pairing-code",
        name: "Stave Desktop",
      }),
    ).rejects.toThrow("OS credential encryption is unavailable");

    expect(harness.exchangeCalls).toBe(0);
    expect(harness.runtime.getStatus()).toMatchObject({
      runtimeState: "error",
      paired: false,
      secureStorageAvailable: false,
      lastErrorCode: "secure_storage_unavailable",
    });
  });

  test("disconnects an active binding locally even when work was pending", async () => {
    const harness = createHarness();
    await harness.runtime.configure({
      enabled: true,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });
    await harness.runNextTimer();

    await harness.runtime.disconnect();

    expect(harness.bindings.get(JOB.id)).toMatchObject({
      state: "cancelled",
      errorCode: "connector_disconnected",
    });
    expect(harness.leases.size).toBe(0);
    expect(harness.runtime.getStatus()).toMatchObject({
      runtimeState: "unpaired",
      paired: false,
      activeJobId: null,
    });
  });

  test.each([
    {
      name: "remote cancellation",
      options: { heartbeatJobState: "cancelled" },
      errorCode: "remote_job_terminal",
    },
    {
      name: "expired remote lease",
      options: {
        heartbeatError: new CraneConnectorHttpError(
          "lease_not_renewed",
          409,
        ),
      },
      errorCode: "remote_job_terminal",
    },
  ])("stops awaiting $name without retrying approval", async ({
    options,
    errorCode,
  }) => {
    const harness = createHarness(options);
    await harness.runtime.configure({
      enabled: true,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
    });
    await harness.runNextTimer();
    const approvalCount = harness.approvals.length;

    await harness.runNextTimer();

    expect(harness.bindings.get(JOB.id)).toMatchObject({
      state: "cancelled",
      errorCode,
    });
    expect(harness.leases.has(JOB.id)).toBe(false);
    expect(harness.approvals).toHaveLength(approvalCount);
    expect(harness.runtime.getStatus()).toMatchObject({
      runtimeState: "connected",
      activeJobId: null,
      lastErrorCode: errorCode,
    });
  });
});
