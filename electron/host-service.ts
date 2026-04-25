import { randomUUID } from "node:crypto";
import {
  generateFallbackPullRequestDraft,
  mergePullRequestDraft,
  resolvePullRequestComparisonBaseRef,
  resolvePullRequestTitle,
} from "../src/lib/source-control-pr";
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
  checkoutScmBranch,
  cherryPickScmCommit,
  commitSourceControl,
  createScmBranch,
  createScmPullRequest,
  diffSourceControlFile,
  discardSourceControlPath,
  fetchGitHubPrStatus,
  getScmHistory,
  getScmStatus,
  listScmBranches,
  mergeScmBranch,
  mergeScmPr,
  rebaseScmBranch,
  setScmPrReady,
  stageAllSourceControl,
  stageSourceControlFile,
  tryAutoFixLintErrors,
  unstageAllSourceControl,
  unstageSourceControlFile,
  updateScmPrBranch,
} from "./host-service/scm-runtime";
import * as localMcpRuntime from "./host-service/local-mcp-runtime";
import { createTerminalRuntime } from "./host-service/terminal-runtime";
import type {
  AnyHostServiceRequestEnvelope,
  AnyHostServiceResponseEnvelope,
  HostServiceEventMap,
  HostServiceEventName,
  HostLocalMcpAction,
  HostServiceMethod,
  HostServiceResponseMap,
} from "./host-service/protocol";
import { providerRuntime } from "./providers/runtime";
import {
  archiveCodexThread,
  batchWriteCodexConfig,
  compactCodexThread,
  forkCodexThread,
  getCodexAppServerSnapshot,
  getCodexModelCatalog,
  getCodexPluginDetail,
  importCodexExternalConfig,
  installCodexPlugin,
  readCodexThread,
  readCodexMcpResource,
  renameCodexThread,
  rollbackCodexThread,
  setCodexExperimentalFeatureEnablement,
  startCodexMcpOauthLogin,
  startCodexReview,
  uninstallCodexPlugin,
  writeCodexConfigValue,
} from "./providers/codex-app-server-runtime";
import {
  getClaudeContextUsage,
  prewarmClaudeSdk,
  reloadClaudePlugins,
  suggestClaudeCommitMessage,
  suggestClaudePRDescription,
  suggestClaudeTaskName,
} from "./providers/claude-sdk-runtime";
import {
  getCodexMcpStatus,
  getToolingStatusSnapshot,
  syncWorkspaceWithOriginMain,
} from "./main/utils/tooling-status";
import { isDoneEvent } from "./main/utils/provider-events";
import { quotePath, runCommand } from "./main/utils/command";
import type { StreamTurnArgs } from "./providers/types";
import { truncateUtf8Middle } from "./shared/bounded-text";
import {
  HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES,
  HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES,
} from "./shared/host-service-transport";
import {
  JsonMessageFrameDecoder,
  serializeJsonFramedMessage,
} from "./shared/json-message-framing";

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
const HOST_PROVIDER_EVENT_STRING_MAX_BYTES = 128 * 1024;
const HOST_PROVIDER_EVENT_LIST_MAX_ITEMS = 32;
const HOST_SERVICE_STDIN_BUFFER_MAX_BYTES = HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES;
const HOST_SERVICE_STDIN_MESSAGE_MAX_BYTES = HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES;

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

