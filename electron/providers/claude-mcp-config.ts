import { readFile } from "node:fs/promises";
import path from "node:path";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { getClaudeStateFilePath } from "./mcp-config-refresh";

export type ClaudeMcpConfigSource = "user" | "project" | "local";

export type ClaudeMcpConfigDiagnostic = {
  kind: "invalid-json" | "unreadable" | "invalid-server";
  source: ClaudeMcpConfigSource;
  serverName?: string;
};

type ConfigDocument = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const entries = Object.entries(record);
  return entries.every(([, entry]) => typeof entry === "string")
    ? Object.fromEntries(entries)
    : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
}

function toClaudeMcpServerConfig(value: unknown): McpServerConfig | null {
  const record = asRecord(value);
  const config = asRecord(record?.transport) ?? record;
  if (!config) {
    return null;
  }

  const timeout =
    typeof config.timeout === "number" &&
    Number.isFinite(config.timeout) &&
    config.timeout > 0
      ? config.timeout
      : undefined;
  const alwaysLoad =
    typeof config.alwaysLoad === "boolean" ? config.alwaysLoad : undefined;
  const type = typeof config.type === "string" ? config.type : undefined;

  if (
    (type === "http" || type === "sse" || type === undefined) &&
    typeof config.url === "string" &&
    config.url.trim()
  ) {
    const headers = asStringRecord(config.headers);
    if (config.headers !== undefined && !headers) {
      return null;
    }
    return {
      type: type === "sse" ? "sse" : "http",
      url: config.url,
      ...(headers ? { headers } : {}),
      ...(timeout ? { timeout } : {}),
      ...(alwaysLoad !== undefined ? { alwaysLoad } : {}),
    };
  }

  if (
    (type === "stdio" || type === undefined) &&
    typeof config.command === "string" &&
    config.command.trim()
  ) {
    const args = asStringArray(config.args);
    const env = asStringRecord(config.env);
    if (
      (config.args !== undefined && !args) ||
      (config.env !== undefined && !env)
    ) {
      return null;
    }
    return {
      type: "stdio",
      command: config.command,
      ...(args ? { args } : {}),
      ...(env ? { env } : {}),
      ...(timeout ? { timeout } : {}),
      ...(alwaysLoad !== undefined ? { alwaysLoad } : {}),
    };
  }

  return null;
}

async function readOptionalConfig(args: {
  filePath: string;
  source: ClaudeMcpConfigSource;
  onDiagnostic?: (diagnostic: ClaudeMcpConfigDiagnostic) => void;
}): Promise<ConfigDocument | null> {
  try {
    const parsed = JSON.parse(await readFile(args.filePath, "utf8")) as unknown;
    if (!asRecord(parsed)) {
      args.onDiagnostic?.({
        kind: "invalid-json",
        source: args.source,
      });
      return null;
    }
    return parsed as ConfigDocument;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    args.onDiagnostic?.({
      kind: error instanceof SyntaxError ? "invalid-json" : "unreadable",
      source: args.source,
    });
    return null;
  }
}

function getServerEntries(document: ConfigDocument | null) {
  return Object.entries(
    asRecord(document?.mcpServers) ?? asRecord(document?.mcp_servers) ?? {},
  );
}

function pathsMatch(left: string, right: string) {
  return path.resolve(left) === path.resolve(right);
}

function getLocalProjectDocument(args: {
  stateDocument: ConfigDocument | null;
  cwd: string;
}) {
  const projects = asRecord(args.stateDocument?.projects);
  if (!projects) {
    return null;
  }
  for (const [projectPath, projectConfig] of Object.entries(projects)) {
    if (pathsMatch(projectPath, args.cwd)) {
      return asRecord(projectConfig);
    }
  }
  return null;
}

function mergeSource(args: {
  target: Record<string, McpServerConfig>;
  sourcesByName: Map<string, ClaudeMcpConfigSource>;
  document: ConfigDocument | null;
  source: ClaudeMcpConfigSource;
  onDiagnostic?: (diagnostic: ClaudeMcpConfigDiagnostic) => void;
}) {
  for (const [name, value] of getServerEntries(args.document)) {
    const config = toClaudeMcpServerConfig(value);
    if (!config) {
      args.onDiagnostic?.({
        kind: "invalid-server",
        source: args.source,
        serverName: name,
      });
      continue;
    }
    args.target[name] = config;
    args.sourcesByName.set(name, args.source);
  }
}

/**
 * Supplying any SDK `mcpServers` serializes them into `--mcp-config`. In SDK
 * mode that programmatic config can replace Claude Code's file-backed MCP
 * catalog, so merge the native scopes before adding Stave's own server.
 *
 * Native precedence is preserved: local > project > user. Stave wins last so
 * task-awareness always targets the current authenticated loopback manifest.
 */
export async function resolveClaudeMcpServers(args: {
  cwd: string;
  claudeConfigDir?: string;
  staveServers?: Record<string, McpServerConfig>;
  strict?: boolean;
  onDiagnostic?: (diagnostic: ClaudeMcpConfigDiagnostic) => void;
  onStaveOverride?: (args: {
    serverName: string;
    replacedSource: ClaudeMcpConfigSource;
  }) => void;
}): Promise<Record<string, McpServerConfig> | undefined> {
  if (!args.staveServers || Object.keys(args.staveServers).length === 0) {
    return undefined;
  }
  if (args.strict) {
    return { ...args.staveServers };
  }

  const stateDocument = await readOptionalConfig({
    filePath: getClaudeStateFilePath({
      claudeConfigDir: args.claudeConfigDir,
    }),
    source: "user",
    onDiagnostic: args.onDiagnostic,
  });
  const projectDocument = await readOptionalConfig({
    filePath: path.join(args.cwd, ".mcp.json"),
    source: "project",
    onDiagnostic: args.onDiagnostic,
  });
  const localDocument = getLocalProjectDocument({
    stateDocument,
    cwd: args.cwd,
  });

  const merged: Record<string, McpServerConfig> = {};
  const sourcesByName = new Map<string, ClaudeMcpConfigSource>();
  mergeSource({
    target: merged,
    sourcesByName,
    document: stateDocument,
    source: "user",
    onDiagnostic: args.onDiagnostic,
  });
  mergeSource({
    target: merged,
    sourcesByName,
    document: projectDocument,
    source: "project",
    onDiagnostic: args.onDiagnostic,
  });
  mergeSource({
    target: merged,
    sourcesByName,
    document: localDocument,
    source: "local",
    onDiagnostic: args.onDiagnostic,
  });

  for (const [serverName, config] of Object.entries(args.staveServers)) {
    const replacedSource = sourcesByName.get(serverName);
    if (replacedSource) {
      args.onStaveOverride?.({
        serverName,
        replacedSource,
      });
    }
    merged[serverName] = config;
  }
  return merged;
}
