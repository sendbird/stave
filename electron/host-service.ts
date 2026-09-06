import { randomUUID } from "node:crypto";
import {
  buildPullRequestDescriptionPrompt,
  generateFallbackPullRequestDraft,
  mergePullRequestDraft,
  resolvePullRequestComparisonBaseRef,
  resolvePullRequestTitle,
} from "../src/lib/source-control-pr";
import { DEFAULT_PROMPT_PR_DESCRIPTION } from "../src/lib/providers/prompt-defaults";
import {
  cleanupAllScriptProcesses,
  getScriptStatuses,
  runScriptEntry,
  runScriptHook,
  setWorkspaceScriptEventListener,
  stopAllWorkspaceScriptProcesses,
  stopScriptEntry,
} from "./main/workspace-scripts";
import {
  ensureHostServicePersistenceReady,
  resetHostServicePersistence,
} from "./host-service/persistence";
import {
  checkoutDefaultBranchDetached,
  checkoutScmBranch,
  cherryPickScmCommit,
  commitSourceControl,
  createScmBranch,
  createScmPullRequest,
  createScmTag,
  deleteScmBranch,
  deleteScmTag,
  diffSourceControlFile,
  discardSourceControlPath,
  fetchScmBranch,
  fetchGitHubPrStatus,
  fetchRepoMergeSettings,
  getScmCommitDetails,
  getScmCommitDiff,
  getScmCommitFiles,
  getScmGraph,
  getScmHistory,
  getScmStatus,
  listScmBranches,
  mergeScmBranch,
  mergeScmPr,
  pullScmBranch,
  pushScmBranch,
  rebaseScmBranch,
  renameScmBranch,
  resetScmCommit,
  revertScmCommit,
  setScmPrReady,
  stageAllSourceControl,
  stageSourceControlFile,
  stageSourceControlFiles,
  tryAutoFixLintErrors,
  unstageAllSourceControl,
  unstageSourceControlFile,
  updateScmPrBranch,
} from "./host-service/scm-runtime";
import {
  fetchPrCheckLogs,
  fetchPrContextIndex,
} from "./host-service/pr-context-runtime";
import {
  fetchGitHubPullRequestReviewDetail,
  listGitHubPullRequests,
  submitGitHubPullRequestReview,
} from "./host-service/github-pr-review-runtime";
import * as localMcpRuntime from "./host-service/local-mcp-runtime";
import { createRoutineRuntime } from "./host-service/routine-runtime";
import { createTaskSupervisorRuntime } from "./host-service/task-supervisor-runtime";
import { createTerminalRuntime } from "./host-service/terminal-runtime";
import { readHostServiceResourceMetrics } from "./host-service/resource-metrics";
import {
  parseExpectedHostParentPid,
  startHostParentWatchdog,
} from "./host-service/parent-watchdog";
import type {
  AnyHostServiceRequestEnvelope,
  AnyHostServiceResponseEnvelope,
  HostServiceEventMap,
  HostServiceEventName,
  HostLocalMcpAction,
  HostRoutineAction,
  HostTaskSupervisorAction,
  HostServiceMethod,
  HostServiceResponseMap,
} from "./host-service/protocol";
import { providerRuntime } from "./providers/runtime";
import { getProviderModelCatalog } from "./providers/provider-model-catalog";
import {
  archiveCodexThread,
  batchWriteCodexConfig,
  compactCodexThread,
  forkCodexThread,
  getCodexAppServerSnapshot,
  getCodexMcpRuntimeStatus,
  getCodexModelCatalog,
  getCodexPluginDetail,
  importCodexExternalConfig,
  installCodexPlugin,
  readCodexThread,
  readCodexMcpResource,
  renameCodexThread,
  reviewCodexWorktreeDiff,
  rollbackCodexThread,
  setCodexExperimentalFeatureEnablement,
  suggestCodexPRDescription,
  startCodexMcpOauthLogin,
  startCodexReview,
  uninstallCodexPlugin,
  writeCodexConfigValue,
} from "./providers/codex-app-server-runtime";
import { getRateLimitsSnapshot } from "./providers/rate-limits/rate-limits-snapshot";
import { closeKiroUsageConnection } from "./providers/rate-limits/kiro-usage-fetcher";
import {
  forkClaudeSession,
  getClaudeContextUsage,
  getClaudeMcpStatus,
  prewarmClaudeSdk,
  listClaudeInstalledPlugins,
  renameClaudeSession,
  reloadClaudePlugins,
  rewindClaudeFiles,
  reviewClaudeWorktreeDiff,
  suggestClaudePRDescription,
  startClaudeMcpOauthLogin,
} from "./providers/claude-sdk-runtime";
import { startCursorMcpOauthLogin } from "./providers/cursor-mcp-oauth";
import {
  classifyUtilityRoute,
  enhanceUtilityPrompt,
  suggestUtilityCommitMessage,
  suggestUtilityTaskName,
} from "./providers/utility-inference";
import {
  normalizePrePrReviewProvider,
  PRE_PR_REVIEW_BRANCH_DIFF_MAX_CHARS,
  PRE_PR_REVIEW_WORKING_TREE_DIFF_MAX_CHARS,
} from "../src/lib/source-control-review";
import {
  getCodexMcpStatus,
  getToolingStatusSnapshot,
  syncWorkspaceWithOriginMain,
} from "./main/utils/tooling-status";
import { isDoneEvent } from "./main/utils/provider-events";
import { prepareCliExecutableDiscovery } from "./providers/cli-path-env";
import {
  resolveCommandCwd,
  runCommand,
  runCommandArgs,
} from "./main/utils/command";
import type { BridgeEvent, StreamTurnArgs } from "./providers/types";
import { truncateUtf8Middle } from "./shared/bounded-text";
import {
  HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES,
  HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES,
  shouldBypassOutboundQueueLimit,
  truncateHostServiceErrorMessage,
} from "./shared/host-service-transport";
import {
  JsonMessageFrameDecoder,
  serializeJsonFramedMessage,
} from "./shared/json-message-framing";
import { collectUntrackedWorkingTreeDiff } from "./host-service/pr-description-context";
import {
  buildIntentGuardFingerprint,
  IntentGuardFingerprintCache,
} from "./host-service/intent-guard-cache";
import {
  cancelSecondaryProviderRun,
  executeSecondaryProviderRun,
} from "./providers/secondary-run-executor";
import {
  applyMcpServerConfigMutation,
  listMcpServerConfigs,
  previewMcpServerConfigMutation,
} from "./providers/mcp-config-management";
import { claimHostServiceStdout } from "./host-service/stdout-guard";
import { toPersistenceTurnUsage } from "./persistence/turn-usage";
import type { PersistenceTurnUsage } from "./persistence/types";

/**
 * Claimed before anything in this process can log: stdout carries the protocol
 * frames, and a single `console.log` landing between them fails the parent's
 * decoder. Everything else that writes to stdout now goes to stderr instead.
 */
const hostServiceStdout = claimHostServiceStdout();

type HostServiceOutboundMessage =
  | AnyHostServiceResponseEnvelope
  | {
      type: "ready";
    }
  | {
      type: "event";
      event: HostServiceEventName;
      payload: HostServiceEventMap[HostServiceEventName];
    };

const HOST_SERVICE_QUEUE_WARN_DEPTH = 24;
const HOST_SERVICE_QUEUE_WARN_BYTES = 256 * 1024;
const HOST_SERVICE_QUEUE_MAX_BYTES = 2 * 1024 * 1024;
const HOST_SERVICE_QUEUE_SLOW_WRITE_MS = 48;
const HOST_SERVICE_QUEUE_LOG_INTERVAL_MS = 2_000;
const HOST_SERVICE_SHUTDOWN_TIMEOUT_MS = 10_000;
/**
 * Absolute backstop after a shutdown has been triggered. Even if `shutdown()`
 * itself wedges past its internal timeout (a sync persistence close that
 * blocks, an exit path that never settles), the process still terminates
 * instead of lingering as a ghost that keeps provider subprocesses alive.
 */
const HOST_SERVICE_HARD_EXIT_TIMEOUT_MS =
  HOST_SERVICE_SHUTDOWN_TIMEOUT_MS + 5_000;
const HOST_PROVIDER_EVENT_STRING_MAX_BYTES = 128 * 1024;
const HOST_PROVIDER_EVENT_LIST_MAX_ITEMS = 32;
const HOST_SERVICE_STDIN_BUFFER_MAX_BYTES =
  HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES;
