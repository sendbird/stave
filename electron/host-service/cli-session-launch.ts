import { randomBytes, randomUUID } from "node:crypto";
import { currentClaudeGateway, validateClaudeGatewayModel } from "../provider-accounts/gateway-runtime";
import { buildCodexApiConnectionCliArgs } from "../providers/codex-api-connection";
import type { ProviderId } from "../providers/types";
import type { ProviderRuntimeOptions } from "../../src/lib/providers/provider.types";
import {
  buildClaudeCliEnv,
  buildCodexCliEnv,
  resolveClaudeCliAutoModeSupport,
  resolveClaudeCliExecutablePath,
  resolveCodexCliExecutablePath,
} from "../providers/cli-path-env";
import { resolveSharedOnlyClaudeMcpServersSync } from "../providers/claude-mcp-config";
import { resolveSharedClaudeMcpStateFile } from "../provider-accounts/shared-mcp";
import {
  buildCursorAgentEnv,
  resolveCursorAgentExecutablePath,
} from "../providers/cursor-cli-env";
import {
  buildKiroCliEnv,
  resolveKiroExecutablePath,
} from "../providers/kiro-cli-env";
import {
  buildOpenCodeCliEnv,
  readOpenCodeMajorVersion,
  resolveOpenCodeExecutablePath,
} from "../providers/opencode-cli-env";

/**
 * Which post-spawn discovery routine (if any) has to run to learn the native
 * session id, for CLIs that do not accept one up front.
 */
export type CliSessionNativeSessionDiscovery = "codex" | "kiro" | "opencode";

export interface CliSessionLaunchSpec {
  ok: true;
  executablePath: string;
  /** `undefined` means "spawn the CLI with no arguments". */
  commandArgs?: string[];
  env: Record<string, string | undefined>;
  /** Present only when the id is known before spawn (Claude) or was resumed. */
  nativeSessionId?: string;
  discovery?: CliSessionNativeSessionDiscovery;
}

export interface CliSessionLaunchFailure {
  ok: false;
  stderr: string;
}

export type CliSessionLaunchResult =
  CliSessionLaunchSpec | CliSessionLaunchFailure;

/**
 * Every `ProviderId` needs a branch here — see
 * `docs/developer/adding-a-provider.md`. The `assertNever` default makes a new
 * provider id a compile error rather than a silent fallback to Codex.
 */
