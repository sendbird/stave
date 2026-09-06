import type { ProviderRuntimeOptions } from "../../../src/lib/providers/provider.types";
import {
  buildCraneDispatchPrompt,
  buildCraneDispatchRetrievedContext,
} from "../../../src/lib/crane-connector/context";
import type {
  CraneStaveJobV1,
  CraneStaveReceiptState,
  CraneStaveReceiptV1,
} from "../../../src/lib/crane-connector/contract";
import {
  CraneConnectorConfigInputSchema,
  CraneConnectorPairInputSchema,
  CraneDispatchApprovalResponseSchema,
  type CraneConnectorConfigInput,
  type CraneConnectorPairInput,
  type CraneConnectorPublicStatus,
  type CraneDispatchApprovalRequest,
  type CraneDispatchApprovalResponse,
  type CraneDispatchJobUpdate,
  type CraneDispatchRuntimeChoice,
  type CraneDispatchWorkspaceChoice,
} from "../../../src/lib/crane-connector/types";
import type { LocalCraneJobBinding } from "../../persistence/crane-job-binding-store";
import type {
  CreatedWorkspaceInfo,
  RegisteredProjectInfo,
  TaskRunResult,
  TaskStatusResult,
} from "../../host-service/local-mcp-runtime";
import {
  buildCraneDispatchTaskTitle,
  resolveCraneJiraReference,
} from "../../../src/lib/crane-connector/jira-reference";
import type { CraneCredentialStore } from "./credential-vault";
import {
  CraneConnectorHttpClient,
  CraneConnectorHttpError,
} from "./http-client";

const BINDING_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_BACKOFF_MS = 5 * 60 * 1_000;
const REMOTE_TERMINAL_JOB_STATES = new Set([
  "declined",
  "completed",
  "failed",
  "cancelled",
  "expired",
]);
const REMOTE_TERMINAL_ERROR_CODES = new Set([
  "job_expired",
  "job_terminal",
  "lease_not_renewed",
]);
const LOCAL_TERMINAL_RECEIPT_STATES = new Set<CraneStaveReceiptState>([
  "declined",
  "completed",
  "failed",
  "cancelled",
]);

interface CraneBindingPersistence {
  getCraneJobBinding(jobId: string): LocalCraneJobBinding | null;
  listActiveCraneJobBindings(connectorId: string): LocalCraneJobBinding[];
  upsertCraneJobBinding(binding: LocalCraneJobBinding): LocalCraneJobBinding;
  pruneCraneJobBindings(cutoff: string): number;
}

interface CraneRuntimeDependencies {
  vault: CraneCredentialStore;
  persistence: CraneBindingPersistence;
  appVersion: string;
  createHttpClient: (baseUrl: string) => CraneConnectorHttpClient;
  listKnownProjects: () => Promise<RegisteredProjectInfo[]>;
  createWorkspace: (args: {
    projectPath: string;
    name: string;
    mode: "branch";
    fromBranch?: string;
    fromBranchKind?: "local" | "remote";
  }) => Promise<CreatedWorkspaceInfo>;
  runTask: (args: {
    workspaceId: string;
    prompt: string;
    title: string;
    provider: "claude-code" | "codex";
    runtimeOptions: ProviderRuntimeOptions;
    retrievedContextParts: ReturnType<
      typeof buildCraneDispatchRetrievedContext
    >[];
  }) => Promise<TaskRunResult>;
  getTaskStatus: (args: {
    workspaceId: string;
    taskId: string;
    turnId?: string;
  }) => Promise<TaskStatusResult>;
  releaseTaskControl: (args: {
    workspaceId: string;
    taskId: string;
    sourceContexts?: ReturnType<typeof buildCraneDispatchRetrievedContext>[];
  }) => Promise<unknown>;
  /**
   * Files the dispatched Crane issue (and any Jira issue it links to) into the
   * workspace Information panel. Optional and best-effort: a failure here must
   * never abort a job that is otherwise ready to run.
   */
  registerWorkspaceIssues?: (args: {
    workspaceId: string;
    crane: { url: string; issueKey: string; title: string };
    jira: { url: string; issueKey: string } | null;
  }) => Promise<unknown>;
  emitStatus: (status: CraneConnectorPublicStatus) => void;
  emitApproval: (request: CraneDispatchApprovalRequest) => void;
  emitJobUpdate: (update: CraneDispatchJobUpdate) => void;
  now?: () => Date;
  random?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
}

/**
 * The user's answers to "where and how does this job run", shared by the remote
 * approval response and the Stave-started kickoff. The two paths differ only in
 * how the binding comes into existence, never in how it launches.
 */
interface CraneLocalLaunchChoice {
  projectPath: string;
  workspace: CraneDispatchWorkspaceChoice;
  runtime: CraneDispatchRuntimeChoice;
}