const HOST_SERVICE_STDIN_MESSAGE_MAX_BYTES =
  HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES;

let messageWriteChain = Promise.resolve();
let pendingMessageCount = 0;
let pendingMessageBytes = 0;
let peakPendingMessageCount = 0;
let peakPendingMessageBytes = 0;
let lastBackpressureLogAt = 0;
let backpressureWarningActive = false;
let fatalHostServiceError: Error | null = null;
let shutdownTriggered = false;

function describeOutboundMessage(message: HostServiceOutboundMessage) {
  if (message.type === "ready") {
    return "ready";
  }
  if (message.type === "response") {
    return `response:${message.id}`;
  }
  return `event:${message.event}`;
}

const isDevBuild = !!process.env.STAVE_DEV;

function logHostServiceQueue(message: string) {
  if (!isDevBuild) return;
  process.stderr.write(`[host-service:backpressure] ${message}\n`);
}

function maybeLogQueueBackpressure(args: {
  reason: string;
  label: string;
  durationMs?: number;
}) {
  const overThreshold =
    pendingMessageCount >= HOST_SERVICE_QUEUE_WARN_DEPTH ||
    pendingMessageBytes >= HOST_SERVICE_QUEUE_WARN_BYTES;
  const isSlowWrite =
    typeof args.durationMs === "number" &&
    args.durationMs >= HOST_SERVICE_QUEUE_SLOW_WRITE_MS;
  if (!overThreshold && !isSlowWrite) {
    return;
  }
  const now = Date.now();
  if (now - lastBackpressureLogAt < HOST_SERVICE_QUEUE_LOG_INTERVAL_MS) {
    return;
  }
  lastBackpressureLogAt = now;
  backpressureWarningActive = true;
  const durationSuffix =
    typeof args.durationMs === "number" ? ` durationMs=${args.durationMs}` : "";
  logHostServiceQueue(
    `${args.reason} label=${args.label} pendingMessages=${pendingMessageCount} pendingBytes=${pendingMessageBytes} peakMessages=${peakPendingMessageCount} peakBytes=${peakPendingMessageBytes}${durationSuffix}`,
  );
}

function maybeLogQueueRecovery() {
  if (!backpressureWarningActive) {
    return;
  }
  if (pendingMessageCount > 0 || pendingMessageBytes > 0) {
    return;
  }
  backpressureWarningActive = false;
  logHostServiceQueue(
    `drained peakMessages=${peakPendingMessageCount} peakBytes=${peakPendingMessageBytes}`,
  );
}

function scheduleHardExit(exitCode: number) {
  const timer = setTimeout(() => {
    process.stderr.write(
      `[host-service] shutdown did not complete within ${HOST_SERVICE_HARD_EXIT_TIMEOUT_MS}ms; forcing exit\n`,
    );
    process.exit(exitCode);
  }, HOST_SERVICE_HARD_EXIT_TIMEOUT_MS);
  timer.unref?.();
}

/**
 * Single guarded path for every way this process can end (stdin close, fatal
 * protocol error, termination signal): run `shutdown()` exactly once so
 * provider subprocesses, PTYs, and the turn journal are cleaned up, and arm a
 * hard-exit backstop so a wedged shutdown still exits.
 */
function beginGuardedShutdown(args: { reason: string; exitCode: number }) {
  if (shutdownTriggered) {
    return false;
  }
  shutdownTriggered = true;
  scheduleHardExit(args.exitCode);
  void shutdown()
    .catch((shutdownError) => {
      process.stderr.write(
        `[host-service] shutdown error (${args.reason}): ${String(shutdownError)}\n`,
      );
    })
    .finally(() => {
      process.exit(args.exitCode);
    });
  return true;
}

function triggerFatalHostServiceError(error: Error) {
  if (fatalHostServiceError) {
    return;
  }
  fatalHostServiceError = error;
  process.stderr.write(`[host-service] ${error.message}\n`);
  beginGuardedShutdown({ reason: "fatal error", exitCode: 1 });
}

function shrinkProviderEventString(value: string, label: string) {
  return truncateUtf8Middle({
    value,
    maxBytes: HOST_PROVIDER_EVENT_STRING_MAX_BYTES,
    marker: `\n…<${label} truncated for transport>…\n`,
  });
}

function shrinkProviderStreamEventPayload(
  payload: HostServiceEventMap["provider.stream-event"],
): HostServiceEventMap["provider.stream-event"] {
  const event = payload.event;
  switch (event.type) {
    case "thinking":
      return {
        ...payload,
        event: {
          ...event,
          text: shrinkProviderEventString(event.text, "thinking"),
        },
      };
    case "text":
      return {
        ...payload,
        event: {
          ...event,
          text: shrinkProviderEventString(event.text, "text"),
        },
      };
    case "tool":
      return {
        ...payload,
        event: {
          ...event,
          input: shrinkProviderEventString(event.input, "tool-input"),
          output: event.output
            ? shrinkProviderEventString(event.output, "tool-output")
            : event.output,
        },
      };
    case "tool_result":
      return {
        ...payload,
        event: {
          ...event,
          output: shrinkProviderEventString(event.output, "tool-result"),
        },
      };
    case "diff":
      return {
        ...payload,
        event: {
          ...event,
          oldContent: shrinkProviderEventString(event.oldContent, "diff-old"),
          newContent: shrinkProviderEventString(event.newContent, "diff-new"),
        },
      };
    case "approval":
      return {
        ...payload,
        event: {
          ...event,
          description: shrinkProviderEventString(
            event.description,
            "approval-description",
          ),
        },
      };
    case "plan_ready":
      return {
        ...payload,
        event: {
          ...event,
          planText: shrinkProviderEventString(event.planText, "plan"),
        },
      };
    case "system":
      return {
        ...payload,
        event: {
          ...event,
          content: shrinkProviderEventString(event.content, "system"),
        },
      };
    case "subagent_progress":
      return {
        ...payload,
        event: {
          ...event,
          content: shrinkProviderEventString(
            event.content,
            "subagent-progress",
          ),
        },
      };
    case "error":
      return {
        ...payload,
        event: {
          ...event,
          message: shrinkProviderEventString(event.message, "error"),
        },
      };
    case "prompt_suggestions":
      return {
        ...payload,
        event: {
          ...event,
          suggestions: event.suggestions
            .slice(0, HOST_PROVIDER_EVENT_LIST_MAX_ITEMS)
            .map((suggestion) =>
              shrinkProviderEventString(suggestion, "prompt-suggestion"),
            ),
        },
      };
    default:
      return payload;
  }
}

function writeMessageNow(serializedMessage: string, label: string) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    hostServiceStdout.writeFrame(serializedMessage, (error) => {
      if (error) {
        reject(error);
        return;
      }
      maybeLogQueueBackpressure({
        reason: "slow-write",
        label,
        durationMs: Date.now() - startedAt,
      });
      resolve();
    });
  });
}

