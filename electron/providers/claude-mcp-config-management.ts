import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type {
  McpConfigScope,
  McpHeaderEnvBinding,
  McpServerConfigDraft,
  McpServerConfigListRequest,
  McpServerConfigMutationApplyRequest,
  McpServerConfigMutationPreviewResponse,
  McpServerConfigMutationRequest,
  McpServerConfigMutationResponse,
  McpServerConfigSnapshot,
  McpServerConfigTarget,
} from "../../src/lib/providers/mcp-config.types";
import {
  buildClaudeCliEnv,
  resolveClaudeCliExecutablePath,
} from "./cli-path-env";
import { getClaudeStateFilePath } from "./mcp-config-refresh";
import {
  asMcpRecord,
  assertMcpDraftSupported,
  buildMcpMutationPreview,
  cloneMcpJsonRecord,
  getMcpConfigRevision,
  getMcpConfigSnapshotId,
  getShareableMcpUrl,
  getSafeHeaderEnvBindings,
  inferMcpTransport,
  isProtectedMcpServerName,
  parseEnvReference,
  sanitizeMcpUrl,
  toEnvReference,
} from "./mcp-config-management-shared";

type JsonDocument = Record<string, unknown>;

type LoadedClaudeDocument = {
  filePath: string;
  document: JsonDocument;
  raw: string;
  exists: boolean;
};

type ClaudeConfigContext = {
  cwd: string;
  stateFilePath: string;
  projectFilePath: string;
};

const SECRET_KEY_PATTERN =
  /(?:authorization|cookie|credential|password|private[_-]?key|secret|token|api[_-]?key)/i;

function getClaudeConfigContext(
  args: McpServerConfigListRequest,
): ClaudeConfigContext {
  const cwd = path.resolve(args.cwd?.trim() || process.cwd());
  const executablePath = resolveClaudeCliExecutablePath({
    explicitPath: args.runtimeOptions?.claudeBinaryPath,
  });
  const claudeEnv = buildClaudeCliEnv({ executablePath, cwd });
  return {
    cwd,
    stateFilePath: getClaudeStateFilePath({
      claudeConfigDir: claudeEnv.CLAUDE_CONFIG_DIR,
    }),
    projectFilePath: path.join(cwd, ".mcp.json"),
  };
}

async function readClaudeDocument(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf8");
    const document = asMcpRecord(JSON.parse(raw) as unknown);
    if (!document) {
      throw new Error("MCP configuration root must be a JSON object.");
    }
    return {
      filePath,
      document,
      raw,
      exists: true,
    } satisfies LoadedClaudeDocument;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        filePath,
        document: {},
        raw: "",
        exists: false,
      } satisfies LoadedClaudeDocument;
    }
    if (error instanceof SyntaxError) {
      throw new Error("MCP configuration contains invalid JSON.");
    }
    throw error;
  }
}

function pathsMatch(left: string, right: string) {
  return path.resolve(left) === path.resolve(right);
}

function getLocalProjectEntry(document: JsonDocument, cwd: string) {
  const projects = asMcpRecord(document.projects);
  for (const [projectPath, projectValue] of Object.entries(projects ?? {})) {
    if (pathsMatch(projectPath, cwd)) {
      return {
        projectKey: projectPath,
        project: asMcpRecord(projectValue) ?? {},
      };
    }
  }
  return { projectKey: cwd, project: {} };
}

function getServerMapKey(document: JsonDocument) {
  return asMcpRecord(document.mcpServers)
    ? "mcpServers"
    : asMcpRecord(document.mcp_servers)
      ? "mcp_servers"
      : "mcpServers";
}

function getClaudeServerMap(args: {
  loaded: LoadedClaudeDocument;
  scope: McpConfigScope;
  cwd: string;
}) {
  const source =
    args.scope === "local"
      ? getLocalProjectEntry(args.loaded.document, args.cwd).project
      : args.loaded.document;
  return asMcpRecord(source[getServerMapKey(source)]) ?? {};
}

