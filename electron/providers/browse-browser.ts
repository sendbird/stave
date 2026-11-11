import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { resolveExecutablePath, buildExecutableLookupEnv } from "./executable-path";
import { parseBrowseStatus, type BrowseConnectionStatus } from "../../src/lib/browse-status";
import { isRecord } from "./codex-app-server-json";
import type { CodexConfigOverrides } from "./codex-app-server-params";

export function resolveBrowseExecutable() {
  return resolveExecutablePath({
    absolutePathEnvVar: "STAVE_BROWSE_PATH",
    commandEnvVar: "STAVE_BROWSE_COMMAND",
    defaultCommand: "browse",
    extraPaths: [process.env.XDG_BIN_HOME || path.join(process.env.HOME || homedir(), ".local", "bin")],
  });
}

export function hasBrowseServer(servers: Record<string, unknown>) {
  return Object.entries(servers).some(([name, server]) => name === "browse" || (
    server !== null && typeof server === "object" && "command" in server &&
    typeof server.command === "string" && path.basename(server.command) === "browse"
  ));
}

export function attachBrowseClaudeServer<T>(args: {
  requested: boolean;
  backend?: string;
  servers: Record<string, T> | undefined;
  createServer: (executable: string) => T;
  resolveExecutable?: () => string | null;
}): Record<string, T> | undefined {
  if (!args.requested || args.backend !== "browse" || hasBrowseServer(args.servers ?? {})) return args.servers;
  const executable = (args.resolveExecutable ?? resolveBrowseExecutable)();
  return executable ? { ...args.servers, browse: args.createServer(executable) } : args.servers;
}

export async function resolveBrowseCodexOverrides(args: {
  requested: boolean;
  backend?: string;
  cwd: string;
  request: (method: string, params: unknown) => Promise<unknown>;
  resolveExecutable?: () => string | null;
}): Promise<CodexConfigOverrides> {
  if (!args.requested || args.backend !== "browse") return {};
  // A failed config read must not overwrite a user's own server.
  try {
    const response = await args.request("config/read", { cwd: args.cwd });
    if (!isRecord(response) || !isRecord(response.config)) return {};
    const servers = response.config.mcp_servers ?? response.config.mcpServers ?? {};
    if (!isRecord(servers) || hasBrowseServer(servers)) return {};
    const executable = (args.resolveExecutable ?? resolveBrowseExecutable)();
    return executable ? { "mcp_servers.browse.command": executable, "mcp_servers.browse.args": ["mcp"] } : {};
  } catch {
    return {};
  }
}

export async function checkBrowseConnection(): Promise<BrowseConnectionStatus> {
  const executable = resolveBrowseExecutable();
  if (!executable) return { installed: false, relay: "stopped", browsers: [] };
  return new Promise((resolve) => {
    execFile(executable, ["status", "--json"], {
      timeout: 5000, maxBuffer: 256 * 1024, env: buildExecutableLookupEnv(),
    }, (error, stdout) => {
      // A stopped relay exits nonzero but still writes a valid JSON status.
      const status = parseBrowseStatus(stdout);
      resolve(error && status.error ? { ...status, error: "status-failed" } : status);
    });
  });
}
