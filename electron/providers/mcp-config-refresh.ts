import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

type McpConfigPathOptions = {
  cwd: string;
  claudeConfigDir?: string;
  codexHome?: string;
};

type CodexMcpConfigPathOptions = McpConfigPathOptions & {
  configLayers?: readonly unknown[];
};

function resolveHomeRelativePath(args: { value?: string; fallback: string }) {
  const value = args.value?.trim();
  return value && path.isAbsolute(value) ? value : args.fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function addAbsolutePath(target: Set<string>, value: unknown) {
  if (typeof value === "string" && path.isAbsolute(value)) {
    target.add(path.normalize(value));
  }
}

function addCodexProjectConfigCandidates(args: {
  target: Set<string>;
  cwd: string;
  dotCodexFolder: string;
}) {
  const cwd = path.resolve(args.cwd);
  const projectRoot = path.dirname(path.resolve(args.dotCodexFolder));
  const relativeCwd = path.relative(projectRoot, cwd);
  if (
    relativeCwd === "" ||
    (!relativeCwd.startsWith(`..${path.sep}`) &&
      relativeCwd !== ".." &&
      !path.isAbsolute(relativeCwd))
  ) {
    let directory = projectRoot;
    args.target.add(path.join(directory, ".codex", "config.toml"));
    for (const segment of relativeCwd.split(path.sep).filter(Boolean)) {
      directory = path.join(directory, segment);
      args.target.add(path.join(directory, ".codex", "config.toml"));
    }
    return;
  }
  args.target.add(path.join(args.dotCodexFolder, "config.toml"));
}

export function getClaudeStateFilePath(args: { claudeConfigDir?: string }) {
  const configuredDir = args.claudeConfigDir?.trim();
  return configuredDir && path.isAbsolute(configuredDir)
    ? path.join(configuredDir, ".claude.json")
    : path.join(homedir(), ".claude.json");
}

/**
 * The stave-local manifest carries the loopback URL and token that both
 * provider runtimes hand to their native session. It is rewritten whenever the
 * local MCP server (re)binds, so it must be tracked alongside the CLI config
 * files — otherwise a restart onto a different port leaves resumed sessions
 * pinned to a dead endpoint and every stave tool call fails.
 */
export function getStaveLocalMcpManifestPath() {
  return path.join(homedir(), ".stave", "local-mcp.json");
}

export function getClaudeMcpConfigPaths(args: McpConfigPathOptions) {
  const configDir = resolveHomeRelativePath({
    value: args.claudeConfigDir,
    fallback: path.join(homedir(), ".claude"),
  });
  return [
    path.join(configDir, "settings.json"),
    path.join(configDir, "settings.local.json"),
    getClaudeStateFilePath({
      claudeConfigDir: args.claudeConfigDir,
    }),
    path.join(args.cwd, ".claude", "settings.json"),
    path.join(args.cwd, ".claude", "settings.local.json"),
    path.join(args.cwd, ".mcp.json"),
    getStaveLocalMcpManifestPath(),
  ];
}

/**
 * Codex resolves config per thread from user, profile, system, managed, and
 * project layers. App Server exposes those exact sources through
 * `config/read(includeLayers: true)`, so use that metadata instead of
 * duplicating Codex's project-root and trust rules.
 *
 * Global and project paths stay separate because the App Server process is
 * shared: a user config edit should invalidate it once, while project edits
 * should be fingerprinted independently for each workspace.
 */
export function getCodexMcpConfigPathGroups(args: CodexMcpConfigPathOptions) {
  const codexHome = resolveHomeRelativePath({
    value: args.codexHome,
    fallback: path.join(homedir(), ".codex"),
  });
  const globalPaths = new Set([
    path.join(codexHome, "config.toml"),
    getStaveLocalMcpManifestPath(),
  ]);
  const projectPaths = new Set([path.join(args.cwd, ".codex", "config.toml")]);

  for (const layer of args.configLayers ?? []) {
    const source = asRecord(asRecord(layer)?.name);
    if (!source) {
      continue;
    }
    const sourceType =
      typeof source.type === "string" ? source.type.toLowerCase() : "";
    if (sourceType === "project") {
      addAbsolutePath(projectPaths, source.file);
      if (
        typeof source.dotCodexFolder === "string" &&
        path.isAbsolute(source.dotCodexFolder)
      ) {
        addCodexProjectConfigCandidates({
          target: projectPaths,
          cwd: args.cwd,
          dotCodexFolder: source.dotCodexFolder,
        });
      }
      continue;
    }
    addAbsolutePath(globalPaths, source.file);
  }

  return {
    globalPaths: [...globalPaths],
    projectPaths: [...projectPaths],
  };
}

export function getCodexMcpConfigPaths(args: CodexMcpConfigPathOptions) {
  const groups = getCodexMcpConfigPathGroups(args);
  return [...groups.globalPaths, ...groups.projectPaths];
}

const MCP_KEY_PATTERN = /mcp/i;

/** Files whose every byte describes MCP wiring, so the whole document counts. */
const WHOLE_DOCUMENT_MCP_BASENAMES: ReadonlySet<string> = new Set([
  ".mcp.json",
  "local-mcp.json",
]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = asRecord(value);
  if (!record) {
    return JSON.stringify(value) ?? "null";
  }
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/**
 * Keep only the subtrees that can change a provider's MCP catalog: any key
 * whose name mentions MCP (`mcpServers`, `disabledMcpServers`,
 * `enabledMcpjsonServers`, …) at any depth. The CLI state file and the
 * settings files carry far more than that — permission grants, tips shown,
 * last-used timestamps — and each of those writes used to look like a config
 * change.
 */
function projectMcpJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    const projected = value
      .map((entry) => projectMcpJson(entry))
      .filter((entry) => entry !== undefined);
    return projected.length > 0 ? projected : undefined;
  }
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const projected: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (MCP_KEY_PATTERN.test(key)) {
      projected[key] = entry;
      continue;
    }
    const nested = projectMcpJson(entry);
    if (nested !== undefined) {
      projected[key] = nested;
    }
  }
  return Object.keys(projected).length > 0 ? projected : undefined;
}