function setClaudeServerMap(args: {
  loaded: LoadedClaudeDocument;
  scope: McpConfigScope;
  cwd: string;
  servers: Record<string, unknown>;
}) {
  const next = cloneMcpJsonRecord(args.loaded.document);
  if (args.scope !== "local") {
    next[getServerMapKey(next)] = args.servers;
    return next;
  }

  const projects = { ...(asMcpRecord(next.projects) ?? {}) };
  const local = getLocalProjectEntry(next, args.cwd);
  const project = { ...local.project };
  project[getServerMapKey(project)] = args.servers;
  projects[local.projectKey] = project;
  next.projects = projects;
  return next;
}

function getClaudeTransportRecord(value: unknown) {
  const entry = asMcpRecord(value) ?? {};
  return {
    entry,
    config: asMcpRecord(entry.transport) ?? entry,
    nested: Boolean(asMcpRecord(entry.transport)),
  };
}

function getClaudeEnvBindings(env: Record<string, unknown> | null) {
  const envVars: string[] = [];
  let hiddenValueCount = 0;
  for (const [name, value] of Object.entries(env ?? {})) {
    if (parseEnvReference(value) === name) {
      envVars.push(name);
    } else {
      hiddenValueCount += 1;
    }
  }
  return { envVars, hiddenValueCount };
}

function toClaudeSnapshot(args: {
  name: string;
  value: unknown;
  scope: McpConfigScope;
  revision: string;
}): McpServerConfigSnapshot {
  const { config } = getClaudeTransportRecord(args.value);
  const transport = inferMcpTransport(config);
  const env = getClaudeEnvBindings(asMcpRecord(config.env));
  const headers = getSafeHeaderEnvBindings({
    headers: asMcpRecord(config.headers),
    bearerHeader: true,
  });
  const url = sanitizeMcpUrl(config.url);
  const argsList = Array.isArray(config.args) ? config.args : [];
  const protectedEntry = isProtectedMcpServerName(args.name);
  const sourceLabel =
    args.scope === "user"
      ? "Claude user"
      : args.scope === "project"
        ? "Claude project"
        : "Claude local project";
  return {
    id: getMcpConfigSnapshotId({
      provider: "claude-code",
      scope: args.scope,
      name: args.name,
    }),
    provider: "claude-code",
    scope: args.scope,
    name: args.name,
    revision: args.revision,
    transport,
    ...(typeof config.command === "string" ? { command: config.command } : {}),
    ...(url.value ? { url: url.value } : {}),
    urlRedacted: url.redacted,
    envVars: env.envVars.sort(),
    ...(headers.bearerTokenEnvVar
      ? { bearerTokenEnvVar: headers.bearerTokenEnvVar }
      : {}),
    headerEnvBindings: headers.bindings.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    enabled: config.disabled !== true,
    argumentCount: argsList.length,
    hiddenValueCount:
      argsList.length +
      env.hiddenValueCount +
      headers.hiddenValueCount +
      url.hiddenValueCount,
    sourceLabel,
    canEdit: !protectedEntry,
    canDelete: !protectedEntry,
  };
}

function retainOpaqueValues(args: {
  existing: Record<string, unknown> | null;
  isSafe: (name: string, value: unknown) => boolean;
}) {
  return Object.fromEntries(
    Object.entries(args.existing ?? {}).filter(
      ([name, value]) => !args.isSafe(name, value),
    ),
  );
}

