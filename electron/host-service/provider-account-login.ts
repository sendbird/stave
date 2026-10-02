import { createHash } from "node:crypto";
import { currentApiConnection } from "../provider-accounts/gateway-runtime";
import {
  ProviderAccountLoginArgsSchema,
  type ProviderAccountLoginArgs,
} from "../../src/lib/providers/provider-accounts";
import { buildTerminalSessionSlotKey } from "../../src/lib/terminal/types";
import { workspaceExecutionGate } from "../shared/workspace-execution-gate";
import {
  buildClaudeCliEnv,
  buildCodexCliEnv,
  resolveClaudeCliExecutablePath,
  resolveCodexCliExecutablePath,
} from "../providers/cli-path-env";
import type { HostTerminalCreateSessionResult } from "./protocol";

interface LoginTerminalDependencies {
  getSessionBySlotKey: (
    slotKey: string,
  ) => { sessionId: string; session: { closing: boolean } } | null;
  createPtySession: (args: {
    workspaceId: string;
    command: string;
    commandArgs: string[];
    env: Record<string, string>;
    cwd: string;
    cols?: number;
    rows?: number;
    deliveryMode: "poll";
    persistScreenState: false;
    slotKey: string;
  }) => string;
}

/** Dedicated native login only: no conversation resume, model query, or credential read. */
export function createProviderAccountLoginSession(
  input: ProviderAccountLoginArgs,
  deps: LoginTerminalDependencies,
): HostTerminalCreateSessionResult {
  const parsed = ProviderAccountLoginArgsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, stderr: "Invalid provider account login request." };
  const args = parsed.data;
  try {
    if (currentApiConnection(args.providerId, args.profileId))
      return { ok: false, stderr: "API connections use a saved API key. Native sign-in is not available." };
    workspaceExecutionGate.assertAllowed({
      workspaceId: args.workspaceId,
      cwd: args.workspacePath,
    });
    const executablePath =
      args.providerId === "claude-code"
        ? resolveClaudeCliExecutablePath({ explicitPath: args.binaryPath })
        : resolveCodexCliExecutablePath({ explicitPath: args.binaryPath });
    if (!executablePath)
      return {
        ok: false,
        stderr:
          "Provider executable not found. Check the CLI installation or configured binary path.",
      };
    const env =
      args.providerId === "claude-code"
        ? buildClaudeCliEnv({
            executablePath,
            accountProfileId: args.profileId,
            cwd: args.workspacePath,
          })
        : buildCodexCliEnv({
            executablePath,
            accountProfileId: args.profileId,
            cwd: args.workspacePath,
          });
    // Include resolved config and executable identity. Never attach B to A's login PTY.
    const identity = createHash("sha256")
      .update(
        JSON.stringify([
          args.providerId,
          args.profileId,
          executablePath,
          env.CLAUDE_CONFIG_DIR ?? "",
          env.CODEX_HOME ?? "",
        ]),
      )
      .digest("hex");
    const slotKey = buildTerminalSessionSlotKey({
      workspaceId: args.workspaceId,
      surface: "cli",
      tabId: `account-login-${identity}`,
    });
    // Resolution precedes reuse: a removed or invalid profile cannot open an old slot.
    const existing = deps.getSessionBySlotKey(slotKey);
    if (existing && !existing.session.closing)
      return { ok: true, sessionId: existing.sessionId };
    const sessionId = deps.createPtySession({
      workspaceId: args.workspaceId,
      command: executablePath,
      commandArgs:
        args.providerId === "claude-code" ? ["auth", "login"] : ["login"],
      cwd: args.workspacePath,
      cols: args.cols,
      rows: args.rows,
      // Buffer output until the renderer attaches the existing terminal surface.
      deliveryMode: "poll",
      persistScreenState: false,
      slotKey,
      env: Object.fromEntries(
        Object.entries({
          ...env,
          STAVE_WORKSPACE_PATH: args.workspacePath,
          STAVE_TASK_ID: "",
          STAVE_TASK_TITLE: "",
        }).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    });
    return { ok: true, sessionId };
  } catch (error) {
    return {
      ok: false,
      stderr:
        error instanceof Error
          ? error.message
          : "Native login could not be started.",
    };
  }
}
