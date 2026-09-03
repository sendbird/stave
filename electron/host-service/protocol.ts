import type {
  CliSessionCreateSessionArgs,
  TerminalCreateSessionArgs,
} from "../../src/lib/terminal/types";
import type { PromptEnhancementContext } from "../../src/lib/providers/prompt-enhancement-context";
import type {
  PrCheckLogExcerpt,
  PrContextIndex,
} from "../../src/lib/pr-context";
import type {
  GitHubPrInboxKind,
  GitHubPrInboxResult,
  GitHubPrReviewDetailResult,
  GitHubPrReviewEvent,
  GitHubPrReviewSubmitResult,
} from "../../src/lib/github-pr-review";
import type { AdvisorConsultOutcome } from "../providers/advisor-consult";
import type { AcpWorkerOutcome } from "../providers/acp/acp-worker-runtime";
import type {
  CanonicalRetrievedContextPart,
  CodexAppServerSnapshotResponse,
  CodexModelCatalogResponse,
  CodexMcpOauthLoginResponse,
  CursorMcpOauthLoginResponse,
  CodexMcpResourceReadResponse,
  CodexThreadForkResponse,
  CodexThreadReadResponse,
  ClaudeContextUsageResponse,
  ClaudeFileRewindResponse,
  ClaudeInstalledPluginsResponse,
  ClaudeMcpOauthLoginResponse,
  ClaudeMcpStatusResponse,
  ClaudePluginReloadResponse,
  ClaudeSessionForkResponse,
  ProviderMutationResponse,
  CodexMcpStatusResponse,
  CodexMutationResponse,
  CodexPluginDetailResponse,
  CodexPluginInstallResponse,
  CodexReviewStartResponse,
  ProviderRuntimeOptions,
  ProviderModelCatalogResponse,
  ProviderAvailabilityResponse,
  ProviderSteerTurnResponse,
  RateLimitsSnapshotResponse,
} from "../../src/lib/providers/provider.types";
import type {
  RouteClassification,
  UtilityInferenceContext,
  UtilityInferenceMetadata,
} from "../../src/lib/providers/utility-inference";
import type {
  ConnectedToolStatusRequest,
  ConnectedToolStatusResponse,
} from "../../src/lib/providers/connected-tool-status";
import type {
  ResolvedWorkspaceScript,
  ResolvedWorkspaceScriptsConfig,
  ScriptHookContext,
  ScriptTrigger,
  WorkspaceScriptEventEnvelope,
  WorkspaceScriptRunSource,
  WorkspaceScriptStatusEntry,
  WorkspaceScriptHookRunSummary,
} from "../../src/lib/workspace-scripts/types";
import type {
  BridgeEvent,
  ProviderCommandCatalogResult,
  StreamTurnArgs,
} from "../providers/types";
import type {
  SyncOriginMainRequest,
  SyncOriginMainResult,
  ToolingStatusRequest,
  ToolingStatusSnapshot,
} from "../../src/lib/tooling-status";
import type {
  PrePrReviewFinding,
  PrePrReviewProviderId,
} from "../../src/lib/source-control-review";
import type {
  CommandResult,
  DetachedCheckoutResult,
  SourceControlStatusItem,
} from "../main/types";
import type { WorkspaceInformationState } from "../../src/lib/workspace-information";
import type {
  SecondaryProviderCancelRequest,
  SecondaryProviderExecutionRequest,
  SecondaryProviderExecutionResult,
} from "../../src/lib/runs/secondary-run";
import type { LocalMcpTaskTurnUpdate } from "../../src/lib/local-mcp/task-turn-update";
import type {
  GraphCommitDetailsResult,
  GraphFileChange,
  GraphResult,
} from "../../src/lib/git-graph/types";
import type {
  McpServerConfigListRequest,
  McpServerConfigListResponse,
  McpServerConfigMutationApplyRequest,
  McpServerConfigMutationPreviewResponse,
  McpServerConfigMutationRequest,
  McpServerConfigMutationResponse,
} from "../../src/lib/providers/mcp-config.types";

export interface HostWorkspaceScriptRunEntryArgs {
  workspaceId: string;
  scriptEntry: ResolvedWorkspaceScript;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  source?: WorkspaceScriptRunSource;
  hookContext?: ScriptHookContext;
}

export interface HostWorkspaceScriptRunHookArgs {
  workspaceId: string;
  trigger: ScriptTrigger;
  config: ResolvedWorkspaceScriptsConfig;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  hookContext?: ScriptHookContext;
}

