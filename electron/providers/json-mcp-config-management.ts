import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type {
  McpConfigProvider,
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
  asMcpRecord,
  assertMcpDraftSupported,
  buildMcpMutationPreview,
  cloneMcpJsonRecord,
  getMcpConfigRevision,
  getMcpConfigSnapshotId,
  getShareableMcpUrl,
  getSafeCursorHeaderEnvBindings,
  getSafeHeaderEnvBindings,
  inferMcpTransport,
  isProtectedMcpServerName,
  parseCursorEnvReference,
  parseEnvReference,
  sanitizeMcpUrl,
  toCursorEnvReference,
  toEnvReference,
} from "./mcp-config-management-shared";

type JsonMcpProvider = Extract<McpConfigProvider, "cursor" | "kiro">;
type JsonDocument = Record<string, unknown>;

export type JsonMcpConfigContext = {
  cwd?: string;
  userFilePath: string;
  projectFilePath: string;
};

type LoadedJsonMcpDocument = {
  filePath: string;
  document: JsonDocument;
  raw: string;
  exists: boolean;
};

type JsonMcpConfigProfile = {
  provider: JsonMcpProvider;
  label: string;
  resolveContext: (args: McpServerConfigListRequest) => JsonMcpConfigContext;
  envSyntax: "cursor" | "plain";
  opaqueAuthKeys: readonly string[];
  previewWarning: string;
};

const SECRET_KEY_PATTERN =
  /(?:authorization|cookie|credential|password|private[_-]?key|secret|token|api[_-]?key)/i;

function readEnvReference(profile: JsonMcpConfigProfile, value: unknown) {
  return profile.envSyntax === "cursor"
    ? parseCursorEnvReference(value)
    : parseEnvReference(value);
}

function writeEnvReference(profile: JsonMcpConfigProfile, name: string) {
  return profile.envSyntax === "cursor"
    ? toCursorEnvReference(name)
    : toEnvReference(name);
}

function readHeaderBindings(
  profile: JsonMcpConfigProfile,
  headers: Record<string, unknown> | null,
) {
  return profile.envSyntax === "cursor"
    ? getSafeCursorHeaderEnvBindings(headers)
    : getSafeHeaderEnvBindings({ headers, bearerHeader: true });
}

async function readJsonMcpDocument(
  profile: JsonMcpConfigProfile,
  filePath: string,
) {
  try {
    const raw = await readFile(filePath, "utf8");
    const document = asMcpRecord(JSON.parse(raw) as unknown);
    if (!document) {
      throw new Error(
        `${profile.label} MCP configuration root must be a JSON object.`,
      );
    }
    return {
      filePath,
      document,
      raw,
      exists: true,
    } satisfies LoadedJsonMcpDocument;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        filePath,
        document: {},
        raw: "",
        exists: false,
      } satisfies LoadedJsonMcpDocument;
    }
    if (error instanceof SyntaxError) {
      throw new Error(`${profile.label} MCP configuration contains invalid JSON.`);
    }
    throw error;
  }
}

function getJsonMcpServerMap(
  profile: JsonMcpConfigProfile,
  document: JsonDocument,
) {
  if (document.mcpServers === undefined) return {};
  const servers = asMcpRecord(document.mcpServers);
  if (!servers) {
    throw new Error(
      `${profile.label} MCP mcpServers must be a JSON object.`,
    );
  }
  return servers;
}

function setJsonMcpServerMap(
  document: JsonDocument,
  servers: Record<string, unknown>,
) {
  return { ...cloneMcpJsonRecord(document), mcpServers: servers };
}

function getJsonMcpEnvBindings(
  profile: JsonMcpConfigProfile,
  env: Record<string, unknown> | null,
) {
  const envVars: string[] = [];
  let hiddenValueCount = 0;
  for (const [name, value] of Object.entries(env ?? {})) {
    if (readEnvReference(profile, value) === name) envVars.push(name);
    else hiddenValueCount += 1;
  }
  return { envVars, hiddenValueCount };
}

function countOpaqueAuthValues(
  profile: JsonMcpConfigProfile,
  config: Record<string, unknown>,
) {
  return profile.opaqueAuthKeys.reduce(
    (count, key) => count + (config[key] === undefined ? 0 : 1),
    0,
  );
}

