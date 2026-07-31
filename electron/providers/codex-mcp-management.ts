import type { StreamTurnArgs } from "./types";
import type {
  CodexMcpOauthLoginResponse,
  CodexMcpResourceReadResponse,
  CodexMcpServerStatusSnapshot,
  CodexMcpStatusResponse,
} from "../../src/lib/providers/provider.types";
import { mapCodexMcpStatusSnapshot } from "./codex-snapshot-mappers";
import { createCodexMcpConfigManagement } from "./codex-mcp-config-management";
import { sanitizeMcpDiagnosticText } from "./mcp-config-management-shared";

export type CodexMcpRuntimeNotification = {
  method?: string;
  params?: unknown;
};

type CodexMcpRuntimeObservation = Pick<
  CodexMcpServerStatusSnapshot,
  | "connectionStatus"
  | "lastError"
  | "lastErrorAt"
  | "statusUpdatedAt"
  | "failureReason"
>;

type CodexMcpClient = {
  request<T = unknown>(method: string, params: unknown): Promise<T>;
};

type CodexMcpManagementDependencies = {
  resolveExecutablePath: (args?: { explicitPath?: string }) => string;
  getClient: (args: { executablePath: string }) => CodexMcpClient;
  formatError: (args: { message: string }) => string;
};

function toBoundedCodexMcpError(value: string) {
  return sanitizeMcpDiagnosticText(value) || null;
}

function toCodexMcpNotificationError(value: unknown) {
  if (typeof value === "string") {
    return toBoundedCodexMcpError(value);
  }
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { message?: unknown }).message === "string"
  ) {
    return toBoundedCodexMcpError((value as { message: string }).message);
  }
  return null;
}

export function parseCodexMcpRuntimeNotification(
  message: CodexMcpRuntimeNotification,
): ({ name: string } & CodexMcpRuntimeObservation) | null {
  if (
    message.method !== "mcpServer/startupStatus/updated" &&
    message.method !== "mcpServer/oauthLogin/completed"
  ) {
    return null;
  }
  if (
    !message.params ||
    typeof message.params !== "object" ||
    Array.isArray(message.params)
  ) {
    return null;
  }

  const params = message.params as Record<string, unknown>;
  const name = typeof params.name === "string" ? params.name.trim() : "";
  if (!name) {
    return null;
  }
  const updatedAt = Date.now();
  const error = toCodexMcpNotificationError(params.error);
  const failureReason =
    typeof params.failureReason === "string" ? params.failureReason : undefined;

  if (message.method === "mcpServer/oauthLogin/completed") {
    const succeeded = params.success !== false && !error;
    return {
      name,
      connectionStatus: succeeded ? "starting" : "failed",
      statusUpdatedAt: updatedAt,
      failureReason: undefined,
      ...(error ? { lastError: error, lastErrorAt: updatedAt } : {}),
    };
  }

  const rawStatus =
    typeof params.status === "string" ? params.status.toLowerCase() : "";
  const needsAuth = failureReason?.toLowerCase() === "reauthenticationrequired";
  const connectionStatus: CodexMcpRuntimeObservation["connectionStatus"] =
    needsAuth
      ? "needs-auth"
      : rawStatus === "ready"
        ? "connected"
        : rawStatus === "starting"
          ? "starting"
          : rawStatus === "failed"
            ? "failed"
            : rawStatus === "cancelled"
              ? "cancelled"
              : "unknown";
  const normalizedError =
    error ?? (needsAuth ? "OAuth reauthentication is required." : undefined);

  return {
    name,
    connectionStatus,
    statusUpdatedAt: updatedAt,
    failureReason,
    ...(normalizedError
      ? { lastError: normalizedError, lastErrorAt: updatedAt }
      : {}),
  };
}

export function resolveCodexMcpOauthAuthorizationUrl(response: unknown) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return undefined;
  }
  const record = response as Record<string, unknown>;
  return typeof record.authorizationUrl === "string"
    ? record.authorizationUrl
    : typeof record.authorization_url === "string"
      ? record.authorization_url
      : undefined;
}

