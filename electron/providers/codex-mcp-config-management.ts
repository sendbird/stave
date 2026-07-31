import type {
  McpServerConfigDraft,
  McpServerConfigListRequest,
  McpServerConfigMutationApplyRequest,
  McpServerConfigMutationPreviewResponse,
  McpServerConfigMutationRequest,
  McpServerConfigMutationResponse,
  McpServerConfigSnapshot,
} from "../../src/lib/providers/mcp-config.types";
import {
  asMcpRecord,
  assertMcpDraftSupported,
  buildMcpMutationPreview,
  getMcpConfigRevision,
  getMcpConfigSnapshotId,
  inferMcpTransport,
  isProtectedMcpServerName,
  sanitizeMcpDiagnosticText,
  sanitizeMcpUrl,
} from "./mcp-config-management-shared";

type CodexMcpConfigClient = {
  request<T = unknown>(method: string, params: unknown): Promise<T>;
};

type CodexMcpConfigDependencies = {
  resolveClient: (args: McpServerConfigListRequest) => CodexMcpConfigClient;
  formatError: (message: string) => string;
};

type CodexUserConfigLayer = {
  config: Record<string, unknown>;
  filePath?: string;
  version?: string;
  revision: string;
};

function getCodexServerMap(config: Record<string, unknown>) {
  return (
    asMcpRecord(config.mcp_servers) ?? asMcpRecord(config.mcpServers) ?? {}
  );
}

function getCodexLayerSource(layer: Record<string, unknown>) {
  return asMcpRecord(layer.name) ?? asMcpRecord(layer.source);
}

function isBaseCodexUserLayer(layer: Record<string, unknown>) {
  const source = getCodexLayerSource(layer);
  if (source) {
    return (
      String(source.type ?? "").toLowerCase() === "user" && !source.profile
    );
  }
  return String(layer.name ?? "").toLowerCase() === "user";
}

function parseCodexUserLayer(response: unknown): CodexUserConfigLayer {
  const root = asMcpRecord(response) ?? {};
  const layers = Array.isArray(root.layers)
    ? root.layers.map(asMcpRecord).filter(Boolean)
    : [];
  const layer = layers.find(isBaseCodexUserLayer);
  if (!layer) {
    throw new Error(
      "Codex App Server did not expose a writable user configuration layer. Update Codex and try again.",
    );
  }
  const source = getCodexLayerSource(layer);
  const config = asMcpRecord(layer.config);
  if (!config) {
    throw new Error(
      "Codex App Server returned an unreadable user configuration layer.",
    );
  }
  const version =
    typeof layer.version === "string" && layer.version.trim()
      ? layer.version
      : undefined;
  const filePath =
    typeof source?.file === "string" && source.file.trim()
      ? source.file
      : undefined;
  const revision =
    version ?? getMcpConfigRevision(JSON.stringify(getCodexServerMap(config)));
  return { config, version, filePath, revision };
}

function getCodexHeaderBindings(value: Record<string, unknown>) {
  const bindings = Object.entries(asMcpRecord(value.env_http_headers) ?? {})
    .filter((entry): entry is [string, string] =>
      Boolean(entry[0] && typeof entry[1] === "string" && entry[1].trim()),
    )
    .map(([name, envVar]) => ({ name, envVar }));
  return bindings.sort((left, right) => left.name.localeCompare(right.name));
}

function toCodexConfigSnapshot(args: {
  name: string;
  value: unknown;
  revision: string;
}): McpServerConfigSnapshot {
  const config = asMcpRecord(args.value) ?? {};
  const transport = inferMcpTransport(config);
  const url = sanitizeMcpUrl(config.url);
  const argumentCount = Array.isArray(config.args) ? config.args.length : 0;
  const staticEnvCount = Object.keys(asMcpRecord(config.env) ?? {}).length;
  const staticHeaderCount = Object.keys(
    asMcpRecord(config.http_headers) ?? {},
  ).length;
  const protectedEntry = isProtectedMcpServerName(args.name);
  return {
    id: getMcpConfigSnapshotId({
      provider: "codex",
      scope: "user",
      name: args.name,
    }),
    provider: "codex",
    scope: "user",
    name: args.name,
    revision: args.revision,
    transport,
    ...(typeof config.command === "string" ? { command: config.command } : {}),
    ...(url.value ? { url: url.value } : {}),
    urlRedacted: url.redacted,
    envVars: Array.isArray(config.env_vars)
      ? config.env_vars
          .filter((entry): entry is string => typeof entry === "string")
          .sort()
      : [],
    ...(typeof config.bearer_token_env_var === "string"
      ? { bearerTokenEnvVar: config.bearer_token_env_var }
      : {}),
    headerEnvBindings: getCodexHeaderBindings(config),
    enabled: config.enabled !== false,
    argumentCount,
    hiddenValueCount:
      argumentCount + staticEnvCount + staticHeaderCount + url.hiddenValueCount,
    sourceLabel: "Codex user",
    canEdit: !protectedEntry,
    canDelete: !protectedEntry,
  };
}

