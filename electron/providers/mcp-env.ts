import { readFileSync } from "node:fs";
import path from "node:path";

export type McpEnvProvider = "claude" | "codex";

const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** `${VAR}` and `${VAR:-default}`, the forms Claude Code expands in MCP config. */
const BRACED_ENV_REFERENCE_PATTERN =
  /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}/g;
const ENV_REFERENCE_PATTERN =
  /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

function addEnvVarName(names: Set<string>, value: unknown) {
  if (typeof value !== "string") {
    return;
  }
  const candidate = value.trim();
  if (ENV_VAR_NAME_PATTERN.test(candidate)) {
    names.add(candidate);
  }
}

function addEnvReferences(
  names: Set<string>,
  value: unknown,
  pattern: RegExp = ENV_REFERENCE_PATTERN,
) {
  if (typeof value !== "string") {
    return;
  }
  for (const match of value.matchAll(pattern)) {
    addEnvVarName(names, match[1] ?? match[2]);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Path variables Claude Code fills in itself when it loads a plugin's MCP
 * servers. Probing the login shell for them would at best find nothing and at
 * worst override the value Claude Code computes per plugin.
 */
const CLAUDE_SUPPLIED_MCP_ENV_VAR_NAMES: ReadonlySet<string> = new Set([
  "CLAUDE_PLUGIN_ROOT",
  "CLAUDE_PLUGIN_DATA",
  "CLAUDE_PROJECT_DIR",
]);

/**
 * Claude files whose MCP servers share the document with unrelated settings
 * and sit under `mcpServers` (or `projects.<path>.mcpServers`). Every other
 * Claude MCP file Stave reads — a project or plugin `.mcp.json`, a JSON file a
 * plugin manifest names, the Stave manifest — is an MCP document, and Claude
 * Code reads a plugin's server map from its root when `mcpServers` is absent.
 */
const CLAUDE_SETTINGS_DOCUMENT_BASENAMES: ReadonlySet<string> = new Set([
  "settings.json",
  "settings.local.json",
  ".claude.json",
  "plugin.json",
]);

export function isClaudeMcpDocumentPath(filePath: string) {
  return !CLAUDE_SETTINGS_DOCUMENT_BASENAMES.has(path.basename(filePath));
}

/** A plugin manifest may list inline server maps beside file paths. */
function toServerMaps(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const record = asRecord(entry);
      return record ? [record] : [];
    });
  }
  const record = asRecord(value);
  return record ? [record] : [];
}

function collectClaudeServerEnvVarNames(
  names: Set<string>,
  value: unknown,
) {
  const record = asRecord(value);
  const config = asRecord(record?.transport) ?? record;
  if (!config) {
    return;
  }

  const env = asRecord(config.env);
  for (const envValue of Object.values(env ?? {})) {
    addEnvReferences(names, envValue);
  }

  const headers = asRecord(config.headers);
  for (const headerValue of Object.values(headers ?? {})) {
    addEnvReferences(names, headerValue);
  }

  // Claude Code also expands references in these fields. Only the braced forms
  // count here: a bare `$NAME` in an argument or URL is literal text.
  addEnvReferences(names, config.url, BRACED_ENV_REFERENCE_PATTERN);
  addEnvReferences(names, config.command, BRACED_ENV_REFERENCE_PATTERN);
  for (const arg of Array.isArray(config.args) ? config.args : []) {
    addEnvReferences(names, arg, BRACED_ENV_REFERENCE_PATTERN);
  }
}

export function collectClaudeMcpEnvVarNames(
  document: unknown,
  args: {
    cwd?: string;
    /** Read the root as the server map when `mcpServers` is absent. */
    bareServerMap?: boolean;
  } = {},
) {
  const names = new Set<string>();
  const root = asRecord(document);
  const declared = root?.mcpServers || root?.mcp_servers;
  const serverMaps = declared
    ? toServerMaps(declared)
    : args.bareServerMap && root
      ? [root]
      : [];
  for (const servers of serverMaps) {
    for (const server of Object.values(servers)) {
      collectClaudeServerEnvVarNames(names, server);
    }
  }

  const cwd = args.cwd?.trim();
  const projects = asRecord(root?.projects);
  if (cwd && projects) {
    const resolvedCwd = path.resolve(cwd);
    for (const [projectPath, project] of Object.entries(projects)) {
      if (path.resolve(projectPath) !== resolvedCwd) {
        continue;
      }
      const projectRecord = asRecord(project);
      const projectServers =
        asRecord(projectRecord?.mcpServers) ??
        asRecord(projectRecord?.mcp_servers) ??
        {};
      for (const server of Object.values(projectServers)) {
        collectClaudeServerEnvVarNames(names, server);
      }
      break;
    }
  }

  return [...names]
    .filter((name) => !CLAUDE_SUPPLIED_MCP_ENV_VAR_NAMES.has(name))
    .sort();
}

function extractTomlStringValues(value: string) {
  const values: string[] = [];
  const pattern = /(['"])(.*?)\1/g;
  for (const match of value.matchAll(pattern)) {
    values.push(match[2] ?? "");
  }
  return values;
}

function collectCodexServerEnvVarNames(names: Set<string>, section: string) {
  if (/^\s*enabled\s*=\s*false\b/m.test(section)) {
    return;
  }

  const bearerToken = section.match(
    /^\s*bearer_token_env_var\s*=\s*(['"])(.*?)\1\s*$/m,
  );
  addEnvVarName(names, bearerToken?.[2]);

  const envVars = section.match(/^\s*env_vars\s*=\s*\[([\s\S]*?)\]/m);
  for (const value of extractTomlStringValues(envVars?.[1] ?? "")) {
    addEnvVarName(names, value);
  }

  const headerTable = section.match(
    /^\s*env_http_headers\s*=\s*\{([\s\S]*?)\}/m,
  );
  const headerBindings = headerTable?.[1] ?? "";
  const headerValuePattern = /(?:=\s*)(['"])(.*?)\1/g;
  for (const match of headerBindings.matchAll(headerValuePattern)) {
    addEnvVarName(names, match[2]);
  }
}

export function collectCodexMcpEnvVarNames(toml: string) {
  const names = new Set<string>();
  const sectionPattern =
    /^\s*\[mcp_servers\.(?:"([^"]+)"|'([^']+)'|([^\]"']+))\]\s*$/gm;
  while (sectionPattern.exec(toml) !== null) {
    const sectionStart = sectionPattern.lastIndex;
    const nextSection = /^\s*\[/m.exec(toml.slice(sectionStart));
    const sectionEnd = nextSection
      ? sectionStart + nextSection.index
      : toml.length;
    collectCodexServerEnvVarNames(names, toml.slice(sectionStart, sectionEnd));
  }

  return [...names].sort();
}

export function readMcpEnvVarNames(args: {
  provider: McpEnvProvider;
  paths: readonly string[];
  cwd?: string;
}) {
  const names = new Set<string>();
  for (const filePath of args.paths) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    if (args.provider === "codex") {
      for (const name of collectCodexMcpEnvVarNames(content)) {
        names.add(name);
      }
      continue;
    }

    try {
      const document = JSON.parse(content) as unknown;
      for (const name of collectClaudeMcpEnvVarNames(document, {
        cwd: args.cwd,
        bareServerMap: isClaudeMcpDocumentPath(filePath),
      })) {
        names.add(name);
      }
    } catch {
      // The provider owns configuration diagnostics. Env discovery is best-effort.
    }
  }
  return [...names].sort();
}