export function runtimeOptionsForApproval(
  approval: Pick<CraneDispatchApprovalResponse, "runtime">,
): ProviderRuntimeOptions {
  const advisorTarget = approval.runtime.advisorTarget ?? undefined;
  // Paired by the approval schema, so the ceiling the approver saw is the one
  // the turn enforces. Without it the runtime would fall back to its own
  // default and ignore a deliberately lowered Stave budget.
  const advisor = advisorTarget
    ? {
        advisorTarget,
        ...(approval.runtime.advisorConsultLimit !== undefined
          ? { advisorConsultLimit: approval.runtime.advisorConsultLimit }
          : {}),
      }
    : {};
  if (approval.runtime.provider === "claude-code") {
    return {
      model: approval.runtime.model,
      providerTimeoutMs: approval.runtime.providerTimeoutMs,
      claudePermissionMode: approval.runtime.claudePermissionMode,
      claudeSandboxEnabled: approval.runtime.claudeSandboxEnabled,
      // Forwarded explicitly: the Claude runtime defaults
      // `allowUnsandboxedCommands` to true, which would undo the sandbox the
      // approver selected.
      claudeAllowUnsandboxedCommands:
        approval.runtime.claudeAllowUnsandboxedCommands,
      claudeAllowDangerouslySkipPermissions:
        approval.runtime.claudeAllowDangerouslySkipPermissions,
      claudeEffort: approval.runtime.claudeEffort,
      ...advisor,
    };
  }
  return {
    model: approval.runtime.model,
    providerTimeoutMs: approval.runtime.providerTimeoutMs,
    codexFileAccess: approval.runtime.codexFileAccess,
    codexNetworkAccess: approval.runtime.codexNetworkAccess,
    codexApprovalPolicy: approval.runtime.codexApprovalPolicy,
    codexWebSearch: approval.runtime.codexWebSearch,
    codexReasoningEffort: approval.runtime.codexReasoningEffort,
    codexFastMode: approval.runtime.codexFastMode,
    ...advisor,
  };
}

export function computeCraneConnectorRetryDelay(args: {
  baseDelayMs: number;
  failureCount: number;
  random?: () => number;
}) {
  const exponent = Math.min(5, Math.max(0, args.failureCount - 1));
  const bounded = Math.min(
    MAX_BACKOFF_MS,
    Math.max(1_000, args.baseDelayMs) * 2 ** exponent,
  );
  const random = (args.random ?? Math.random)();
  const jitter = 0.85 + Math.min(1, Math.max(0, random)) * 0.3;
  return Math.round(Math.min(MAX_BACKOFF_MS, bounded * jitter));
}

export class CraneConnectorRuntime {
  private config: CraneConnectorConfigInput = {
    enabled: false,
    baseUrl: "https://atelier.delight-tools.ai",
    pollIntervalSeconds: 15,
  };
  private status: CraneConnectorPublicStatus;
  private timer: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;
  private generation = 0;
  private failureCount = 0;
  private operationQueue: Promise<void> = Promise.resolve();
  /**
   * Last tasks-list capability from heartbeat JSON or the idle-poll header.
   *
   * Null until a poll has heard from this host. The tracker source reads this
   * so it does not have to guess from a collection 404.
   */
  private tasksEnabled: boolean | null = null;

  constructor(private readonly dependencies: CraneRuntimeDependencies) {
    this.status = {
      runtimeState: "disabled",
      paired: false,
      connector: null,
      lastHeartbeatAt: null,
      lastErrorCode: null,
      activeJobId: null,
      secureStorageAvailable: dependencies.vault.isSecureStorageAvailable(),
    };
  }

  getStatus() {
    return { ...this.status };
  }

  getTasksEnabled(): boolean | null {
    return this.tasksEnabled;
  }

  async configure(input: CraneConnectorConfigInput) {
    const config = CraneConnectorConfigInputSchema.parse(input);
    this.stopPendingWork();
    this.config = config;
    return this.enqueue(async () => {
      if (!config.enabled) {
        this.setStatus(
          {
            runtimeState: "disabled",
            activeJobId: null,
            lastErrorCode: null,
          },
          false,
        );
        return this.getStatus();
      }
      await this.resume();
      return this.getStatus();
    });
  }

  async pair(input: CraneConnectorPairInput) {
    const pairing = CraneConnectorPairInputSchema.parse(input);
    this.stopPendingWork();
    return this.enqueue(async () => {
      if (!this.dependencies.vault.isSecureStorageAvailable()) {
        this.setStatus({
          runtimeState: "error",
          paired: false,
          connector: null,
          secureStorageAvailable: false,
          lastErrorCode: "secure_storage_unavailable",
        });
        throw new Error(
          "OS credential encryption is unavailable. Unlock the system credential store and retry.",
        );
      }
      this.setStatus({
        runtimeState: "connecting",
        secureStorageAvailable: true,
        lastErrorCode: null,
      });
      const controller = this.createAbortController();
      const client = this.dependencies.createHttpClient(pairing.baseUrl);
      try {
        const exchanged = await client.exchangePairingCode({
          code: pairing.code,
          name: pairing.name,
          appVersion: this.dependencies.appVersion,
          signal: controller.signal,
        });
        await this.dependencies.vault.saveCredential({
          baseUrl: pairing.baseUrl,
          connector: exchanged.connector,
          secret: exchanged.secret,
        });
        this.config = {
          ...this.config,
          enabled: true,
          baseUrl: pairing.baseUrl,
          pollIntervalSeconds: Math.max(
            this.config.pollIntervalSeconds,
            Math.ceil(exchanged.pollRetryMs / 1_000),
          ),
        };
        this.failureCount = 0;
        this.setStatus({
          runtimeState: "connected",
          paired: true,
          connector: exchanged.connector,
          lastHeartbeatAt: this.nowIso(),
          lastErrorCode: null,
        });
        this.schedule(0);
        return this.getStatus();
      } catch (error) {
        await this.handleRuntimeError(error);
        throw error;
      } finally {
        if (this.abortController === controller) {
          this.abortController = null;
        }
      }
    });
  }