function writeMessage(message: HostServiceOutboundMessage) {
  const label = describeOutboundMessage(message);
  const serializedMessage = serializeJsonFramedMessage(message);
  const messageBytes = serializedMessage.serializedBytes;
  if (fatalHostServiceError) {
    return Promise.reject(fatalHostServiceError);
  }
  if (
    !shouldBypassOutboundQueueLimit(message) &&
    pendingMessageBytes + messageBytes > HOST_SERVICE_QUEUE_MAX_BYTES
  ) {
    const error = new Error(
      `protocol overflow: outbound queue exceeded ${HOST_SERVICE_QUEUE_MAX_BYTES} bytes`,
    );
    maybeLogQueueBackpressure({
      reason: "rejected",
      label,
    });
    return Promise.reject(error);
  }
  pendingMessageCount += 1;
  pendingMessageBytes += messageBytes;
  peakPendingMessageCount = Math.max(
    peakPendingMessageCount,
    pendingMessageCount,
  );
  peakPendingMessageBytes = Math.max(
    peakPendingMessageBytes,
    pendingMessageBytes,
  );
  maybeLogQueueBackpressure({
    reason: "queued",
    label,
  });
  const nextWrite = messageWriteChain.then(
    () => writeMessageNow(serializedMessage.serialized, label),
    () => writeMessageNow(serializedMessage.serialized, label),
  );
  const trackedWrite = nextWrite
    .catch((error) => {
      triggerFatalHostServiceError(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    })
    .finally(() => {
      pendingMessageCount = Math.max(0, pendingMessageCount - 1);
      pendingMessageBytes = Math.max(0, pendingMessageBytes - messageBytes);
      maybeLogQueueRecovery();
    });
  messageWriteChain = trackedWrite.catch(() => {});
  return trackedWrite;
}

function emitEvent<TEvent extends HostServiceEventName>(
  event: TEvent,
  payload: HostServiceEventMap[TEvent],
) {
  const normalizedPayload =
    event === "provider.stream-event"
      ? shrinkProviderStreamEventPayload(
          payload as HostServiceEventMap["provider.stream-event"],
        )
      : payload;
  const writePromise = writeMessage({
    type: "event",
    event,
    payload: normalizedPayload as HostServiceEventMap[TEvent],
  });
  void writePromise.catch((error) => {
    process.stderr.write(
      `[host-service] failed to emit ${event}: ${String(error)}\n`,
    );
  });
  return writePromise;
}

const terminalRuntime = createTerminalRuntime({
  emitEvent,
  persistence: ensureHostServicePersistenceReady(),
});
const routineRuntime = createRoutineRuntime({
  persistence: ensureHostServicePersistenceReady(),
  runTask: localMcpRuntime.runTask,
  getTaskStatus: localMcpRuntime.getTaskStatus,
  getWorkspaceInformation: localMcpRuntime.getWorkspaceInformation,
  emitUnattendedAutomationsChanged: (payload) => {
    emitEvent("routine.unattended-automations-changed", payload);
  },
});
const taskSupervisorRuntime = createTaskSupervisorRuntime({
  persistence: ensureHostServicePersistenceReady(),
  getTaskSupervisionSnapshot: localMcpRuntime.getTaskSupervisionSnapshot,
  runHeartbeatTurn: localMcpRuntime.runHeartbeatTurn,
  // Wiring this is what makes completion observable at all: without it the
  // capability probe reports `unsupported` and a completion heartbeat is
  // refused rather than left waiting for an event that never arrives.
  listCompletedDelegatedRuns: ({ taskId }) =>
    localMcpRuntime.listTaskCompletionSignals({ taskId }),
  // A consumed receipt that never became a turn has to surface somewhere, or
  // "exactly one follow-up turn or one terminal notification" quietly becomes
  // neither.
  notifyHeartbeatWakeFailed: localMcpRuntime.notifyHeartbeatWakeFailed,
});
setWorkspaceScriptEventListener((envelope) => {
  emitEvent("workspace-scripts.event", envelope);
});
localMcpRuntime.setLocalMcpEventListener((event) => {
  if (event.type === "workspace-information-updated") {
    emitEvent("local-mcp.workspace-information-updated", event.payload);
    return;
  }
  emitEvent("local-mcp.task-turn-updated", event.payload);
});

async function invokeLocalMcpAction(action: HostLocalMcpAction, args: unknown) {
  switch (action) {
    case "list-known-projects":
      return localMcpRuntime.listKnownProjects();
    case "register-project":
      return localMcpRuntime.registerProject(
        args as Parameters<typeof localMcpRuntime.registerProject>[0],
      );
    case "create-workspace":
      return localMcpRuntime.createWorkspace(
        args as Parameters<typeof localMcpRuntime.createWorkspace>[0],
      );
    case "run-task":
      return localMcpRuntime.runTask(
        args as Parameters<typeof localMcpRuntime.runTask>[0],
      );
    case "get-task-status":
      return localMcpRuntime.getTaskStatus(
        args as Parameters<typeof localMcpRuntime.getTaskStatus>[0],
      );
    case "release-task-parent":
      return localMcpRuntime.releaseTaskParent(
        args as Parameters<typeof localMcpRuntime.releaseTaskParent>[0],
      );
    case "respond-approval":
      return localMcpRuntime.respondApproval(
        args as Parameters<typeof localMcpRuntime.respondApproval>[0],
      );
    case "respond-user-input":
      return localMcpRuntime.respondUserInput(
        args as Parameters<typeof localMcpRuntime.respondUserInput>[0],
      );
    case "get-workspace-information":
      return localMcpRuntime.getWorkspaceInformation(
        args as Parameters<typeof localMcpRuntime.getWorkspaceInformation>[0],
      );
    case "set-workspace-martin-project":
      return localMcpRuntime.setWorkspaceMartinProject(
        args as Parameters<typeof localMcpRuntime.setWorkspaceMartinProject>[0],
      );
    case "replace-workspace-notes":
      return localMcpRuntime.replaceWorkspaceNotes(
        args as Parameters<typeof localMcpRuntime.replaceWorkspaceNotes>[0],
      );
    case "append-workspace-notes":
      return localMcpRuntime.appendWorkspaceNotes(
        args as Parameters<typeof localMcpRuntime.appendWorkspaceNotes>[0],
      );
    case "remember-project-memory":
      return localMcpRuntime.rememberProjectMemory(
        args as Parameters<typeof localMcpRuntime.rememberProjectMemory>[0],
      );
    case "forget-project-memory":
      return localMcpRuntime.forgetProjectMemory(
        args as Parameters<typeof localMcpRuntime.forgetProjectMemory>[0],
      );
    case "list-project-memories":
      return localMcpRuntime.listProjectMemories(
        args as Parameters<typeof localMcpRuntime.listProjectMemories>[0],
      );
    case "clear-workspace-notes":
      return localMcpRuntime.clearWorkspaceNotes(
        args as Parameters<typeof localMcpRuntime.clearWorkspaceNotes>[0],
      );
    case "add-workspace-todo":
      return localMcpRuntime.addWorkspaceTodo(
        args as Parameters<typeof localMcpRuntime.addWorkspaceTodo>[0],
      );
    case "update-workspace-todo":
      return localMcpRuntime.updateWorkspaceTodo(
        args as Parameters<typeof localMcpRuntime.updateWorkspaceTodo>[0],
      );
    case "remove-workspace-todo":
      return localMcpRuntime.removeWorkspaceTodo(
        args as Parameters<typeof localMcpRuntime.removeWorkspaceTodo>[0],
      );
    case "add-workspace-resource":
      return localMcpRuntime.addWorkspaceResource(
        args as Parameters<typeof localMcpRuntime.addWorkspaceResource>[0],
      );
    case "remove-workspace-resource":
      return localMcpRuntime.removeWorkspaceResource(
        args as Parameters<typeof localMcpRuntime.removeWorkspaceResource>[0],
      );
    case "add-workspace-custom-field":
      return localMcpRuntime.addWorkspaceCustomField(
        args as Parameters<typeof localMcpRuntime.addWorkspaceCustomField>[0],
      );
    case "set-workspace-custom-field":
      return localMcpRuntime.setWorkspaceCustomField(
        args as Parameters<typeof localMcpRuntime.setWorkspaceCustomField>[0],
      );
    case "remove-workspace-custom-field":
      return localMcpRuntime.removeWorkspaceCustomField(
        args as Parameters<
          typeof localMcpRuntime.removeWorkspaceCustomField
        >[0],
      );
    case "add-workspace-crane-issue":
      return localMcpRuntime.addWorkspaceCraneIssue(
        args as Parameters<typeof localMcpRuntime.addWorkspaceCraneIssue>[0],
      );
    case "add-workspace-jira-issue":
      return localMcpRuntime.addWorkspaceJiraIssue(
        args as Parameters<typeof localMcpRuntime.addWorkspaceJiraIssue>[0],
      );
    case "add-workspace-confluence-page":
      return localMcpRuntime.addWorkspaceConfluencePage(
        args as Parameters<
          typeof localMcpRuntime.addWorkspaceConfluencePage
        >[0],
      );
    case "add-workspace-figma-resource":
      return localMcpRuntime.addWorkspaceFigmaResource(
        args as Parameters<typeof localMcpRuntime.addWorkspaceFigmaResource>[0],
      );
    case "add-workspace-storybook-resource":
      return localMcpRuntime.addWorkspaceStorybookResource(
        args as Parameters<
          typeof localMcpRuntime.addWorkspaceStorybookResource
        >[0],
      );
    case "update-workspace-storybook-resource-access":
      return localMcpRuntime.updateWorkspaceStorybookResourceAccess(
        args as Parameters<
          typeof localMcpRuntime.updateWorkspaceStorybookResourceAccess
        >[0],
      );
    case "add-workspace-slack-thread":
      return localMcpRuntime.addWorkspaceSlackThread(
        args as Parameters<typeof localMcpRuntime.addWorkspaceSlackThread>[0],
      );
    case "add-workspace-amplify-link":
      return localMcpRuntime.addWorkspaceAmplifyLink(
        args as Parameters<typeof localMcpRuntime.addWorkspaceAmplifyLink>[0],
      );
    default:
      action satisfies never;
      throw new Error(`Unsupported local MCP action: ${action}`);
  }
}

async function invokeRoutineAction(action: HostRoutineAction, args: unknown) {
  switch (action) {
    case "list":
      return routineRuntime.list();
    case "create":
      return routineRuntime.create(
        args as Parameters<typeof routineRuntime.create>[0],
      );
    case "update":
      return routineRuntime.update(
        args as Parameters<typeof routineRuntime.update>[0],
      );
    case "remove":
      return routineRuntime.remove(
        args as Parameters<typeof routineRuntime.remove>[0],
      );
    case "set-enabled":
      return routineRuntime.setEnabled(
        args as Parameters<typeof routineRuntime.setEnabled>[0],
      );
    case "set-provider-timeout":
      return routineRuntime.setProviderTimeoutMs(
        args as Parameters<typeof routineRuntime.setProviderTimeoutMs>[0],
      );
    case "run-now":
      return routineRuntime.runNow(
        args as Parameters<typeof routineRuntime.runNow>[0],
      );
    case "list-information-references":
      return routineRuntime.listInformationReferences(
        args as Parameters<typeof routineRuntime.listInformationReferences>[0],
      );
    default:
      action satisfies never;
      throw new Error(`Unsupported routine action: ${String(action)}`);
  }
}

async function invokeTaskSupervisorAction(
  action: HostTaskSupervisorAction,
  args: unknown,
) {
  switch (action) {
    case "list":
      return taskSupervisorRuntime.list(
        args as Parameters<typeof taskSupervisorRuntime.list>[0],
      );
    case "get":
      return taskSupervisorRuntime.get(
        args as Parameters<typeof taskSupervisorRuntime.get>[0],
      );
    case "create":
      return taskSupervisorRuntime.create(
        args as Parameters<typeof taskSupervisorRuntime.create>[0],
      );
    case "update":
      return taskSupervisorRuntime.update(
        args as Parameters<typeof taskSupervisorRuntime.update>[0],
      );
    case "pause":
      return taskSupervisorRuntime.pause(
        args as Parameters<typeof taskSupervisorRuntime.pause>[0],
      );
    case "resume":
      return taskSupervisorRuntime.resume(
        args as Parameters<typeof taskSupervisorRuntime.resume>[0],
      );
    case "remove":
      return taskSupervisorRuntime.remove(
        args as Parameters<typeof taskSupervisorRuntime.remove>[0],
      );
    default:
      action satisfies never;
      throw new Error(`Unsupported task supervisor action: ${String(action)}`);
  }
}

/** Max time a buffered turn event waits before being flushed to SQLite. */
const TURN_EVENT_FLUSH_INTERVAL_MS = 300;
/** Flush immediately once this many events are buffered, regardless of timer. */
const TURN_EVENT_FLUSH_MAX_PENDING = 64;

/**
 * Finalizers for in-flight push turns. Shutdown walks this so a turn that
 * never reached its terminal event still gets its buffered journal entries
 * flushed (and its flush timer cleared) before persistence closes.
 */
const activePushTurnFlushFinalizers = new Set<() => void>();

function flushActivePushTurnEvents() {
  for (const finalize of Array.from(activePushTurnFlushFinalizers)) {
    try {
      finalize();
    } catch (error) {
      process.stderr.write(
        `[host-service] failed to flush push-turn events during shutdown: ${String(error)}\n`,
      );
    }
  }
}

function startPushProviderTurn(args: StreamTurnArgs) {
  const turnId = args.turnId ?? randomUUID();
  const store = args.taskId ? ensureHostServicePersistenceReady() : null;
  let sequence = 0;
  let completed = false;

  // W1 Phase 0 — durable turn-event journaling. Buffer events and flush to
  // SQLite in batches so the provider stream hot path never blocks on a
  // per-event DB write (the unbounded per-event journal it replaces was purged).
  const persistEnabled = Boolean(args.taskId && store);
  let pendingTurnEvents: Array<{ sequence: number; event: BridgeEvent }> = [];
  let turnEventFlushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushTurnEvents = () => {
    if (!persistEnabled || !store || pendingTurnEvents.length === 0) {
      return;
    }
    const batch = pendingTurnEvents;
    pendingTurnEvents = [];
    try {
      store.saveStreamEvents({ turnId, events: batch });
    } catch (error) {
      console.warn(
        "[provider:persistence] failed to save stream events",
        error,
        { turnId, count: batch.length, providerId: args.providerId },
      );
    }
  };

  const stopTurnEventFlushTimer = () => {
    if (turnEventFlushTimer) {
      clearTimeout(turnEventFlushTimer);
      turnEventFlushTimer = null;
    }
  };

  // One-shot, unref'd, and re-armed only while events are actually pending: a
  // turn that stalls forever holds at most one 300ms timer instead of an
  // eternal interval, and the timer never keeps the process alive on its own.
  const scheduleTurnEventFlush = () => {
    if (turnEventFlushTimer) {
      return;
    }
    turnEventFlushTimer = setTimeout(() => {
      turnEventFlushTimer = null;
      flushTurnEvents();
    }, TURN_EVENT_FLUSH_INTERVAL_MS);
    turnEventFlushTimer.unref?.();
  };

  const finalizeTurnEventFlush = () => {
    activePushTurnFlushFinalizers.delete(finalizeTurnEventFlush);
    stopTurnEventFlushTimer();
    flushTurnEvents();
  };
  if (persistEnabled) {
    activePushTurnFlushFinalizers.add(finalizeTurnEventFlush);
  }

  if (args.taskId && store) {
    try {
      store.beginTurn({
        id: turnId,
        workspaceId: args.workspaceId ?? "default",
        taskId: args.taskId,
        providerId: args.providerId,
      });
    } catch (error) {
      console.warn("[provider:persistence] failed to begin turn", error, {
        turnId,
        providerId: args.providerId,
        taskId: args.taskId,
        workspaceId: args.workspaceId ?? null,
      });
    }
  }

  let latestTurnUsage: PersistenceTurnUsage | null = null;
  const started = providerRuntime.startTurnStream(
    {
      ...args,
      turnId,
    },
    {
      bufferEvents: true,
      onEvent: (turnEvent) => {
        sequence += 1;

        // The last `usage` event of a turn is its authoritative total; earlier
        // ones are throttled running totals of the same counters.
        if (turnEvent.type === "usage") {
          latestTurnUsage = toPersistenceTurnUsage(turnEvent);
        }

        if (persistEnabled) {
          pendingTurnEvents.push({ sequence, event: turnEvent });
          if (pendingTurnEvents.length >= TURN_EVENT_FLUSH_MAX_PENDING) {
            flushTurnEvents();
          } else {
            scheduleTurnEventFlush();
          }
        }

        emitEvent("provider.stream-event", {
          streamId: started.streamId,
          event: turnEvent,
          sequence,
          done: isDoneEvent({ event: turnEvent }),
          taskId: args.taskId ?? null,
          workspaceId: args.workspaceId ?? null,
          providerId: args.providerId,
          turnId: args.taskId ? turnId : null,
        });
      },
      onDone: () => {
        finalizeTurnEventFlush();
        if (!completed && args.taskId && store) {
          completed = true;
          try {
            store.completeTurn({
              id: turnId,
              completedAt: new Date().toISOString(),
              usage: latestTurnUsage,
            });
          } catch (error) {
            console.warn(
              "[provider:persistence] failed to complete turn",
              error,
              {
                turnId,
                providerId: args.providerId,
                taskId: args.taskId,
              },
            );
          }
        }
      },
    },
  );

  return {
    ok: true,
    streamId: started.streamId,
    turnId: args.taskId ? turnId : null,
  } as const;
}

async function suggestProviderCommitMessage(
  args: import("./host-service/protocol").HostProviderSuggestCommitMessageArgs,
) {
  const cwd = args.cwd;
  const [diffResult, statusResult] = await Promise.all([
    runCommandArgs({ command: "git", commandArgs: ["diff", "HEAD"], cwd }),
    runCommandArgs({
      command: "git",
      commandArgs: ["status", "--porcelain"],
      cwd,
    }),
  ]);

  const diff = diffResult.ok ? diffResult.stdout.trim() : "";
  const fileList = statusResult.ok ? statusResult.stdout.trim() : "";
  return suggestUtilityCommitMessage({ ...args, diff, fileList });
}

async function collectProviderPullRequestContext(args: {
  cwd?: string;
  baseBranch?: string;
  headBranch?: string;
}) {
  const cwd = resolveCommandCwd({ cwd: args.cwd });
  const baseBranch = args.baseBranch?.trim() || "main";
  const expectedBranch = args.headBranch?.trim() || undefined;

  const remoteBranchesResult = await runCommandArgs({
    command: "git",
    commandArgs: ["branch", "-r", "--format=%(refname:short)"],
    cwd,
  });
  const comparisonBaseRef = resolvePullRequestComparisonBaseRef({
    baseBranch,
    remoteBranches: remoteBranchesResult.ok
      ? remoteBranchesResult.stdout
          .split("\n")
          .map((branch) => branch.trim())
          .filter(Boolean)
      : [],
  });
  const [
    diffResult,
    trackedWorkingTreeDiffResult,
    untrackedWorkingTreeDiff,
    logResult,
    statResult,
    statusResult,
    prTemplateResult,
    agentsResult,
    branchResult,
  ] = await Promise.all([
    runCommandArgs({
      command: "git",
      commandArgs: [
        "diff",
        "--no-ext-diff",
        "--unified=2",
        `${comparisonBaseRef}...HEAD`,
      ],
      cwd,
    }),
    runCommandArgs({
      command: "git",
      commandArgs: ["diff", "--no-ext-diff", "--unified=2", "HEAD"],
      cwd,
    }),
    collectUntrackedWorkingTreeDiff({ cwd }),
    runCommandArgs({
      command: "git",
      commandArgs: [
        "log",
        `${comparisonBaseRef}..HEAD`,
        "--pretty=format:%h %s",
        "--no-merges",
      ],
      cwd,
    }),
    runCommandArgs({
      command: "git",
      commandArgs: ["diff", `${comparisonBaseRef}...HEAD`, "--stat"],
      cwd,
    }),
    runCommandArgs({
      command: "git",
      commandArgs: ["status", "--porcelain"],
      cwd,
    }),
    runCommand({
      command: "cat .github/PULL_REQUEST_TEMPLATE.md 2>/dev/null || true",
      cwd,
    }),
    runCommand({ command: "cat AGENTS.md 2>/dev/null || true", cwd }),
    runCommandArgs({
      command: "git",
      commandArgs: ["rev-parse", "--abbrev-ref", "HEAD"],
      cwd,
    }),
  ]);

  const gitDetectedBranch = branchResult.ok
    ? branchResult.stdout.trim()
    : "HEAD";
  const headBranch = expectedBranch || gitDetectedBranch;

  if (
    expectedBranch &&
    gitDetectedBranch !== "HEAD" &&
    gitDetectedBranch !== expectedBranch
  ) {
    return { ok: false, headBranch: gitDetectedBranch } as const;
  }

  const diff = diffResult.ok ? diffResult.stdout.trim() : "";
  const workingTreeDiff = [
    trackedWorkingTreeDiffResult.ok
      ? trackedWorkingTreeDiffResult.stdout.trim()
      : "",
    untrackedWorkingTreeDiff.trim(),
  ]
    .filter(Boolean)
    .join("\n");
  const commitLog = logResult.ok ? logResult.stdout.trim() : "";
  const fileList = [
    statResult.ok ? statResult.stdout.trim() : "",
    statusResult.ok ? statusResult.stdout.trim() : "",
  ]
    .filter(Boolean)
    .join("\n");
  const prTemplateContent = prTemplateResult.ok
    ? prTemplateResult.stdout.trim()
    : undefined;
  const agentsContent = agentsResult.ok
    ? agentsResult.stdout.trim()
    : undefined;

  return {
    ok: true,
    cwd,
    baseBranch,
    headBranch,
    diff,
    workingTreeDiff,
    commitLog,
    fileList,
    prTemplateContent,
    agentsContent,
  } as const;
}

async function suggestProviderPRDescription(args: {
  cwd?: string;
  baseBranch?: string;
  headBranch?: string;
  providerId?: StreamTurnArgs["providerId"];
  promptTemplate?: string;
  workspaceContext?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const context = await collectProviderPullRequestContext(args);
  if (!context.ok) {
    return { ok: false, headBranch: context.headBranch };
  }

  const fallbackDraft = generateFallbackPullRequestDraft({
    baseBranch: context.baseBranch,
    headBranch: context.headBranch,
    commitLog: context.commitLog,
    fileList: context.fileList,
  });

  const baseTemplate =
    args.promptTemplate === undefined
      ? DEFAULT_PROMPT_PR_DESCRIPTION
      : args.promptTemplate.trim();
  const prompt = baseTemplate
    ? buildPullRequestDescriptionPrompt({
        baseTemplate,
        baseBranch: context.baseBranch,
        headBranch: context.headBranch,
        commitLog: context.commitLog,
        fileList: context.fileList,
        diff: context.diff,
        workingTreeDiff: context.workingTreeDiff,
        prTemplateContent: context.prTemplateContent,
        agentsContent: context.agentsContent,
        workspaceContext: args.workspaceContext,
      })
    : "";
  const suggestion = !prompt
    ? { ok: false as const }
    : args.providerId === "codex"
      ? await suggestCodexPRDescription({
          cwd: context.cwd,
          prompt,
          model: args.runtimeOptions?.model,
          runtimeOptions: args.runtimeOptions,
        })
      : await suggestClaudePRDescription({
          cwd: context.cwd,
          prompt,
          model: args.runtimeOptions?.model,
        });
  const mergedDraft = mergePullRequestDraft({
    fallbackTitle: fallbackDraft.title,
    fallbackBody: fallbackDraft.body,
    generatedTitle: suggestion.title,
    generatedBody: suggestion.body,
  });
  const resolvedTitle = resolvePullRequestTitle({
    currentTitle: mergedDraft.title,
    commitLog: context.commitLog,
    headBranch: context.headBranch,
  });

  return {
    ok: true,
    title: resolvedTitle,
    body: mergedDraft.body,
    headBranch: context.headBranch,
  };
}

/** Per-worktree fingerprint of the last intent-guard verdict. */
const intentGuardCache = new IntentGuardFingerprintCache<
  Awaited<ReturnType<typeof reviewClaudeWorktreeDiff>>["findings"]
>();

async function reviewProviderDiff(args: {
  cwd?: string;
  baseBranch?: string;
  headBranch?: string;
  providerId?: StreamTurnArgs["providerId"];
  model?: string;
  mode?: "review" | "intent";
  intentContext?: string;
  intentFingerprintGate?: boolean;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const providerId = normalizePrePrReviewProvider(args.providerId);
  const context = await collectProviderPullRequestContext(args);
  if (!context.ok) {
    return {
      ok: false,
      findings: [],
      headBranch: context.headBranch,
      providerId,
    };
  }

  // Repeated intent-guard checks over an unchanged diff answer themselves.
  const intentFingerprint =
    args.intentFingerprintGate && args.mode === "intent" && args.intentContext
      ? buildIntentGuardFingerprint({
          intentContext: args.intentContext,
          diff: context.diff,
          workingTreeDiff: context.workingTreeDiff,
          providerId,
          model: args.model ?? args.runtimeOptions?.model,
        })
      : null;
  if (intentFingerprint) {
    const cached = intentGuardCache.get(context.cwd, intentFingerprint);
    if (cached) {
      return {
        ok: true,
        findings: cached,
        headBranch: context.headBranch,
        providerId,
        unchanged: true,
      };
    }
  }

  const reviewArgs = {
    cwd: context.cwd,
    diff: context.diff,
    workingTreeDiff: context.workingTreeDiff,
    commitLog: context.commitLog,
    fileList: context.fileList,
    baseBranch: context.baseBranch,
    headBranch: context.headBranch,
    agentsContent: context.agentsContent,
    model: args.model ?? args.runtimeOptions?.model,
    mode: args.mode,
    intentContext: args.intentContext,
  };
  const review =
    providerId === "codex"
      ? await reviewCodexWorktreeDiff({
          ...reviewArgs,
          runtimeOptions: args.runtimeOptions,
        })
      : await reviewClaudeWorktreeDiff(reviewArgs);

  const findings = review.findings ?? [];
  if (intentFingerprint && review.ok) {
    intentGuardCache.set(context.cwd, intentFingerprint, findings);
  }

  return {
    ok: review.ok,
    findings,
    headBranch: context.headBranch,
    providerId,
    truncated:
      context.diff.length > PRE_PR_REVIEW_BRANCH_DIFF_MAX_CHARS ||
      context.workingTreeDiff.length >
        PRE_PR_REVIEW_WORKING_TREE_DIFF_MAX_CHARS,
  };
}

async function respond<TMethod extends HostServiceMethod>(
  id: number,
  result: HostServiceResponseMap[TMethod],
) {
  await writeMessage({
    type: "response",
    id,
    ok: true,
    result,
  } as AnyHostServiceResponseEnvelope);
}

/**
 * Truncated so the response stays small enough to safely bypass the outbound
 * queue cap (see {@link shouldBypassOutboundQueueLimit}).
 */
async function respondError(id: number, error: unknown) {
  await writeMessage({
    type: "response",
    id,
    ok: false,
    error: truncateHostServiceErrorMessage(
      error instanceof Error ? error.message : String(error),
    ),
  });
}

async function shutdown() {
  setWorkspaceScriptEventListener(null);
  localMcpRuntime.setLocalMcpEventListener(null);
  routineRuntime.stop();
  taskSupervisorRuntime.stop();
  const infrastructureCleanup = Promise.allSettled([
    terminalRuntime.cleanupAll(),
    cleanupAllScriptProcesses(),
  ]);
  const cleanup = (async () => {
    // Provider shutdown can emit final error/done events into the local MCP
    // queue. Drain that queue only after every provider has settled.
    await Promise.allSettled([
      providerRuntime.shutdown(),
      closeKiroUsageConnection(),
    ]);
    await Promise.allSettled([localMcpRuntime.cleanupLocalMcpRuntime()]);
    await infrastructureCleanup;
  })();
  // A cleanup step that never settles (a pty that will not die, a provider SDK
  // that hangs) used to leave the process alive but unable to answer anything.
  await Promise.race([
    cleanup,
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        process.stderr.write(
          `[host-service] shutdown cleanup exceeded ${HOST_SERVICE_SHUTDOWN_TIMEOUT_MS}ms; continuing\n`,
        );
        resolve();
      }, HOST_SERVICE_SHUTDOWN_TIMEOUT_MS);
      timer.unref?.();
    }),
  ]);
  // Persist whatever the still-running push turns had buffered (and clear
  // their flush timers) before the store closes underneath them.
  flushActivePushTurnEvents();
  resetHostServicePersistence();
}