export type HostWorkspaceScriptRunEntryResult =
  | {
      ok: true;
      runId: string;
      sessionId?: string;
      alreadyRunning?: boolean;
      exitCode?: number;
    }
  | {
      ok: false;
      runId: string;
      exitCode?: number;
      error?: string;
    };

export type HostWorkspaceScriptRunHookResult = {
  ok: boolean;
  summary: WorkspaceScriptHookRunSummary;
};

export interface HostTerminalCreateSessionResult {
  ok: boolean;
  sessionId?: string;
  nativeSessionId?: string;
  stderr?: string;
}

export interface HostTerminalReadSessionResult {
  ok: boolean;
  output: string;
  stderr?: string;
}

export interface HostTerminalMutationResult {
  ok: boolean;
  stderr?: string;
}

export interface HostTerminalAttachSessionResult {
  ok: boolean;
  attachmentId?: string;
  backlog?: string;
  screenState?: string;
  snapshotSequence?: number;
  stderr?: string;
}

export interface HostTerminalStatusEvent {
  sessionId: string;
  status: "prompt-start" | "command-start" | "command-finished" | "prompt-end";
  exitCode?: number;
}

export interface HostTerminalSlotStateResult {
  state: "idle" | "running" | "background" | "exited";
  sessionId?: string;
  exitCode?: number;
  signal?: number;
}

export interface HostTerminalSessionResumeInfoResult {
  ok: boolean;
  nativeSessionId?: string;
  stderr?: string;
}

export interface HostProviderStartStreamResult {
  ok: boolean;
  streamId: string;
  message?: string;
}

export interface HostProviderStartPushTurnResult extends HostProviderStartStreamResult {
  turnId: string | null;
}

export interface HostCraneRunTaskArgs {
  workspaceId: string;
  prompt: string;
  taskId?: string;
  title?: string;
  provider?: "claude-code" | "codex";
  runtimeOptions?: ProviderRuntimeOptions;
  retrievedContextParts: CanonicalRetrievedContextPart[];
}

export interface HostCraneRunTaskResult {
  workspaceId: string;
  taskId: string;
  taskTitle: string;
  turnId: string;
  provider: "claude-code" | "codex";
  model: string;
}

export interface HostCraneReleaseTaskControlArgs {
  workspaceId: string;
  taskId: string;
  sourceContexts?: CanonicalRetrievedContextPart[];
}

export interface HostCraneReleaseTaskControlResult {
  workspaceId: string;
  taskId: string;
  released: boolean;
}

export interface HostTaskTakeOverArgs {
  workspaceId: string;
  taskId: string;
  sourceContexts?: CanonicalRetrievedContextPart[];
}

export interface HostTaskTakeOverResult {
  workspaceId: string;
  taskId: string;
  released: boolean;
}

export interface HostTaskStopArgs {
  workspaceId: string;
  taskId: string;
}

export interface HostTaskStopResult {
  workspaceId: string;
  taskId: string;
  stopped: boolean;
  turnId?: string;
}

export interface HostProviderReadStreamResult {
  ok: boolean;
  events: BridgeEvent[];
  cursor: number;
  done: boolean;
  message?: string;
}

export interface HostProviderMutationResult {
  ok: boolean;
  message?: string;
}

export interface HostProviderSuggestTaskNameArgs extends UtilityInferenceContext {
  prompt: string;
  history?: Array<{ role: string; content: string }>;
}

export interface HostProviderSuggestTaskNameResult {
  ok: boolean;
  title?: string;
  utility: UtilityInferenceMetadata;
}

export interface HostProviderClassifyRouteArgs extends UtilityInferenceContext {
  prompt: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
    providerId?: StreamTurnArgs["providerId"];
    model?: string;
  }>;
  fileContextCount?: number;
}

export interface HostProviderClassifyRouteResult {
  ok: boolean;
  classification?: RouteClassification;
  utility: UtilityInferenceMetadata;
}

export interface HostProviderEnhancePromptArgs
  extends UtilityInferenceContext,
    Omit<PromptEnhancementContext, "repoGuidance"> {
  prompt: string;
}

export interface HostProviderEnhancePromptResult {
  ok: boolean;
  prompt?: string;
  utility: UtilityInferenceMetadata;
}

export interface HostProviderSuggestCommitMessageArgs extends UtilityInferenceContext {}

export interface HostProviderSuggestCommitMessageResult {
  ok: boolean;
  message?: string;
  utility: UtilityInferenceMetadata;
}

export interface HostProviderSuggestPRDescriptionArgs {
  cwd?: string;
  baseBranch?: string;
  headBranch?: string;
  providerId?: StreamTurnArgs["providerId"];
  promptTemplate?: string;
  workspaceContext?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}