function buildClaudeServerEntry(args: {
  existing?: unknown;
  draft: McpServerConfigDraft;
  operation: "create" | "update";
}) {
  const current = getClaudeTransportRecord(args.existing);
  const previousTransport = inferMcpTransport(current.config);
  const sameTransport =
    args.operation === "update" && previousTransport === args.draft.transport;
  const config = sameTransport ? { ...current.config } : {};
  config.type = args.draft.transport;

  if (args.draft.transport === "stdio") {
    config.command = args.draft.command?.trim();
    if (args.draft.args !== undefined) {
      config.args = args.draft.args;
    } else if (!sameTransport) {
      config.args = [];
    }
    const env = retainOpaqueValues({
      existing: sameTransport ? asMcpRecord(current.config.env) : null,
      isSafe: (name, value) => parseEnvReference(value) === name,
    });
    for (const name of args.draft.envVars) {
      env[name] = toEnvReference(name);
    }
    if (Object.keys(env).length) config.env = env;
    else delete config.env;
    delete config.url;
    delete config.headers;
  } else {
    if (args.draft.url !== undefined) {
      config.url = args.draft.url;
    } else if (!sameTransport) {
      throw new Error("A URL is required for a remote MCP server.");
    }
    const headers = retainOpaqueValues({
      existing: sameTransport ? asMcpRecord(current.config.headers) : null,
      isSafe: (_name, value) =>
        Boolean(parseEnvReference(value)) ||
        /^Bearer\s+\$\{[A-Za-z_][A-Za-z0-9_]*\}$/i.test(String(value ?? "")),
    });
    for (const binding of args.draft.headerEnvBindings) {
      headers[binding.name] = toEnvReference(binding.envVar);
    }
    if (args.draft.bearerTokenEnvVar) {
      headers.Authorization = `Bearer ${toEnvReference(args.draft.bearerTokenEnvVar)}`;
    }
    if (Object.keys(headers).length) config.headers = headers;
    else delete config.headers;
    delete config.command;
    delete config.args;
    delete config.env;
  }

  if (!current.nested) return config;
  return { ...current.entry, transport: config };
}

function isSecretLikeProjectEntry(value: unknown) {
  const { config } = getClaudeTransportRecord(value);
  for (const [name, envValue] of Object.entries(
    asMcpRecord(config.env) ?? {},
  )) {
    if (SECRET_KEY_PATTERN.test(name) && !parseEnvReference(envValue))
      return true;
  }
  for (const [name, headerValue] of Object.entries(
    asMcpRecord(config.headers) ?? {},
  )) {
    if (
      SECRET_KEY_PATTERN.test(name) &&
      !parseEnvReference(headerValue) &&
      !/^Bearer\s+\$\{[A-Za-z_][A-Za-z0-9_]*\}$/i.test(
        String(headerValue ?? ""),
      )
    ) {
      return true;
    }
  }
  if (typeof config.url === "string") {
    try {
      const url = new URL(config.url);
      if (url.username || url.password) return true;
      for (const [key, parameterValue] of url.searchParams) {
        if (
          SECRET_KEY_PATTERN.test(key) &&
          !parseEnvReference(parameterValue)
        ) {
          return true;
        }
      }
    } catch {
      // Invalid URLs are rejected by the provider; they are not inspected here.
    }
  }
  const args = Array.isArray(config.args) ? config.args : [];
  for (let index = 0; index < args.length; index += 1) {
    const entry = args[index];
    if (typeof entry !== "string") continue;
    const separatorIndex = entry.search(/[=:]/);
    const key =
      separatorIndex >= 0 ? entry.slice(0, separatorIndex) : entry.trim();
    if (!SECRET_KEY_PATTERN.test(key)) continue;
    if (separatorIndex >= 0) {
      if (!parseEnvReference(entry.slice(separatorIndex + 1).trim())) {
        return true;
      }
      continue;
    }
    const next = args[index + 1];
    if (typeof next !== "string" || !parseEnvReference(next.trim())) {
      return true;
    }
    index += 1;
  }
  return false;
}

function assertProjectDocumentSafe(servers: Record<string, unknown>) {
  if (Object.values(servers).some(isSecretLikeProjectEntry)) {
    throw new Error(
      "Project MCP configuration contains a literal credential-like value. Replace it with an environment reference before editing it in Stave.",
    );
  }
}