async function loadMergedCodexMcpStatus(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const checkedAt = Date.now();
  const [configured, runtime] = await Promise.all([
    getCodexMcpStatus({
      codexBinaryPath: args.runtimeOptions?.codexBinaryPath,
    }),
    getCodexMcpRuntimeStatus(args),
  ]);
  const runtimeByName = new Map(
    runtime.servers.map((server) => [server.name, server]),
  );
  const servers: typeof runtime.servers = configured.servers.map((server) => {
    const live = runtimeByName.get(server.name);
    runtimeByName.delete(server.name);
    if (!live) {
      return {
        ...server,
        connectionStatus: server.enabled ? "unknown" : "disabled",
        statusUpdatedAt: server.statusUpdatedAt ?? checkedAt,
      } as const;
    }
    return {
      ...server,
      ...live,
      enabled: server.enabled,
      disabledReason: server.disabledReason,
      connectionStatus: server.enabled
        ? live.connectionStatus
        : ("disabled" as const),
      statusUpdatedAt:
        live.statusUpdatedAt ?? server.statusUpdatedAt ?? checkedAt,
      transportType:
        server.transportType !== "unknown"
          ? server.transportType
          : live.transportType,
      url: server.url ?? live.url,
      bearerTokenEnvVar: server.bearerTokenEnvVar ?? live.bearerTokenEnvVar,
      authStatus: live.authStatus ?? server.authStatus,
      startupTimeoutSec: server.startupTimeoutSec ?? live.startupTimeoutSec,
      toolTimeoutSec: server.toolTimeoutSec ?? live.toolTimeoutSec,
    };
  });
  servers.push(...runtimeByName.values());

  return {
    ok: configured.ok || runtime.ok,
    detail: [configured.detail, runtime.detail].filter(Boolean).join(" "),
    servers,
  };
}