export interface HostProviderSuggestPRDescriptionResult {
  ok: boolean;
  title?: string;
  body?: string;
  headBranch?: string;
}

export interface HostProviderReviewDiffArgs {
  cwd?: string;
  baseBranch?: string;
  headBranch?: string;
  providerId?: PrePrReviewProviderId;
  model?: string;
  /** "review" (default) checks for bugs; "intent" checks the change against
   *  the pinned product intent in `intentContext`. */
  mode?: "review" | "intent";
  /** Pinned product intent (PRD / spec / design) text for `mode: "intent"`. */
  intentContext?: string;
  /** Reuse the previous verdict when the intent, diff, provider and model are
   *  all byte-identical. Only the recurring per-turn guard opts in; an explicit
   *  user-triggered review always re-runs. */
  intentFingerprintGate?: boolean;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}

export interface HostProviderReviewDiffResult {
  ok: boolean;
  findings: PrePrReviewFinding[];
  headBranch?: string;
  providerId?: PrePrReviewProviderId;
  truncated?: boolean;
  /** The cached verdict was reused; no model call was made. */
  unchanged?: boolean;
}

export interface HostProviderStreamEventPayload {
  streamId: string;
  event: BridgeEvent;
  sequence: number;
  done: boolean;
  taskId: string | null;
  workspaceId: string | null;
  providerId: StreamTurnArgs["providerId"];
  turnId: string | null;
}

export interface HostScmStatusResult {
  ok: boolean;
  branch: string;
  items: SourceControlStatusItem[];
  hasConflicts: boolean;
  stderr: string;
}

export interface HostScmDiffResult {
  ok: boolean;
  content: string;
  oldContent: string;
  newContent: string;
  stderr: string;
}

export interface HostScmHistoryResult {
  ok: boolean;
  items: Array<{
    hash: string;
    relativeDate: string;
    subject: string;
  }>;
  stderr: string;
}

export type HostScmGraphResult = GraphResult;
export type HostScmCommitDetailsResult = GraphCommitDetailsResult;

export interface HostScmListBranchesResult {
  ok: boolean;
  current: string;
  branches: string[];
  remoteBranches: string[];
  worktreePathByBranch: Record<string, string>;
  stderr: string;
}

export interface HostScmCreatePrResult {
  ok: boolean;
  prUrl?: string;
  autoMergeEnabled?: boolean;
  autoMergeUnsupported?: boolean;
  merged?: boolean;
  stderr?: string;
}

export interface HostScmRepoMergeSettingsResult {
  ok: boolean;
  squashMergeAllowed?: boolean;
  mergeCommitAllowed?: boolean;
  rebaseMergeAllowed?: boolean;
  autoMergeAllowed?: boolean;
  stderr: string;
}

export interface HostScmPrStatusResult {
  ok: boolean;
  pr: {
    number: number;
    title: string;
    state: "OPEN" | "CLOSED" | "MERGED";
    isDraft: boolean;
    url: string;
    reviewDecision: string | null;
    mergeable: string;
    mergeStateStatus: string;
    checksRollup: "SUCCESS" | "FAILURE" | "PENDING" | null;
    mergedAt: string | null;
    baseRefName: string;
    headRefName: string;
  } | null;
  stderr?: string;
}

export type HostLocalMcpAction =
  | "list-known-projects"
  | "register-project"
  | "create-workspace"
  | "run-task"
  | "get-task-status"
  | "release-task-parent"
  | "respond-approval"
  | "respond-user-input"
  | "get-workspace-information"
  | "set-workspace-martin-project"
  | "replace-workspace-notes"
  | "append-workspace-notes"
  | "clear-workspace-notes"
  | "add-workspace-todo"
  | "update-workspace-todo"
  | "remove-workspace-todo"
  | "add-workspace-resource"
  | "remove-workspace-resource"
  | "add-workspace-custom-field"
  | "set-workspace-custom-field"
  | "remove-workspace-custom-field"
  | "add-workspace-jira-issue"
  | "add-workspace-crane-issue"
  | "add-workspace-confluence-page"
  | "add-workspace-figma-resource"
  | "add-workspace-storybook-resource"
  | "update-workspace-storybook-resource-access"
  | "add-workspace-slack-thread"
  | "add-workspace-amplify-link";

export type HostTaskSupervisorAction =
  "list" | "get" | "create" | "update" | "pause" | "resume" | "remove";

export type HostRoutineAction =
  | "list"
  | "create"
  | "update"
  | "remove"
  | "set-enabled"
  | "set-provider-timeout"
  | "run-now"
  | "list-information-references";