  async disconnect() {
    this.stopPendingWork();
    return this.enqueue(async () => {
      const credential = await this.dependencies.vault
        .getCredential()
        .catch(() => null);
      if (credential) {
        const controller = this.createAbortController();
        try {
          await this.dependencies
            .createHttpClient(credential.baseUrl)
            .revokeSelf({
              secret: credential.secret,
              signal: controller.signal,
            });
        } catch {
          // Local deletion remains authoritative when the endpoint is
          // unreachable. The narrow server credential can be revoked later
          // from Crane's browser UI.
        } finally {
          if (this.abortController === controller) {
            this.abortController = null;
          }
        }
      }
      if (credential) {
        for (const binding of this.dependencies.persistence.listActiveCraneJobBindings(
          credential.connector.id,
        )) {
          this.markServerTerminal(
            binding,
            "cancelled",
            "connector_disconnected",
          );
        }
      }
      await this.dependencies.vault.clear();
      this.setStatus({
        runtimeState: this.config.enabled ? "unpaired" : "disabled",
        paired: false,
        connector: null,
        activeJobId: null,
        lastHeartbeatAt: null,
        lastErrorCode: null,
      });
      return this.getStatus();
    });
  }

  async prepareTaskTakeover(args: { workspaceId: string; taskId: string }) {
    return this.enqueue(async () => {
      const credential = await this.dependencies.vault
        .getCredential()
        .catch(() => null);
      if (!credential) {
        return {
          bindingFound: false,
          receiptPending: false,
          sourceContexts: [],
        };
      }
      const binding =
        this.dependencies.persistence
          .listActiveCraneJobBindings(credential.connector.id)
          .find(
            (candidate) =>
              candidate.workspaceId === args.workspaceId &&
              candidate.taskId === args.taskId,
          ) ?? null;
      if (!binding) {
        return {
          bindingFound: false,
          receiptPending: false,
          sourceContexts: [],
        };
      }
      if (!binding.turnId) {
        throw new Error("local_state_inconsistent");
      }
      const task = await this.dependencies.getTaskStatus({
        workspaceId: args.workspaceId,
        taskId: args.taskId,
        turnId: binding.turnId,
      });
      if (task.activeTurnId === binding.turnId) {
        throw new Error("The managed Crane run is still active.");
      }
      if (task.latestTurnId !== binding.turnId || !task.latestTurnCompletedAt) {
        throw new Error(
          "The managed Crane run has not reached a terminal state yet.",
        );
      }

      const targetState = task.latestTurnError ? "failed" : "completed";
      const sourceContexts = [buildCraneDispatchRetrievedContext(binding.job)];
      try {
        let updated: LocalCraneJobBinding;
        if (
          binding.pendingReceipt &&
          LOCAL_TERMINAL_RECEIPT_STATES.has(binding.pendingReceipt.state)
        ) {
          updated = await this.flushPendingReceipt(binding);
        } else if (LOCAL_TERMINAL_RECEIPT_STATES.has(binding.state)) {
          updated = binding;
        } else {
          updated = await this.publishReceipt(
            binding,
            targetState,
            task.latestTurnError ? "provider_failed" : undefined,
          );
        }
        await this.dependencies.vault.deleteLease(binding.jobId);
        this.refreshAggregateStatus({ lastErrorCode: null });
        this.emitJobUpdate(updated);
        return {
          bindingFound: true,
          receiptPending: false,
          sourceContexts,
        };
      } catch (error) {
        if (await this.finishRemoteTerminalError(binding, error)) {
          return {
            bindingFound: true,
            receiptPending: false,
            sourceContexts,
          };
        }
        await this.handleRuntimeError(error);
        this.schedule(0);
        return {
          bindingFound: true,
          receiptPending: true,
          sourceContexts,
        };
      }
    });
  }

  async approve(input: CraneDispatchApprovalResponse) {
    return this.enqueue(async () => {
      const approval = CraneDispatchApprovalResponseSchema.parse(input);
      const binding = this.requireAwaitingBinding(approval.jobId);
      if (Date.parse(binding.job.expiresAt) <= this.now().getTime()) {
        await this.failBeforeExecution(binding, "job_expired");
        throw new Error("This Crane job expired before local approval.");
      }
      const launched = await this.launchBindingLocally(binding, approval);
      return {
        status: this.getStatus(),
        workspaceId: launched.workspaceId!,
        taskId: launched.taskId!,
      };
    });
  }

