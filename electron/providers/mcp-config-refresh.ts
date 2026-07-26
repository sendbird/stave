import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

type McpConfigPathOptions = {
  cwd: string;
  claudeConfigDir?: string;
  codexHome?: string;
};

function resolveHomeRelativePath(args: { value?: string; fallback: string }) {
  const value = args.value?.trim();
  return value && path.isAbsolute(value) ? value : args.fallback;
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
    path.join(homedir(), ".claude.json"),
    path.join(args.cwd, ".claude", "settings.json"),
    path.join(args.cwd, ".claude", "settings.local.json"),
    path.join(args.cwd, ".mcp.json"),
    getStaveLocalMcpManifestPath(),
  ];
}

export function getCodexMcpConfigPaths(args: McpConfigPathOptions) {
  const codexHome = resolveHomeRelativePath({
    value: args.codexHome,
    fallback: path.join(homedir(), ".codex"),
  });
  return [
    path.join(codexHome, "config.toml"),
    getStaveLocalMcpManifestPath(),
  ];
}

async function getMcpConfigFingerprint(paths: readonly string[]) {
  const entries = await Promise.all(
    paths.map(async (filePath) => {
      try {
        const metadata = await stat(filePath);
        return `${filePath}:${metadata.mtimeMs}:${metadata.size}`;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return `${filePath}:missing`;
        }
        // The provider will surface a native config error when it loads an
        // unreadable file. Do not reset a healthy session for a stat failure.
        return `${filePath}:unavailable`;
      }
    }),
  );
  return entries.join("|");
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
      (fingerprint) => {
        const changed =
          scope.fingerprint !== null && scope.fingerprint !== fingerprint;
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