export interface HostServiceRequestMap {
  "service.shutdown": undefined;
  "terminal.create-session": TerminalCreateSessionArgs;
  "terminal.create-cli-session": CliSessionCreateSessionArgs;
  "terminal.write-session": {
    sessionId: string;
    input: string;
  };
  "terminal.ack-session-output": {
    sessionId: string;
    attachmentId: string;
    acknowledgedBytes: number;
  };
  "terminal.read-session": {
    sessionId: string;
  };
  "terminal.set-session-delivery-mode": {
    sessionId: string;
    deliveryMode: "poll" | "push";
  };
  "terminal.resize-session": {
    sessionId: string;
    cols: number;
    rows: number;
  };
  "terminal.close-session": {
    sessionId: string;
  };
  "terminal.buffer-session-output": {
    sessionId: string;
    output: string;
  };
  "terminal.attach-session": {
    sessionId: string;
    deliveryMode: "poll" | "push";
  };
  "terminal.detach-session": {
    sessionId: string;
    attachmentId?: string;
  };
  "terminal.resume-session-stream": {
    sessionId: string;
    attachmentId: string;
  };
  "terminal.get-slot-state": {
    slotKey: string;
  };
  "terminal.get-session-resume-info": {
    sessionId: string;
  };
  "terminal.close-sessions-by-slot-prefix": {
    prefix: string;
  };
  "terminal.cleanup-all": undefined;
  "workspace-scripts.run-entry": HostWorkspaceScriptRunEntryArgs;
  "workspace-scripts.run-hook": HostWorkspaceScriptRunHookArgs;
  "workspace-scripts.stop-entry": {
    workspaceId: string;
    scriptId: string;
    scriptKind: ResolvedWorkspaceScript["kind"];
  };
  "workspace-scripts.stop-all": {
    workspaceId: string;
  };
  "workspace-scripts.get-status": {
    workspaceId: string;
  };
  "workspace-scripts.cleanup-all": undefined;
  "provider.stream-turn": StreamTurnArgs;
  "runs.execute-secondary": SecondaryProviderExecutionRequest;
  "runs.cancel-secondary": SecondaryProviderCancelRequest;
  "provider.start-stream-turn": StreamTurnArgs;
  "provider.start-push-turn": StreamTurnArgs;
  "provider.read-stream-turn": {
    streamId: string;
    cursor: number;
  };
  "provider.ack-stream-turn": {
    streamId: string;
    cursor: number;
  };
  "provider.abort-turn": {
    turnId: string;
  };
  "provider.skip-advisor": {
    turnId: string;
  };
  "provider.consult-advisor": {
    consultKey: string;
    question: string;
    context?: string;
  };
  "provider.run-acp-worker": {
    workerKey: string;
    task: string;
    context?: string;
  };
  "provider.cleanup-task": {
    taskId: string;
  };
  "provider.respond-approval": {
    turnId: string;
    requestId: string;
    approved: boolean;
    reason?: string;
    scope?: "once" | "always";
  };
  "provider.respond-user-input": {
    turnId: string;
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  };
  "provider.steer-turn": {
    turnId: string;
    text: string;
    enabled?: boolean;
    clientMessageId?: string;
  };
  "provider.check-availability": {
    providerId: StreamTurnArgs["providerId"];
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-command-catalog": {
    providerId: StreamTurnArgs["providerId"];
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-connected-tool-status": ConnectedToolStatusRequest;
  "provider.get-claude-context-usage": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.fork-claude-session": {
    sessionId: string;
    upToMessageId: string;
    title?: string;
    cwd?: string;
  };
  "provider.rewind-claude-files": {
    sessionId: string;
    userMessageId: string;
    dryRun: boolean;
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.rename-claude-session": {
    sessionId: string;
    title: string;
    cwd?: string;
  };
  "provider.reload-claude-plugins": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.list-claude-plugins": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-claude-mcp-status": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-codex-mcp-status": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.list-mcp-server-configs": McpServerConfigListRequest;
  "provider.preview-mcp-server-config-mutation": McpServerConfigMutationRequest;
  "provider.apply-mcp-server-config-mutation": McpServerConfigMutationApplyRequest;
  "provider.get-codex-model-catalog": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-model-catalog": {
    providerId: StreamTurnArgs["providerId"];
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-codex-app-server-snapshot": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-rate-limits-snapshot": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-codex-plugin-detail": {
    marketplacePath: string;
    pluginName: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.install-codex-plugin": {
    marketplacePath: string;
    pluginName: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.uninstall-codex-plugin": {
    pluginId: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.set-codex-experimental-feature-enablement": {
    enablement: Record<string, boolean>;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.start-codex-mcp-oauth-login": {
    name: string;
    scopes?: string[];
    timeoutSecs?: number;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.start-claude-mcp-oauth-login": {
    name: string;
    cwd?: string;
    timeoutSecs?: number;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.start-cursor-mcp-oauth-login": {
    name: string;
    cwd?: string;
    timeoutSecs?: number;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.read-codex-mcp-resource": {
    threadId: string;
    server: string;
    uri: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.rename-codex-thread": {
    threadId: string;
    name: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.read-codex-thread": {
    threadId: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.fork-codex-thread": {
    threadId: string;
    lastTurnId?: string;
    beforeTurnId?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.archive-codex-thread": {
    threadId: string;
    archived?: boolean;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.compact-codex-thread": {
    threadId: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.rollback-codex-thread": {
    threadId: string;
    numTurns: number;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.start-codex-review": {
    threadId: string;
    delivery?: "inline" | "detached";
    target:
      | { type: "uncommittedChanges" }
      | { type: "baseBranch"; baseBranch: string }
      | { type: "commit"; sha: string; title?: string }
      | { type: "custom"; instructions: string };
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.import-codex-external-config": {
    migrationItems: Array<{
      itemType: string;
      description: string;
      cwd: string | null;
    }>;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.write-codex-config-value": {
    keyPath: string;
    value: unknown;
    mergeStrategy?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.batch-write-codex-config": {
    edits: Array<{
      keyPath: string;
      value: unknown;
      mergeStrategy?: string;
    }>;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.suggest-task-name": HostProviderSuggestTaskNameArgs;
  "provider.classify-route": HostProviderClassifyRouteArgs;
  "provider.enhance-prompt": HostProviderEnhancePromptArgs;
  "provider.suggest-commit-message": HostProviderSuggestCommitMessageArgs;
  "provider.suggest-pr-description": HostProviderSuggestPRDescriptionArgs;
  "provider.review-diff": HostProviderReviewDiffArgs;
  "tooling.get-status": ToolingStatusRequest;
  "tooling.sync-origin-main": SyncOriginMainRequest;
  "scm.status": {
    cwd?: string;
  };
  "scm.stage-all": {
    cwd?: string;
  };
  "scm.unstage-all": {
    cwd?: string;
  };
  "scm.commit": {
    message: string;
    cwd?: string;
  };
  "scm.try-auto-fix-lint": {
    cwd?: string;
    paths?: string[];
  };
  "scm.stage-file": {
    path: string;
    cwd?: string;
  };
  "scm.stage-files": {
    paths: string[];
    cwd?: string;
  };
  "scm.unstage-file": {
    path: string;
    cwd?: string;
  };
  "scm.discard-file": {
    path: string;
    cwd?: string;
  };
  "scm.diff": {
    path: string;
    cwd?: string;
  };
  "scm.graph": {
    cwd?: string;
    limit?: number;
    skip?: number;
    scope?: "current" | "all" | string;
    refs?: string[];
    includeRepositoryState?: boolean;
  };
  "scm.commit-details": {
    hash: string;
    cwd?: string;
  };
  "scm.commit-files": {
    hash: string;
    cwd?: string;
  };
  "scm.commit-diff": {
    hash: string;
    path: string;
    oldPath?: string;
    cwd?: string;
  };
  "scm.history": {
    cwd?: string;
    limit?: number;
  };
  "scm.list-branches": {
    cwd?: string;
    refreshRemote?: boolean;
  };
  "scm.fetch-branch": {
    cwd?: string;
    branch?: string;
  };
  "scm.create-branch": {
    name: string;
    cwd?: string;
    from?: string;
  };
  "scm.checkout-branch": {
    name: string;
    cwd?: string;
  };
  "scm.checkout-default-branch-detached": {
    cwd?: string;
  };
  "scm.pull-branch": {
    cwd?: string;
    branch?: string;
  };
  "scm.merge-branch": {
    branch: string;
    cwd?: string;
  };
  "scm.rebase-branch": {
    branch: string;
    cwd?: string;
  };
  "scm.cherry-pick": {
    commit: string;
    cwd?: string;
  };
  "scm.revert": { commit: string; cwd?: string };
  "scm.reset": {
    commit: string;
    mode: "soft" | "mixed" | "hard";
    cwd?: string;
  };
  "scm.create-tag": {
    name: string;
    commit?: string;
    message?: string;
    cwd?: string;
  };
  "scm.delete-tag": { name: string; cwd?: string };
  "scm.rename-branch": { from: string; to: string; cwd?: string };
  "scm.delete-branch": { name: string; force?: boolean; cwd?: string };
  "scm.push": {
    branch?: string;
    remote?: string;
    force?: boolean;
    cwd?: string;
  };
  "scm.get-pr-status": {
    cwd?: string;
  };
  "scm.get-repo-merge-settings": {
    cwd?: string;
  };
  "scm.get-pr-status-for-url": {
    url: string;
    cwd?: string;
  };
  "scm.fetch-pr-context-index": {
    prUrl: string;
    cwd?: string;
  };
  "scm.fetch-pr-check-logs": {
    prUrl: string;
    headSha: string;
    checkIds: number[];
    cwd?: string;
  };
  "scm.list-github-prs": {
    kind: GitHubPrInboxKind;
    limit?: number;
    cwd?: string;
  };
  "scm.get-github-pr-review-detail": {
    prUrl: string;
    cwd?: string;
  };
  "scm.submit-github-pr-review": {
    prUrl: string;
    expectedHeadOid: string;
    event: GitHubPrReviewEvent;
    body?: string;
    cwd?: string;
  };
  "scm.set-pr-ready": {
    cwd?: string;
  };
  "scm.merge-pr": {
    method?: "default" | "merge" | "squash" | "rebase";
    cwd?: string;
  };
  "scm.update-pr-branch": {
    cwd?: string;
  };
  "scm.create-pr": {
    title: string;
    body?: string;
    baseBranch?: string;
    draft?: boolean;
    autoMerge?: boolean;
    mergeMethod?: "default" | "merge" | "squash" | "rebase";
    cwd?: string;
  };
  "local-mcp.invoke": {
    action: HostLocalMcpAction;
    args: unknown;
  };
  "crane.run-task": HostCraneRunTaskArgs;
  "crane.release-task-control": HostCraneReleaseTaskControlArgs;
  "task.take-over": HostTaskTakeOverArgs;
  "task.stop": HostTaskStopArgs;
  "routine.invoke": {
    action: HostRoutineAction;
    args: unknown;
  };
  "task-supervisor.invoke": {
    action: HostTaskSupervisorAction;
    args: unknown;
  };
}