async function atomicWriteClaudeDocument(args: {
  loaded: LoadedClaudeDocument;
  document: JsonDocument;
  scope: McpConfigScope;
}) {
  const serialized = `${JSON.stringify(args.document, null, 2)}\n`;
  await mkdir(path.dirname(args.loaded.filePath), { recursive: true });
  const existingMode = args.loaded.exists
    ? (await stat(args.loaded.filePath)).mode & 0o777
    : args.scope === "project"
      ? 0o644
      : 0o600;
  const temporaryPath = path.join(
    path.dirname(args.loaded.filePath),
    `.${path.basename(args.loaded.filePath)}.stave-${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporaryPath, "wx", existingMode);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, args.loaded.filePath);
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
  return serialized;
}

export function toClaudeShareDraft(args: {
  name: string;
  value: unknown;
  scope: McpConfigScope;
}): { draft: McpServerConfigDraft; warnings: string[] } {
  const { config } = getClaudeTransportRecord(args.value);
  const transport = inferMcpTransport(config);
  const shareableUrl =
    transport === "stdio"
      ? undefined
      : getShareableMcpUrl(config.url, "Claude");
  const env = getClaudeEnvBindings(asMcpRecord(config.env));
  const headers = getSafeHeaderEnvBindings({
    headers: asMcpRecord(config.headers),
    bearerHeader: true,
  });
  const argumentList = Array.isArray(config.args)
    ? config.args.filter((entry): entry is string => typeof entry === "string")
    : [];
  const warnings: string[] = [];
  if (env.hiddenValueCount > 0) {
    warnings.push(
      `${env.hiddenValueCount} opaque Claude environment value${
        env.hiddenValueCount === 1 ? " was" : "s were"
      } not copied. Rebind ${
        env.hiddenValueCount === 1 ? "it" : "them"
      } on the destination.`,
    );
  }
  if (headers.hiddenValueCount > 0) {
    warnings.push(
      `${headers.hiddenValueCount} opaque Claude header value${
        headers.hiddenValueCount === 1 ? " was" : "s were"
      } not copied.`,
    );
  }
  return {
    draft: {
      provider: "claude-code",
      scope: args.scope,
      name: args.name,
      transport,
      ...(typeof config.command === "string"
        ? { command: config.command }
        : {}),
      ...(transport === "stdio" ? { args: argumentList } : {}),
      ...(shareableUrl ? { url: shareableUrl } : {}),
      envVars: env.envVars,
      ...(headers.bearerTokenEnvVar
        ? { bearerTokenEnvVar: headers.bearerTokenEnvVar }
        : {}),
      headerEnvBindings: headers.bindings,
      enabled: config.disabled !== true,
    },
    warnings,
  };
}

export async function readClaudeMcpShareDraft(
  args: McpServerConfigListRequest & { target: McpServerConfigTarget },
) {
  if (args.target.provider !== "claude-code") {
    throw new Error("The Claude MCP manager received a different provider.");
  }
  const context = getClaudeConfigContext(args);
  const loaded = await readClaudeDocument(
    args.target.scope === "project"
      ? context.projectFilePath
      : context.stateFilePath,
  );
  const value = getClaudeServerMap({
    loaded,
    scope: args.target.scope,
    cwd: context.cwd,
  })[args.target.name];
  if (value === undefined) {
    throw new Error("The MCP server no longer exists. Refresh and try again.");
  }
  return {
    revision: getMcpConfigRevision(loaded.raw),
    ...toClaudeShareDraft({
      name: args.target.name,
      value,
      scope: args.target.scope,
    }),
  };
}

export async function listClaudeMcpServerConfigs(
  args: McpServerConfigListRequest,
) {
  const servers: McpServerConfigSnapshot[] = [];
  const errors: string[] = [];
  const context = getClaudeConfigContext(args);
  let state: LoadedClaudeDocument | null = null;
  let project: LoadedClaudeDocument | null = null;
  try {
    state = await readClaudeDocument(context.stateFilePath);
  } catch (error) {
    errors.push(
      `Claude user/local: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    project = await readClaudeDocument(context.projectFilePath);
  } catch (error) {
    errors.push(
      `Claude project: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  for (const scope of ["user", "project", "local"] as const) {
    const loaded = scope === "project" ? project : state;
    if (!loaded) continue;
    const revision = getMcpConfigRevision(loaded.raw);
    for (const [name, value] of Object.entries(
      getClaudeServerMap({ loaded, scope, cwd: context.cwd }),
    )) {
      servers.push(toClaudeSnapshot({ name, value, scope, revision }));
    }
  }
  return { servers, errors };
}

function assertClaudeMutationShape(args: McpServerConfigMutationRequest): asserts args is McpServerConfigMutationRequest & { operation: "create" | "update" | "delete" } {
    if (args.operation === "share") throw new Error("Sharing uses the dedicated MCP sharing flow.");
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
    (args.target && args.target.provider !== "claude-code") ||
    (args.draft && args.draft.provider !== "claude-code")
  ) {
    throw new Error("The Claude MCP manager received a different provider.");
  }
  if (args.target && isProtectedMcpServerName(args.target.name)) {
    throw new Error(
      "The Stave Local MCP entry is managed by its dedicated settings control.",
    );
  }
  if (args.draft) assertMcpDraftSupported(args.draft);
}

async function prepareClaudeMutation(
  args: McpServerConfigMutationRequest,
  contextOverride?: ClaudeConfigContext,
) {
  assertClaudeMutationShape(args);
  const scope = args.draft?.scope ?? args.target?.scope;
  if (!scope) throw new Error("Claude MCP scope is required.");
  if (args.target && args.draft && args.target.scope !== args.draft.scope) {
    throw new Error(
      "Move a server between scopes by adding it and deleting the old entry.",
    );
  }
  const context = contextOverride ?? getClaudeConfigContext(args);
  const loaded = await readClaudeDocument(
    scope === "project" ? context.projectFilePath : context.stateFilePath,
  );
  const revision = getMcpConfigRevision(loaded.raw);
  const currentServers = getClaudeServerMap({
    loaded,
    scope,
    cwd: context.cwd,
  });
  const currentName = args.target?.name;
  const existing = currentName ? currentServers[currentName] : undefined;
  if (args.operation !== "create" && existing === undefined) {
    throw new Error("The MCP server no longer exists. Refresh and try again.");
  }
  const nextName = args.draft?.name ?? currentName;
  if (!nextName) throw new Error("MCP server name is required.");
  if (
    (args.operation === "create" || nextName !== currentName) &&
    currentServers[nextName] !== undefined
  ) {
    throw new Error(
      `An MCP server named ${nextName} already exists in this scope.`,
    );
  }

  const nextServers = { ...currentServers };
  if (currentName) delete nextServers[currentName];
  if (args.operation !== "delete" && args.draft) {
    nextServers[nextName] = buildClaudeServerEntry({
      existing,
      draft: args.draft,
      operation: args.operation,
    });
  }
  if (scope === "project") assertProjectDocumentSafe(nextServers);
  const existingSnapshot =
    existing === undefined || !currentName
      ? undefined
      : toClaudeSnapshot({
          name: currentName,
          value: existing,
          scope,
          revision,
        });
  const document = setClaudeServerMap({
    loaded,
    scope,
    cwd: context.cwd,
    servers: nextServers,
  });
  return {
    loaded,
    scope,
    revision,
    nextName,
    nextServers,
    document,
    existingSnapshot,
  };
}

export async function previewClaudeMcpServerConfigMutation(
  args: McpServerConfigMutationRequest,
): Promise<McpServerConfigMutationPreviewResponse> {
  try {
    const prepared = await prepareClaudeMutation(args);
    const preview = buildMcpMutationPreview({
      operation: args.operation,
      revision: prepared.revision,
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
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function applyClaudeMcpServerConfigMutation(
  args: McpServerConfigMutationApplyRequest,
): Promise<McpServerConfigMutationResponse> {
  try {
    const prepared = await prepareClaudeMutation(args);
    if (prepared.revision !== args.expectedRevision) {
      throw new Error(
        "MCP configuration changed after preview. Refresh the preview and try again.",
      );
    }
    const serialized = await atomicWriteClaudeDocument({
      loaded: prepared.loaded,
      document: prepared.document,
      scope: prepared.scope,
    });
    const revision = getMcpConfigRevision(serialized);
    const value = prepared.nextServers[prepared.nextName];
    return {
      ok: true,
      detail:
        args.operation === "create"
          ? "Added the Claude MCP server."
          : args.operation === "update"
            ? "Updated the Claude MCP server."
            : "Deleted the Claude MCP server.",
      operation: args.operation,
      ...(value !== undefined
        ? {
            server: toClaudeSnapshot({
              name: prepared.nextName,
              value,
              scope: prepared.scope,
              revision,
            }),
          }
        : {}),
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      operation: args.operation,
    };
  }
}

export const __claudeMcpConfigManagementTest = {
  buildClaudeServerEntry,
  isSecretLikeProjectEntry,
  prepareClaudeMutation,
  toClaudeShareDraft,
  toClaudeSnapshot,
};