/**
 * Codex config is TOML. Keep the `[mcp_servers.*]` tables (and any top-level
 * `*mcp*` key); everything else — model, approval policy, features — is
 * irrelevant to the MCP catalog a thread snapshotted.
 */
function projectMcpToml(content: string): string {
  const kept: string[] = [];
  let inMcpTable = false;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = /^\[\[?\s*([^\]]+?)\s*\]?\]$/.exec(line);
    if (header) {
      inMcpTable = MCP_KEY_PATTERN.test(header[1] ?? "");
      if (inMcpTable) {
        kept.push(line);
      }
      continue;
    }
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    if (inMcpTable || /^[\w.-]*mcp[\w.-]*\s*=/i.test(line)) {
      kept.push(line);
    }
  }
  return kept.join("\n");
}

/**
 * Reduce a config file to the bytes that can change the MCP catalog. Anything
 * unparseable falls back to the raw content, which is still stricter than the
 * mtime the tracker compared before: a rewrite with identical bytes stays
 * invisible.
 */
export function projectMcpConfigContent(args: {
  filePath: string;
  content: string;
}): string {
  const basename = path.basename(args.filePath);
  const extension = path.extname(basename).toLowerCase();
  if (extension === ".json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args.content);
    } catch {
      return args.content;
    }
    if (WHOLE_DOCUMENT_MCP_BASENAMES.has(basename)) {
      return stableStringify(parsed);
    }
    return stableStringify(projectMcpJson(parsed) ?? null);
  }
  if (extension === ".toml") {
    return projectMcpToml(args.content);
  }
  return args.content;
}

async function getMcpConfigFingerprint(paths: readonly string[]) {
  const metadata = await Promise.all(
    paths.map(async (filePath) => {
      try {
        const [fileMetadata, content] = await Promise.all([
          stat(filePath),
          readFile(filePath, "utf8"),
        ]);
        const digest = createHash("sha1")
          .update(projectMcpConfigContent({ filePath, content }))
          .digest("hex");
        return {
          fingerprint: `${filePath}:${digest}`,
          modifiedAt: fileMetadata.mtimeMs,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { fingerprint: `${filePath}:missing`, modifiedAt: 0 };
        }
        // The provider will surface a native config error when it loads an
        // unreadable file. Do not reset a healthy session for a stat failure.
        return { fingerprint: `${filePath}:unavailable`, modifiedAt: 0 };
      }
    }),
  );
  return {
    fingerprint: metadata.map((entry) => entry.fingerprint).join("|"),
    latestModifiedAt: Math.max(0, ...metadata.map((entry) => entry.modifiedAt)),
  };
}

/**
 * Provider CLIs snapshot MCP discovery at native session/app-server startup.
 * Track MCP-bearing config files between turns so callers can refresh safely.
 */
export type McpConfigRefreshResult = {
  changed: boolean;
  generation: number;
  checkedAt: number;
};

type McpConfigRefreshScope = McpConfigRefreshResult & {
  fingerprint: string | null;
  pendingCheck?: Promise<McpConfigRefreshResult>;
};

/**
 * Tracks cheap file metadata separately from provider-native MCP probing.
 *
 * A scope is intentionally supplied by the runtime: a global tracker must not
 * mistake moving between workspaces or CLI homes for a configuration change.
 * Concurrent turn preflights for the same scope share one stat pass.
 */
export class McpConfigRefreshTracker {
  private readonly scopes = new Map<string, McpConfigRefreshScope>();

  check(args: {
    scopeKey: string;
    paths: readonly string[];
    /**
     * When the provider process predates this tracker's first check, detect a
     * config edit that happened after the process took its native snapshot.
     */
    processStartedAt?: number;
    force?: boolean;
    minIntervalMs?: number;
  }): Promise<McpConfigRefreshResult> {
    const scope = this.scopes.get(args.scopeKey) ?? {
      fingerprint: null,
      generation: 0,
      checkedAt: 0,
      changed: false,
    };
    this.scopes.set(args.scopeKey, scope);

    const minIntervalMs = args.minIntervalMs ?? 0;
    if (
      !args.force &&
      scope.checkedAt > 0 &&
      Date.now() - scope.checkedAt < minIntervalMs
    ) {
      return Promise.resolve({
        changed: false,
        generation: scope.generation,
        checkedAt: scope.checkedAt,
      });
    }
    if (scope.pendingCheck) {
      return scope.pendingCheck;
    }

    scope.pendingCheck = getMcpConfigFingerprint(args.paths).then(
      ({ fingerprint, latestModifiedAt }) => {
        const changed =
          (scope.fingerprint !== null && scope.fingerprint !== fingerprint) ||
          (scope.fingerprint === null &&
            typeof args.processStartedAt === "number" &&
            latestModifiedAt > args.processStartedAt);
        scope.fingerprint = fingerprint;
        if (changed) {
          scope.generation += 1;
        }
        scope.checkedAt = Date.now();
        scope.changed = changed;
        return {
          changed,
          generation: scope.generation,
          checkedAt: scope.checkedAt,
        };
      },
    );
    return scope.pendingCheck.finally(() => {
      scope.pendingCheck = undefined;
    });
  }
}
