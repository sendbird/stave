import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { getClaudeStateFilePath } from "./mcp-config-refresh";
import { NEVER_SHARED_MCP_SERVER_NAMES } from "../provider-accounts/shared-mcp";

/**
 * `shared-user` and `shared-local` come from System default's `.claude.json`
 * for a managed account that shares System default's setup.
 */
export type ClaudeMcpConfigSource = "shared-user" | "user" | "project" | "shared-local" | "local";


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
  const strings: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== "string") return undefined;
    strings[key] = entry;
  }
  return strings;
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

type ReadConfigArgs = {
  filePath: string;
  source: ClaudeMcpConfigSource;
  onDiagnostic?: (diagnostic: ClaudeMcpConfigDiagnostic) => void;
};

function parseOptionalConfig(
  args: ReadConfigArgs,
  read: () => string,
): ConfigDocument | null {
  try {
    const parsed = JSON.parse(read()) as unknown;
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

async function readOptionalConfig(
  args: ReadConfigArgs,
): Promise<ConfigDocument | null> {
  let raw: string;
  try {
    raw = await readFile(args.filePath, "utf8");
  } catch (error) {
    return parseOptionalConfig(args, () => {
      throw error;
    });
  }
  return parseOptionalConfig(args, () => raw);
}

function readOptionalConfigSync(args: ReadConfigArgs): ConfigDocument | null {
  return parseOptionalConfig(args, () => readFileSync(args.filePath, "utf8"));
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
  const shared = args.source === "shared-user" || args.source === "shared-local";
  for (const [name, value] of getServerEntries(args.document)) {
    if (shared && NEVER_SHARED_MCP_SERVER_NAMES.has(name)) continue;
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

type NativeClaudeMcpArgs = {
  cwd: string;
  claudeConfigDir?: string;
  sharedStateFilePath?: string | null;
  onDiagnostic?: (diagnostic: ClaudeMcpConfigDiagnostic) => void;
};

type NativeClaudeMcpServers = {
  servers: Record<string, McpServerConfig>;
  sourcesByName: Map<string, ClaudeMcpConfigSource>;
};

function nativeClaudeMcpConfigReads(args: NativeClaudeMcpArgs) {
  return {
    state: {
      filePath: getClaudeStateFilePath({
        claudeConfigDir: args.claudeConfigDir,
      }),
      source: "user",
      onDiagnostic: args.onDiagnostic,
    },
    project: {
      filePath: path.join(args.cwd, ".mcp.json"),
      source: "project",
      onDiagnostic: args.onDiagnostic,
    },
    shared: args.sharedStateFilePath
      ? {
          filePath: args.sharedStateFilePath,
          source: "shared-user",
          onDiagnostic: args.onDiagnostic,
        }
      : null,
  } satisfies Record<string, ReadConfigArgs | null>;
}

function mergeNativeClaudeMcpDocuments(args: {
  cwd: string;
  stateDocument: ConfigDocument | null;
  projectDocument: ConfigDocument | null;
  sharedStateDocument: ConfigDocument | null;
  onDiagnostic?: (diagnostic: ClaudeMcpConfigDiagnostic) => void;
}): NativeClaudeMcpServers {
  const { stateDocument, projectDocument, sharedStateDocument } = args;
  const localDocument = getLocalProjectDocument({
    stateDocument,
    cwd: args.cwd,
  });
  const sharedLocalDocument = getLocalProjectDocument({
    stateDocument: sharedStateDocument,
    cwd: args.cwd,
  });

  const servers: Record<string, McpServerConfig> = {};
  const sourcesByName = new Map<string, ClaudeMcpConfigSource>();
  mergeSource({
    target: servers,
    sourcesByName,
    document: sharedStateDocument,
    source: "shared-user",
    onDiagnostic: args.onDiagnostic,
  });
  mergeSource({
    target: servers,
    sourcesByName,
    document: stateDocument,
    source: "user",
    onDiagnostic: args.onDiagnostic,
  });
  mergeSource({
    target: servers,
    sourcesByName,
    document: projectDocument,
    source: "project",
    onDiagnostic: args.onDiagnostic,
  });
  mergeSource({
    target: servers,
    sourcesByName,
    document: sharedLocalDocument,
    source: "shared-local",
    onDiagnostic: args.onDiagnostic,
  });
  mergeSource({
    target: servers,
    sourcesByName,
    document: localDocument,
    source: "local",
    onDiagnostic: args.onDiagnostic,
  });
  return { servers, sourcesByName };
}

/**
 * Supplying any SDK `mcpServers` serializes them into `--mcp-config`. In SDK
 * mode that programmatic config can replace Claude Code's file-backed MCP
 * catalog, so merge the native scopes before adding Stave's own server.
 *
 * Native precedence is preserved: local > project > user. Stave wins last so
 * task-awareness always targets the current authenticated loopback manifest.
 *
 * `sharedStateFilePath` is System default's `.claude.json` for an account that
 * shares System default's setup. Its servers sit just below the account's own
 * entry at the same scope, so the account can still override one by name.
 */
export async function resolveNativeClaudeMcpServers(
  args: NativeClaudeMcpArgs,
): Promise<NativeClaudeMcpServers> {
  const reads = nativeClaudeMcpConfigReads(args);
  const [stateDocument, projectDocument, sharedStateDocument] =
    await Promise.all([
      readOptionalConfig(reads.state),
      readOptionalConfig(reads.project),
      reads.shared ? readOptionalConfig(reads.shared) : null,
    ]);
  return mergeNativeClaudeMcpDocuments({
    cwd: args.cwd,
    stateDocument,
    projectDocument,
    sharedStateDocument,
    onDiagnostic: args.onDiagnostic,
  });
}

/**
 * The servers a managed account takes from System default and does not define
 * itself, for launches that cannot wait on async reads (CLI terminal tabs).
 * Empty when the account does not share System default's setup.
 */
export function resolveSharedOnlyClaudeMcpServersSync(
  args: NativeClaudeMcpArgs,
): Record<string, McpServerConfig> {
  const reads = nativeClaudeMcpConfigReads(args);
  if (!reads.shared) return {};
  const { servers, sourcesByName } = mergeNativeClaudeMcpDocuments({
    cwd: args.cwd,
    stateDocument: readOptionalConfigSync(reads.state),
    projectDocument: readOptionalConfigSync(reads.project),
    sharedStateDocument: readOptionalConfigSync(reads.shared),
    onDiagnostic: args.onDiagnostic,
  });
  return Object.fromEntries(
    Object.entries(servers).filter(([name]) => {
      const source = sourcesByName.get(name);
      return source === "shared-user" || source === "shared-local";
    }),
  );
}

export async function resolveClaudeMcpServers(args: {
  cwd: string;
  claudeConfigDir?: string;
  sharedStateFilePath?: string | null;
  staveServers?: Record<string, McpServerConfig>;
  strict?: boolean;
  onDiagnostic?: (diagnostic: ClaudeMcpConfigDiagnostic) => void;
  onStaveOverride?: (args: {
    serverName: string;
    replacedSource: ClaudeMcpConfigSource;
  }) => void;
}): Promise<Record<string, McpServerConfig> | undefined> {
  const staveServers = args.staveServers ?? {};
  const hasStaveServers = Object.keys(staveServers).length > 0;
  if (args.strict) {
    return hasStaveServers ? { ...staveServers } : undefined;
  }
  // Without Stave's server or shared servers the CLI reads its own files, so
  // there is nothing to restate.
  if (!hasStaveServers && !args.sharedStateFilePath) {
    return undefined;
  }

  const { servers, sourcesByName } = await resolveNativeClaudeMcpServers({
    cwd: args.cwd,
    claudeConfigDir: args.claudeConfigDir,
    sharedStateFilePath: args.sharedStateFilePath,
    onDiagnostic: args.onDiagnostic,
  });
  if (!hasStaveServers) {
    const sharesAny = [...sourcesByName.values()].some(
      (source) => source === "shared-user" || source === "shared-local",
    );
    return sharesAny ? servers : undefined;
  }

  for (const [serverName, config] of Object.entries(staveServers)) {
    const replacedSource = sourcesByName.get(serverName);
    if (replacedSource) {
      args.onStaveOverride?.({
        serverName,
        replacedSource,
      });
    }
    servers[serverName] = config;
  }
  return servers;
}
