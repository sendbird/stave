import type {
  CliSessionCreateSessionArgs,
  TerminalCreateSessionArgs,
} from "../../src/lib/terminal/types";
import type {
  CodexAppServerSnapshotResponse,
  CodexModelCatalogResponse,
  CodexMcpOauthLoginResponse,
  CodexMcpResourceReadResponse,
  CodexThreadForkResponse,
  CodexThreadReadResponse,
  ClaudeContextUsageResponse,
  ClaudePluginReloadResponse,
  CodexMcpStatusResponse,
  CodexMutationResponse,
  CodexPluginDetailResponse,
  CodexPluginInstallResponse,
  CodexReviewStartResponse,
  RateLimitsSnapshotResponse,
} from "../../src/lib/providers/provider.types";
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
import type { CommandResult, SourceControlStatusItem } from "../main/types";
import type { WorkspaceInformationState } from "../../src/lib/workspace-information";

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
  stderr?: string;
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

export interface HostProviderSuggestTaskNameArgs {
  prompt: string;
  history?: Array<{ role: string; content: string }>;
}

export interface HostProviderSuggestTaskNameResult {
  ok: boolean;
  title?: string;
}

export interface HostProviderClassifyRouteArgs {
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
  classification?: {
    taskType:
      | "quick_edit"
      | "plan"
      | "implementation"
      | "debug"
      | "review"
      | "general"
      | "safety";
    complexity: "low" | "medium" | "high";
    recommendedTier: "light" | "standard" | "heavy" | "frontier";
    confidence: number;
    rationale?: string;
    stick?: boolean;
  };
}

export interface HostProviderSuggestCommitMessageArgs {
  cwd?: string;
}

export interface HostProviderSuggestCommitMessageResult {
  ok: boolean;
  message?: string;
}

export interface HostProviderSuggestPRDescriptionArgs {
  cwd?: string;
  baseBranch?: string;
  headBranch?: string;
  promptTemplate?: string;
  workspaceContext?: string;
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
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}

export interface HostProviderReviewDiffResult {
  ok: boolean;
  findings: PrePrReviewFinding[];
  headBranch?: string;
  providerId?: PrePrReviewProviderId;
  truncated?: boolean;
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

export interface HostScmGraphResult {
  ok: boolean;
  commits: import("../../src/lib/git-graph/types").GraphCommit[];
  head: string | null;
  hasMore: boolean;
  stderr: string;
}

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
  stderr?: string;
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
  | "respond-approval"
  | "respond-user-input"
  | "get-workspace-information"
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
  | "add-workspace-confluence-page"
  | "add-workspace-figma-resource"
  | "add-workspace-storybook-resource"
  | "update-workspace-storybook-resource-access"
  | "add-workspace-slack-thread"
  | "add-workspace-amplify-link";

export interface HostServiceRequestMap {
  "service.shutdown": undefined;
  "terminal.create-session": TerminalCreateSessionArgs;
  "terminal.create-cli-session": CliSessionCreateSessionArgs;
  "terminal.write-session": {
    sessionId: string;
    input: string;
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
  "provider.cleanup-task": {
    taskId: string;
  };
  "provider.respond-approval": {
    turnId: string;
    requestId: string;
    approved: boolean;
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
  "provider.reload-claude-plugins": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-codex-mcp-status": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-codex-model-catalog": {
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
  "scm.reset": { commit: string; mode: "soft" | "mixed" | "hard"; cwd?: string };
  "scm.create-tag": { name: string; commit?: string; message?: string; cwd?: string };
  "scm.delete-tag": { name: string; cwd?: string };
  "scm.rename-branch": { from: string; to: string; cwd?: string };
  "scm.delete-branch": { name: string; force?: boolean; cwd?: string };
  "scm.push": { branch?: string; remote?: string; force?: boolean; cwd?: string };
  "scm.get-pr-status": {
    cwd?: string;
  };
  "scm.get-pr-status-for-url": {
    url: string;
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
}

export interface HostServiceResponseMap {
  "service.shutdown": {
    ok: true;
  };
  "terminal.create-session": HostTerminalCreateSessionResult;
  "terminal.create-cli-session": HostTerminalCreateSessionResult;
  "terminal.write-session": HostTerminalMutationResult;
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
  "provider.start-stream-turn": HostProviderStartStreamResult;
  "provider.start-push-turn": HostProviderStartPushTurnResult;
  "provider.read-stream-turn": HostProviderReadStreamResult;
  "provider.ack-stream-turn": HostProviderMutationResult;
  "provider.abort-turn": HostProviderMutationResult;
  "provider.cleanup-task": HostProviderMutationResult;
  "provider.respond-approval": HostProviderMutationResult;
  "provider.respond-user-input": HostProviderMutationResult;
  "provider.steer-turn": HostProviderMutationResult;
  "provider.check-availability": {
    ok: boolean;
    available: boolean;
    detail: string;
  };
  "provider.get-command-catalog": ProviderCommandCatalogResult;
  "provider.get-connected-tool-status": ConnectedToolStatusResponse;
  "provider.get-claude-context-usage": ClaudeContextUsageResponse;
  "provider.reload-claude-plugins": ClaudePluginReloadResponse;
  "provider.get-codex-mcp-status": CodexMcpStatusResponse;
  "provider.get-codex-model-catalog": CodexModelCatalogResponse;
  "provider.get-codex-app-server-snapshot": CodexAppServerSnapshotResponse;
  "provider.get-rate-limits-snapshot": RateLimitsSnapshotResponse;
  "provider.get-codex-plugin-detail": CodexPluginDetailResponse;
  "provider.install-codex-plugin": CodexPluginInstallResponse;
  "provider.uninstall-codex-plugin": CodexMutationResponse;
  "provider.set-codex-experimental-feature-enablement": CodexMutationResponse;
  "provider.start-codex-mcp-oauth-login": CodexMcpOauthLoginResponse;
  "provider.read-codex-mcp-resource": CodexMcpResourceReadResponse;
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
  "scm.unstage-file": CommandResult;
  "scm.discard-file": CommandResult;
  "scm.diff": HostScmDiffResult;
  "scm.graph": HostScmGraphResult;
  "scm.commit-files": {
    ok: boolean;
    files: Array<{ path: string; status: string }>;
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
  "scm.get-pr-status-for-url": HostScmPrStatusResult;
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
}

export interface HostServiceEventMap {
  "terminal.output": {
    sessionId: string;
    output: string;
  };
  "terminal.exit": {
    sessionId: string;
    exitCode: number;
    signal?: number;
  };
  "workspace-scripts.event": WorkspaceScriptEventEnvelope;
  "provider.stream-event": HostProviderStreamEventPayload;
  "local-mcp.workspace-information-updated": {
    workspaceId: string;
    workspaceInformation: WorkspaceInformationState;
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
      [TMethod in HostServiceMethod]: HostServiceSuccessResponseEnvelope<TMethod>;
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
