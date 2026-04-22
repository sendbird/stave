import { ipcMain, webContents } from "electron";
import {
  invokeHostService,
  onHostServiceEvent,
} from "../host-service-client";
import {
  ApprovalResponseArgsSchema,
  ClaudeRuntimeActionArgsSchema,
  CheckAvailabilityArgsSchema,
  ConnectedToolStatusArgsSchema,
  CodexConfigBatchWriteArgsSchema,
  CodexConfigValueWriteArgsSchema,
  CodexExperimentalFeatureEnablementArgsSchema,
  CodexExternalConfigImportArgsSchema,
  CodexMcpOauthLoginArgsSchema,
  CodexMcpResourceReadArgsSchema,
  CodexPluginDetailArgsSchema,
  CodexPluginInstallArgsSchema,
  CodexPluginUninstallArgsSchema,
  CodexReviewStartArgsSchema,
  CodexRuntimeActionArgsSchema,
  CodexThreadArchiveArgsSchema,
  CodexThreadCompactArgsSchema,
  CodexThreadForkArgsSchema,
  CodexThreadReadArgsSchema,
  CodexThreadRenameArgsSchema,
  CodexThreadRollbackArgsSchema,
  CleanupTaskArgsSchema,
  ProviderCommandCatalogArgsSchema,
  StreamAckArgsSchema,
  StreamReadArgsSchema,
  StreamTurnArgsSchema,
  SuggestCommitMessageArgsSchema,
  SuggestPRDescriptionArgsSchema,
  SuggestTaskNameArgsSchema,
  UserInputResponseArgsSchema,
} from "./schemas";

function formatSchemaIssuePath(path: PropertyKey[]) {
  if (path.length === 0) {
    return "(root)";
  }
  return path.map((segment) => String(segment)).join(".");
}

function formatSchemaFailureMessage(args: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
  fallback: string;
}) {
  const summary = args.issues
    .slice(0, 3)
    .map((issue) => `${formatSchemaIssuePath(issue.path)}: ${issue.message}`)
    .join("; ");

  return summary.length > 0
    ? `IPC schema rejected provider request. ${summary}`
    : args.fallback;
}

const providerOwnerWebContentsIdByStreamId = new Map<string, number>();
const providerStreamIdsByWebContentsId = new Map<number, Set<string>>();
const providerCleanupRegisteredContentsIds = new Set<number>();
let providerEventBridgeRegistered = false;

function forgetProviderStreamOwner(streamId: string) {
  const ownerWebContentsId = providerOwnerWebContentsIdByStreamId.get(streamId);
  if (ownerWebContentsId == null) {
    return;
  }
  providerOwnerWebContentsIdByStreamId.delete(streamId);
  const streamIds = providerStreamIdsByWebContentsId.get(ownerWebContentsId);
  if (!streamIds) {
    return;
  }
  streamIds.delete(streamId);
  if (streamIds.size === 0) {
    providerStreamIdsByWebContentsId.delete(ownerWebContentsId);
  }
}

function registerProviderEventCleanup(contentsId: number) {
  if (providerCleanupRegisteredContentsIds.has(contentsId)) {
    return;
  }
  const contents = webContents.fromId(contentsId);
  if (!contents || contents.isDestroyed()) {
    return;
  }
  providerCleanupRegisteredContentsIds.add(contentsId);
  contents.once("destroyed", () => {
    const streamIds = [...(providerStreamIdsByWebContentsId.get(contentsId) ?? [])];
    for (const streamId of streamIds) {
      forgetProviderStreamOwner(streamId);
    }
    providerCleanupRegisteredContentsIds.delete(contentsId);
  });
}

function rememberProviderStreamOwner(args: {
  streamId?: string;
  ownerWebContentsId?: number | null;
}) {
  if (!args.streamId) {
    return;
  }
  if (args.ownerWebContentsId == null) {
    forgetProviderStreamOwner(args.streamId);
    return;
  }
  forgetProviderStreamOwner(args.streamId);
  providerOwnerWebContentsIdByStreamId.set(args.streamId, args.ownerWebContentsId);
  const streamIds = providerStreamIdsByWebContentsId.get(args.ownerWebContentsId) ?? new Set<string>();
  streamIds.add(args.streamId);
  providerStreamIdsByWebContentsId.set(args.ownerWebContentsId, streamIds);
  registerProviderEventCleanup(args.ownerWebContentsId);
}