async function handleRequest(request: AnyHostServiceRequestEnvelope) {
  if (
    request.method === "provider.check-availability" ||
    request.method === "provider.get-model-catalog"
  ) {
    // Discovery may initialize login shells. Only discovery reads wait for it;
    // routine lists, PTY traffic and turn stop/input acknowledgements stay live.
    await prepareCliExecutableDiscovery();
  }
  switch (request.method) {
    case "service.get-resource-metrics":
      await respond(
        request.id,
        await readHostServiceResourceMetrics({
          ptyPids: terminalRuntime.listPtyPids(),
        }),
      );
      return;
    case "service.shutdown": {
      // Guard re-entrancy: a signal, stdin close, or duplicate request may
      // already be running the one allowed shutdown pass. In that case just
      // acknowledge and let the in-flight pass finish and exit the process.
      const firstTrigger = !shutdownTriggered;
      if (firstTrigger) {
        shutdownTriggered = true;
        scheduleHardExit(0);
        await shutdown();
      }
      await respond(request.id, { ok: true });
      if (firstTrigger) {
        setImmediate(() => process.exit(0));
      }
      return;
    }
    case "terminal.create-session":
      await respond(request.id, terminalRuntime.createSession(request.params));
      return;
    case "terminal.create-cli-session":
      await respond(
        request.id,
        terminalRuntime.createCliSession(request.params),
      );
      return;
    case "terminal.write-session":
      await respond(request.id, terminalRuntime.writeSession(request.params));
      return;
    case "terminal.ack-session-output":
      await respond(
        request.id,
        terminalRuntime.ackSessionOutput(request.params),
      );
      return;
    case "terminal.read-session":
      await respond(request.id, terminalRuntime.readSession(request.params));
      return;
    case "terminal.set-session-delivery-mode":
      await respond(
        request.id,
        terminalRuntime.setSessionDeliveryMode(request.params),
      );
      return;
    case "terminal.resize-session":
      await respond(request.id, terminalRuntime.resizeSession(request.params));
      return;
    case "terminal.close-session":
      await respond(request.id, terminalRuntime.closeSession(request.params));
      return;
    case "terminal.buffer-session-output":
      await respond(
        request.id,
        terminalRuntime.bufferSessionOutput(request.params),
      );
      return;
    case "terminal.attach-session":
      await respond(
        request.id,
        await terminalRuntime.attachSession(request.params),
      );
      return;
    case "terminal.detach-session":
      await respond(request.id, terminalRuntime.detachSession(request.params));
      return;
    case "terminal.resume-session-stream":
      await respond(
        request.id,
        terminalRuntime.resumeSessionStream(request.params),
      );
      return;
    case "terminal.get-slot-state":
      await respond(request.id, terminalRuntime.getSlotState(request.params));
      return;
    case "terminal.get-session-resume-info":
      await respond(
        request.id,
        terminalRuntime.getSessionResumeInfo(request.params),
      );
      return;
    case "terminal.close-sessions-by-slot-prefix":
      await respond(
        request.id,
        await terminalRuntime.closeSessionsBySlotPrefix(request.params),
      );
      return;
    case "terminal.cleanup-all":
      await terminalRuntime.cleanupAll();
      await respond(request.id, { ok: true });
      return;
    case "workspace-scripts.run-entry":
      await respond(request.id, await runScriptEntry(request.params));
      return;
    case "workspace-scripts.run-hook":
      await respond(request.id, {
        ok: true,
        summary: await runScriptHook(request.params),
      });
      return;
    case "workspace-scripts.stop-entry":
      await stopScriptEntry(request.params);
      await respond(request.id, { ok: true });
      return;
    case "workspace-scripts.stop-all":
      await stopAllWorkspaceScriptProcesses(request.params);
      await respond(request.id, { ok: true });
      return;
    case "workspace-scripts.get-status":
      await respond(request.id, {
        statuses: getScriptStatuses(request.params),
      });
      return;
    case "workspace-scripts.cleanup-all":
      await cleanupAllScriptProcesses();
      await respond(request.id, { ok: true });
      return;
    case "provider.stream-turn":
      await respond(
        request.id,
        await providerRuntime.streamTurn(request.params),
      );
      return;
    case "runs.execute-secondary":
      await respond(
        request.id,
        await executeSecondaryProviderRun(request.params, providerRuntime),
      );
      return;
    case "runs.cancel-secondary":
      await respond(
        request.id,
        cancelSecondaryProviderRun(request.params, providerRuntime),
      );
      return;
    case "provider.start-stream-turn":
      await respond(
        request.id,
        providerRuntime.startTurnStream(request.params),
      );
      return;
    case "provider.start-push-turn":
      await respond(request.id, startPushProviderTurn(request.params));
      return;
    case "provider.read-stream-turn":
      await respond(request.id, providerRuntime.readTurnStream(request.params));
      return;
    case "provider.ack-stream-turn":
      await respond(request.id, providerRuntime.ackTurnStream(request.params));
      return;
    case "provider.abort-turn":
      await respond(request.id, providerRuntime.abortTurn(request.params));
      return;
    case "provider.skip-advisor":
      await respond(request.id, providerRuntime.skipAdvisor(request.params));
      return;
    case "provider.consult-advisor":
      await respond(
        request.id,
        await providerRuntime.consultAdvisor(request.params),
      );
      return;
    case "provider.run-acp-worker":
      await respond(
        request.id,
        await providerRuntime.runAcpWorker(request.params),
      );
      return;
    case "provider.cleanup-task":
      await respond(request.id, providerRuntime.cleanupTask(request.params));
      return;
    case "provider.respond-approval":
      await respond(
        request.id,
        await providerRuntime.respondApproval(request.params),
      );
      return;
    case "provider.respond-user-input":
      await respond(
        request.id,
        await providerRuntime.respondUserInput(request.params),
      );
      return;
    case "provider.steer-turn":
      await respond(
        request.id,
        await providerRuntime.steerTurn(request.params),
      );
      return;
    case "provider.check-availability":
      await respond(
        request.id,
        await providerRuntime.checkAvailability(request.params),
      );
      return;
    case "provider.get-command-catalog":
      await respond(
        request.id,
        await providerRuntime.getCommandCatalog(request.params),
      );
      return;
    case "provider.get-connected-tool-status":
      await respond(
        request.id,
        await providerRuntime.getConnectedToolStatus(request.params),
      );
      return;
    case "provider.get-claude-context-usage":
      await respond(request.id, await getClaudeContextUsage(request.params));
      return;
    case "provider.fork-claude-session":
      await respond(request.id, await forkClaudeSession(request.params));
      return;
    case "provider.rewind-claude-files":
      await respond(request.id, await rewindClaudeFiles(request.params));
      return;
    case "provider.rename-claude-session":
      await respond(request.id, await renameClaudeSession(request.params));
      return;
    case "provider.reload-claude-plugins":
      await respond(request.id, await reloadClaudePlugins(request.params));
      return;
    case "provider.list-claude-plugins":
      await respond(
        request.id,
        await listClaudeInstalledPlugins(request.params),
      );
      return;
    case "provider.get-claude-mcp-status":
      await respond(request.id, await getClaudeMcpStatus(request.params));
      return;
    case "provider.get-codex-mcp-status":
      await respond(request.id, await loadMergedCodexMcpStatus(request.params));
      return;
    case "provider.list-mcp-server-configs":
      await respond(request.id, await listMcpServerConfigs(request.params));
      return;
    case "provider.preview-mcp-server-config-mutation":
      await respond(
        request.id,
        await previewMcpServerConfigMutation(request.params),
      );
      return;
    case "provider.apply-mcp-server-config-mutation":
      await respond(
        request.id,
        await applyMcpServerConfigMutation(request.params),
      );
      return;
    case "provider.get-codex-model-catalog":
      await respond(request.id, await getCodexModelCatalog(request.params));
      return;
    case "provider.get-model-catalog":
      await respond(request.id, await getProviderModelCatalog(request.params));
      return;
    case "provider.get-codex-app-server-snapshot":
      await respond(
        request.id,
        await getCodexAppServerSnapshot(request.params),
      );
      return;
    case "provider.get-rate-limits-snapshot":
      await respond(request.id, await getRateLimitsSnapshot(request.params));
      return;
    case "provider.get-codex-plugin-detail":
      await respond(request.id, await getCodexPluginDetail(request.params));
      return;
    case "provider.install-codex-plugin":
      await respond(request.id, await installCodexPlugin(request.params));
      return;
    case "provider.uninstall-codex-plugin":
      await respond(request.id, await uninstallCodexPlugin(request.params));
      return;
    case "provider.set-codex-experimental-feature-enablement":
      await respond(
        request.id,
        await setCodexExperimentalFeatureEnablement(request.params),
      );
      return;
    case "provider.start-codex-mcp-oauth-login":
      await respond(request.id, await startCodexMcpOauthLogin(request.params));
      return;
    case "provider.start-claude-mcp-oauth-login":
      await respond(request.id, await startClaudeMcpOauthLogin(request.params));
      return;
    case "provider.start-cursor-mcp-oauth-login":
      await respond(request.id, await startCursorMcpOauthLogin(request.params));
      return;
    case "provider.read-codex-mcp-resource":
      await respond(request.id, await readCodexMcpResource(request.params));
      return;
    case "provider.rename-codex-thread":
      await respond(request.id, await renameCodexThread(request.params));
      return;
    case "provider.read-codex-thread":
      await respond(request.id, await readCodexThread(request.params));
      return;
    case "provider.fork-codex-thread":
      await respond(request.id, await forkCodexThread(request.params));
      return;
    case "provider.archive-codex-thread":
      await respond(request.id, await archiveCodexThread(request.params));
      return;
    case "provider.compact-codex-thread":
      await respond(request.id, await compactCodexThread(request.params));
      return;
    case "provider.rollback-codex-thread":
      await respond(request.id, await rollbackCodexThread(request.params));
      return;
    case "provider.start-codex-review":
      await respond(request.id, await startCodexReview(request.params));
      return;
    case "provider.import-codex-external-config":
      await respond(
        request.id,
        await importCodexExternalConfig(request.params),
      );
      return;
    case "provider.write-codex-config-value":
      await respond(request.id, await writeCodexConfigValue(request.params));
      return;
    case "provider.batch-write-codex-config":
      await respond(request.id, await batchWriteCodexConfig(request.params));
      return;
    case "provider.suggest-task-name":
      await respond(request.id, await suggestUtilityTaskName(request.params));
      return;
    case "provider.classify-route":
      await respond(request.id, await classifyUtilityRoute(request.params));
      return;
    case "provider.enhance-prompt":
      await respond(request.id, await enhanceUtilityPrompt(request.params));
      return;
    case "provider.suggest-commit-message":
      await respond(
        request.id,
        await suggestProviderCommitMessage(request.params),
      );
      return;
    case "provider.suggest-pr-description":
      await respond(
        request.id,
        await suggestProviderPRDescription(request.params),
      );
      return;
    case "provider.review-diff":
      await respond(request.id, await reviewProviderDiff(request.params));
      return;
    case "tooling.get-status":
      await respond(request.id, await getToolingStatusSnapshot(request.params));
      return;
    case "tooling.sync-origin-main":
      await respond(
        request.id,
        await syncWorkspaceWithOriginMain(request.params),
      );
      return;
    case "scm.status":
      await respond(request.id, await getScmStatus(request.params));
      return;
    case "scm.stage-all":
      await respond(request.id, await stageAllSourceControl(request.params));
      return;
    case "scm.unstage-all":
      await respond(request.id, await unstageAllSourceControl(request.params));
      return;
    case "scm.commit":
      await respond(request.id, await commitSourceControl(request.params));
      return;
    case "scm.try-auto-fix-lint":
      await respond(request.id, await tryAutoFixLintErrors(request.params));
      return;
    case "scm.stage-file":
      await respond(request.id, await stageSourceControlFile(request.params));
      return;
    case "scm.stage-files":
      await respond(request.id, await stageSourceControlFiles(request.params));
      return;
    case "scm.unstage-file":
      await respond(request.id, await unstageSourceControlFile(request.params));
      return;
    case "scm.discard-file":
      await respond(request.id, await discardSourceControlPath(request.params));
      return;
    case "scm.diff":
      await respond(request.id, await diffSourceControlFile(request.params));
      return;
    case "scm.graph":
      await respond(request.id, await getScmGraph(request.params));
      return;
    case "scm.commit-details":
      await respond(request.id, await getScmCommitDetails(request.params));
      return;
    case "scm.commit-files":
      await respond(request.id, await getScmCommitFiles(request.params));
      return;
    case "scm.commit-diff":
      await respond(request.id, await getScmCommitDiff(request.params));
      return;
    case "scm.history":
      await respond(request.id, await getScmHistory(request.params));
      return;
    case "scm.list-branches":
      await respond(request.id, await listScmBranches(request.params));
      return;
    case "scm.fetch-branch":
      await respond(request.id, await fetchScmBranch(request.params));
      return;
    case "scm.create-branch":
      await respond(request.id, await createScmBranch(request.params));
      return;
    case "scm.checkout-branch":
      await respond(request.id, await checkoutScmBranch(request.params));
      return;
    case "scm.checkout-default-branch-detached":
      await respond(
        request.id,
        await checkoutDefaultBranchDetached(request.params),
      );
      return;
    case "scm.pull-branch":
      await respond(request.id, await pullScmBranch(request.params));
      return;
    case "scm.merge-branch":
      await respond(request.id, await mergeScmBranch(request.params));
      return;
    case "scm.rebase-branch":
      await respond(request.id, await rebaseScmBranch(request.params));
      return;
    case "scm.cherry-pick":
      await respond(request.id, await cherryPickScmCommit(request.params));
      return;
    case "scm.revert":
      await respond(request.id, await revertScmCommit(request.params));
      return;
    case "scm.reset":
      await respond(request.id, await resetScmCommit(request.params));
      return;
    case "scm.create-tag":
      await respond(request.id, await createScmTag(request.params));
      return;
    case "scm.delete-tag":
      await respond(request.id, await deleteScmTag(request.params));
      return;
    case "scm.rename-branch":
      await respond(request.id, await renameScmBranch(request.params));
      return;
    case "scm.delete-branch":
      await respond(request.id, await deleteScmBranch(request.params));
      return;
    case "scm.push":
      await respond(request.id, await pushScmBranch(request.params));
      return;
    case "scm.get-pr-status":
      await respond(request.id, await fetchGitHubPrStatus(request.params));
      return;
    case "scm.get-repo-merge-settings":
      await respond(request.id, await fetchRepoMergeSettings(request.params));
      return;
    case "scm.get-pr-status-for-url":
      await respond(
        request.id,
        await fetchGitHubPrStatus({
          cwd: request.params.cwd,
          target: request.params.url,
        }),
      );
      return;
    case "scm.fetch-pr-context-index":
      await respond(request.id, await fetchPrContextIndex(request.params));
      return;
    case "scm.fetch-pr-check-logs":
      await respond(request.id, await fetchPrCheckLogs(request.params));
      return;
    case "scm.list-github-prs":
      await respond(request.id, await listGitHubPullRequests(request.params));
      return;
    case "scm.get-github-pr-review-detail":
      await respond(
        request.id,
        await fetchGitHubPullRequestReviewDetail(request.params),
      );
      return;
    case "scm.submit-github-pr-review":
      await respond(
        request.id,
        await submitGitHubPullRequestReview(request.params),
      );
      return;
    case "scm.set-pr-ready":
      await respond(request.id, await setScmPrReady(request.params));
      return;
    case "scm.merge-pr":
      await respond(request.id, await mergeScmPr(request.params));
      return;
    case "scm.update-pr-branch":
      await respond(request.id, await updateScmPrBranch(request.params));
      return;
    case "scm.create-pr":
      await respond(request.id, await createScmPullRequest(request.params));
      return;
    case "local-mcp.invoke":
      await respond(
        request.id,
        await invokeLocalMcpAction(request.params.action, request.params.args),
      );
      return;
    case "crane.run-task":
      await respond(
        request.id,
        await localMcpRuntime.runLocallyApprovedCraneKickoff(request.params),
      );
      return;
    case "crane.release-task-control":
      await respond(
        request.id,
        await localMcpRuntime.releaseLocallyManagedTaskControl(request.params),
      );
      return;
    case "task.take-over":
      await respond(
        request.id,
        await localMcpRuntime.takeOverManagedTaskControl(request.params),
      );
      return;
    case "task.stop":
      await respond(
        request.id,
        await localMcpRuntime.stopManagedTaskTurn(request.params),
      );
      return;
    case "routine.invoke":
      await respond(
        request.id,
        await invokeRoutineAction(request.params.action, request.params.args),
      );
      return;
    case "task-supervisor.invoke":
      await respond(
        request.id,
        await invokeTaskSupervisorAction(
          request.params.action,
          request.params.args,
        ),
      );
      return;
    default:
      request satisfies never;
  }
}