export function buildCliSessionLaunch(args: {
  providerId: ProviderId;
  cwd: string;
  requestedNativeSessionId: string;
  runtimeOptions?: ProviderRuntimeOptions;
}): CliSessionLaunchResult {
  const { providerId, cwd, requestedNativeSessionId, runtimeOptions } = args;

  switch (providerId) {
    case "claude-code": {
      const gateway = currentClaudeGateway(runtimeOptions?.claudeAccountProfileId);
      const gatewayModel = gateway ? validateClaudeGatewayModel(runtimeOptions?.model, runtimeOptions?.claudeAccountProfileId) : undefined;
      const executablePath = resolveClaudeCliExecutablePath({
        explicitPath: runtimeOptions?.claudeBinaryPath,
      });
      if (!executablePath) {
        return {
          ok: false,
          stderr:
            "Claude executable not found. Check Claude CLI installation and auth.",
        };
      }
      const nativeSessionId = requestedNativeSessionId || randomUUID();
      const requestedClaudePermissionMode =
        runtimeOptions?.claudePermissionMode ?? "auto";
      const claudeAutoModeSupported = resolveClaudeCliAutoModeSupport({
        executablePath,
      });
      const claudePermissionMode =
        requestedClaudePermissionMode === "auto" && !claudeAutoModeSupported
          ? "default"
          : requestedClaudePermissionMode;
      const env = buildClaudeCliEnv({ executablePath, cwd, accountProfileId: runtimeOptions?.claudeAccountProfileId });
      // The CLI reads the account's own MCP files; servers the account takes
      // from System default's `.claude.json` have to be handed over here.
      const sharedMcpServers = resolveSharedOnlyClaudeMcpServersSync({
        cwd,
        claudeConfigDir: env.CLAUDE_CONFIG_DIR,
        sharedStateFilePath: resolveSharedClaudeMcpStateFile({ claudeConfigDir: env.CLAUDE_CONFIG_DIR }),
      });
      return {
        ok: true,
        executablePath,
        commandArgs: [
          ...(gatewayModel ? ["--model", gatewayModel, "--setting-sources", ""] : []),
          ...(Object.keys(sharedMcpServers).length > 0
            ? ["--mcp-config", JSON.stringify({ mcpServers: sharedMcpServers })]
            : []),
          ...(claudeAutoModeSupported ? ["--enable-auto-mode"] : []),
          "--permission-mode",
          claudePermissionMode,
          ...(requestedNativeSessionId
            ? ["--resume", nativeSessionId]
            : ["--session-id", nativeSessionId]),
        ],
        env,
        nativeSessionId,
      };
    }
    case "codex": {
      const executablePath = resolveCodexCliExecutablePath({
        explicitPath: runtimeOptions?.codexBinaryPath,
      });
      if (!executablePath) {
        return {
          ok: false,
          stderr:
            "Codex executable not found. Check Codex CLI installation or the configured binary path.",
        };
      }
      // An API connection routes through config overrides; the key reaches the CLI through its env.
      const connectionArgs = buildCodexApiConnectionCliArgs(runtimeOptions?.model, runtimeOptions?.codexAccountProfileId);
      return {
        ok: true,
        executablePath,
        commandArgs: requestedNativeSessionId
          ? ["resume", ...connectionArgs, requestedNativeSessionId]
          : connectionArgs.length > 0 ? connectionArgs : undefined,
        env: buildCodexCliEnv({ executablePath, cwd, accountProfileId: runtimeOptions?.codexAccountProfileId }),
        ...(requestedNativeSessionId
          ? { nativeSessionId: requestedNativeSessionId }
          : { discovery: "codex" as const }),
      };
    }
    case "cursor": {
      const executablePath = resolveCursorAgentExecutablePath({
        explicitPath: runtimeOptions?.cursorBinaryPath,
      });
      if (!executablePath) {
        return {
          ok: false,
          stderr:
            "Cursor agent executable not found. Check Cursor CLI installation or the configured binary path.",
        };
      }
      return {
        ok: true,
        executablePath,
        commandArgs: requestedNativeSessionId
          ? ["--resume", requestedNativeSessionId]
          : undefined,
        env: buildCursorAgentEnv({ executablePath }),
        ...(requestedNativeSessionId
          ? { nativeSessionId: requestedNativeSessionId }
          : {}),
      };
    }
    case "kiro": {
      const executablePath = resolveKiroExecutablePath({
        explicitPath: runtimeOptions?.kiroBinaryPath,
      });
      if (!executablePath) {
        return {
          ok: false,
          stderr:
            "Kiro CLI executable not found. Check Kiro CLI installation or the configured binary path.",
        };
      }
      return {
        ok: true,
        executablePath,
        commandArgs: requestedNativeSessionId
          ? ["chat", "--resume-id", requestedNativeSessionId]
          : ["chat"],
        env: buildKiroCliEnv({ executablePath }),
        ...(requestedNativeSessionId
          ? { nativeSessionId: requestedNativeSessionId }
          : { discovery: "kiro" as const }),
      };
    }
    case "opencode": {
      const executablePath = resolveOpenCodeExecutablePath({
        explicitPath: runtimeOptions?.opencodeBinaryPath,
      });
      if (!executablePath) {
        return {
          ok: false,
          stderr:
            "OpenCode executable not found. Check OpenCode installation or the configured binary path.",
        };
      }
      const env = buildOpenCodeCliEnv({ executablePath });
      if (requestedNativeSessionId) {
        return {
          ok: true,
          executablePath,
          commandArgs: ["--session", requestedNativeSessionId],
          env,
          nativeSessionId: requestedNativeSessionId,
        };
      }
      // 2.x creates a session under an id given with `--session`, so the tab
      // owns its id from the start. 1.x refuses an unknown id, so a new tab
      // starts the TUI bare and the host infers the id only when exactly one
      // tab could own the new session.
      if ((readOpenCodeMajorVersion({ executablePath, env }) ?? 0) >= 2) {
        const nativeSessionId = createOpenCodeSessionId();
        return {
          ok: true,
          executablePath,
          commandArgs: ["--session", nativeSessionId],
          env,
          nativeSessionId,
        };
      }
      return {
        ok: true,
        executablePath,
        env,
        discovery: "opencode" as const,
      };
    }
    default:
      return assertNeverProvider(providerId);
  }
}

/** `ses_` plus 26 lowercase alphanumerics: the shape OpenCode 2.x accepts for `--session`. */
export function createOpenCodeSessionId() {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = randomBytes(26);
  let suffix = "";
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `ses_${suffix}`;
}

function assertNeverProvider(providerId: never): never {
  throw new Error(
    `Unsupported CLI session provider: ${String(providerId)}. Add a launch spec in electron/host-service/cli-session-launch.ts (see docs/developer/adding-a-provider.md).`,
  );
}