export interface HostServiceResponseMap {
  "service.shutdown": {
    ok: true;
  };
  "terminal.create-session": HostTerminalCreateSessionResult;
  "terminal.create-cli-session": HostTerminalCreateSessionResult;
  "terminal.write-session": HostTerminalMutationResult;
  "terminal.ack-session-output": HostTerminalMutationResult;
  "terminal.read-session": HostTerminalReadSessionResult;
  "terminal.set-session-delivery-mode": HostTerminalMutationResult;
  "terminal.resize-session": HostTerminalMutationResult;
  "terminal.close-session": HostTerminalMutationResult;
  "terminal.buffer-session-output": HostTerminalMutationResult;
  "terminal.attach-session": HostTerminalAttachSessionResult;
  "terminal.detach-session": HostTerminalMutationResult;
  "terminal.resume-session-stream": HostTerminalMutationResult;
  "terminal.get-slot-state": HostTerminalSlotStateResult;
  "terminal.get-session-resume-info": HostTerminalSessionResumeInfoResult;
  "terminal.close-sessions-by-slot-prefix": {
    ok: true;
    closedCount: number;
  };
  "terminal.cleanup-all": {
    ok: true;
  };
  "workspace-scripts.run-entry": HostWorkspaceScriptRunEntryResult;
  "workspace-scripts.run-hook": HostWorkspaceScriptRunHookResult;
  "workspace-scripts.stop-entry": {
    ok: true;
  };
  "workspace-scripts.stop-all": {
    ok: true;
  };
  "workspace-scripts.get-status": {
    statuses: WorkspaceScriptStatusEntry[];
  };
  "workspace-scripts.cleanup-all": {
    ok: true;
  };
  "provider.stream-turn": BridgeEvent[];
  "runs.execute-secondary": SecondaryProviderExecutionResult;
  "runs.cancel-secondary": HostProviderMutationResult;
  "provider.start-stream-turn": HostProviderStartStreamResult;
  "provider.start-push-turn": HostProviderStartPushTurnResult;
  "provider.read-stream-turn": HostProviderReadStreamResult;
  "provider.ack-stream-turn": HostProviderMutationResult;
  "provider.abort-turn": HostProviderMutationResult;
  "provider.skip-advisor": HostProviderMutationResult;
  "provider.consult-advisor": AdvisorConsultOutcome;
  "provider.run-acp-worker": AcpWorkerOutcome;
  "provider.cleanup-task": HostProviderMutationResult;
  "provider.respond-approval": HostProviderMutationResult;
  "provider.respond-user-input": HostProviderMutationResult;
  "provider.steer-turn": ProviderSteerTurnResponse;
  "provider.check-availability": ProviderAvailabilityResponse;
  "provider.get-command-catalog": ProviderCommandCatalogResult;
  "provider.get-connected-tool-status": ConnectedToolStatusResponse;
  "provider.get-claude-context-usage": ClaudeContextUsageResponse;
  "provider.fork-claude-session": ClaudeSessionForkResponse;
  "provider.rewind-claude-files": ClaudeFileRewindResponse;
  "provider.rename-claude-session": ProviderMutationResponse;
  "provider.reload-claude-plugins": ClaudePluginReloadResponse;
  "provider.list-claude-plugins": ClaudeInstalledPluginsResponse;
  "provider.get-claude-mcp-status": ClaudeMcpStatusResponse;
  "provider.get-codex-mcp-status": CodexMcpStatusResponse;
  "provider.list-mcp-server-configs": McpServerConfigListResponse;
  "provider.preview-mcp-server-config-mutation": McpServerConfigMutationPreviewResponse;
  "provider.apply-mcp-server-config-mutation": McpServerConfigMutationResponse;
  "provider.get-codex-model-catalog": CodexModelCatalogResponse;
  "provider.get-model-catalog": ProviderModelCatalogResponse;
  "provider.get-codex-app-server-snapshot": CodexAppServerSnapshotResponse;
  "provider.get-rate-limits-snapshot": RateLimitsSnapshotResponse;
  "provider.get-codex-plugin-detail": CodexPluginDetailResponse;
  "provider.install-codex-plugin": CodexPluginInstallResponse;
  "provider.uninstall-codex-plugin": CodexMutationResponse;
  "provider.set-codex-experimental-feature-enablement": CodexMutationResponse;
  "provider.start-codex-mcp-oauth-login": CodexMcpOauthLoginResponse;
  "provider.start-claude-mcp-oauth-login": ClaudeMcpOauthLoginResponse;
  "provider.read-codex-mcp-resource": CodexMcpResourceReadResponse;
  "provider.start-cursor-mcp-oauth-login": CursorMcpOauthLoginResponse;
  "provider.rename-codex-thread": CodexMutationResponse;
  "provider.read-codex-thread": CodexThreadReadResponse;
  "provider.fork-codex-thread": CodexThreadForkResponse;
  "provider.archive-codex-thread": CodexMutationResponse;
  "provider.compact-codex-thread": CodexMutationResponse;
  "provider.rollback-codex-thread": CodexMutationResponse;
  "provider.start-codex-review": CodexReviewStartResponse;
  "provider.import-codex-external-config": CodexMutationResponse;
  "provider.write-codex-config-value": CodexMutationResponse;
  "provider.batch-write-codex-config": CodexMutationResponse;
  "provider.suggest-task-name": HostProviderSuggestTaskNameResult;
  "provider.classify-route": HostProviderClassifyRouteResult;
  "provider.enhance-prompt": HostProviderEnhancePromptResult;
  "provider.suggest-commit-message": HostProviderSuggestCommitMessageResult;
  "provider.suggest-pr-description": HostProviderSuggestPRDescriptionResult;
  "provider.review-diff": HostProviderReviewDiffResult;
  "tooling.get-status": ToolingStatusSnapshot;
  "tooling.sync-origin-main": SyncOriginMainResult;
  "scm.status": HostScmStatusResult;
  "scm.stage-all": CommandResult;
  "scm.unstage-all": CommandResult;
  "scm.commit": CommandResult;
  "scm.try-auto-fix-lint": {
    ok: boolean;
    fixAttempted: boolean;
    eslintOk?: boolean;
    prettierOk?: boolean;
    stderr: string;
  };
  "scm.stage-file": CommandResult;
  "scm.stage-files": CommandResult;
  "scm.unstage-file": CommandResult;
  "scm.discard-file": CommandResult;
  "scm.diff": HostScmDiffResult;
  "scm.graph": HostScmGraphResult;
  "scm.commit-details": HostScmCommitDetailsResult;
  "scm.commit-files": {
    ok: boolean;
    files: GraphFileChange[];
    stderr: string;
  };
  "scm.commit-diff": {
    ok: boolean;
    oldContent: string;
    newContent: string;
    stderr: string;
  };
  "scm.history": HostScmHistoryResult;
  "scm.list-branches": HostScmListBranchesResult;
  "scm.fetch-branch": CommandResult;
  "scm.create-branch": CommandResult;
  "scm.checkout-branch": CommandResult;
  "scm.checkout-default-branch-detached": DetachedCheckoutResult;
  "scm.pull-branch": CommandResult;
  "scm.merge-branch": CommandResult;
  "scm.rebase-branch": CommandResult;
  "scm.cherry-pick": CommandResult;
  "scm.revert": CommandResult;
  "scm.reset": CommandResult;
  "scm.create-tag": CommandResult;
  "scm.delete-tag": CommandResult;
  "scm.rename-branch": CommandResult;
  "scm.delete-branch": CommandResult;
  "scm.push": CommandResult;
  "scm.get-pr-status": HostScmPrStatusResult;
  "scm.get-repo-merge-settings": HostScmRepoMergeSettingsResult;
  "scm.get-pr-status-for-url": HostScmPrStatusResult;
  "scm.fetch-pr-context-index": {
    ok: boolean;
    index: PrContextIndex | null;
    stderr: string;
  };
  "scm.fetch-pr-check-logs": {
    ok: boolean;
    excerpts: PrCheckLogExcerpt[];
    stderr: string;
  };
  "scm.list-github-prs": GitHubPrInboxResult;
  "scm.get-github-pr-review-detail": GitHubPrReviewDetailResult;
  "scm.submit-github-pr-review": GitHubPrReviewSubmitResult;
  "scm.set-pr-ready":
    | CommandResult
    | {
        ok: false;
        stderr: string;
      };
  "scm.merge-pr":
    | CommandResult
    | {
        ok: false;
        stderr: string;
      };
  "scm.update-pr-branch": CommandResult;
  "scm.create-pr": HostScmCreatePrResult;
  "local-mcp.invoke": unknown;
  "crane.run-task": HostCraneRunTaskResult;
  "crane.release-task-control": HostCraneReleaseTaskControlResult;
  "task.take-over": HostTaskTakeOverResult;
  "task.stop": HostTaskStopResult;
  "routine.invoke": unknown;
  "task-supervisor.invoke": unknown;
}

