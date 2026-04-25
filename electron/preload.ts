import { contextBridge, ipcRenderer } from "electron";
import type {
  CodexAppServerSnapshotResponse,
  CodexModelCatalogResponse,
  CodexMcpOauthLoginResponse,
  CodexMcpResourceReadResponse,
  CodexThreadForkResponse,
  CodexThreadReadResponse,
  CanonicalConversationRequest,
  ClaudeContextUsageResponse,
  CodexMcpStatusResponse,
  ClaudePluginReloadResponse,
  CodexMutationResponse,
  CodexPluginDetailResponse,
  CodexPluginInstallResponse,
  ProviderId,
  ProviderRuntimeOptions,
  CodexReviewStartResponse,
} from "../src/lib/providers/provider.types";
import type {
  ConnectedToolId,
  ConnectedToolStatusResponse,
} from "../src/lib/providers/connected-tool-status";
import type {
  StaveLocalMcpRequestLog,
  StaveLocalMcpRequestLogPage,
  StaveLocalMcpRequestLogQuery,
  StaveLocalMcpStatus,
} from "../src/lib/local-mcp";
import type { WorkspaceInformationState } from "../src/lib/workspace-information";
import type { RepoMapResponse } from "../src/lib/fs/repo-map.types";
import type {
  AppNotification,
  AppNotificationCreateInput,
} from "../src/lib/notifications/notification.types";
import type { SkillCatalogResponse } from "../src/lib/skills/types";
import type {
  AppUpdateInstallResult,
  AppUpdateStatusSnapshot,
} from "../src/lib/app-update";
import type {
  SyncOriginMainResult,
  ToolingStatusRequest,
  ToolingStatusSnapshot,
} from "../src/lib/tooling-status";
import type {
  CliSessionCreateSessionArgs,
  TerminalCreateSessionArgs,
} from "../src/lib/terminal/types";
import type {
  ScriptKind,
  ScriptTrigger,
  ResolvedWorkspaceScriptsConfig,
  WorkspaceScriptEventEnvelope,
  WorkspaceScriptHookRunSummary,
  WorkspaceScriptStatusEntry,
} from "../src/lib/workspace-scripts/types";
import type {
  BrowserConsoleEventPayload,
  BrowserNavigationEventPayload,
} from "../src/lib/lens/lens.types";
import type { PersistenceBootstrapStatus } from "../src/lib/persistence/bootstrap-status";
import { WORKSPACE_SCRIPTS_IPC } from "../src/lib/workspace-scripts/constants";

interface ProviderSlashCommand {
  name: string;
  command: string;
  description: string;
  argumentHint?: string;
}

interface StreamTurnArgs {
  turnId?: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: CanonicalConversationRequest;
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}

interface TerminalRunArgs {
  command: string;
  cwd?: string;
}

interface TerminalSessionOutputPayload {
  sessionId: string;
  output: string;
}