async function main() {
  startHostParentWatchdog({
    expectedParentPid: parseExpectedHostParentPid(
      process.env.STAVE_HOST_PARENT_PID,
    ),
    onParentMissing: () => {
      triggerFatalHostServiceError(
        new Error("parent process exited; stopping orphaned host service"),
      );
    },
  });
  prewarmClaudeSdk();
  routineRuntime.start();
  taskSupervisorRuntime.start();
  const stdinFrameDecoder = new JsonMessageFrameDecoder({
    label: "host-service stdin",
    maxBufferBytes: HOST_SERVICE_STDIN_BUFFER_MAX_BYTES,
    maxMessageBytes: HOST_SERVICE_STDIN_MESSAGE_MAX_BYTES,
  });
  let stdinClosed = false;
  const handleStdinClosed = () => {
    if (stdinClosed) {
      return;
    }
    stdinClosed = true;
    beginGuardedShutdown({ reason: "stdin closed", exitCode: 0 });
  };

  // The default disposition for these signals kills the process instantly,
  // orphaning provider CLI subprocesses (and their MCP-server children), the
  // shared Codex app-server, and PTYs, and dropping buffered journal events.
  // Route them into the same guarded shutdown path as stdin close.
  const handleTerminationSignal = (signal: NodeJS.Signals) => {
    beginGuardedShutdown({ reason: `signal ${signal}`, exitCode: 0 });
  };
  process.on("SIGTERM", handleTerminationSignal);
  process.on("SIGINT", handleTerminationSignal);
  if (process.platform !== "win32") {
    process.on("SIGHUP", handleTerminationSignal);
  }

  // Last-resort safety nets: a throw escaping a subprocess event callback or a
  // timer must not hard-crash the shared host service without cleanup. An
  // uncaught exception leaves state unknowable, so shut down gracefully (kill
  // provider children, flush the journal) and let the client respawn us; a
  // stray rejection is settled state, so log it and keep serving other tasks.
  process.on("uncaughtException", (error) => {
    triggerFatalHostServiceError(
      error instanceof Error
        ? error
        : new Error(`uncaught exception: ${String(error)}`),
    );
  });
  process.on("unhandledRejection", (reason) => {
    const detail =
      reason instanceof Error
        ? (reason.stack ?? reason.message)
        : String(reason);
    process.stderr.write(`[host-service] unhandled rejection: ${detail}\n`);
  });

  process.stdin.on("data", (chunk: Buffer) => {
    let messages: string[];
    try {
      messages = stdinFrameDecoder.append(chunk);
    } catch (error) {
      triggerFatalHostServiceError(
        error instanceof Error ? error : new Error(String(error)),
      );
      return;
    }
    for (const message of messages) {
      if (!message.trim()) {
        continue;
      }
      void (async () => {
        let request: AnyHostServiceRequestEnvelope;
        try {
          request = JSON.parse(message) as AnyHostServiceRequestEnvelope;
        } catch {
          return;
        }
        if (request.type !== "request") {
          return;
        }
        try {
          await handleRequest(request);
        } catch (error) {
          await respondError(request.id, error).catch((respondFailure) => {
            // The caller is now guaranteed to hang until its own backstop
            // fires, so make the cause visible instead of silently dropping it.
            process.stderr.write(
              `[host-service] failed to deliver error response for request ${request.id} (${request.method}): ${String(respondFailure)}\n`,
            );
          });
        }
      })();
    }
  });

  process.stdin.on("end", handleStdinClosed);
  process.stdin.on("close", handleStdinClosed);

  // Announce readiness only once stdin is actually being consumed, so the first
  // request can never land before this process is able to read it.
  await writeMessage({ type: "ready" });
}

void main().catch((error) => {
  process.stderr.write(`[host-service] ${String(error)}\n`);
  process.exit(1);
});
