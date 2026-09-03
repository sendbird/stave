import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { resolveLoginShellEnvVarValues } from "../executable-path";
import { resolveNativeClaudeMcpServers } from "../claude-mcp-config";
import {
  isProtectedMcpServerName,
  sanitizeMcpUrl,
} from "../mcp-config-management-shared";

export type AcpMcpEnvEntry = { name: string; value: string };

export type AcpStdioMcpServer = {
  name: string;
  command: string;
  args: string[];
  env: AcpMcpEnvEntry[];
};

export type AcpHttpMcpServer = {
  type: "http";
  name: string;
  url: string;
  headers: AcpMcpEnvEntry[];
};

export type AcpMcpServerDescriptor = AcpStdioMcpServer | AcpHttpMcpServer;
export type AcpMcpTargetProvider = "cursor" | "kiro";

export type NativeMcpRouteIndex = {
  names: Set<string>;
  fingerprints: Set<string>;
};

type CodexMcpServerRecord = {
  name: string;
  enabled: boolean;
  command?: string;
  args: string[];
  url?: string;
  envVars: string[];
  env: Record<string, string>;
  bearerTokenEnvVar?: string;
  headerEnvBindings: Record<string, string>;
};

const ENV_REFERENCE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const TOML_STRING_PATTERN = /(['"])(.*?)\1/g;
const CODEX_SECTION_PATTERN =
  /^\s*\[mcp_servers\.(?:"([^"]+)"|'([^']+)'|([^\]"'.]+))(?:\.(env|env_http_headers))?\]\s*$/gm;

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function asUnknownRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeServerName(name: string) {
  return name.trim().toLowerCase();
}

function normalizeMcpUrl(value: unknown) {
  const sanitized = sanitizeMcpUrl(value).value;
  if (!sanitized) return null;
  try {
    return new URL(sanitized).toString();
  } catch {
    return null;
  }
}

function fingerprintMcpRoute(value: {
  transport: "stdio" | "remote";
  command?: string;
  args?: readonly string[];
  url?: string;
  envNames?: readonly string[];
  headerNames?: readonly string[];
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        transport: value.transport,
        command: value.command?.trim() || undefined,
        args: value.args ?? [],
        url: value.url,
        envNames: [...(value.envNames ?? [])].sort(),
        headerNames: [...(value.headerNames ?? [])]
          .map((name) => name.toLowerCase())
          .sort(),
      }),
    )
    .digest("hex");
}

export function getAcpMcpServerFingerprint(
  server: AcpMcpServerDescriptor,
) {
  if ("type" in server) {
    const url = normalizeMcpUrl(server.url);
    if (!url) return null;
    return fingerprintMcpRoute({
      transport: "remote",
      url,
      headerNames: server.headers.map((entry) => entry.name),
    });
  }
  if (!server.command.trim()) return null;
  return fingerprintMcpRoute({
    transport: "stdio",
    command: server.command,
    args: server.args,
    envNames: server.env.map((entry) => entry.name),
  });
}

function getNativeMcpServerFingerprint(value: unknown) {
  const config = asUnknownRecord(value);
  const url = normalizeMcpUrl(config.url);
  if (url) {
    return fingerprintMcpRoute({
      transport: "remote",
      url,
      headerNames: Object.keys(asUnknownRecord(config.headers)),
    });
  }
  const command = typeof config.command === "string" ? config.command : "";
  if (!command.trim()) return null;
  return fingerprintMcpRoute({
    transport: "stdio",
    command,
    args: Array.isArray(config.args)
      ? config.args.filter((entry): entry is string => typeof entry === "string")
      : [],
    envNames: Object.keys(asUnknownRecord(config.env)),
  });
}

export function expandEnvReferences(
  value: string,
  env: Record<string, string | undefined>,
) {
  return value.replace(ENV_REFERENCE_PATTERN, (match, name: string) => {
    const resolved = env[name];
    return resolved && resolved.length > 0 ? resolved : match;
  });
}