function toJsonMcpSnapshot(
  profile: JsonMcpConfigProfile,
  args: {
    name: string;
    value: unknown;
    scope: Extract<McpConfigScope, "user" | "project">;
    revision: string;
  },
): McpServerConfigSnapshot {
  const config = asMcpRecord(args.value) ?? {};
  const transport = inferMcpTransport(config);
  const env = getJsonMcpEnvBindings(profile, asMcpRecord(config.env));
  const headers = readHeaderBindings(profile, asMcpRecord(config.headers));
  const url = sanitizeMcpUrl(config.url);
  const argsList = Array.isArray(config.args) ? config.args : [];
  const protectedEntry = isProtectedMcpServerName(args.name);
  return {
    id: getMcpConfigSnapshotId({
      provider: profile.provider,
      scope: args.scope,
      name: args.name,
    }),
    provider: profile.provider,
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
      url.hiddenValueCount +
      countOpaqueAuthValues(profile, config),
    sourceLabel: `${profile.label} ${args.scope}`,
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

function buildJsonMcpServerEntry(
  profile: JsonMcpConfigProfile,
  args: {
    existing?: unknown;
    draft: McpServerConfigDraft;
    operation: "create" | "update";
  },
) {
  const current = asMcpRecord(args.existing) ?? {};
  const previousTransport = inferMcpTransport(current);
  const sameTransport =
    args.operation === "update" && previousTransport === args.draft.transport;
  const config: Record<string, unknown> = sameTransport ? { ...current } : {};

  if (args.draft.transport === "stdio") {
    config.command = args.draft.command?.trim();
    if (args.draft.args !== undefined) config.args = args.draft.args;
    else if (!sameTransport) config.args = [];
    const env = retainOpaqueValues({
      existing: sameTransport ? asMcpRecord(current.env) : null,
      isSafe: (name, value) => readEnvReference(profile, value) === name,
    });
    for (const name of args.draft.envVars) {
      env[name] = writeEnvReference(profile, name);
    }
    if (Object.keys(env).length) config.env = env;
    else delete config.env;
    delete config.type;
    delete config.url;
    delete config.headers;
    for (const key of profile.opaqueAuthKeys) delete config[key];
  } else {
    if (args.draft.url !== undefined) config.url = args.draft.url;
    else if (!sameTransport) {
      throw new Error("A URL is required for a remote MCP server.");
    }
    if (args.draft.transport === "sse") config.type = "sse";
    else delete config.type;
    const headers = retainOpaqueValues({
      existing: sameTransport ? asMcpRecord(current.headers) : null,
      isSafe: (_name, value) => {
        const text = String(value ?? "");
        return (
          Boolean(readEnvReference(profile, value)) ||
          /^Bearer\s+\$\{(?:env:)?[A-Za-z_][A-Za-z0-9_]*\}$/i.test(text)
        );
      },
    });
    for (const binding of args.draft.headerEnvBindings) {
      headers[binding.name] = writeEnvReference(profile, binding.envVar);
    }
    if (args.draft.bearerTokenEnvVar) {
      headers.Authorization = `Bearer ${writeEnvReference(
        profile,
        args.draft.bearerTokenEnvVar,
      )}`;
    }
    if (Object.keys(headers).length) config.headers = headers;
    else delete config.headers;
    delete config.command;
    delete config.args;
    delete config.env;
    if (!sameTransport) {
      for (const key of profile.opaqueAuthKeys) delete config[key];
    }
  }
  if (args.draft.enabled) delete config.disabled;
  else config.disabled = true;
  return config;
}

function isSecretLikeJsonMcpEntry(
  profile: JsonMcpConfigProfile,
  value: unknown,
) {
  const config = asMcpRecord(value) ?? {};
  for (const [name, envValue] of Object.entries(
    asMcpRecord(config.env) ?? {},
  )) {
    if (SECRET_KEY_PATTERN.test(name) && !readEnvReference(profile, envValue)) {
      return true;
    }
  }
  for (const [name, headerValue] of Object.entries(
    asMcpRecord(config.headers) ?? {},
  )) {
    if (
      SECRET_KEY_PATTERN.test(name) &&
      !readEnvReference(profile, headerValue) &&
      !/^Bearer\s+\$\{(?:env:)?[A-Za-z_][A-Za-z0-9_]*\}$/i.test(
        String(headerValue ?? ""),
      )
    ) {
      return true;
    }
  }
  for (const authKey of profile.opaqueAuthKeys) {
    for (const [name, authValue] of Object.entries(
      asMcpRecord(config[authKey]) ?? {},
    )) {
      if (
        /secret|token/i.test(name) &&
        !readEnvReference(profile, authValue)
      ) {
        return true;
      }
    }
  }
  if (typeof config.url === "string") {
    try {
      const url = new URL(config.url);
      if (url.username || url.password) return true;
      for (const [key, valuePart] of url.searchParams) {
        if (
          SECRET_KEY_PATTERN.test(key) &&
          !readEnvReference(profile, valuePart)
        ) {
          return true;
        }
      }
    } catch {
      // Boundary validation rejects invalid draft URLs before a write.
    }
  }
  return false;
}

function assertProjectDocumentSafe(
  profile: JsonMcpConfigProfile,
  servers: Record<string, unknown>,
) {
  if (
    Object.values(servers).some((entry) =>
      isSecretLikeJsonMcpEntry(profile, entry),
    )
  ) {
    const example = writeEnvReference(profile, "NAME");
    throw new Error(
      `Project ${profile.label} MCP configuration contains a literal credential-like value. Replace it with a ${example} reference before editing it in Stave.`,
    );
  }
}

async function atomicWriteJsonMcpDocument(args: {
  loaded: LoadedJsonMcpDocument;
  document: JsonDocument;
  scope: Extract<McpConfigScope, "user" | "project">;
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

function toJsonMcpShareDraft(
  profile: JsonMcpConfigProfile,
  args: {
    name: string;
    value: unknown;
    scope: Extract<McpConfigScope, "user" | "project">;
  },
) {
  const config = asMcpRecord(args.value) ?? {};
  const transport = inferMcpTransport(config);
  const shareableUrl =
    transport === "stdio"
      ? undefined
      : getShareableMcpUrl(config.url, profile.label);
  const env = getJsonMcpEnvBindings(profile, asMcpRecord(config.env));
  const headers = readHeaderBindings(profile, asMcpRecord(config.headers));
  const opaqueCount =
    env.hiddenValueCount +
    headers.hiddenValueCount +
    countOpaqueAuthValues(profile, config);
  const warnings = opaqueCount
    ? [
        `${opaqueCount} opaque ${profile.label} authentication value${
          opaqueCount === 1 ? " was" : "s were"
        } not copied.`,
      ]
    : [];
  return {
    draft: {
      provider: profile.provider,
      scope: args.scope,
      name: args.name,
      transport,
      ...(typeof config.command === "string"
        ? { command: config.command }
        : {}),
      ...(transport === "stdio" && Array.isArray(config.args)
        ? {
            args: config.args.filter(
              (entry): entry is string => typeof entry === "string",
            ),
          }
        : {}),
      ...(shareableUrl ? { url: shareableUrl } : {}),
      envVars: env.envVars,
      ...(headers.bearerTokenEnvVar
        ? { bearerTokenEnvVar: headers.bearerTokenEnvVar }
        : {}),
      headerEnvBindings: headers.bindings,
      enabled: config.disabled !== true,
    } satisfies McpServerConfigDraft,
    warnings,
  };
}

/** Creates a native JSON MCP adapter for providers with user/project files. */
export function createJsonMcpConfigManagement(profile: JsonMcpConfigProfile) {
  function assertMutationShape(args: McpServerConfigMutationRequest): asserts args is McpServerConfigMutationRequest & { operation: "create" | "update" | "delete" } {
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
      (args.target && args.target.provider !== profile.provider) ||
      (args.draft && args.draft.provider !== profile.provider)
    ) {
      throw new Error(
        `The ${profile.label} MCP manager received a different provider.`,
      );
    }
    if (args.target && isProtectedMcpServerName(args.target.name)) {
      throw new Error(
        "The Stave Local MCP entry is managed by its dedicated settings control.",
      );
    }
    if (args.draft) assertMcpDraftSupported(args.draft);
  }

  async function prepareMutation(
    args: McpServerConfigMutationRequest,
    contextOverride?: JsonMcpConfigContext,
  ) {
    assertMutationShape(args);
    const scope = args.draft?.scope ?? args.target?.scope;
    if (scope !== "user" && scope !== "project") {
      throw new Error(
        `${profile.label} MCP editing supports user or project scope.`,
      );
    }
    if (args.target && args.draft && args.target.scope !== args.draft.scope) {
      throw new Error(
        "Move a server between scopes by adding it and deleting the old entry.",
      );
    }
    const context = contextOverride ?? profile.resolveContext(args);
    const loaded = await readJsonMcpDocument(
      profile,
      scope === "project" ? context.projectFilePath : context.userFilePath,
    );
    const revision = getMcpConfigRevision(loaded.raw);
    const currentServers = getJsonMcpServerMap(profile, loaded.document);
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
      nextServers[nextName] = buildJsonMcpServerEntry(profile, {
        existing,
        draft: args.draft,
        operation: args.operation,
      });
    }
    if (scope === "project") assertProjectDocumentSafe(profile, nextServers);
    const existingSnapshot =
      existing === undefined || !currentName
        ? undefined
        : toJsonMcpSnapshot(profile, {
            name: currentName,
            value: existing,
            scope,
            revision,
          });
    return {
      loaded,
      scope,
      revision,
      nextName,
      nextServers,
      document: setJsonMcpServerMap(loaded.document, nextServers),
      existingSnapshot,
    };
  }

  async function readShareDraft(
    args: McpServerConfigListRequest & { target: McpServerConfigTarget },
  ) {
    if (args.target.provider !== profile.provider) {
      throw new Error(
        `The ${profile.label} MCP manager received a different provider.`,
      );
    }
    if (args.target.scope !== "user" && args.target.scope !== "project") {
      throw new Error(`${profile.label} MCP scope is invalid.`);
    }
    const context = profile.resolveContext(args);
    const loaded = await readJsonMcpDocument(
      profile,
      args.target.scope === "project"
        ? context.projectFilePath
        : context.userFilePath,
    );
    const value = getJsonMcpServerMap(profile, loaded.document)[args.target.name];
    if (value === undefined) {
      throw new Error("The MCP server no longer exists. Refresh and try again.");
    }
    return {
      revision: getMcpConfigRevision(loaded.raw),
      ...toJsonMcpShareDraft(profile, {
        name: args.target.name,
        value,
        scope: args.target.scope,
      }),
    };
  }

  async function listWithContext(context: JsonMcpConfigContext) {
    const servers: McpServerConfigSnapshot[] = [];
    const errors: string[] = [];
    for (const [scope, filePath] of [
      ["user", context.userFilePath],
      ["project", context.projectFilePath],
    ] as const) {
      try {
        const loaded = await readJsonMcpDocument(profile, filePath);
        const revision = getMcpConfigRevision(loaded.raw);
        for (const [name, value] of Object.entries(
          getJsonMcpServerMap(profile, loaded.document),
        )) {
          servers.push(
            toJsonMcpSnapshot(profile, { name, value, scope, revision }),
          );
        }
      } catch (error) {
        errors.push(
          `${profile.label} ${scope}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return { servers, errors };
  }

  async function listConfigs(args: McpServerConfigListRequest) {
    return listWithContext(profile.resolveContext(args));
  }

  async function previewMutation(
    args: McpServerConfigMutationRequest,
  ): Promise<McpServerConfigMutationPreviewResponse> {
    try {
      const prepared = await prepareMutation(args);
      const preview = buildMcpMutationPreview({
        operation: args.operation,
        revision: prepared.revision,
        target: args.target,
        draft: args.draft,
        hiddenValueCount: prepared.existingSnapshot?.hiddenValueCount,
      });
      preview.warnings.push(profile.previewWarning);
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
        detail: `${profile.label} MCP configuration change is ready to review.`,
        preview,
      };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function applyMutation(
    args: McpServerConfigMutationApplyRequest,
  ): Promise<McpServerConfigMutationResponse> {
    try {
      const prepared = await prepareMutation(args);
      if (prepared.revision !== args.expectedRevision) {
        throw new Error(
          "MCP configuration changed after preview. Refresh the preview and try again.",
        );
      }
      const serialized = await atomicWriteJsonMcpDocument({
        loaded: prepared.loaded,
        document: prepared.document,
        scope: prepared.scope,
      });
      const value = prepared.nextServers[prepared.nextName];
      const verb =
        args.operation === "create"
          ? "Added"
          : args.operation === "update"
            ? "Updated"
            : "Deleted";
      return {
        ok: true,
        detail: `${verb} the ${profile.label} MCP server.`,
        operation: args.operation,
        ...(value === undefined
          ? {}
          : {
              server: toJsonMcpSnapshot(profile, {
                name: prepared.nextName,
                value,
                scope: prepared.scope,
                revision: getMcpConfigRevision(serialized),
              }),
            }),
      };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        operation: args.operation,
      };
    }
  }

  return {
    listConfigs,
    previewMutation,
    applyMutation,
    readShareDraft,
    test: {
      buildServerEntry: (args: {
        existing?: unknown;
        draft: McpServerConfigDraft;
        operation: "create" | "update";
      }) => buildJsonMcpServerEntry(profile, args),
      isSecretLikeEntry: (value: unknown) =>
        isSecretLikeJsonMcpEntry(profile, value),
      listWithContext,
      prepareMutation,
      readDocument: (filePath: string) =>
        readJsonMcpDocument(profile, filePath),
      toShareDraft: (args: {
        name: string;
        value: unknown;
        scope: Extract<McpConfigScope, "user" | "project">;
      }) => toJsonMcpShareDraft(profile, args),
      toSnapshot: (args: {
        name: string;
        value: unknown;
        scope: Extract<McpConfigScope, "user" | "project">;
        revision: string;
      }) => toJsonMcpSnapshot(profile, args),
    },
  };
}