function buildCodexServerEntry(args: {
  existing?: unknown;
  draft: McpServerConfigDraft;
  operation: "create" | "update";
}) {
  const current = asMcpRecord(args.existing) ?? {};
  const previousTransport = inferMcpTransport(current);
  const sameTransport =
    args.operation === "update" && previousTransport === args.draft.transport;
  const config: Record<string, unknown> = sameTransport
    ? { ...current }
    : {
        ...(typeof current.startup_timeout_sec === "number"
          ? { startup_timeout_sec: current.startup_timeout_sec }
          : {}),
        ...(typeof current.tool_timeout_sec === "number"
          ? { tool_timeout_sec: current.tool_timeout_sec }
          : {}),
      };
  config.enabled = args.draft.enabled;

  if (args.draft.transport === "stdio") {
    config.command = args.draft.command?.trim();
    if (args.draft.args !== undefined) {
      config.args = args.draft.args;
    } else if (!sameTransport) {
      config.args = [];
    }
    config.env_vars = args.draft.envVars;
    delete config.url;
    delete config.bearer_token_env_var;
    delete config.http_headers;
    delete config.env_http_headers;
  } else {
    if (args.draft.url !== undefined) {
      config.url = args.draft.url;
    } else if (!sameTransport) {
      throw new Error("A URL is required for a remote MCP server.");
    }
    if (args.draft.bearerTokenEnvVar) {
      config.bearer_token_env_var = args.draft.bearerTokenEnvVar;
    } else {
      delete config.bearer_token_env_var;
    }
    config.env_http_headers = Object.fromEntries(
      args.draft.headerEnvBindings.map(({ name, envVar }) => [name, envVar]),
    );
    delete config.command;
    delete config.args;
    delete config.env;
    delete config.env_vars;
  }
  return config;
}

function assertCodexMutationShape(args: McpServerConfigMutationRequest) {
  if (args.operation === "create") {
    if (!args.draft || args.target) {
      throw new Error("Create requires a new MCP server configuration.");
    }
  } else if (!args.target || (args.operation === "update" && !args.draft)) {
    throw new Error(
      `${args.operation} requires an existing MCP server target.`,
    );
  }
  if (
    (args.target && args.target.provider !== "codex") ||
    (args.draft && args.draft.provider !== "codex")
  ) {
    throw new Error("The Codex MCP manager received a different provider.");
  }
  if (args.target?.scope !== undefined && args.target.scope !== "user") {
    throw new Error("Codex MCP editing currently supports user scope only.");
  }
  if (args.target && isProtectedMcpServerName(args.target.name)) {
    throw new Error(
      "The Stave Local MCP entry is managed by its dedicated settings control.",
    );
  }
  if (args.draft) assertMcpDraftSupported(args.draft);
}