export interface HostServiceEventMap {
  "terminal.output": {
    sessionId: string;
    output: string;
    sequence: number;
    bytes: number;
  };
  "terminal.exit": {
    sessionId: string;
    exitCode: number;
    signal?: number;
  };
  "terminal.status": HostTerminalStatusEvent;
  "workspace-scripts.event": WorkspaceScriptEventEnvelope;
  "provider.stream-event": HostProviderStreamEventPayload;
  "local-mcp.workspace-information-updated": {
    workspaceId: string;
    workspaceInformation: WorkspaceInformationState;
  };
  "local-mcp.task-turn-updated": LocalMcpTaskTurnUpdate;
  "routine.unattended-automations-changed": {
    authorizations: Array<{
      workspaceId: string;
      authorizationToken: string;
    }>;
  };
}

export type HostServiceMethod = keyof HostServiceRequestMap;
export type HostServiceEventName = keyof HostServiceEventMap;

export interface HostServiceReadyEnvelope {
  type: "ready";
}

export interface HostServiceRequestEnvelope<TMethod extends HostServiceMethod> {
  type: "request";
  id: number;
  method: TMethod;
  params: HostServiceRequestMap[TMethod];
}

export interface HostServiceSuccessResponseEnvelope<
  TMethod extends HostServiceMethod,
> {
  type: "response";
  id: number;
  ok: true;
  result: HostServiceResponseMap[TMethod];
}

export interface HostServiceErrorResponseEnvelope {
  type: "response";
  id: number;
  ok: false;
  error: string;
}

export interface HostServiceEventEnvelope<TEvent extends HostServiceEventName> {
  type: "event";
  event: TEvent;
  payload: HostServiceEventMap[TEvent];
}

export type AnyHostServiceRequestEnvelope = {
  [TMethod in HostServiceMethod]: HostServiceRequestEnvelope<TMethod>;
}[HostServiceMethod];

export type AnyHostServiceResponseEnvelope =
  | {
      [
        TMethod in HostServiceMethod
      ]: HostServiceSuccessResponseEnvelope<TMethod>;
    }[HostServiceMethod]
  | HostServiceErrorResponseEnvelope;

export type AnyHostServiceEventEnvelope = {
  [TEvent in HostServiceEventName]: HostServiceEventEnvelope<TEvent>;
}[HostServiceEventName];

export type AnyHostServiceMessage =
  | HostServiceReadyEnvelope
  | AnyHostServiceRequestEnvelope
  | AnyHostServiceResponseEnvelope
  | AnyHostServiceEventEnvelope;
