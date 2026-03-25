import { contextBridge, ipcRenderer } from "electron";
import type { CanonicalConversationRequest, ProviderId, ProviderRuntimeOptions } from "../src/lib/providers/provider.types";
import type { SkillCatalogResponse } from "../src/lib/skills/types";

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

const streamEventSubscribers = new Set<(payload: StreamEventPayload) => void>();
ipcRenderer.on("provider:stream-event", (_event, payload: StreamEventPayload) => {
  for (const subscriber of streamEventSubscribers) {
    subscriber(payload);
  }
});

const zoomChangeSubscribers = new Set<(payload: { factor: number; percent: number }) => void>();
ipcRenderer.on("window:zoom-changed", (_event, payload: { factor: number; percent: number }) => {
  for (const subscriber of zoomChangeSubscribers) {
    subscriber(payload);
  }
});

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

const lspEventSubscribers = new Set<(payload: LspEventPayload) => void>();
ipcRenderer.on("lsp:event", (_event, payload: LspEventPayload) => {
  for (const subscriber of lspEventSubscribers) {
    subscriber(payload);
  }
});

contextBridge.exposeInMainWorld("api", {
  provider: {
    streamTurn: (args: StreamTurnArgs) => ipcRenderer.invoke("provider:stream-turn", args),
    startStreamTurn: (args: StreamTurnArgs) => ipcRenderer.invoke("provider:start-stream-turn", args),
    startPushTurn: (args: StreamTurnArgs) => ipcRenderer.invoke("provider:start-push-turn", args),
    readStreamTurn: (args: { streamId: string; cursor: number }) => ipcRenderer.invoke("provider:read-stream-turn", args),
    subscribeStreamEvents: (listener: (payload: StreamEventPayload) => void) => {
      streamEventSubscribers.add(listener);
      return () => {
        streamEventSubscribers.delete(listener);
      };
    },
    abortTurn: (args: { turnId: string }) => ipcRenderer.invoke("provider:abort-turn", args),
    cleanupTask: (args: { taskId: string }) => ipcRenderer.invoke("provider:cleanup-task", args),
    respondApproval: (args: { turnId: string; requestId: string; approved: boolean }) =>
      ipcRenderer.invoke("provider:respond-approval", args),
    respondUserInput: (args: {
      turnId: string;
      requestId: string;
      answers?: Record<string, string>;
      denied?: boolean;
    }) => ipcRenderer.invoke("provider:respond-user-input", args),
    checkAvailability: (args: { providerId: ProviderId }) =>
      ipcRenderer.invoke("provider:check-availability", args),
    getCommandCatalog: (args: {
      providerId: ProviderId;
      cwd?: string;
      runtimeOptions?: StreamTurnArgs["runtimeOptions"];
    }) => ipcRenderer.invoke("provider:get-command-catalog", args) as Promise<{
      ok: boolean;
      supported: boolean;
      commands: ProviderSlashCommand[];
      detail: string;
    }>,
  },
  persistence: {
    listWorkspaces: () => ipcRenderer.invoke("persistence:list-workspaces"),
    loadWorkspace: (args: { workspaceId: string }) => ipcRenderer.invoke("persistence:load-workspace", args),
    upsertWorkspace: (args: { id: string; name: string; snapshot: unknown }) => ipcRenderer.invoke("persistence:upsert-workspace", args),
    upsertWorkspaceSync: (args: { id: string; name: string; snapshot: unknown }) => ipcRenderer.sendSync("persistence:upsert-workspace-sync", args),
    deleteWorkspace: (args: { workspaceId: string }) => ipcRenderer.invoke("persistence:delete-workspace", args),
    listTaskTurns: (args: { workspaceId: string; taskId: string; limit?: number }) => ipcRenderer.invoke("persistence:list-task-turns", args),
    listLatestWorkspaceTurns: (args: { workspaceId: string; limit?: number }) =>
      ipcRenderer.invoke("persistence:list-latest-workspace-turns", args),
    listTurnEvents: (args: { turnId: string; afterSequence?: number; limit?: number }) =>
      ipcRenderer.invoke("persistence:list-turn-events", args),
  },
  fs: {
    pickRoot: () => ipcRenderer.invoke("fs:pick-root"),
    resolvePath: (args: { inputPath: string }) => ipcRenderer.invoke("fs:resolve-path", args),
    listFiles: (args: { rootPath: string }) => ipcRenderer.invoke("fs:list-files", args),
    listDirectory: (args: { rootPath: string; directoryPath?: string }) => ipcRenderer.invoke("fs:list-directory", args),
    readFile: (args: { rootPath: string; filePath: string }) => ipcRenderer.invoke("fs:read-file", args),
    readFileDataUrl: (args: { rootPath: string; filePath: string }) => ipcRenderer.invoke("fs:read-file-data-url", args),
    writeFile: (args: { rootPath: string; filePath: string; content: string; expectedRevision?: string | null }) =>
      ipcRenderer.invoke("fs:write-file", args),
    readTypeDefs: (args: { rootPath: string; entryFilePath?: string }) => ipcRenderer.invoke("fs:read-type-defs", args),
    readSourceFiles: (args: { rootPath: string; entryFilePath?: string }) => ipcRenderer.invoke("fs:read-source-files", args),
  },
  skills: {
    getCatalog: (args?: { workspacePath?: string }) =>
      ipcRenderer.invoke("skills:get-catalog", args ?? {}) as Promise<SkillCatalogResponse>,
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
    stopSessions: (args: { rootPath?: string }) => ipcRenderer.invoke("lsp:stop-sessions", args),
    subscribeEvents: (listener: (payload: LspEventPayload) => void) => {
      lspEventSubscribers.add(listener);
      return () => {
        lspEventSubscribers.delete(listener);
      };
    },
  },
  terminal: {
    runCommand: (args: TerminalRunArgs) => ipcRenderer.invoke("terminal:run-command", args),
    createSession: (args: { cwd?: string; shell?: string; cols?: number; rows?: number }) => ipcRenderer.invoke("terminal:create-session", args),
    writeSession: (args: { sessionId: string; input: string }) => ipcRenderer.invoke("terminal:write-session", args),
    readSession: (args: { sessionId: string }) => ipcRenderer.invoke("terminal:read-session", args),
    resizeSession: (args: { sessionId: string; cols: number; rows: number }) => ipcRenderer.invoke("terminal:resize-session", args),
    closeSession: (args: { sessionId: string }) => ipcRenderer.invoke("terminal:close-session", args),
  },
  sourceControl: {
    getStatus: (args: { cwd?: string }) => ipcRenderer.invoke("scm:status", args),
    stageAll: (args: { cwd?: string }) => ipcRenderer.invoke("scm:stage-all", args),
    unstageAll: (args: { cwd?: string }) => ipcRenderer.invoke("scm:unstage-all", args),
    commit: (args: ScmCommitArgs) => ipcRenderer.invoke("scm:commit", args),
    stageFile: (args: { path: string; cwd?: string }) => ipcRenderer.invoke("scm:stage-file", args),
    unstageFile: (args: { path: string; cwd?: string }) => ipcRenderer.invoke("scm:unstage-file", args),
    discardFile: (args: { path: string; cwd?: string }) => ipcRenderer.invoke("scm:discard-file", args),
    getDiff: (args: { path: string; cwd?: string }) => ipcRenderer.invoke("scm:diff", args),
    getHistory: (args: { cwd?: string; limit?: number }) => ipcRenderer.invoke("scm:history", args),
    listBranches: (args: { cwd?: string }) => ipcRenderer.invoke("scm:list-branches", args),
    createBranch: (args: { name: string; cwd?: string; from?: string }) => ipcRenderer.invoke("scm:create-branch", args),
    checkoutBranch: (args: { name: string; cwd?: string }) => ipcRenderer.invoke("scm:checkout-branch", args),
    mergeBranch: (args: { branch: string; cwd?: string }) => ipcRenderer.invoke("scm:merge-branch", args),
    rebaseBranch: (args: { branch: string; cwd?: string }) => ipcRenderer.invoke("scm:rebase-branch", args),
    cherryPick: (args: { commit: string; cwd?: string }) => ipcRenderer.invoke("scm:cherry-pick", args),
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    getGpuStatus: () => ipcRenderer.invoke("window:get-gpu-status") as Promise<{
      hardwareAccelerationEnabled: boolean;
      featureStatus: Record<string, string>;
    }>,
    subscribeZoomChanges: (listener: (payload: { factor: number; percent: number }) => void) => {
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
  },
  shell: {
    openExternal: (args: { url: string }) => ipcRenderer.invoke("shell:open-external", args),
  },
  capture: {
    screenshot: () => ipcRenderer.invoke("screenshot:capture") as Promise<{ ok: boolean; dataUrl: string }>,
  },
});