function triggerFatalHostServiceError(error: Error) {
  if (fatalHostServiceError) {
    return;
  }
  fatalHostServiceError = error;
  process.stderr.write(`[host-service] ${error.message}\n`);
  if (shutdownTriggered) {
    return;
  }
  shutdownTriggered = true;
  void shutdown()
    .catch((shutdownError) => {
      process.stderr.write(
        `[host-service] shutdown error: ${String(shutdownError)}\n`,
      );
    })
    .finally(() => {
      process.exit(1);
    });
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
          content: shrinkProviderEventString(event.content, "subagent-progress"),
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
              shrinkProviderEventString(suggestion, "prompt-suggestion")
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
    process.stdout.write(serializedMessage, (error) => {
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
  if (pendingMessageBytes + messageBytes > HOST_SERVICE_QUEUE_MAX_BYTES) {
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
  const normalizedPayload = event === "provider.stream-event"
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

const terminalRuntime = createTerminalRuntime({ emitEvent });
setWorkspaceScriptEventListener((envelope) => {
  emitEvent("workspace-scripts.event", envelope);
});
localMcpRuntime.setLocalMcpEventListener((event) => {
  if (event.type === "workspace-information-updated") {
    emitEvent("local-mcp.workspace-information-updated", event.payload);
  }
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
    case "replace-workspace-notes":
      return localMcpRuntime.replaceWorkspaceNotes(
        args as Parameters<typeof localMcpRuntime.replaceWorkspaceNotes>[0],
      );
    case "append-workspace-notes":
      return localMcpRuntime.appendWorkspaceNotes(
        args as Parameters<typeof localMcpRuntime.appendWorkspaceNotes>[0],
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
    case "add-workspace-slack-thread":
      return localMcpRuntime.addWorkspaceSlackThread(
        args as Parameters<typeof localMcpRuntime.addWorkspaceSlackThread>[0],
      );
    default:
      action satisfies never;
      throw new Error(`Unsupported local MCP action: ${action}`);
  }
}

function startPushProviderTurn(args: StreamTurnArgs) {
  const turnId = args.turnId ?? randomUUID();
  const store = args.taskId ? ensureHostServicePersistenceReady() : null;
  let sequence = 0;
  let completed = false;

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

  const started = providerRuntime.startTurnStream(
    {
      ...args,
      turnId,
    },
    {
      bufferEvents: true,
      onEvent: (turnEvent) => {
        sequence += 1;

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
        if (!completed && args.taskId && store) {
          completed = true;
          try {
            store.completeTurn({
              id: turnId,
              completedAt: new Date().toISOString(),
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

async function suggestProviderCommitMessage(args: { cwd?: string }) {
  const cwd = args.cwd;
  const [diffResult, statusResult] = await Promise.all([
    runCommand({ command: "git diff HEAD", cwd }),
    runCommand({ command: "git status --porcelain", cwd }),
  ]);

  const diff = diffResult.ok ? diffResult.stdout.trim() : "";
  const fileList = statusResult.ok ? statusResult.stdout.trim() : "";
  return suggestClaudeCommitMessage({ diff, fileList });
}

async function suggestProviderPRDescription(args: {
  cwd?: string;
  baseBranch?: string;
  headBranch?: string;
  promptTemplate?: string;
  workspaceContext?: string;
}) {
  const cwd = args.cwd;
  const baseBranch = args.baseBranch?.trim() || "main";
  const expectedBranch = args.headBranch?.trim() || undefined;

  const remoteBranchesResult = await runCommand({
    command: "git branch -r --format='%(refname:short)'",
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
  const safeComparisonBaseRef = quotePath({ value: comparisonBaseRef });

  const [
    diffResult,
    workingTreeDiffResult,
    logResult,
    statResult,
    statusResult,
    prTemplateResult,
    agentsResult,
    branchResult,
  ] = await Promise.all([
    runCommand({ command: `git diff "${safeComparisonBaseRef}"...HEAD`, cwd }),
    runCommand({ command: "git diff HEAD", cwd }),
    runCommand({
      command: `git log "${safeComparisonBaseRef}"..HEAD --pretty=format:"%h %s" --no-merges`,
      cwd,
    }),
    runCommand({ command: `git diff "${safeComparisonBaseRef}"...HEAD --stat`, cwd }),
    runCommand({ command: "git status --porcelain", cwd }),
    runCommand({
      command: "cat .github/PULL_REQUEST_TEMPLATE.md 2>/dev/null || true",
      cwd,
    }),
    runCommand({ command: "cat AGENTS.md 2>/dev/null || true", cwd }),
    runCommand({ command: "git rev-parse --abbrev-ref HEAD", cwd }),
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
    return { ok: false, headBranch: gitDetectedBranch };
  }

  const diff = diffResult.ok ? diffResult.stdout.trim() : "";
  const workingTreeDiff = workingTreeDiffResult.ok
    ? workingTreeDiffResult.stdout.trim()
    : "";
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
  const fallbackDraft = generateFallbackPullRequestDraft({
    baseBranch,
    headBranch,
    commitLog,
    fileList,
  });

  const suggestion = await suggestClaudePRDescription({
    cwd,
    diff,
    workingTreeDiff,
    commitLog,
    fileList,
    baseBranch,
    headBranch,
    prTemplateContent,
    agentsContent,
    promptTemplate: args.promptTemplate,
    workspaceContext: args.workspaceContext,
  });
  const mergedDraft = mergePullRequestDraft({
    fallbackTitle: fallbackDraft.title,
    fallbackBody: fallbackDraft.body,
    generatedTitle: suggestion.title,
    generatedBody: suggestion.body,
  });
  const resolvedTitle = resolvePullRequestTitle({
    currentTitle: mergedDraft.title,
    commitLog,
    headBranch,
  });

  return {
    ok: true,
    title: resolvedTitle,
    body: mergedDraft.body,
    headBranch,
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

async function respondError(id: number, error: unknown) {
  await writeMessage({
    type: "response",
    id,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

async function shutdown() {
  setWorkspaceScriptEventListener(null);
  localMcpRuntime.setLocalMcpEventListener(null);
  await Promise.allSettled([
    terminalRuntime.cleanupAll(),
    cleanupAllScriptProcesses(),
    providerRuntime.shutdown(),
    localMcpRuntime.cleanupLocalMcpRuntime(),
  ]);
  resetHostServicePersistence();
}

async function handleRequest(request: AnyHostServiceRequestEnvelope) {
  switch (request.method) {
    case "service.shutdown":
      await shutdown();
      await respond(request.id, { ok: true });
      setImmediate(() => process.exit(0));
      return;
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
        terminalRuntime.closeSessionsBySlotPrefix(request.params),
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
    case "provider.cleanup-task":
      await respond(request.id, providerRuntime.cleanupTask(request.params));
      return;
    case "provider.respond-approval":
      await respond(
        request.id,
        providerRuntime.respondApproval(request.params),
      );
      return;
    case "provider.respond-user-input":
      await respond(
        request.id,
        providerRuntime.respondUserInput(request.params),
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
    case "provider.reload-claude-plugins":
      await respond(request.id, await reloadClaudePlugins(request.params));
      return;
    case "provider.get-codex-mcp-status":
      await respond(
        request.id,
        await getCodexMcpStatus({
          codexBinaryPath: request.params.runtimeOptions?.codexBinaryPath,
        }),
      );
      return;
    case "provider.get-codex-model-catalog":
      await respond(
        request.id,
        await getCodexModelCatalog(request.params),
      );
      return;
    case "provider.get-codex-app-server-snapshot":
      await respond(
        request.id,
        await getCodexAppServerSnapshot(request.params),
      );
      return;
    case "provider.get-codex-plugin-detail":
      await respond(
        request.id,
        await getCodexPluginDetail(request.params),
      );
      return;
    case "provider.install-codex-plugin":
      await respond(
        request.id,
        await installCodexPlugin(request.params),
      );
      return;
    case "provider.uninstall-codex-plugin":
      await respond(
        request.id,
        await uninstallCodexPlugin(request.params),
      );
      return;
    case "provider.set-codex-experimental-feature-enablement":
      await respond(
        request.id,
        await setCodexExperimentalFeatureEnablement(request.params),
      );
      return;
    case "provider.start-codex-mcp-oauth-login":
      await respond(
        request.id,
        await startCodexMcpOauthLogin(request.params),
      );
      return;
    case "provider.read-codex-mcp-resource":
      await respond(
        request.id,
        await readCodexMcpResource(request.params),
      );
      return;
    case "provider.rename-codex-thread":
      await respond(
        request.id,
        await renameCodexThread(request.params),
      );
      return;
    case "provider.read-codex-thread":
      await respond(
        request.id,
        await readCodexThread(request.params),
      );
      return;
    case "provider.fork-codex-thread":
      await respond(
        request.id,
        await forkCodexThread(request.params),
      );
      return;
    case "provider.archive-codex-thread":
      await respond(
        request.id,
        await archiveCodexThread(request.params),
      );
      return;
    case "provider.compact-codex-thread":
      await respond(
        request.id,
        await compactCodexThread(request.params),
      );
      return;
    case "provider.rollback-codex-thread":
      await respond(
        request.id,
        await rollbackCodexThread(request.params),
      );
      return;
    case "provider.start-codex-review":
      await respond(
        request.id,
        await startCodexReview(request.params),
      );
      return;
    case "provider.import-codex-external-config":
      await respond(
        request.id,
        await importCodexExternalConfig(request.params),
      );
      return;
    case "provider.write-codex-config-value":
      await respond(
        request.id,
        await writeCodexConfigValue(request.params),
      );
      return;
    case "provider.batch-write-codex-config":
      await respond(
        request.id,
        await batchWriteCodexConfig(request.params),
      );
      return;
    case "provider.suggest-task-name":
      await respond(request.id, await suggestClaudeTaskName(request.params));
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
    case "scm.unstage-file":
      await respond(request.id, await unstageSourceControlFile(request.params));
      return;
    case "scm.discard-file":
      await respond(request.id, await discardSourceControlPath(request.params));
      return;
    case "scm.diff":
      await respond(request.id, await diffSourceControlFile(request.params));
      return;
    case "scm.history":
      await respond(request.id, await getScmHistory(request.params));
      return;
    case "scm.list-branches":
      await respond(request.id, await listScmBranches(request.params));
      return;
    case "scm.create-branch":
      await respond(request.id, await createScmBranch(request.params));
      return;
    case "scm.checkout-branch":
      await respond(request.id, await checkoutScmBranch(request.params));
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
    case "scm.get-pr-status":
      await respond(request.id, await fetchGitHubPrStatus(request.params));
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
    default:
      request satisfies never;
  }
}

async function main() {
  prewarmClaudeSdk();
  await writeMessage({ type: "ready" });
  const stdinFrameDecoder = new JsonMessageFrameDecoder({
    label: "host-service stdin",
    maxBufferBytes: HOST_SERVICE_STDIN_BUFFER_MAX_BYTES,
    maxMessageBytes: HOST_SERVICE_STDIN_MESSAGE_MAX_BYTES,
  });
  let stdinClosed = false;
  const handleStdinClosed = () => {
    if (stdinClosed || shutdownTriggered) {
      return;
    }
    stdinClosed = true;
    shutdownTriggered = true;
    void shutdown()
      .catch((error) => {
        process.stderr.write(
          `[host-service] shutdown error: ${String(error)}\n`,
        );
      })
      .finally(() => {
        process.exit(0);
      });
  };

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
          await respondError(request.id, error).catch(() => {});
        }
      })();
    }
  });

  process.stdin.on("end", handleStdinClosed);
  process.stdin.on("close", handleStdinClosed);
}

void main().catch((error) => {
  process.stderr.write(`[host-service] ${String(error)}\n`);
  process.exit(1);
});