  /**
   * Starts a job Stave claimed itself, skipping the remote
   * "offered -> awaiting local approval" handshake: the user picked the ticket,
   * project, workspace, and runtime here, so the binding is born approved and
   * `running` is the first receipt Crane ever sees for it.
   */
  async kickoffClaimedJob(args: {
    claimed: {
      job: CraneStaveJobV1;
      leaseId: string;
      leaseExpiresAt: string;
      nextSequence: number;
    };
    projectPath: string;
    workspace: CraneDispatchWorkspaceChoice;
    runtime: CraneDispatchRuntimeChoice;
  }): Promise<{ jobId: string; workspaceId: string; taskId: string }> {
    return this.enqueue(async () => {
      const credential = await this.dependencies.vault.getCredential();
      if (
        !credential ||
        credential.connector.id !== args.claimed.job.connectorId
      ) {
        // Rejected before the first local write, so a job claimed under another
        // connector can never leave a binding or a lease behind.
        throw new Error("connector_scope_mismatch");
      }
      const binding = this.saveBinding({
        jobId: args.claimed.job.id,
        connectorId: credential.connector.id,
        job: args.claimed.job,
        leaseExpiresAt: args.claimed.leaseExpiresAt,
        state: "received",
        // The claim already reserved `nextSequence` on the server, so seeding
        // one below it puts the `running` receipt exactly on that slot.
        lastReceiptSequence: args.claimed.nextSequence - 1,
        pendingReceipt: null,
        workspaceId: null,
        taskId: null,
        turnId: null,
        errorCode: null,
        updatedAt: this.nowIso(),
      });
      // Stored before the launch because every receipt, including the terminal
      // one a pre-run failure publishes, needs the lease to reach Crane.
      await this.dependencies.vault.putLease({
        jobId: args.claimed.job.id,
        connectorId: credential.connector.id,
        leaseId: args.claimed.leaseId,
        expiresAt: args.claimed.leaseExpiresAt,
      });
      const launched = await this.launchBindingLocally(binding, args);
      return {
        jobId: launched.jobId,
        workspaceId: launched.workspaceId!,
        taskId: launched.taskId!,
      };
    });
  }

  async decline(jobId: string) {
    return this.enqueue(async () => {
      const binding = this.requireAwaitingBinding(jobId);
      const declined = await this.publishReceipt(
        binding,
        "declined",
        "local_declined",
      );
      await this.dependencies.vault.deleteLease(jobId);
      this.refreshAggregateStatus({ lastErrorCode: null });
      this.emitJobUpdate(declined);
      this.schedule(0);
      return this.getStatus();
    });
  }

  shutdown() {
    this.stopPendingWork();
  }

  /**
   * Everything an approved job does locally, from project lookup through the
   * first `running` receipt. Shared by the remote approval path and the
   * Stave-started kickoff so both route their pre-run failures through
   * `failBeforeExecution` and therefore always leave Crane a terminal receipt.
   */
  private async launchBindingLocally(
    binding: LocalCraneJobBinding,
    choice: CraneLocalLaunchChoice,
  ) {
    const projects = await this.dependencies.listKnownProjects();
    const project =
      projects.find(
        (candidate) => candidate.projectPath === choice.projectPath,
      ) ?? null;
    if (!project) {
      await this.failBeforeExecution(binding, "mapping_missing");
      throw new Error("The selected project is no longer registered in Stave.");
    }

    let workspaceId: string;
    try {
      if (choice.workspace.strategy === "existing") {
        const requestedWorkspaceId = choice.workspace.workspaceId;
        const workspace = project.workspaces.find(
          (candidate) => candidate.id === requestedWorkspaceId,
        );
        if (!workspace) {
          throw new Error("The selected workspace no longer exists.");
        }
        workspaceId = workspace.id;
      } else {
        const created = await this.dependencies.createWorkspace({
          projectPath: project.projectPath,
          name: choice.workspace.branchName,
          mode: "branch",
          fromBranch: project.defaultBranch,
          fromBranchKind: "remote",
        });
        workspaceId = created.workspaceId;
      }
    } catch (error) {
      await this.failBeforeExecution(binding, "workspace_create_failed");
      throw error;
    }

    await this.registerWorkspaceIssues(workspaceId, binding.job);

    let updated = this.saveBinding({
      ...binding,
      workspaceId,
      updatedAt: this.nowIso(),
    });
    try {
      const run = await this.dependencies.runTask({
        workspaceId,
        prompt: buildCraneDispatchPrompt(binding.job),
        title: buildCraneDispatchTaskTitle(binding.job),
        provider: choice.runtime.provider,
        runtimeOptions: runtimeOptionsForApproval(choice),
        retrievedContextParts: [
          buildCraneDispatchRetrievedContext(binding.job),
        ],
      });
      updated = this.saveBinding({
        ...updated,
        workspaceId: run.workspaceId,
        taskId: run.taskId,
        turnId: run.turnId,
        updatedAt: this.nowIso(),
      });
    } catch (error) {
      await this.failBeforeExecution(updated, "provider_start_failed");
      throw error;
    }

    try {
      updated = await this.publishReceipt(updated, "running");
    } catch (error) {
      await this.handleRuntimeError(error);
      this.schedule(0);
      throw error;
    }
    this.refreshAggregateStatus({ lastErrorCode: null });
    this.emitJobUpdate(updated);
    this.schedule(0);
    return updated;
  }