function toEnvEntries(record: Record<string, string>): AcpMcpEnvEntry[] {
  return Object.entries(record)
    .filter(
      ([, value]) =>
        value.length > 0 && !/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(value),
    )
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function claudeServerToAcpDescriptor(args: {
  name: string;
  config: McpServerConfig;
  env: Record<string, string | undefined>;
}): AcpMcpServerDescriptor | null {
  if (isProtectedMcpServerName(args.name)) {
    return null;
  }
  if (args.config.type === "sse") {
    return null;
  }
  if (args.config.type === "http" || "url" in args.config) {
    const url = expandEnvReferences(args.config.url, args.env);
    if (!url || /\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(url)) {
      return null;
    }
    const headers = Object.fromEntries(
      Object.entries(asStringRecord(args.config.headers)).map(
        ([name, value]) => [name, expandEnvReferences(value, args.env)],
      ),
    );
    return {
      type: "http",
      name: args.name,
      url,
      headers: toEnvEntries(headers),
    };
  }
  if (!("command" in args.config) || !args.config.command?.trim()) {
    return null;
  }
  const env = Object.fromEntries(
    Object.entries(asStringRecord(args.config.env)).map(([name, value]) => [
      name,
      expandEnvReferences(value, args.env),
    ]),
  );
  return {
    name: args.name,
    command: args.config.command,
    args: Array.isArray(args.config.args) ? [...args.config.args] : [],
    env: toEnvEntries(env),
  };
}

function extractTomlStrings(value: string) {
  return [...value.matchAll(TOML_STRING_PATTERN)].map(
    (match) => match[2] ?? "",
  );
}

function readTomlString(section: string, key: string) {
  const match = section.match(
    new RegExp(`^\\s*${key}\\s*=\\s*(['"])(.*?)\\1\\s*$`, "m"),
  );
  return match?.[2]?.trim() || undefined;
}

function readTomlStringArray(section: string, key: string) {
  const match = section.match(
    new RegExp(`^\\s*${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m"),
  );
  return match ? extractTomlStrings(match[1] ?? "") : [];
}

function readTomlInlineTable(section: string, key: string) {
  const match = section.match(
    new RegExp(`^\\s*${key}\\s*=\\s*\\{([\\s\\S]*?)\\}`, "m"),
  );
  const record: Record<string, string> = {};
  if (!match) return record;
  const pairPattern = /(['"]?)([^'"=\s]+)\1\s*=\s*(['"])(.*?)\3/g;
  for (const entry of match[1]?.matchAll(pairPattern) ?? []) {
    const name = entry[2]?.trim();
    const value = entry[4] ?? "";
    if (name) record[name] = value;
  }
  return record;
}

export function parseCodexMcpServerRecords(
  toml: string,
): CodexMcpServerRecord[] {
  const servers = new Map<string, CodexMcpServerRecord>();
  const pattern = new RegExp(CODEX_SECTION_PATTERN.source, "gm");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(toml))) {
    const name = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!name) continue;
    const table = match[4];
    const start = pattern.lastIndex;
    const next = /^\s*\[/m.exec(toml.slice(start));
    const section = toml.slice(start, next ? start + next.index : toml.length);
    const current = servers.get(name) ?? {
      name,
      enabled: true,
      args: [],
      envVars: [],
      env: {},
      headerEnvBindings: {},
    };
    if (table === "env") {
      Object.assign(
        current.env,
        readTomlInlineTable(`env = {${section}}`, "env"),
      );
      for (const [key, value] of Object.entries(
        Object.fromEntries(
          [
            ...section.matchAll(
              /^\s*(['"]?)([^'"=\s]+)\1\s*=\s*(['"])(.*?)\3\s*$/gm,
            ),
          ].map((entry) => [entry[2] ?? "", entry[4] ?? ""]),
        ),
      )) {
        if (key) current.env[key] = value;
      }
    } else if (table === "env_http_headers") {
      for (const [key, value] of Object.entries(
        Object.fromEntries(
          [
            ...section.matchAll(
              /^\s*(['"]?)([^'"=\s]+)\1\s*=\s*(['"])(.*?)\3\s*$/gm,
            ),
          ].map((entry) => [entry[2] ?? "", entry[4] ?? ""]),
        ),
      )) {
        if (key) current.headerEnvBindings[key] = value;
      }
    } else {
      current.enabled = !/^\s*enabled\s*=\s*false\b/m.test(section);
      current.command = readTomlString(section, "command") ?? current.command;
      current.url = readTomlString(section, "url") ?? current.url;
      current.bearerTokenEnvVar =
        readTomlString(section, "bearer_token_env_var") ??
        current.bearerTokenEnvVar;
      const args = readTomlStringArray(section, "args");
      if (args.length > 0) current.args = args;
      const envVars = readTomlStringArray(section, "env_vars");
      if (envVars.length > 0) current.envVars = envVars;
      Object.assign(
        current.headerEnvBindings,
        readTomlInlineTable(section, "env_http_headers"),
      );
      Object.assign(current.env, readTomlInlineTable(section, "env"));
    }
    servers.set(name, current);
  }
  return [...servers.values()];
}

export function codexServerToAcpDescriptor(args: {
  server: CodexMcpServerRecord;
  env: Record<string, string | undefined>;
}): AcpMcpServerDescriptor | null {
  if (!args.server.enabled || isProtectedMcpServerName(args.server.name)) {
    return null;
  }
  if (args.server.url?.trim()) {
    const headers = Object.fromEntries(
      Object.entries(args.server.headerEnvBindings).flatMap(
        ([name, envVar]) => {
          const value = args.env[envVar];
          return value ? [[name, value] as const] : [];
        },
      ),
    );
    if (args.server.bearerTokenEnvVar) {
      const token = args.env[args.server.bearerTokenEnvVar];
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
    return {
      type: "http",
      name: args.server.name,
      url: args.server.url,
      headers: toEnvEntries(headers),
    };
  }
  if (!args.server.command?.trim()) {
    return null;
  }
  const env = { ...args.server.env };
  for (const name of args.server.envVars) {
    const value = args.env[name];
    if (value) env[name] = value;
  }
  return {
    name: args.server.name,
    command: args.server.command,
    args: args.server.args,
    env: toEnvEntries(env),
  };
}

export function mergeAcpMcpServers(
  servers: readonly AcpMcpServerDescriptor[],
): AcpMcpServerDescriptor[] {
  const merged = new Map<string, AcpMcpServerDescriptor>();
  const fingerprints = new Set<string>();
  for (const server of servers) {
    const key = server.name.trim().toLowerCase();
    if (!key || merged.has(key)) continue;
    const fingerprint = getAcpMcpServerFingerprint(server);
    if (fingerprint && fingerprints.has(fingerprint)) continue;
    merged.set(key, server);
    if (fingerprint) fingerprints.add(fingerprint);
  }
  return [...merged.values()];
}

async function readOptionalText(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function readOptionalMcpServerMap(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Native MCP configuration root must be a JSON object.");
    }
    const serverValue = (parsed as Record<string, unknown>).mcpServers;
    if (serverValue === undefined) return {};
    if (
      !serverValue ||
      typeof serverValue !== "object" ||
      Array.isArray(serverValue)
    ) {
      throw new Error("Native MCP mcpServers must be a JSON object.");
    }
    return serverValue as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

function getTargetNativeMcpPaths(args: {
  targetProvider: AcpMcpTargetProvider;
  cwd: string;
  env?: Record<string, string | undefined>;
  homeDirectory?: string;
}) {
  const homeDirectory = args.homeDirectory ?? homedir();
  if (args.targetProvider === "cursor") {
    return [
      path.join(homeDirectory, ".cursor", "mcp.json"),
      path.join(args.cwd, ".cursor", "mcp.json"),
    ];
  }
  const configuredKiroHome = args.homeDirectory
    ? undefined
    : args.env?.KIRO_HOME?.trim() || process.env.KIRO_HOME?.trim();
  const kiroHome = configuredKiroHome || path.join(homeDirectory, ".kiro");
  return [
    path.join(kiroHome, "settings", "mcp.json"),
    path.join(args.cwd, ".kiro", "settings", "mcp.json"),
  ];
}

/**
 * Indexes native MCP routes without returning credential values. The later
 * workspace layer replaces an earlier user entry with the same name.
 */
export async function resolveNativeMcpRouteIndex(args: {
  targetProvider: AcpMcpTargetProvider;
  cwd: string;
  env?: Record<string, string | undefined>;
  homeDirectory?: string;
}): Promise<NativeMcpRouteIndex> {
  const [userServers, workspaceServers] = await Promise.all(
    getTargetNativeMcpPaths(args).map(readOptionalMcpServerMap),
  );
  const merged = new Map<string, { name: string; value: unknown }>();
  for (const servers of [userServers, workspaceServers]) {
    for (const [name, value] of Object.entries(servers)) {
      const key = normalizeServerName(name);
      if (key) merged.set(key, { name, value });
    }
  }
  const names = new Set<string>();
  const fingerprints = new Set<string>();
  for (const [key, entry] of merged) {
    names.add(key);
    const config = asUnknownRecord(entry.value);
    if (config.disabled === true) continue;
    const fingerprint = getNativeMcpServerFingerprint(config);
    if (fingerprint) fingerprints.add(fingerprint);
  }
  return { names, fingerprints };
}

/** Keeps provider-native routes authoritative over Stave's ACP projection. */
export function filterAcpMcpServersForNativeRoutes(args: {
  servers: readonly AcpMcpServerDescriptor[];
  nativeRoutes: NativeMcpRouteIndex;
}) {
  return args.servers.filter((server) => {
    if (args.nativeRoutes.names.has(normalizeServerName(server.name))) {
      return false;
    }
    const fingerprint = getAcpMcpServerFingerprint(server);
    return !fingerprint || !args.nativeRoutes.fingerprints.has(fingerprint);
  });
}

function collectReferencedEnvNames(args: {
  claudeServers: Record<string, McpServerConfig>;
  codexServers: CodexMcpServerRecord[];
}) {
  const names = new Set<string>();
  const collect = (value: string) => {
    for (const match of value.matchAll(ENV_REFERENCE_PATTERN)) {
      if (match[1]) names.add(match[1]);
    }
  };
  for (const server of Object.values(args.claudeServers)) {
    if ("url" in server) collect(server.url);
    for (const value of Object.values(asStringRecord(server.headers))) {
      collect(value);
    }
    if ("env" in server) {
      for (const value of Object.values(asStringRecord(server.env))) {
        collect(value);
      }
    }
  }
  for (const server of args.codexServers) {
    for (const name of server.envVars) names.add(name);
    if (server.bearerTokenEnvVar) names.add(server.bearerTokenEnvVar);
    for (const name of Object.values(server.headerEnvBindings)) names.add(name);
  }
  return [...names];
}

export async function resolveAcpSharedMcpServers(args: {
  cwd: string;
  env?: Record<string, string | undefined>;
  claudeConfigDir?: string;
  codexHome?: string;
  resolveEnv?: (key: string) => string | null;
}): Promise<AcpMcpServerDescriptor[]> {
  const cwd = path.resolve(args.cwd);
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...args.env,
  };
  const { servers: claudeServers } = await resolveNativeClaudeMcpServers({
    cwd,
    claudeConfigDir: args.claudeConfigDir,
  });
  const codexHome =
    args.codexHome?.trim() ||
    process.env.CODEX_HOME?.trim() ||
    path.join(homedir(), ".codex");
  const [userToml, projectToml] = await Promise.all([
    readOptionalText(path.join(codexHome, "config.toml")),
    readOptionalText(path.join(cwd, ".codex", "config.toml")),
  ]);
  const codexServers = [
    ...parseCodexMcpServerRecords(userToml),
    ...parseCodexMcpServerRecords(projectToml),
  ];
  const missingNames = collectReferencedEnvNames({
    claudeServers,
    codexServers,
  }).filter((name) => !env[name]?.trim());
  if (missingNames.length > 0) {
    const resolved = args.resolveEnv
      ? Object.fromEntries(
          missingNames.map((name) => [
            name,
            args.resolveEnv?.(name) ?? undefined,
          ]),
        )
      : resolveLoginShellEnvVarValues({ keys: missingNames });
    for (const name of missingNames) {
      const value = resolved?.[name]?.trim();
      if (value) env[name] = value;
    }
  }

  const descriptors: AcpMcpServerDescriptor[] = [];
  for (const [name, config] of Object.entries(claudeServers)) {
    const descriptor = claudeServerToAcpDescriptor({ name, config, env });
    if (descriptor) descriptors.push(descriptor);
  }
  for (const server of codexServers) {
    const descriptor = codexServerToAcpDescriptor({ server, env });
    if (descriptor) descriptors.push(descriptor);
  }
  return mergeAcpMcpServers(descriptors);
}

export async function resolveAcpTurnMcpServers(args: {
  targetProvider: AcpMcpTargetProvider;
  cwd: string;
  env?: Record<string, string | undefined>;
  claudeConfigDir?: string;
  codexHome?: string;
  homeDirectory?: string;
  staveLocalMcpServers?: readonly AcpMcpServerDescriptor[];
}): Promise<AcpMcpServerDescriptor[]> {
  try {
    const [shared, nativeRoutes] = await Promise.all([
      resolveAcpSharedMcpServers({
        cwd: args.cwd,
        env: args.env,
        claudeConfigDir: args.claudeConfigDir,
        codexHome: args.codexHome,
      }),
      resolveNativeMcpRouteIndex({
        targetProvider: args.targetProvider,
        cwd: args.cwd,
        env: args.env,
        homeDirectory: args.homeDirectory,
      }),
    ]);
    const portable = filterAcpMcpServersForNativeRoutes({
      servers: shared,
      nativeRoutes,
    });
    return mergeAcpMcpServers([
      ...portable,
      ...(args.staveLocalMcpServers ?? []),
    ]);
  } catch {
    return [...(args.staveLocalMcpServers ?? [])];
  }
}