export function createCodexMcpConfigManagement(
  dependencies: CodexMcpConfigDependencies,
) {
  const formatSafeError = (error: unknown) =>
    sanitizeMcpDiagnosticText(
      dependencies.formatError(
        error instanceof Error ? error.message : String(error),
      ),
    );

  async function readUserLayer(args: McpServerConfigListRequest) {
    const client = dependencies.resolveClient(args);
    const response = await client.request("config/read", {
      includeLayers: true,
      cwd: args.cwd?.trim() || process.cwd(),
    });
    return { client, layer: parseCodexUserLayer(response) };
  }

  async function listConfigs(args: McpServerConfigListRequest) {
    try {
      const { layer } = await readUserLayer(args);
      return {
        servers: Object.entries(getCodexServerMap(layer.config)).map(
          ([name, value]) =>
            toCodexConfigSnapshot({ name, value, revision: layer.revision }),
        ),
        errors: [] as string[],
      };
    } catch (error) {
      return {
        servers: [] as McpServerConfigSnapshot[],
        errors: [`Codex user: ${formatSafeError(error)}`],
      };
    }
  }

  async function prepareMutation(args: McpServerConfigMutationRequest) {
    assertCodexMutationShape(args);
    const { client, layer } = await readUserLayer(args);
    const currentServers = getCodexServerMap(layer.config);
    const currentName = args.target?.name;
    const existing = currentName ? currentServers[currentName] : undefined;
    if (args.operation !== "create" && existing === undefined) {
      throw new Error(
        "The MCP server no longer exists. Refresh and try again.",
      );
    }
    const nextName = args.draft?.name ?? currentName;
    if (!nextName) throw new Error("MCP server name is required.");
    if (
      (args.operation === "create" || nextName !== currentName) &&
      currentServers[nextName] !== undefined
    ) {
      throw new Error(
        `An MCP server named ${nextName} already exists in user scope.`,
      );
    }
    const nextServers = { ...currentServers };
    if (currentName) delete nextServers[currentName];
    if (args.operation !== "delete" && args.draft) {
      nextServers[nextName] = buildCodexServerEntry({
        existing,
        draft: args.draft,
        operation: args.operation,
      });
    }
    return {
      client,
      layer,
      nextName,
      nextServers,
      existingSnapshot:
        existing === undefined || !currentName
          ? undefined
          : toCodexConfigSnapshot({
              name: currentName,
              value: existing,
              revision: layer.revision,
            }),
    };
  }

  async function previewMutation(
    args: McpServerConfigMutationRequest,
  ): Promise<McpServerConfigMutationPreviewResponse> {
    try {
      const prepared = await prepareMutation(args);
      const preview = buildMcpMutationPreview({
        operation: args.operation,
        revision: prepared.layer.revision,
        target: args.target,
        draft: args.draft,
        hiddenValueCount: prepared.existingSnapshot?.hiddenValueCount,
      });
      if (
        args.operation === "update" &&
        args.draft &&
        prepared.existingSnapshot?.transport !== args.draft.transport
      ) {
        preview.warnings.push(
          "Changing transport removes fields that only apply to the previous transport.",
        );
      }
      return {
        ok: true,
        detail: "MCP configuration change is ready to review.",
        preview,
      };
    } catch (error) {
      return {
        ok: false,
        detail: formatSafeError(error),
      };
    }
  }

  async function applyMutation(
    args: McpServerConfigMutationApplyRequest,
  ): Promise<McpServerConfigMutationResponse> {
    try {
      const prepared = await prepareMutation(args);
      if (prepared.layer.revision !== args.expectedRevision) {
        throw new Error(
          "MCP configuration changed after preview. Refresh the preview and try again.",
        );
      }
      await prepared.client.request("config/batchWrite", {
        edits: [
          {
            keyPath: "mcp_servers",
            value: prepared.nextServers,
            mergeStrategy: "replace",
          },
        ],
        ...(prepared.layer.version
          ? { expectedVersion: prepared.layer.version }
          : {}),
        ...(prepared.layer.filePath
          ? { filePath: prepared.layer.filePath }
          : {}),
        reloadUserConfig: true,
      });
      let reloadWarning = "";
      try {
        await prepared.client.request("config/mcpServer/reload", {});
      } catch {
        reloadWarning =
          " The new configuration will load with the next Codex session.";
      }
      const refreshed = await readUserLayer(args).catch(() => null);
      const refreshedRevision =
        refreshed?.layer.revision ??
        getMcpConfigRevision(JSON.stringify(prepared.nextServers));
      const value = prepared.nextServers[prepared.nextName];
      return {
        ok: true,
        detail: `${
          args.operation === "create"
            ? "Added"
            : args.operation === "update"
              ? "Updated"
              : "Deleted"
        } the Codex MCP server.${reloadWarning}`,
        operation: args.operation,
        ...(value !== undefined
          ? {
              server: toCodexConfigSnapshot({
                name: prepared.nextName,
                value,
                revision: refreshedRevision,
              }),
            }
          : {}),
      };
    } catch (error) {
      return {
        ok: false,
        detail: formatSafeError(error),
        operation: args.operation,
      };
    }
  }

  return { listConfigs, previewMutation, applyMutation };
}

export const __codexMcpConfigManagementTest = {
  buildCodexServerEntry,
  parseCodexUserLayer,
  toCodexConfigSnapshot,
};