  private async resume() {
    if (!this.dependencies.vault.isSecureStorageAvailable()) {
      this.setStatus({
        runtimeState: "error",
        paired: false,
        connector: null,
        secureStorageAvailable: false,
        lastErrorCode: "secure_storage_unavailable",
      });
      return;
    }
    this.setStatus({ secureStorageAvailable: true }, false);
    const credential = await this.dependencies.vault.getCredential();
    if (!credential) {
      this.setStatus({
        runtimeState: "unpaired",
        paired: false,
        connector: null,
        activeJobId: null,
        lastErrorCode: null,
      });
      return;
    }
    if (credential.baseUrl !== this.config.baseUrl) {
      this.setStatus({
        runtimeState: "error",
        paired: true,
        connector: credential.connector,
        activeJobId: null,
        lastErrorCode: "endpoint_mismatch",
      });
      return;
    }

    // Several bindings may legitimately be active at once - a remote offer can
    // overlap a Stave-started kickoff - so a restart restores all of them
    // instead of treating the set as corrupted local state.
    const active = this.dependencies.persistence.listActiveCraneJobBindings(
      credential.connector.id,
    );
    this.refreshAggregateStatus({
      paired: true,
      connector: credential.connector,
      lastErrorCode: null,
    });
    for (const binding of active) {
      if (
        binding.state === "awaiting_local_approval" &&
        !binding.pendingReceipt
      ) {
        this.dependencies.emitApproval({
          job: binding.job,
          leaseExpiresAt: binding.leaseExpiresAt,
        });
      }
    }
    this.dependencies.persistence.pruneCraneJobBindings(
      new Date(this.now().getTime() - BINDING_RETENTION_MS).toISOString(),
    );
    this.schedule(0);
  }