interface TerminalSessionExitPayload {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

interface ScmCommitArgs {
  message: string;
  cwd?: string;
}

interface StreamEventPayload {
  streamId: string;
  event: unknown;
  sequence: number;
  done: boolean;
  taskId: string | null;
  workspaceId: string | null;
  providerId: ProviderId;
  turnId: string | null;
}

interface WorkspaceInformationUpdatePayload {
  workspaceId: string;
  workspaceInformation: WorkspaceInformationState;
}

const streamEventSubscribers = new Set<(payload: StreamEventPayload) => void>();
ipcRenderer.on(
  "provider:stream-event",
  (_event, payload: StreamEventPayload) => {
    for (const subscriber of streamEventSubscribers) {
      subscriber(payload);
    }
  },
);

const zoomChangeSubscribers = new Set<
  (payload: { factor: number; percent: number }) => void
>();
ipcRenderer.on(
  "window:zoom-changed",
  (_event, payload: { factor: number; percent: number }) => {
    for (const subscriber of zoomChangeSubscribers) {
      subscriber(payload);
    }
  },
);

const terminalSessionOutputSubscribers = new Set<
  (payload: TerminalSessionOutputPayload) => void
>();
ipcRenderer.on(
  "terminal:session-output",
  (_event, payload: TerminalSessionOutputPayload) => {
    for (const subscriber of terminalSessionOutputSubscribers) {
      subscriber(payload);
    }
  },
);

const terminalSessionExitSubscribers = new Set<
  (payload: TerminalSessionExitPayload) => void
>();
ipcRenderer.on(
  "terminal:session-exit",
  (_event, payload: TerminalSessionExitPayload) => {
    for (const subscriber of terminalSessionExitSubscribers) {
      subscriber(payload);
    }
  },
);

const workspaceInformationUpdateSubscribers = new Set<
  (payload: WorkspaceInformationUpdatePayload) => void
>();
ipcRenderer.on(
  "local-mcp:workspace-information-updated",
  (_event, payload: WorkspaceInformationUpdatePayload) => {
    for (const subscriber of workspaceInformationUpdateSubscribers) {
      subscriber(payload);
    }
  },
);

const persistenceBootstrapStatusSubscribers = new Set<
  (payload: PersistenceBootstrapStatus) => void
>();
ipcRenderer.on(
  "persistence:bootstrap-status",
  (_event, payload: PersistenceBootstrapStatus) => {
    for (const subscriber of persistenceBootstrapStatusSubscribers) {
      subscriber(payload);
    }
  },
);

const workspaceScriptEventSubscribersByWorkspaceId = new Map<
  string,
  Set<(payload: WorkspaceScriptEventEnvelope) => void>
>();
ipcRenderer.on(
  WORKSPACE_SCRIPTS_IPC.EVENT,
  (_event, payload: WorkspaceScriptEventEnvelope) => {
    const subscribers = workspaceScriptEventSubscribersByWorkspaceId.get(
      payload.workspaceId,
    );
    if (!subscribers) {
      return;
    }
    for (const subscriber of subscribers) {
      subscriber(payload);
    }
  },
);

type LspEventPayload =
  | {
      type: "status";
      rootPath: string;
      languageId: "python";
      status?: "starting" | "ready" | "error" | "unavailable" | "stopped";
      detail?: string;
    }
  | {
      type: "diagnostics";
      rootPath: string;
      languageId: "python";
      filePath?: string;
      diagnostics?: Array<{
        severity?: number;
        message: string;
        source?: string;
        code?: string;
        range: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
      }>;
    };

const closeShortcutSubscribers = new Set<() => void>();
ipcRenderer.on("shortcut:close-tab-or-task", () => {
  for (const subscriber of closeShortcutSubscribers) {
    subscriber();
  }
});

const appQuitRequestSubscribers = new Set<() => void>();
ipcRenderer.on("window:app-quit-requested", () => {
  for (const subscriber of appQuitRequestSubscribers) {
    subscriber();
  }
});

const lspEventSubscribers = new Set<(payload: LspEventPayload) => void>();
ipcRenderer.on("lsp:event", (_event, payload: LspEventPayload) => {
  for (const subscriber of lspEventSubscribers) {
    subscriber(payload);
  }
});

const scriptsApi = {
  getConfig: (args: {
    projectPath: string;
    workspacePath: string;
    userOverridePath?: string;
  }) =>
    ipcRenderer.invoke(WORKSPACE_SCRIPTS_IPC.GET_CONFIG, args) as Promise<{
      ok: boolean;
      error?: string;
      config: ResolvedWorkspaceScriptsConfig | null;
    }>,
  getStatus: (args: { workspaceId: string }) =>
    ipcRenderer.invoke(WORKSPACE_SCRIPTS_IPC.GET_STATUS, args) as Promise<{
      ok: boolean;
      error?: string;
      statuses: WorkspaceScriptStatusEntry[];
    }>,
  runEntry: (args: {
    workspaceId: string;
    scriptId: string;
    scriptKind: ScriptKind;
    projectPath: string;
    workspacePath: string;
    workspaceName: string;
    branch: string;
  }) =>
    ipcRenderer.invoke(WORKSPACE_SCRIPTS_IPC.RUN_ENTRY, args) as Promise<{
      ok: boolean;
      runId?: string;
      sessionId?: string;
      exitCode?: number;
      alreadyRunning?: boolean;
      error?: string;
    }>,
  stopEntry: (args: {
    workspaceId: string;
    scriptId: string;
    scriptKind: ScriptKind;
  }) =>
    ipcRenderer.invoke(WORKSPACE_SCRIPTS_IPC.STOP_ENTRY, args) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  runHook: (args: {
    workspaceId: string;
    trigger: ScriptTrigger;
    projectPath: string;
    workspacePath: string;
    workspaceName: string;
    branch: string;
    taskId?: string;
    taskTitle?: string;
    turnId?: string;
  }) =>
    ipcRenderer.invoke(WORKSPACE_SCRIPTS_IPC.RUN_HOOK, args) as Promise<{
      ok: boolean;
      error?: string;
      summary: WorkspaceScriptHookRunSummary | null;
    }>,
  stopAll: (args: { workspaceId: string }) =>
    ipcRenderer.invoke(WORKSPACE_SCRIPTS_IPC.STOP_ALL, args) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  subscribeEvents: (
    args: { workspaceId: string },
    listener: (payload: WorkspaceScriptEventEnvelope) => void,
  ) => {
    const existing = workspaceScriptEventSubscribersByWorkspaceId.get(
      args.workspaceId,
    );
    if (existing) {
      existing.add(listener);
    } else {
      workspaceScriptEventSubscribersByWorkspaceId.set(
        args.workspaceId,
        new Set([listener]),
      );
      ipcRenderer.send(WORKSPACE_SCRIPTS_IPC.SUBSCRIBE_EVENTS, args);
    }
    return () => {
      const subscribers = workspaceScriptEventSubscribersByWorkspaceId.get(
        args.workspaceId,
      );
      if (!subscribers) {
        return;
      }
      subscribers.delete(listener);
      if (subscribers.size > 0) {
        return;
      }
      workspaceScriptEventSubscribersByWorkspaceId.delete(args.workspaceId);
      ipcRenderer.send(WORKSPACE_SCRIPTS_IPC.UNSUBSCRIBE_EVENTS, args);
    };
  },
};

// BrowserNavigationEventPayload imported from lens.types is the single source
// of truth for the navigation event shape. The local interface is removed.
const lensNavigationEventSubscribers = new Set<
  (payload: BrowserNavigationEventPayload) => void
>();
ipcRenderer.on(
  "lens:navigation-event",
  (_event, payload: BrowserNavigationEventPayload) => {
    for (const subscriber of lensNavigationEventSubscribers) {
      subscriber(payload);
    }
  },
);
ipcRenderer.on(
  "lens:console-entry",
  (_event, payload: BrowserConsoleEventPayload) => {
    const prefix = `[Lens:${payload.workspaceId}]`;
    const message = payload.entry.source
      ? `${prefix} ${payload.entry.text} (${payload.entry.source})`
      : `${prefix} ${payload.entry.text}`;
    switch (payload.entry.level) {
      case "debug":
        console.debug(message);
        break;
      case "info":
        console.info(message);
        break;
      case "warn":
        console.warn(message);
        break;
      case "error":
        console.error(message);
        break;
      default:
        console.log(message);
        break;
    }
  },
);

contextBridge.exposeInMainWorld("api", {
  platform: process.platform,
  provider: {
    streamTurn: (args: StreamTurnArgs) =>
      ipcRenderer.invoke("provider:stream-turn", args),
    startStreamTurn: (args: StreamTurnArgs) =>
      ipcRenderer.invoke("provider:start-stream-turn", args),
    startPushTurn: (args: StreamTurnArgs) =>
      ipcRenderer.invoke("provider:start-push-turn", args),
    readStreamTurn: (args: { streamId: string; cursor: number }) =>
      ipcRenderer.invoke("provider:read-stream-turn", args),
    ackStreamTurn: (args: { streamId: string; cursor: number }) =>
      ipcRenderer.invoke("provider:ack-stream-turn", args),
    subscribeStreamEvents: (
      listener: (payload: StreamEventPayload) => void,
    ) => {
      streamEventSubscribers.add(listener);
      return () => {
        streamEventSubscribers.delete(listener);
      };
    },
    abortTurn: (args: { turnId: string }) =>
      ipcRenderer.invoke("provider:abort-turn", args),
    cleanupTask: (args: { taskId: string }) =>
      ipcRenderer.invoke("provider:cleanup-task", args),
    respondApproval: (args: {
      turnId: string;
      requestId: string;
      approved: boolean;
    }) => ipcRenderer.invoke("provider:respond-approval", args),
    respondUserInput: (args: {
      turnId: string;
      requestId: string;
      answers?: Record<string, string>;
      denied?: boolean;
    }) => ipcRenderer.invoke("provider:respond-user-input", args),
    checkAvailability: (args: {
      providerId: ProviderId;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) => ipcRenderer.invoke("provider:check-availability", args),
    getCommandCatalog: (args: {
      providerId: ProviderId;
      cwd?: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke("provider:get-command-catalog", args) as Promise<{
        ok: boolean;
        supported: boolean;
        commands: ProviderSlashCommand[];
        detail: string;
      }>,
    getConnectedToolStatus: (args: {
      providerId: ProviderId;
      cwd?: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
      toolIds?: ConnectedToolId[];
    }) =>
      ipcRenderer.invoke(
        "provider:get-connected-tool-status",
        args,
      ) as Promise<ConnectedToolStatusResponse>,
    getClaudeContextUsage: (args: {
      cwd?: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:get-claude-context-usage",
        args,
      ) as Promise<ClaudeContextUsageResponse>,
    reloadClaudePlugins: (args: {
      cwd?: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:reload-claude-plugins",
        args,
      ) as Promise<ClaudePluginReloadResponse>,
    getCodexMcpStatus: (args: {
      cwd?: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:get-codex-mcp-status",
        args,
      ) as Promise<CodexMcpStatusResponse>,
    getCodexModelCatalog: (args: {
      cwd?: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:get-codex-model-catalog",
        args,
      ) as Promise<CodexModelCatalogResponse>,
    getCodexAppServerSnapshot: (args: {
      cwd?: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:get-codex-app-server-snapshot",
        args,
      ) as Promise<CodexAppServerSnapshotResponse>,
    getCodexPluginDetail: (args: {
      marketplacePath: string;
      pluginName: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:get-codex-plugin-detail",
        args,
      ) as Promise<CodexPluginDetailResponse>,
    installCodexPlugin: (args: {
      marketplacePath: string;
      pluginName: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:install-codex-plugin",
        args,
      ) as Promise<CodexPluginInstallResponse>,
    uninstallCodexPlugin: (args: {
      pluginId: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:uninstall-codex-plugin",
        args,
      ) as Promise<CodexMutationResponse>,
    setCodexExperimentalFeatureEnablement: (args: {
      enablement: Record<string, boolean>;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:set-codex-experimental-feature-enablement",
        args,
      ) as Promise<CodexMutationResponse>,
    startCodexMcpOauthLogin: (args: {
      name: string;
      scopes?: string[];
      timeoutSecs?: number;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:start-codex-mcp-oauth-login",
        args,
      ) as Promise<CodexMcpOauthLoginResponse>,
    readCodexMcpResource: (args: {
      threadId: string;
      server: string;
      uri: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:read-codex-mcp-resource",
        args,
      ) as Promise<CodexMcpResourceReadResponse>,
    renameCodexThread: (args: {
      threadId: string;
      name: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:rename-codex-thread",
        args,
      ) as Promise<CodexMutationResponse>,
    readCodexThread: (args: {
      threadId: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:read-codex-thread",
        args,
      ) as Promise<CodexThreadReadResponse>,
    forkCodexThread: (args: {
      threadId: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:fork-codex-thread",
        args,
      ) as Promise<CodexThreadForkResponse>,
    archiveCodexThread: (args: {
      threadId: string;
      archived?: boolean;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:archive-codex-thread",
        args,
      ) as Promise<CodexMutationResponse>,
    compactCodexThread: (args: {
      threadId: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:compact-codex-thread",
        args,
      ) as Promise<CodexMutationResponse>,
    rollbackCodexThread: (args: {
      threadId: string;
      numTurns: number;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:rollback-codex-thread",
        args,
      ) as Promise<CodexMutationResponse>,
    startCodexReview: (args: {
      threadId: string;
      delivery?: "inline" | "detached";
      target:
        | { type: "uncommittedChanges" }
        | { type: "baseBranch"; baseBranch: string }
        | { type: "commit"; sha: string; title?: string }
        | { type: "custom"; instructions: string };
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:start-codex-review",
        args,
      ) as Promise<CodexReviewStartResponse>,
    importCodexExternalConfig: (args: {
      migrationItems: Array<{
        itemType: string;
        description: string;
        cwd: string | null;
      }>;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:import-codex-external-config",
        args,
      ) as Promise<CodexMutationResponse>,
    writeCodexConfigValue: (args: {
      keyPath: string;
      value: unknown;
      mergeStrategy?: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:write-codex-config-value",
        args,
      ) as Promise<CodexMutationResponse>,
    batchWriteCodexConfig: (args: {
      edits: Array<{
        keyPath: string;
        value: unknown;
        mergeStrategy?: string;
      }>;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) =>
      ipcRenderer.invoke(
        "provider:batch-write-codex-config",
        args,
      ) as Promise<CodexMutationResponse>,
    suggestTaskName: (args: {
      prompt: string;
      history?: Array<{ role: string; content: string }>;
    }) =>
      ipcRenderer.invoke("provider:suggest-task-name", args) as Promise<{
        ok: boolean;
        title?: string;
      }>,
    suggestCommitMessage: (args: { cwd?: string }) =>
      ipcRenderer.invoke("provider:suggest-commit-message", args) as Promise<{
        ok: boolean;
        message?: string;
      }>,
    suggestPRDescription: (args: {
      cwd?: string;
      baseBranch?: string;
      headBranch?: string;
      promptTemplate?: string;
      workspaceContext?: string;
    }) =>
      ipcRenderer.invoke("provider:suggest-pr-description", args) as Promise<{
        ok: boolean;
        title?: string;
        body?: string;
        /** Git-detected head branch in the resolved cwd.  The handler
         *  returns `ok: false` when this differs from the provided headBranch,
         *  signalling a cwd mismatch. */
        headBranch?: string;
      }>,
  },
  persistence: {
    getBootstrapStatus: () =>
      ipcRenderer.invoke(
        "persistence:get-bootstrap-status",
      ) as Promise<PersistenceBootstrapStatus>,
    subscribeBootstrapStatus: (
      listener: (payload: PersistenceBootstrapStatus) => void,
    ) => {
      persistenceBootstrapStatusSubscribers.add(listener);
      return () => {
        persistenceBootstrapStatusSubscribers.delete(listener);
      };
    },
    listWorkspaces: () => ipcRenderer.invoke("persistence:list-workspaces"),
    loadWorkspaceShell: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("persistence:load-workspace-shell", args),
    loadWorkspaceShellForRestore: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("persistence:load-workspace-shell-for-restore", args),
    loadWorkspaceShellLite: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("persistence:load-workspace-shell-lite", args),
    loadWorkspaceShellSummary: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("persistence:load-workspace-shell-summary", args),
    loadWorkspace: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("persistence:load-workspace", args),
    loadTaskMessages: (args: {
      workspaceId: string;
      taskId: string;
      limit?: number;
      offset?: number;
    }) => ipcRenderer.invoke("persistence:load-task-messages", args),
    loadWorkspaceEditorTabBodies: (args: {
      workspaceId: string;
      tabIds: string[];
    }) =>
      ipcRenderer.invoke("persistence:load-workspace-editor-tab-bodies", args),
    loadProjectRegistry: () =>
      ipcRenderer.invoke("persistence:load-project-registry"),
    upsertWorkspace: (args: { id: string; name: string; snapshot: unknown }) =>
      ipcRenderer.invoke("persistence:upsert-workspace", args),
    saveProjectRegistry: (args: { projects: unknown[] }) =>
      ipcRenderer.invoke("persistence:save-project-registry", args),
    upsertWorkspaceSync: (args: {
      id: string;
      name: string;
      snapshot: unknown;
    }) => ipcRenderer.sendSync("persistence:upsert-workspace-sync", args),
    closeWorkspace: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("persistence:close-workspace", args),
    listNotifications: (args?: { limit?: number; unreadOnly?: boolean }) =>
      ipcRenderer.invoke("persistence:list-notifications", args ?? {}),
    createNotification: (args: { notification: AppNotificationCreateInput }) =>
      ipcRenderer.invoke("persistence:create-notification", args) as Promise<{
        ok: boolean;
        inserted: boolean;
        notification: AppNotification | null;
      }>,
    markNotificationRead: (args: { id: string; readAt?: string }) =>
      ipcRenderer.invoke(
        "persistence:mark-notification-read",
        args,
      ) as Promise<{
        ok: boolean;
        notification: AppNotification | null;
      }>,
    markAllNotificationsRead: (args?: { readAt?: string }) =>
      ipcRenderer.invoke(
        "persistence:mark-all-notifications-read",
        args ?? {},
      ) as Promise<{
        ok: boolean;
        count: number;
      }>,
    listTaskTurns: (args: {
      workspaceId: string;
      taskId: string;
      limit?: number;
    }) => ipcRenderer.invoke("persistence:list-task-turns", args),
    listActiveWorkspaceTurns: (args: { workspaceId: string; limit?: number }) =>
      ipcRenderer.invoke("persistence:list-active-workspace-turns", args),
    listLatestWorkspaceTurns: (args: { workspaceId: string; limit?: number }) =>
      ipcRenderer.invoke("persistence:list-latest-workspace-turns", args),
  },
  fs: {
    pickRoot: () => ipcRenderer.invoke("fs:pick-root"),
    pickFiles: (args: { rootPath: string }) =>
      ipcRenderer.invoke("fs:pick-files", args),
    resolvePath: (args: { inputPath: string }) =>
      ipcRenderer.invoke("fs:resolve-path", args),
    listFiles: (args: { rootPath: string }) =>
      ipcRenderer.invoke("fs:list-files", args),
    getRepoMap: (args: { rootPath: string; refresh?: boolean }) =>
      ipcRenderer.invoke("fs:get-repo-map", args) as Promise<RepoMapResponse>,
    listDirectory: (args: { rootPath: string; directoryPath?: string }) =>
      ipcRenderer.invoke("fs:list-directory", args),
    readFile: (args: { rootPath: string; filePath: string }) =>
      ipcRenderer.invoke("fs:read-file", args),
    readFileDataUrl: (args: { rootPath: string; filePath: string }) =>
      ipcRenderer.invoke("fs:read-file-data-url", args),
    writeFile: (args: {
      rootPath: string;
      filePath: string;
      content: string;
      expectedRevision?: string | null;
    }) => ipcRenderer.invoke("fs:write-file", args),
    createFile: (args: { rootPath: string; filePath: string }) =>
      ipcRenderer.invoke("fs:create-file", args),
    createDirectory: (args: { rootPath: string; directoryPath: string }) =>
      ipcRenderer.invoke("fs:create-directory", args),
    deleteFile: (args: { rootPath: string; filePath: string }) =>
      ipcRenderer.invoke("fs:delete-file", args),
    deleteDirectory: (args: { rootPath: string; directoryPath: string }) =>
      ipcRenderer.invoke("fs:delete-directory", args),
    readTypeDefs: (args: { rootPath: string; entryFilePath?: string }) =>
      ipcRenderer.invoke("fs:read-type-defs", args),
    readSourceFiles: (args: { rootPath: string; entryFilePath?: string }) =>
      ipcRenderer.invoke("fs:read-source-files", args),
    searchContent: (args: { rootPath: string; query: string }) =>
      ipcRenderer.invoke("fs:search-content", args) as Promise<{
        ok: boolean;
        results: Array<{
          file: string;
          matches: Array<{ line: number; text: string }>;
        }>;
        limitHit: boolean;
        stderr?: string;
      }>,
  },
  skills: {
    getCatalog: (args?: {
      workspacePath?: string;
      sharedSkillsHome?: string;
    }) =>
      ipcRenderer.invoke(
        "skills:get-catalog",
        args ?? {},
      ) as Promise<SkillCatalogResponse>,
  },
  localMcp: {
    getStatus: () =>
      ipcRenderer.invoke("local-mcp:get-status") as Promise<{
        ok: boolean;
        status: StaveLocalMcpStatus | null;
        message?: string;
      }>,
    updateConfig: (args: {
      enabled?: boolean;
      port?: number;
      token?: string;
      claudeCodeAutoRegister?: boolean;
      codexAutoRegister?: boolean;
    }) =>
      ipcRenderer.invoke("local-mcp:update-config", args) as Promise<{
        ok: boolean;
        status: StaveLocalMcpStatus | null;
        message?: string;
      }>,
    rotateToken: () =>
      ipcRenderer.invoke("local-mcp:rotate-token") as Promise<{
        ok: boolean;
        status: StaveLocalMcpStatus | null;
        message?: string;
      }>,
    listRequestLogs: (args?: StaveLocalMcpRequestLogQuery) =>
      ipcRenderer.invoke("local-mcp:list-request-logs", args ?? {}) as Promise<{
        ok: boolean;
        logs: StaveLocalMcpRequestLogPage["logs"];
        total: StaveLocalMcpRequestLogPage["total"];
        limit: StaveLocalMcpRequestLogPage["limit"];
        offset: StaveLocalMcpRequestLogPage["offset"];
        hasMore: StaveLocalMcpRequestLogPage["hasMore"];
        message?: string;
      }>,
    getRequestLog: (args: { id: string; includePayload?: boolean }) =>
      ipcRenderer.invoke("local-mcp:get-request-log", args) as Promise<{
        ok: boolean;
        log: StaveLocalMcpRequestLog | null;
        message?: string;
      }>,
    clearRequestLogs: () =>
      ipcRenderer.invoke("local-mcp:clear-request-logs") as Promise<{
        ok: boolean;
        cleared: number;
        message?: string;
      }>,
    respondApproval: (args: {
      workspaceId: string;
      taskId: string;
      requestId: string;
      approved: boolean;
    }) =>
      ipcRenderer.invoke("local-mcp:respond-approval", args) as Promise<{
        ok: boolean;
        message?: string;
        result?: {
          ok: boolean;
          workspaceId: string;
          taskId: string;
          requestId: string;
          approved: boolean;
        };
      }>,
    respondUserInput: (args: {
      workspaceId: string;
      taskId: string;
      requestId: string;
      answers?: Record<string, string>;
      denied?: boolean;
    }) =>
      ipcRenderer.invoke("local-mcp:respond-user-input", args) as Promise<{
        ok: boolean;
        message?: string;
        result?: {
          ok: boolean;
          workspaceId: string;
          taskId: string;
          requestId: string;
          answers?: Record<string, string>;
          denied?: boolean;
        };
      }>,
    subscribeWorkspaceInformationUpdates: (
      listener: (payload: WorkspaceInformationUpdatePayload) => void,
    ) => {
      workspaceInformationUpdateSubscribers.add(listener);
      return () => {
        workspaceInformationUpdateSubscribers.delete(listener);
      };
    },
  },
  lsp: {
    syncDocument: (args: {
      rootPath: string;
      languageId: "python";
      filePath: string;
      documentLanguageId: string;
      text: string;
      version: number;
      commandOverride?: string;
    }) => ipcRenderer.invoke("lsp:sync-document", args),
    closeDocument: (args: {
      rootPath: string;
      languageId: "python";
      filePath: string;
    }) => ipcRenderer.invoke("lsp:close-document", args),
    hover: (args: {
      rootPath: string;
      languageId: "python";
      filePath: string;
      line: number;
      character: number;
      commandOverride?: string;
    }) => ipcRenderer.invoke("lsp:hover", args),
    completion: (args: {
      rootPath: string;
      languageId: "python";
      filePath: string;
      line: number;
      character: number;
      commandOverride?: string;
    }) => ipcRenderer.invoke("lsp:completion", args),
    definition: (args: {
      rootPath: string;
      languageId: "python";
      filePath: string;
      line: number;
      character: number;
      commandOverride?: string;
    }) => ipcRenderer.invoke("lsp:definition", args),
    stopSessions: (args: { rootPath?: string }) =>
      ipcRenderer.invoke("lsp:stop-sessions", args),
    subscribeEvents: (listener: (payload: LspEventPayload) => void) => {
      lspEventSubscribers.add(listener);
      return () => {
        lspEventSubscribers.delete(listener);
      };
    },
  },
  eslint: {
    lint: (args: { rootPath: string; filePath: string; text: string }) =>
      ipcRenderer.invoke("eslint:lint", args),
    fix: (args: { rootPath: string; filePath: string; text: string }) =>
      ipcRenderer.invoke("eslint:fix", args),
  },
  diagnostics: {
    reportRendererIssue: (args: {
      scope: string;
      context: string;
      message: string;
      stack?: string;
      metadata?: Record<string, string>;
    }) => ipcRenderer.invoke("diagnostics:report-renderer-issue", args),
  },
  terminal: {
    runCommand: (args: TerminalRunArgs) =>
      ipcRenderer.invoke("terminal:run-command", args),
    createSession: (args: TerminalCreateSessionArgs) =>
      ipcRenderer.invoke("terminal:create-session", args),
    createCliSession: (args: CliSessionCreateSessionArgs) =>
      ipcRenderer.invoke("terminal:create-cli-session", args),
    writeSession: (args: { sessionId: string; input: string }) =>
      ipcRenderer.invoke("terminal:write-session", args),
    readSession: (args: { sessionId: string }) =>
      ipcRenderer.invoke("terminal:read-session", args),
    subscribeSessionOutput: (
      listener: (payload: TerminalSessionOutputPayload) => void,
    ) => {
      terminalSessionOutputSubscribers.add(listener);
      return () => {
        terminalSessionOutputSubscribers.delete(listener);
      };
    },
    subscribeSessionExit: (
      listener: (payload: TerminalSessionExitPayload) => void,
    ) => {
      terminalSessionExitSubscribers.add(listener);
      return () => {
        terminalSessionExitSubscribers.delete(listener);
      };
    },
    setSessionDeliveryMode: (args: {
      sessionId: string;
      deliveryMode: "poll" | "push";
    }) => ipcRenderer.invoke("terminal:set-session-delivery-mode", args),
    resizeSession: (args: { sessionId: string; cols: number; rows: number }) =>
      ipcRenderer.invoke("terminal:resize-session", args),
    closeSession: (args: { sessionId: string }) =>
      ipcRenderer.invoke("terminal:close-session", args),
    attachSession: (args: {
      sessionId: string;
      deliveryMode: "poll" | "push";
    }) => ipcRenderer.invoke("terminal:attach-session", args),
    detachSession: (args: { sessionId: string; attachmentId?: string }) =>
      ipcRenderer.invoke("terminal:detach-session", args),
    resumeSessionStream: (args: { sessionId: string; attachmentId: string }) =>
      ipcRenderer.invoke("terminal:resume-session-stream", args),
    getSlotState: (args: { slotKey: string }) =>
      ipcRenderer.invoke("terminal:get-slot-state", args),
    getSessionResumeInfo: (args: { sessionId: string }) =>
      ipcRenderer.invoke("terminal:get-session-resume-info", args),
    closeSessionsBySlotPrefix: (args: { prefix: string }) =>
      ipcRenderer.invoke("terminal:close-sessions-by-slot-prefix", args),
  },
  tooling: {
    getStatus: (args: ToolingStatusRequest) =>
      ipcRenderer.invoke(
        "tooling:get-status",
        args,
      ) as Promise<ToolingStatusSnapshot>,
    syncOriginMain: (args: { cwd?: string }) =>
      ipcRenderer.invoke(
        "tooling:sync-origin-main",
        args,
      ) as Promise<SyncOriginMainResult>,
    getAppUpdateStatus: () =>
      ipcRenderer.invoke(
        "tooling:get-app-update-status",
      ) as Promise<AppUpdateStatusSnapshot>,
    installAppUpdateAndRestart: () =>
      ipcRenderer.invoke(
        "tooling:install-app-update-and-restart",
      ) as Promise<AppUpdateInstallResult>,
  },
  scripts: scriptsApi,
  sourceControl: {
    getStatus: (args: { cwd?: string }) =>
      ipcRenderer.invoke("scm:status", args),
    stageAll: (args: { cwd?: string }) =>
      ipcRenderer.invoke("scm:stage-all", args),
    unstageAll: (args: { cwd?: string }) =>
      ipcRenderer.invoke("scm:unstage-all", args),
    commit: (args: ScmCommitArgs) => ipcRenderer.invoke("scm:commit", args),
    tryAutoFixLint: (args: { cwd?: string }) =>
      ipcRenderer.invoke("scm:try-auto-fix-lint", args) as Promise<{
        ok: boolean;
        fixAttempted: boolean;
        eslintOk?: boolean;
        prettierOk?: boolean;
        stderr: string;
      }>,
    stageFile: (args: { path: string; cwd?: string }) =>
      ipcRenderer.invoke("scm:stage-file", args),
    unstageFile: (args: { path: string; cwd?: string }) =>
      ipcRenderer.invoke("scm:unstage-file", args),
    discardFile: (args: { path: string; cwd?: string }) =>
      ipcRenderer.invoke("scm:discard-file", args),
    getDiff: (args: { path: string; cwd?: string }) =>
      ipcRenderer.invoke("scm:diff", args),
    getHistory: (args: { cwd?: string; limit?: number }) =>
      ipcRenderer.invoke("scm:history", args),
    listBranches: (args: { cwd?: string; refreshRemote?: boolean }) =>
      ipcRenderer.invoke("scm:list-branches", args),
    createBranch: (args: { name: string; cwd?: string; from?: string }) =>
      ipcRenderer.invoke("scm:create-branch", args),
    checkoutBranch: (args: { name: string; cwd?: string }) =>
      ipcRenderer.invoke("scm:checkout-branch", args),
    mergeBranch: (args: { branch: string; cwd?: string }) =>
      ipcRenderer.invoke("scm:merge-branch", args),
    rebaseBranch: (args: { branch: string; cwd?: string }) =>
      ipcRenderer.invoke("scm:rebase-branch", args),
    cherryPick: (args: { commit: string; cwd?: string }) =>
      ipcRenderer.invoke("scm:cherry-pick", args),
    createPR: (args: {
      title: string;
      body?: string;
      baseBranch?: string;
      draft?: boolean;
      cwd?: string;
    }) =>
      ipcRenderer.invoke("scm:create-pr", args) as Promise<{
        ok: boolean;
        prUrl?: string;
        stderr?: string;
      }>,
    getPrStatus: (args: { cwd?: string }) =>
      ipcRenderer.invoke("scm:get-pr-status", args) as Promise<{
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
      }>,
    getPrStatusForUrl: (args: { url: string; cwd?: string }) =>
      ipcRenderer.invoke("scm:get-pr-status-for-url", args) as Promise<{
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
      }>,
    setPrReady: (args: { cwd?: string }) =>
      ipcRenderer.invoke("scm:set-pr-ready", args) as Promise<{
        ok: boolean;
        code?: number;
        stdout?: string;
        stderr?: string;
      }>,
    mergePr: (args: { method?: "merge" | "squash" | "rebase"; cwd?: string }) =>
      ipcRenderer.invoke("scm:merge-pr", args) as Promise<{
        ok: boolean;
        code?: number;
        stdout?: string;
        stderr?: string;
      }>,
    updatePrBranch: (args: { cwd?: string }) =>
      ipcRenderer.invoke("scm:update-pr-branch", args) as Promise<{
        ok: boolean;
        code?: number;
        stdout?: string;
        stderr?: string;
      }>,
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    confirmAppQuit: () =>
      ipcRenderer.invoke("window:confirm-app-quit") as Promise<{ ok: boolean }>,
    cancelAppQuit: () =>
      ipcRenderer.invoke("window:cancel-app-quit") as Promise<{ ok: boolean }>,
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    getGpuStatus: () =>
      ipcRenderer.invoke("window:get-gpu-status") as Promise<{
        hardwareAccelerationEnabled: boolean;
        featureStatus: Record<string, string>;
      }>,
    subscribeZoomChanges: (
      listener: (payload: { factor: number; percent: number }) => void,
    ) => {
      zoomChangeSubscribers.add(listener);
      return () => {
        zoomChangeSubscribers.delete(listener);
      };
    },
    subscribeCloseShortcut: (listener: () => void) => {
      closeShortcutSubscribers.add(listener);
      return () => {
        closeShortcutSubscribers.delete(listener);
      };
    },
    subscribeAppQuitRequested: (listener: () => void) => {
      appQuitRequestSubscribers.add(listener);
      return () => {
        appQuitRequestSubscribers.delete(listener);
      };
    },
  },
  shell: {
    openExternal: (args: { url: string }) =>
      ipcRenderer.invoke("shell:open-external", args),
    showInFinder: (args: { path: string }) =>
      ipcRenderer.invoke("shell:show-in-finder", args),
    openInVSCode: (args: { path: string }) =>
      ipcRenderer.invoke("shell:open-in-vscode", args),
    openInTerminal: (args: { path: string }) =>
      ipcRenderer.invoke("shell:open-in-terminal", args),
    openInGhostty: (args: { path: string }) =>
      ipcRenderer.invoke("shell:open-in-ghostty", args),
  },
  metrics: {
    getAppMetrics: () =>
      ipcRenderer.invoke("metrics:get-app-metrics") as Promise<{
        processes: Array<{
          pid: number;
          type: string;
          memory: {
            workingSetSizeKB: number;
            peakWorkingSetSizeKB: number;
          };
          cpu: {
            percentCPUUsage: number;
          };
        }>;
        mainProcess: {
          rss: number;
          heapTotal: number;
          heapUsed: number;
          external: number;
          arrayBuffers: number;
        };
        uptimeSeconds: number;
      }>,
  },
  inlineCompletion: {
    request: (args: {
      prefix: string;
      suffix: string;
      filePath: string;
      language: string;
      maxTokens?: number;
      systemPromptOverride?: string;
    }) =>
      ipcRenderer.invoke("inline-completion:request", args) as Promise<{
        ok: boolean;
        text: string;
        error?: string;
      }>,
    abort: () =>
      ipcRenderer.invoke("inline-completion:abort") as Promise<{ ok: boolean }>,
    available: () =>
      ipcRenderer.invoke("inline-completion:available") as Promise<{
        ok: boolean;
        available: boolean;
      }>,
  },
  lens: {
    createView: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("lens:create-view", args) as Promise<{
        ok: boolean;
        message?: string;
      }>,
    destroyView: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("lens:destroy-view", args) as Promise<{
        ok: boolean;
      }>,
    setBounds: (args: {
      workspaceId: string;
      bounds: { x: number; y: number; width: number; height: number };
    }) =>
      ipcRenderer.invoke("lens:set-bounds", args) as Promise<{
        ok: boolean;
        message?: string;
      }>,
    setVisible: (args: { workspaceId: string; visible: boolean }) =>
      ipcRenderer.invoke("lens:set-visible", args) as Promise<{
        ok: boolean;
      }>,
    navigate: (args: { workspaceId: string; url: string }) =>
      ipcRenderer.invoke("lens:navigate", args) as Promise<{
        ok: boolean;
        message?: string;
      }>,
    goBack: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("lens:go-back", args) as Promise<{
        ok: boolean;
        message?: string;
      }>,
    goForward: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("lens:go-forward", args) as Promise<{
        ok: boolean;
        message?: string;
      }>,
    reload: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("lens:reload", args) as Promise<{
        ok: boolean;
        message?: string;
      }>,
    getState: (args: { workspaceId: string }) =>
      ipcRenderer.invoke("lens:get-state", args) as Promise<{
        ok: boolean;
        state?: {
          url: string;
          title: string;
          canGoBack: boolean;
          canGoForward: boolean;
          isLoading: boolean;
        };
        message?: string;
      }>,
    screenshot: (args: {
      workspaceId: string;
      options?: {
        fullPage?: boolean;
        clip?: { x: number; y: number; width: number; height: number };
      };
    }) =>
      ipcRenderer.invoke("lens:screenshot", args) as Promise<{
        ok: boolean;
        dataUrl?: string;
        message?: string;
      }>,
    getDom: (args: { workspaceId: string; selector?: string }) =>
      ipcRenderer.invoke("lens:get-dom", args) as Promise<{
        ok: boolean;
        html?: string;
        message?: string;
      }>,
    evaluate: (args: { workspaceId: string; expression: string }) =>
      ipcRenderer.invoke("lens:evaluate", args) as Promise<{
        ok: boolean;
        result?: unknown;
        message?: string;
      }>,
    getConsoleLog: (args: { workspaceId: string; limit?: number }) =>
      ipcRenderer.invoke("lens:get-console-log", args) as Promise<{
        ok: boolean;
        entries?: Array<{
          level: string;
          text: string;
          timestamp: string;
          source?: string;
        }>;
        message?: string;
      }>,
    getNetworkLog: (args: { workspaceId: string; limit?: number }) =>
      ipcRenderer.invoke("lens:get-network-log", args) as Promise<{
        ok: boolean;
        entries?: Array<{
          url: string;
          method: string;
          status?: number;
          timestamp: string;
        }>;
        message?: string;
      }>,
    startElementPicker: (args: {
      workspaceId: string;
      options?: { extractDebugSource?: boolean };
    }) =>
      ipcRenderer.invoke("lens:start-element-picker", args) as Promise<{
        ok: boolean;
        result?: {
          selector: string;
          tagName: string;
          id: string;
          classList: string[];
          boundingBox: { x: number; y: number; width: number; height: number };
          computedStyles: Record<string, string>;
          outerHTML: string;
          textContent: string;
          debugSource?: {
            fileName: string;
            lineNumber: number;
            columnNumber?: number;
          };
        };
        message?: string;
      }>,
    subscribeNavigationEvents: (
      listener: (payload: BrowserNavigationEventPayload) => void,
    ) => {
      lensNavigationEventSubscribers.add(listener);
      return () => {
        lensNavigationEventSubscribers.delete(listener);
      };
    },
  },
});