export function createCodexMcpManagement(
  dependencies: CodexMcpManagementDependencies,
) {
  const configManagement = createCodexMcpConfigManagement({
    resolveClient: (args) => {
      const executablePath = dependencies.resolveExecutablePath({
        explicitPath: args.runtimeOptions?.codexBinaryPath,
      });
      if (!executablePath) {
        throw new Error("Codex executable not found.");
      }
      return dependencies.getClient({ executablePath });
    },
    formatError: (message) => dependencies.formatError({ message }),
  });
  const observationsByExecutable = new Map<
    string,
    Map<string, CodexMcpRuntimeObservation>
  >();

  function captureNotification(
    executablePath: string,
    message: CodexMcpRuntimeNotification,
  ) {
    const observation = parseCodexMcpRuntimeNotification(message);
    if (!observation) {
      return;
    }
    const byServer =
      observationsByExecutable.get(executablePath) ??
      new Map<string, CodexMcpRuntimeObservation>();
    const previous = byServer.get(observation.name);
    byServer.set(observation.name, {
      ...previous,
      ...observation,
      ...(!observation.lastError && previous?.lastError
        ? {
            lastError: previous.lastError,
            lastErrorAt: previous.lastErrorAt,
          }
        : {}),
    });
    observationsByExecutable.set(executablePath, byServer);
  }

  async function getRuntimeStatus(args: {
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  }): Promise<CodexMcpStatusResponse> {
    const checkedAt = Date.now();
    try {
      const executablePath = dependencies.resolveExecutablePath({
        explicitPath: args.runtimeOptions?.codexBinaryPath,
      });
      if (!executablePath) {
        return {
          ok: false,
          detail: "Codex executable not found.",
          servers: [],
        };
      }

      const client = dependencies.getClient({ executablePath });
      const response = await client.request<{ data?: unknown[] }>(
        "mcpServerStatus/list",
        { detail: "full" },
      );
      const observations = observationsByExecutable.get(executablePath);
      const servers = (response.data ?? []).map((server) => {
        const snapshot = mapCodexMcpStatusSnapshot(server);
        const observation = observations?.get(snapshot.name);
        return {
          ...snapshot,
          connectionStatus:
            observation?.connectionStatus ??
            snapshot.connectionStatus ??
            (snapshot.tools?.length ||
            snapshot.resources?.length ||
            snapshot.resourceTemplates?.length
              ? "connected"
              : "unknown"),
          ...(observation?.lastError
            ? {
                lastError: observation.lastError,
                lastErrorAt: observation.lastErrorAt,
              }
            : {}),
          ...(observation?.statusUpdatedAt
            ? { statusUpdatedAt: observation.statusUpdatedAt }
            : { statusUpdatedAt: snapshot.statusUpdatedAt ?? checkedAt }),
          ...(snapshot.lastError && !snapshot.lastErrorAt
            ? { lastErrorAt: checkedAt }
            : {}),
          ...(observation?.failureReason
            ? { failureReason: observation.failureReason }
            : {}),
        } satisfies CodexMcpServerStatusSnapshot;
      });

      return {
        ok: true,
        detail:
          servers.length > 0
            ? `Loaded ${servers.length} Codex MCP runtime status${servers.length === 1 ? "" : "es"}.`
            : "No Codex MCP servers are exposed by App Server.",
        servers,
      };
    } catch (error) {
      return {
        ok: false,
        detail: sanitizeMcpDiagnosticText(
          dependencies.formatError({
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
        servers: [],
      };
    }
  }

  async function startOauthLogin(args: {
    name: string;
    scopes?: string[];
    timeoutSecs?: number;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  }): Promise<CodexMcpOauthLoginResponse> {
    try {
      const executablePath = dependencies.resolveExecutablePath({
        explicitPath: args.runtimeOptions?.codexBinaryPath,
      });
      if (!executablePath) {
        throw new Error("Codex executable not found.");
      }
      const client = dependencies.getClient({ executablePath });
      const response = await client.request("mcpServer/oauth/login", {
        name: args.name,
        ...(args.scopes?.length ? { scopes: args.scopes } : {}),
        ...(typeof args.timeoutSecs === "number"
          ? { timeoutSecs: args.timeoutSecs }
          : {}),
      });
      return {
        ok: true,
        detail: `Started MCP OAuth login for ${args.name}.`,
        authorizationUrl: resolveCodexMcpOauthAuthorizationUrl(response),
      };
    } catch (error) {
      return {
        ok: false,
        detail: sanitizeMcpDiagnosticText(
          dependencies.formatError({
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
      };
    }
  }

  async function readResource(args: {
    threadId: string;
    server: string;
    uri: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  }): Promise<CodexMcpResourceReadResponse> {
    try {
      const executablePath = dependencies.resolveExecutablePath({
        explicitPath: args.runtimeOptions?.codexBinaryPath,
      });
      if (!executablePath) {
        throw new Error("Codex executable not found.");
      }
      const client = dependencies.getClient({ executablePath });
      const response = await client.request<{
        contents?: Array<Record<string, unknown>>;
      }>("mcpServer/resource/read", {
        threadId: args.threadId,
        server: args.server,
        uri: args.uri,
      });
      return {
        ok: true,
        detail: `Read MCP resource ${args.uri}.`,
        contents: Array.isArray(response?.contents)
          ? response.contents.map((content) => ({
              uri: String(content?.uri ?? args.uri),
              ...(typeof content?.mimeType === "string"
                ? { mimeType: content.mimeType }
                : {}),
              ...(typeof content?.text === "string"
                ? { text: content.text }
                : {}),
              ...(typeof content?.blob === "string"
                ? { blob: content.blob }
                : {}),
            }))
          : [],
      };
    } catch (error) {
      return {
        ok: false,
        detail: sanitizeMcpDiagnosticText(
          dependencies.formatError({
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
        contents: [],
      };
    }
  }

  return {
    captureNotification,
    getRuntimeStatus,
    startOauthLogin,
    readResource,
    listConfigs: configManagement.listConfigs,
    previewConfigMutation: configManagement.previewMutation,
    applyConfigMutation: configManagement.applyMutation,
  };
}