  private async poll() {
    if (!this.config.enabled) {
      return;
    }
    const credential = await this.dependencies.vault.getCredential();
    if (!credential || credential.baseUrl !== this.config.baseUrl) {
      this.setStatus({
        runtimeState: credential ? "error" : "unpaired",
        paired: Boolean(credential),
        connector: credential?.connector ?? null,
        activeJobId: null,
        lastErrorCode: credential ? "endpoint_mismatch" : null,
      });
      return;
    }
    const client = this.dependencies.createHttpClient(credential.baseUrl);
    const controller = this.createAbortController();
    let nextDelayMs = this.config.pollIntervalSeconds * 1_000;
    try {
      const active = this.dependencies.persistence.listActiveCraneJobBindings(
        credential.connector.id,
      );
      // Sequentially, never concurrently: the shared operation queue only
      // serializes public entry points, so this loop is what keeps two bindings
      // from interleaving their receipts and their status writes.
      for (const binding of active) {
        await this.processActiveBinding({
          binding,
          client,
          secret: credential.secret,
          signal: controller.signal,
        });
      }
      // Never offer a second job while one still needs an answer from the user.
      // Deliberately read from the pre-processing snapshot: a binding that just
      // reached a terminal state still holds this cycle, so the status and
      // error code its transition published survive until the next one.
      const approvalPending = active.some(
        (binding) =>
          binding.state === "received" ||
          binding.state === "awaiting_local_approval",
      );
      if (!approvalPending) {
        const next = await client.getNextJob({
          secret: credential.secret,
          signal: controller.signal,
        });
        this.rememberTasksEnabled(client);
        if (next) {
          await this.claimJob({
            client,
            secret: credential.secret,
            connectorId: credential.connector.id,
            job: next.job,
            signal: controller.signal,
          });
          nextDelayMs = 0;
        } else {
          this.refreshAggregateStatus({
            paired: true,
            connector: credential.connector,
            lastHeartbeatAt: this.nowIso(),
            lastErrorCode: null,
          });
        }
      }
      this.failureCount = 0;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      this.failureCount += 1;
      const retryHint =
        error instanceof CraneConnectorHttpError
          ? error.retryAfterMs
          : undefined;
      nextDelayMs = computeCraneConnectorRetryDelay({
        baseDelayMs: retryHint ?? this.config.pollIntervalSeconds * 1_000,
        failureCount: this.failureCount,
        random: this.dependencies.random,
      });
      await this.handleRuntimeError(error);
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
      }
    }
    this.schedule(nextDelayMs);
  }

  private async claimJob(args: {
    client: CraneConnectorHttpClient;
    secret: string;
    connectorId: string;
    job: Parameters<typeof buildCraneDispatchPrompt>[0];
    signal: AbortSignal;
  }) {
    if (
      args.job.connectorId !== args.connectorId ||
      Date.parse(args.job.expiresAt) <= this.now().getTime()
    ) {
      throw new Error(
        args.job.connectorId !== args.connectorId
          ? "connector_scope_mismatch"
          : "job_expired",
      );
    }
    const existing = this.dependencies.persistence.getCraneJobBinding(
      args.job.id,
    );
    if (existing) {
      if (
        existing.connectorId !== args.connectorId ||
        JSON.stringify(existing.job) !== JSON.stringify(args.job)
      ) {
        throw new Error("local_state_inconsistent");
      }
      return;
    }

    const claimed = await args.client.claimJob({
      secret: args.secret,
      jobId: args.job.id,
      signal: args.signal,
    });
    if (
      claimed.job.connectorId !== args.connectorId ||
      claimed.job.id !== args.job.id
    ) {
      throw new Error("connector_scope_mismatch");
    }
    let binding = this.saveBinding({
      jobId: claimed.job.id,
      connectorId: args.connectorId,
      job: claimed.job,
      leaseExpiresAt: claimed.leaseExpiresAt,
      state: "received",
      lastReceiptSequence: claimed.nextSequence - 1,
      pendingReceipt: null,
      workspaceId: null,
      taskId: null,
      turnId: null,
      errorCode: null,
      updatedAt: this.nowIso(),
    });
    await this.dependencies.vault.putLease({
      jobId: claimed.job.id,
      connectorId: args.connectorId,
      leaseId: claimed.leaseId,
      expiresAt: claimed.leaseExpiresAt,
    });
    binding = await this.publishReceipt(binding, "received");
    binding = await this.publishReceipt(binding, "awaiting_local_approval");
    this.setStatus({
      runtimeState: "awaiting_local_approval",
      paired: true,
      activeJobId: binding.jobId,
      lastHeartbeatAt: this.nowIso(),
      lastErrorCode: null,
    });
    this.emitJobUpdate(binding);
    this.dependencies.emitApproval({
      job: binding.job,
      leaseExpiresAt: binding.leaseExpiresAt,
    });
  }

  private async processActiveBinding(args: {
    binding: LocalCraneJobBinding;
    client: CraneConnectorHttpClient;
    secret: string;
    signal: AbortSignal;
  }) {
    let binding = args.binding;
    if (binding.pendingReceipt) {
      try {
        binding = await this.flushPendingReceipt(binding);
      } catch (error) {
        if (await this.finishRemoteTerminalError(binding, error)) {
          return;
        }
        throw error;
      }
      this.emitJobUpdate(binding);
      if (LOCAL_TERMINAL_RECEIPT_STATES.has(binding.state)) {
        await this.dependencies.vault.deleteLease(binding.jobId);
        this.refreshAggregateStatus({ lastErrorCode: binding.errorCode });
        return;
      }
    }
    if (binding.state === "received") {
      binding = await this.publishReceipt(binding, "awaiting_local_approval");
      this.emitJobUpdate(binding);
    }
    if (binding.state === "awaiting_local_approval") {
      const lease = await this.requireLease(binding);
      if (Date.parse(binding.job.expiresAt) <= this.now().getTime()) {
        this.markServerTerminal(binding, "cancelled", "job_expired");
        await this.dependencies.vault.deleteLease(binding.jobId);
        return;
      }
      let heartbeat: Awaited<ReturnType<CraneConnectorHttpClient["heartbeat"]>>;
      try {
        heartbeat = await args.client.heartbeat({
          secret: args.secret,
          jobId: binding.jobId,
          leaseId: lease.leaseId,
          signal: args.signal,
        });
      } catch (error) {
        if (await this.finishRemoteTerminalError(binding, error)) {
          return;
        }
        throw error;
      }
      if (
        heartbeat.jobState &&
        REMOTE_TERMINAL_JOB_STATES.has(heartbeat.jobState)
      ) {
        const errorCode =
          heartbeat.jobState === "expired"
            ? "job_expired"
            : "remote_job_terminal";
        this.markServerTerminal(binding, "cancelled", errorCode);
        await this.dependencies.vault.deleteLease(binding.jobId);
        return;
      }
      this.rememberTasksEnabled(args.client, heartbeat.tasksEnabled);
      if (heartbeat.leaseExpiresAt) {
        binding = this.saveBinding({
          ...binding,
          leaseExpiresAt: heartbeat.leaseExpiresAt,
          updatedAt: this.nowIso(),
        });
        await this.dependencies.vault.putLease({
          ...lease,
          expiresAt: heartbeat.leaseExpiresAt,
        });
      }
      this.refreshAggregateStatus({
        lastHeartbeatAt: this.nowIso(),
        lastErrorCode: null,
      });
      this.dependencies.emitApproval({
        job: binding.job,
        leaseExpiresAt: binding.leaseExpiresAt,
      });
      return;
    }
    if (binding.state === "running" || binding.state === "needs_local_input") {
      await this.observeRunningBinding(binding);
    }
  }

  /**
   * Advances one running binding by exactly one observation, then returns; the
   * poll loop above awaits each call in turn, so two bindings are never
   * observed concurrently even though both may be running.
   *
   * Receipt sequences cannot collide across bindings because
   * `lastReceiptSequence` is a column of the binding row and `publishReceipt`
   * derives the next number from the very row it is about to overwrite. Two
   * observations of the *same* binding would collide, and what rules that out
   * is the operation queue: `approve`, `kickoffClaimedJob`, `decline`,
   * `prepareTaskTakeover`, and each poll cycle run one at a time, so no two
   * callers ever hold the same binding snapshot at once.
   */
  private async observeRunningBinding(binding: LocalCraneJobBinding) {
    if (!binding.workspaceId || !binding.taskId || !binding.turnId) {
      throw new Error("local_state_inconsistent");
    }
    const task = await this.dependencies.getTaskStatus({
      workspaceId: binding.workspaceId,
      taskId: binding.taskId,
      turnId: binding.turnId,
    });
    const needsInput =
      task.pendingApprovals.length > 0 || task.pendingUserInputs.length > 0;
    let updated = binding;
    if (task.activeTurnId === binding.turnId) {
      const targetState = needsInput ? "needs_local_input" : "running";
      if (binding.state !== targetState) {
        updated = await this.publishReceipt(binding, targetState);
        this.emitJobUpdate(updated);
      }
      this.refreshAggregateStatus({ lastErrorCode: null });
      return;
    }
    if (task.latestTurnId === binding.turnId && task.latestTurnCompletedAt) {
      await this.dependencies.releaseTaskControl({
        workspaceId: binding.workspaceId,
        taskId: binding.taskId,
        sourceContexts: [buildCraneDispatchRetrievedContext(binding.job)],
      });
      const targetState = task.latestTurnError ? "failed" : "completed";
      updated = await this.publishReceipt(
        binding,
        targetState,
        task.latestTurnError ? "provider_failed" : undefined,
      );
      await this.dependencies.vault.deleteLease(binding.jobId);
      this.refreshAggregateStatus({ lastErrorCode: null });
      this.emitJobUpdate(updated);
    }
  }

  private requireAwaitingBinding(jobId: string) {
    const binding = this.dependencies.persistence.getCraneJobBinding(jobId);
    if (
      !binding ||
      !["received", "awaiting_local_approval"].includes(binding.state)
    ) {
      throw new Error("This Crane job is no longer awaiting local approval.");
    }
    return binding;
  }

  private async requireLease(binding: LocalCraneJobBinding) {
    const lease = await this.dependencies.vault.getLease(binding.jobId);
    if (
      !lease ||
      lease.connectorId !== binding.connectorId ||
      lease.jobId !== binding.jobId
    ) {
      throw new Error("local_lease_missing");
    }
    return lease;
  }

  private async publishReceipt(
    binding: LocalCraneJobBinding,
    state: CraneStaveReceiptState,
    errorCode?: string,
  ) {
    let current = binding.pendingReceipt
      ? await this.flushPendingReceipt(binding)
      : binding;
    const receipt: CraneStaveReceiptV1 = {
      version: 1,
      jobId: current.jobId,
      connectorId: current.connectorId,
      sequence: current.lastReceiptSequence + 1,
      state,
      occurredAt: this.nowIso(),
      ...(errorCode ? { errorCode } : {}),
    };
    current = this.saveBinding({
      ...current,
      state,
      pendingReceipt: receipt,
      errorCode: errorCode ?? null,
      updatedAt: receipt.occurredAt,
    });
    return this.flushPendingReceipt(current);
  }

  private async flushPendingReceipt(binding: LocalCraneJobBinding) {
    const receipt = binding.pendingReceipt;
    if (!receipt) {
      return binding;
    }
    const [credential, lease] = await Promise.all([
      this.dependencies.vault.getCredential(),
      this.requireLease(binding),
    ]);
    if (!credential || credential.connector.id !== binding.connectorId) {
      throw new Error("connector_scope_mismatch");
    }
    await this.dependencies.createHttpClient(credential.baseUrl).postReceipt({
      secret: credential.secret,
      jobId: binding.jobId,
      leaseId: lease.leaseId,
      receipt,
      signal: this.abortController?.signal,
    });
    return this.saveBinding({
      ...binding,
      state: receipt.state,
      lastReceiptSequence: receipt.sequence,
      pendingReceipt: null,
      errorCode: receipt.errorCode ?? null,
      updatedAt: receipt.occurredAt,
    });
  }

  /**
   * Best-effort: the Crane link belongs in the Crane section of the Information
   * panel, and the linked Jira issue (when Crane reports one) in the Jira
   * section. Failures are swallowed — the job is already approved and must run.
   */
  private async registerWorkspaceIssues(
    workspaceId: string,
    job: CraneStaveJobV1,
  ) {
    const register = this.dependencies.registerWorkspaceIssues;
    if (!register) {
      return;
    }
    const jira = resolveCraneJiraReference(job);
    try {
      await register({
        workspaceId,
        crane: {
          url: job.issue.href,
          issueKey: job.issue.key,
          title: job.issue.title,
        },
        jira: jira?.url ? { url: jira.url, issueKey: jira.key } : null,
      });
    } catch {
      // Intentionally ignored — panel bookkeeping must not block the dispatch.
    }
  }

  private async failBeforeExecution(
    binding: LocalCraneJobBinding,
    errorCode: string,
  ) {
    const failed = await this.publishReceipt(binding, "failed", errorCode);
    this.emitJobUpdate(failed);
    await this.dependencies.vault.deleteLease(binding.jobId);
    this.refreshAggregateStatus({ lastErrorCode: errorCode });
  }

  private async finishRemoteTerminalError(
    binding: LocalCraneJobBinding,
    error: unknown,
  ) {
    if (
      !(error instanceof CraneConnectorHttpError) ||
      !REMOTE_TERMINAL_ERROR_CODES.has(error.code)
    ) {
      return false;
    }
    const errorCode =
      error.code === "job_expired" ? "job_expired" : "remote_job_terminal";
    this.markServerTerminal(binding, "cancelled", errorCode);
    await this.dependencies.vault.deleteLease(binding.jobId);
    return true;
  }

  private markServerTerminal(
    binding: LocalCraneJobBinding,
    state: Extract<CraneStaveReceiptState, "cancelled" | "failed">,
    errorCode: string,
  ) {
    const updated = this.saveBinding({
      ...binding,
      state,
      pendingReceipt: null,
      errorCode,
      updatedAt: this.nowIso(),
    });
    this.refreshAggregateStatus({ lastErrorCode: errorCode });
    this.emitJobUpdate(updated);
  }

  private saveBinding(binding: LocalCraneJobBinding) {
    return this.dependencies.persistence.upsertCraneJobBinding(binding);
  }

  private emitJobUpdate(binding: LocalCraneJobBinding) {
    this.dependencies.emitJobUpdate({
      jobId: binding.jobId,
      state: binding.state,
      workspaceId: binding.workspaceId,
      taskId: binding.taskId,
      errorCode: binding.errorCode,
    });
  }

  private async handleRuntimeError(error: unknown) {
    if (
      error instanceof CraneConnectorHttpError &&
      (error.status === 401 || error.status === 403)
    ) {
      const connectorId = this.status.connector?.id;
      if (connectorId) {
        for (const binding of this.dependencies.persistence.listActiveCraneJobBindings(
          connectorId,
        )) {
          this.markServerTerminal(
            binding,
            "cancelled",
            "connector_unauthorized",
          );
        }
      }
      await this.dependencies.vault.clear().catch(() => undefined);
      this.setStatus({
        runtimeState: "unpaired",
        paired: false,
        connector: null,
        activeJobId: null,
        lastErrorCode: "connector_unauthorized",
      });
      return;
    }
    const code =
      error instanceof CraneConnectorHttpError
        ? error.code
        : error instanceof Error && /^[a-z][a-z0-9_]*$/.test(error.message)
          ? error.message
          : "connector_error";
    this.setStatus({
      runtimeState: code === "network_unavailable" ? "offline" : "error",
      lastErrorCode: code,
    });
  }

  /**
   * The connector exposes one public status while more than one binding can be
   * active, so that status is derived from persisted binding state rather than
   * from whichever code path happened to write last - two observers therefore
   * cannot clobber each other. A pending approval outranks a run because it is
   * the only state that is blocked on the user. Callers supply what binding
   * state cannot express: pairing, heartbeat, and the error code to surface.
   *
   * Deliberately limited to the connected/awaiting/running family. Error and
   * offline states are set directly by the code that detects them.
   */
  private refreshAggregateStatus(patch?: Partial<CraneConnectorPublicStatus>) {
    const connector =
      patch?.connector !== undefined ? patch.connector : this.status.connector;
    const active = connector
      ? this.dependencies.persistence.listActiveCraneJobBindings(connector.id)
      : [];
    const awaiting = active.find(
      (binding) =>
        binding.state === "awaiting_local_approval" && !binding.pendingReceipt,
    );
    const running = active.find(
      (binding) =>
        binding.state === "running" || binding.state === "needs_local_input",
    );
    this.setStatus({
      runtimeState: awaiting
        ? "awaiting_local_approval"
        : running
          ? "running"
          : "connected",
      activeJobId: awaiting?.jobId ?? running?.jobId ?? null,
      ...patch,
    });
  }

  private setStatus(patch: Partial<CraneConnectorPublicStatus>, emit = true) {
    this.status = { ...this.status, ...patch };
    if (emit && this.config.enabled) {
      this.dependencies.emitStatus(this.getStatus());
    }
  }

  private createAbortController() {
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    return controller;
  }

  private stopPendingWork() {
    this.generation += 1;
    if (this.timer) {
      (this.dependencies.clearTimer ?? clearTimeout)(this.timer);
      this.timer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
  }

  private schedule(delayMs: number) {
    if (!this.config.enabled) {
      return;
    }
    if (this.timer) {
      (this.dependencies.clearTimer ?? clearTimeout)(this.timer);
    }
    const generation = this.generation;
    this.timer = (this.dependencies.setTimer ?? setTimeout)(
      () => {
        this.timer = null;
        if (generation !== this.generation || !this.config.enabled) {
          return;
        }
        void this.enqueue(() => this.poll());
      },
      Math.max(0, delayMs),
    );
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private rememberTasksEnabled(
    client: { getLastTasksEnabled?: () => boolean | null },
    fromBody?: boolean,
  ) {
    if (typeof fromBody === "boolean") {
      this.tasksEnabled = fromBody;
      return;
    }
    const fromHeader = client.getLastTasksEnabled?.();
    if (typeof fromHeader === "boolean") {
      this.tasksEnabled = fromHeader;
    }
  }

  private now() {
    return (this.dependencies.now ?? (() => new Date()))();
  }

  private nowIso() {
    return this.now().toISOString();
  }
}
