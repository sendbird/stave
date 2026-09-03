import path from "node:path";
import type {
  CursorMcpOauthLoginResponse,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import {
  buildCursorAgentEnv,
  resolveCursorAgentExecutablePath,
} from "./cursor-cli-env";
import { sanitizeMcpDiagnosticText } from "./mcp-config-management-shared";
import { runExecutableProbe } from "./runtime-shared";

const DEFAULT_CURSOR_MCP_LOGIN_TIMEOUT_MS = 10 * 60_000;

type CursorMcpLoginRunner = typeof runExecutableProbe;

export function createCursorMcpOauthLogin(args: {
  run?: CursorMcpLoginRunner;
  resolveExecutable?: typeof resolveCursorAgentExecutablePath;
} = {}) {
  const run = args.run ?? runExecutableProbe;
  const resolveExecutable =
    args.resolveExecutable ?? resolveCursorAgentExecutablePath;

  return async function startCursorMcpOauthLogin(loginArgs: {
    name: string;
    cwd?: string;
    timeoutSecs?: number;
    runtimeOptions?: ProviderRuntimeOptions;
  }): Promise<CursorMcpOauthLoginResponse> {
    const name = loginArgs.name.trim();
    if (!name) {
      return { ok: false, detail: "Cursor MCP server name is required." };
    }
    const executablePath = resolveExecutable({
      explicitPath: loginArgs.runtimeOptions?.cursorBinaryPath,
    });
    if (!executablePath) {
      return {
        ok: false,
        detail:
          "Cursor Agent was not found. Configure its executable path in Settings > Providers > Cursor.",
      };
    }
    const cwd = path.resolve(loginArgs.cwd?.trim() || process.cwd());
    const timeoutMs = loginArgs.timeoutSecs
      ? Math.max(1_000, loginArgs.timeoutSecs * 1_000)
      : DEFAULT_CURSOR_MCP_LOGIN_TIMEOUT_MS;
    const result = await run({
      executablePath,
      commandArgs: ["mcp", "login", name],
      cwd,
      env: buildCursorAgentEnv({ executablePath }),
      timeoutMs,
      maxBytes: 32 * 1024,
    });
    if (result.status === 0) {
      return {
        ok: true,
        detail: `Cursor authenticated the ${name} MCP server. New Cursor/Grok tasks will load it from Cursor's native configuration.`,
      };
    }
    const diagnostic = sanitizeMcpDiagnosticText(
      result.error ||
        result.stderr ||
        result.stdout ||
        (result.timedOut
          ? "Cursor MCP login timed out."
          : "Cursor MCP login failed."),
    );
    return {
      ok: false,
      detail: diagnostic || "Cursor MCP login failed.",
    };
  };
}

export const startCursorMcpOauthLogin = createCursorMcpOauthLogin();
