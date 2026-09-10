import { randomUUID } from "node:crypto";
import type { ProviderId } from "../providers/types";
import type { ProviderRuntimeOptions } from "../../src/lib/providers/provider.types";
import {
  buildClaudeCliEnv,
  buildCodexCliEnv,
  resolveClaudeCliAutoModeSupport,
  resolveClaudeCliExecutablePath,
  resolveCodexCliExecutablePath,
} from "../providers/cli-path-env";
import {
  buildCursorAgentEnv,
  resolveCursorAgentExecutablePath,
} from "../providers/cursor-cli-env";
import {
  buildKiroCliEnv,
  resolveKiroExecutablePath,
} from "../providers/kiro-cli-env";

/**
 * Which post-spawn discovery routine (if any) has to run to learn the native
 * session id, for CLIs that do not accept one up front.
 */
export type CliSessionNativeSessionDiscovery = "codex" | "kiro";

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
      return {
        ok: true,
        executablePath,
        commandArgs: [
          ...(claudeAutoModeSupported ? ["--enable-auto-mode"] : []),
          "--permission-mode",
          claudePermissionMode,
          ...(requestedNativeSessionId
            ? ["--resume", nativeSessionId]
            : ["--session-id", nativeSessionId]),
        ],
        env: buildClaudeCliEnv({ executablePath, cwd }),
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
      return {
        ok: true,
        executablePath,
        commandArgs: requestedNativeSessionId
          ? ["resume", requestedNativeSessionId]
          : undefined,
        env: buildCodexCliEnv({ executablePath, cwd }),
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
    default:
      return assertNeverProvider(providerId);
  }
}

function assertNeverProvider(providerId: never): never {
  throw new Error(
    `Unsupported CLI session provider: ${String(providerId)}. Add a launch spec in electron/host-service/cli-session-launch.ts (see docs/developer/adding-a-provider.md).`,
  );
}