function registerProviderEventBridge() {
  if (providerEventBridgeRegistered) {
    return;
  }
  providerEventBridgeRegistered = true;

  onHostServiceEvent("provider.stream-event", (payload) => {
    const ownerWebContentsId = providerOwnerWebContentsIdByStreamId.get(
      payload.streamId,
    );
    if (payload.done) {
      forgetProviderStreamOwner(payload.streamId);
    }
    if (ownerWebContentsId == null) {
      return;
    }

    const owner = webContents.fromId(ownerWebContentsId);
    if (!owner || owner.isDestroyed()) {
      forgetProviderStreamOwner(payload.streamId);
      return;
    }

    owner.send("provider:stream-event", payload);
  });
}

export function registerProviderHandlers() {
  registerProviderEventBridge();

  ipcMain.handle("provider:stream-turn", async (_event, args: unknown) => {
    const parsedArgs = StreamTurnArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return [
        {
          type: "error",
          message: formatSchemaFailureMessage({
            issues: parsedArgs.error.issues,
            fallback: "IPC schema rejected provider request.",
          }),
          recoverable: false,
        },
        { type: "done" },
      ];
    }
    return invokeHostService("provider.stream-turn", parsedArgs.data);
  });

  ipcMain.handle("provider:start-stream-turn", async (_event, args: unknown) => {
    const parsedArgs = StreamTurnArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        streamId: "",
        message: formatSchemaFailureMessage({
          issues: parsedArgs.error.issues,
          fallback: "IPC schema rejected provider request.",
        }),
      };
    }
    return invokeHostService("provider.start-stream-turn", parsedArgs.data);
  });

  ipcMain.handle("provider:start-push-turn", async (event, args: unknown) => {
    const parsedArgs = StreamTurnArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        streamId: "",
        turnId: null,
        message: formatSchemaFailureMessage({
          issues: parsedArgs.error.issues,
          fallback: "IPC schema rejected provider request.",
        }),
      };
    }

    const result = await invokeHostService("provider.start-push-turn", parsedArgs.data);
    if (result.ok) {
      rememberProviderStreamOwner({
        streamId: result.streamId,
        ownerWebContentsId: event.sender.id,
      });
    }
    return result;
  });

  ipcMain.handle("provider:read-stream-turn", async (_event, args: unknown) => {
    const parsedArgs = StreamReadArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        events: [],
        cursor: 0,
        done: true,
        message: "Invalid stream read request.",
      };
    }
    return invokeHostService("provider.read-stream-turn", parsedArgs.data);
  });

  ipcMain.handle("provider:ack-stream-turn", async (_event, args: unknown) => {
    const parsedArgs = StreamAckArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        message: "Invalid stream ack request.",
      };
    }
    return invokeHostService("provider.ack-stream-turn", parsedArgs.data);
  });

  ipcMain.handle("provider:abort-turn", (_event, args: unknown) => {
    const turnId = (args as { turnId?: unknown })?.turnId;
    if (typeof turnId !== "string" || turnId.trim().length === 0) {
      return { ok: false, message: "Invalid provider abort request." };
    }
    return invokeHostService("provider.abort-turn", { turnId });
  });

  ipcMain.handle("provider:cleanup-task", (_event, args: unknown) => {
    const parsedArgs = CleanupTaskArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, message: "Invalid task cleanup request." };
    }
    return invokeHostService("provider.cleanup-task", {
      taskId: parsedArgs.data.taskId,
    });
  });

  ipcMain.handle("provider:respond-approval", (_event, args: unknown) => {
    const parsedArgs = ApprovalResponseArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, message: "Invalid approval response request." };
    }
    return invokeHostService("provider.respond-approval", parsedArgs.data);
  });

  ipcMain.handle("provider:respond-user-input", (_event, args: unknown) => {
    const parsedArgs = UserInputResponseArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, message: "Invalid user-input response request." };
    }
    return invokeHostService("provider.respond-user-input", parsedArgs.data);
  });

  ipcMain.handle("provider:check-availability", (_event, args: unknown) => {
    const parsedArgs = CheckAvailabilityArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        available: false,
        detail: "Invalid provider availability request.",
      };
    }
    return invokeHostService("provider.check-availability", parsedArgs.data);
  });

  ipcMain.handle("provider:get-command-catalog", (_event, args: unknown) => {
    const parsedArgs = ProviderCommandCatalogArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        supported: false,
        commands: [],
        detail: "Invalid provider command catalog request.",
      };
    }
    return invokeHostService("provider.get-command-catalog", {
      providerId: parsedArgs.data.providerId,
      cwd: parsedArgs.data.cwd,
      runtimeOptions: parsedArgs.data.runtimeOptions,
    });
  });

  ipcMain.handle("provider:get-connected-tool-status", (_event, args: unknown) => {
    const parsedArgs = ConnectedToolStatusArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        providerId: "stave" as const,
        detail: "Invalid connected-tool status request.",
        tools: [],
      };
    }
    return invokeHostService("provider.get-connected-tool-status", parsedArgs.data);
  });

  ipcMain.handle("provider:get-claude-context-usage", (_event, args: unknown) => {
    const parsedArgs = ClaudeRuntimeActionArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Claude context usage request.",
      };
    }
    return invokeHostService("provider.get-claude-context-usage", parsedArgs.data);
  });

  ipcMain.handle("provider:reload-claude-plugins", (_event, args: unknown) => {
    const parsedArgs = ClaudeRuntimeActionArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Claude plugin reload request.",
      };
    }
    return invokeHostService("provider.reload-claude-plugins", parsedArgs.data);
  });

  ipcMain.handle("provider:get-codex-mcp-status", (_event, args: unknown) => {
    const parsedArgs = ClaudeRuntimeActionArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex MCP status request.",
        servers: [],
      };
    }
    return invokeHostService("provider.get-codex-mcp-status", parsedArgs.data);
  });

  ipcMain.handle("provider:get-codex-model-catalog", (_event, args: unknown) => {
    const parsedArgs = CodexRuntimeActionArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex model catalog request.",
        models: [],
      };
    }
    return invokeHostService("provider.get-codex-model-catalog", parsedArgs.data);
  });

  ipcMain.handle("provider:get-codex-app-server-snapshot", (_event, args: unknown) => {
    const parsedArgs = CodexRuntimeActionArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex App Server snapshot request.",
        sectionErrors: {},
      };
    }
    return invokeHostService(
      "provider.get-codex-app-server-snapshot",
      parsedArgs.data,
    );
  });

  ipcMain.handle("provider:get-codex-plugin-detail", (_event, args: unknown) => {
    const parsedArgs = CodexPluginDetailArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex plugin detail request.",
      };
    }
    return invokeHostService("provider.get-codex-plugin-detail", parsedArgs.data);
  });

  ipcMain.handle("provider:install-codex-plugin", (_event, args: unknown) => {
    const parsedArgs = CodexPluginInstallArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex plugin install request.",
        authPolicy: null,
        appsNeedingAuth: [],
      };
    }
    return invokeHostService("provider.install-codex-plugin", parsedArgs.data);
  });

  ipcMain.handle("provider:uninstall-codex-plugin", (_event, args: unknown) => {
    const parsedArgs = CodexPluginUninstallArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex plugin uninstall request.",
      };
    }
    return invokeHostService("provider.uninstall-codex-plugin", parsedArgs.data);
  });

  ipcMain.handle(
    "provider:set-codex-experimental-feature-enablement",
    (_event, args: unknown) => {
      const parsedArgs =
        CodexExperimentalFeatureEnablementArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        return {
          ok: false,
          detail: "Invalid Codex experimental feature request.",
        };
      }
      return invokeHostService(
        "provider.set-codex-experimental-feature-enablement",
        parsedArgs.data,
      );
    },
  );

  ipcMain.handle("provider:start-codex-mcp-oauth-login", (_event, args: unknown) => {
    const parsedArgs = CodexMcpOauthLoginArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex MCP OAuth login request.",
      };
    }
    return invokeHostService(
      "provider.start-codex-mcp-oauth-login",
      parsedArgs.data,
    );
  });

  ipcMain.handle("provider:read-codex-mcp-resource", (_event, args: unknown) => {
    const parsedArgs = CodexMcpResourceReadArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex MCP resource read request.",
        contents: [],
      };
    }
    return invokeHostService("provider.read-codex-mcp-resource", parsedArgs.data);
  });

  ipcMain.handle("provider:rename-codex-thread", (_event, args: unknown) => {
    const parsedArgs = CodexThreadRenameArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex thread rename request.",
      };
    }
    return invokeHostService("provider.rename-codex-thread", parsedArgs.data);
  });

  ipcMain.handle("provider:read-codex-thread", (_event, args: unknown) => {
    const parsedArgs = CodexThreadReadArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex thread read request.",
      };
    }
    return invokeHostService("provider.read-codex-thread", parsedArgs.data);
  });

  ipcMain.handle("provider:fork-codex-thread", (_event, args: unknown) => {
    const parsedArgs = CodexThreadForkArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex thread fork request.",
      };
    }
    return invokeHostService("provider.fork-codex-thread", parsedArgs.data);
  });

  ipcMain.handle("provider:archive-codex-thread", (_event, args: unknown) => {
    const parsedArgs = CodexThreadArchiveArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex thread archive request.",
      };
    }
    return invokeHostService("provider.archive-codex-thread", parsedArgs.data);
  });

  ipcMain.handle("provider:compact-codex-thread", (_event, args: unknown) => {
    const parsedArgs = CodexThreadCompactArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex thread compact request.",
      };
    }
    return invokeHostService("provider.compact-codex-thread", parsedArgs.data);
  });

  ipcMain.handle("provider:rollback-codex-thread", (_event, args: unknown) => {
    const parsedArgs = CodexThreadRollbackArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex thread rollback request.",
      };
    }
    return invokeHostService("provider.rollback-codex-thread", parsedArgs.data);
  });

  ipcMain.handle("provider:start-codex-review", (_event, args: unknown) => {
    const parsedArgs = CodexReviewStartArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex review request.",
      };
    }
    return invokeHostService("provider.start-codex-review", parsedArgs.data);
  });

  ipcMain.handle("provider:import-codex-external-config", (_event, args: unknown) => {
    const parsedArgs = CodexExternalConfigImportArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex external config import request.",
      };
    }
    return invokeHostService(
      "provider.import-codex-external-config",
      parsedArgs.data,
    );
  });

  ipcMain.handle("provider:write-codex-config-value", (_event, args: unknown) => {
    const parsedArgs = CodexConfigValueWriteArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex config write request.",
      };
    }
    return invokeHostService(
      "provider.write-codex-config-value",
      parsedArgs.data,
    );
  });

  ipcMain.handle("provider:batch-write-codex-config", (_event, args: unknown) => {
    const parsedArgs = CodexConfigBatchWriteArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex config batch write request.",
      };
    }
    return invokeHostService(
      "provider.batch-write-codex-config",
      parsedArgs.data,
    );
  });

  ipcMain.handle("provider:suggest-task-name", (_event, args: unknown) => {
    const parsed = SuggestTaskNameArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false };
    }
    return invokeHostService("provider.suggest-task-name", parsed.data);
  });

  ipcMain.handle("provider:suggest-commit-message", (_event, args: unknown) => {
    const parsed = SuggestCommitMessageArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false };
    }
    return invokeHostService("provider.suggest-commit-message", parsed.data);
  });

  ipcMain.handle("provider:suggest-pr-description", (_event, args: unknown) => {
    const parsed = SuggestPRDescriptionArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false };
    }
    return invokeHostService("provider.suggest-pr-description", parsed.data);
  });
}
