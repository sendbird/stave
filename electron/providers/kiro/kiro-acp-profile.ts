import path from "node:path";
import { resolveBoundSecretEnv } from "../../main/browser/secret-service";
import { resolveAcpStaveLocalMcpServers } from "../../main/stave-local-mcp-manifest";
import { resolveAcpTurnMcpServers } from "../acp/acp-shared-mcp";
import {
  createEmptyProviderRuntimeCapabilities,
  extractRuntimeVersion,
  resolveProviderRuntimeCapabilities,
} from "../../../src/lib/providers/runtime-capabilities";
import {
  streamAcpProviderTurn,
  type AcpProviderStreamTurnArgs,
} from "../acp/acp-provider-runtime";
import { buildKiroCliEnv, resolveKiroExecutablePath } from "../kiro-cli-env";
import { parsePositiveIntEnv, runExecutableProbe } from "../runtime-shared";
import type { BridgeEvent, StreamTurnArgs } from "../types";
import { createKiroExtensionRuntime } from "./kiro-acp-extensions";

const KIRO_APPROVAL_TIMEOUT_DEFAULT_MS = 45 * 60 * 1000;

/**
 * Builds the `kiro-cli` argument list for one ACP session.
 *
 * Approval autonomy is a process flag rather than an ACP parameter. Verified
 * against `kiro-cli 2.20.1`: `--trust-all-tools` stops every
 * `session/request_permission` from being sent.
 *
 * There is no Guided tier. `--trust-tools` accepts unknown tool names without
 * an error, so a partial-trust tier could silently trust nothing while
 * presenting as a middle ground.
 */
export function buildKiroAcpCommandArgs(
  effort: NonNullable<StreamTurnArgs["runtimeOptions"]>["kiroEffort"],
  approvalMode?: NonNullable<
    StreamTurnArgs["runtimeOptions"]
  >["kiroApprovalMode"],
) {
  return [
    "acp",
    "--effort",
    effort ?? "medium",
    ...(approvalMode === "auto" ? ["--trust-all-tools"] : []),
  ];
}

function unavailableEvents(message: string): BridgeEvent[] {
  return [
    { type: "error", message, recoverable: true },
    { type: "done", stop_reason: "runtime_failure" },
  ];
}

export async function describeKiroAvailability(
  args: { runtimeOptions?: StreamTurnArgs["runtimeOptions"] } = {},
) {
  const executablePath = resolveKiroExecutablePath({
    explicitPath: args.runtimeOptions?.kiroBinaryPath,
  });
  if (!executablePath) {
    return {
      available: false,
      detail:
        "Kiro CLI not found from runtime override, STAVE_KIRO_CLI_PATH, STAVE_KIRO_CLI_CMD, login-shell PATH, or home-bin candidates. Install Kiro CLI or configure its path.",
      capabilities: createEmptyProviderRuntimeCapabilities(),
    };
  }

  const env = buildKiroCliEnv({ executablePath });
  const [versionProbe, acpProbe, authProbe] = await Promise.all([
    runExecutableProbe({ executablePath, commandArgs: ["--version"], env }),
    runExecutableProbe({ executablePath, commandArgs: ["acp", "--help"], env }),
    runExecutableProbe({ executablePath, commandArgs: ["whoami"], env }),
  ]);
  const available =
    versionProbe.status === 0 &&
    acpProbe.status === 0 &&
    authProbe.status === 0;
  const version = extractRuntimeVersion(versionProbe.text);
  const detail = available
    ? `Resolved authenticated Kiro CLI: ${executablePath}`
    : authProbe.status !== 0
      ? "Kiro CLI is installed but not authenticated. Run `kiro-cli login` and retry."
      : acpProbe.status !== 0
        ? "Kiro CLI is installed but its ACP subcommand is unavailable. Update Kiro CLI and retry."
        : `Kiro CLI probe failed: ${executablePath}`;
  return {
    available,
    detail,
    ...(version ? { version } : {}),
    capabilities: resolveProviderRuntimeCapabilities({
      providerId: "kiro",
      versionText: versionProbe.text,
      available,
    }),
  };
}

export async function streamKiroWithAcp(
  args: AcpProviderStreamTurnArgs & {
    /** Test-only subprocess arguments for the provider fixture. */
    acpArgsForTest?: readonly string[];
  },
): Promise<BridgeEvent[]> {
  if (args.executionPolicy || args.unattendedAutomation) {
    const events = unavailableEvents(
      "Kiro is available only for interactive primary task turns.",
    );
    events.forEach((event) => args.onEvent?.(event));
    return events;
  }

  const executablePath = resolveKiroExecutablePath({
    explicitPath: args.runtimeOptions?.kiroBinaryPath,
  });
  if (!executablePath) {
    const events = unavailableEvents(
      "Kiro CLI was not found. Install it or configure the Kiro CLI path in Settings.",
    );
    events.forEach((event) => args.onEvent?.(event));
    return events;
  }

  const runtimeCwd =
    args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const secretEnv = args.runtimeOptions?.boundSecretIds?.length
    ? await resolveBoundSecretEnv({ ids: args.runtimeOptions.boundSecretIds })
    : {};
  const staveLocalMcpServers = args.staveLocalMcpToolNames?.length
    ? await resolveAcpStaveLocalMcpServers({
        allowedToolNames: args.staveLocalMcpToolNames,
      })
    : [];
  const mcpServers = await resolveAcpTurnMcpServers({
    cwd: runtimeCwd,
    env: { ...process.env, ...secretEnv },
    staveLocalMcpServers,
  });
  if (
    args.staveLocalMcpToolNames?.length &&
    staveLocalMcpServers.length === 0
  ) {
    args.onEvent?.({
      type: "error",
      message:
        "Worker mode is armed, but the Stave Local MCP server is unavailable. Start it in Settings and retry the turn.",
      recoverable: true,
    });
  }
  return streamAcpProviderTurn({
    turn: args,
    profile: {
      providerId: "kiro",
      displayName: "Kiro",
      command: executablePath,
      commandArgs:
        args.acpArgsForTest ??
        buildKiroAcpCommandArgs(
          args.runtimeOptions?.kiroEffort,
          args.runtimeOptions?.kiroApprovalMode,
        ),
      cwd: runtimeCwd,
      env: buildKiroCliEnv({ executablePath, baseEnv: secretEnv }),
      resumeSessionId: args.runtimeOptions?.kiroResumeSessionId,
      requestedModel: args.runtimeOptions?.model?.trim() || "auto",
      modelSetter: "legacy-set-model",
      promptParameterName: "prompt+content",
      supportsMidTurnSteering: true,
      authenticationHelp: "Run `kiro-cli login` if authentication has expired.",
      decisionTimeoutMs: parsePositiveIntEnv({
        value: process.env.STAVE_KIRO_APPROVAL_TIMEOUT_MS,
        fallback: KIRO_APPROVAL_TIMEOUT_DEFAULT_MS,
      }),
      ...(mcpServers.length > 0 ? { mcpServers } : {}),
      createExtensionRuntime: createKiroExtensionRuntime,
    },
  });
}

/** Same-task Worker lane. No secrets or nested MCP servers. */
export async function streamKiroWorkerWithAcp(args: {
  prompt: string;
  cwd: string;
  model: string;
  effort?: NonNullable<StreamTurnArgs["runtimeOptions"]>["kiroEffort"];
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  requestIdScope: string;
  resumeSessionId?: string;
  acpArgsForTest?: readonly string[];
  onEvent?: (event: BridgeEvent) => void;
  registerAbort?: (aborter: () => void) => void;
  registerApprovalResponder?: AcpProviderStreamTurnArgs["registerApprovalResponder"];
}) {
  const executablePath = resolveKiroExecutablePath({
    explicitPath: args.runtimeOptions?.kiroBinaryPath,
  });
  if (!executablePath) {
    return unavailableEvents("Kiro CLI was not found for the armed Worker.");
  }
  const runtimeCwd = path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  return streamAcpProviderTurn({
    turn: {
      providerId: "kiro",
      prompt: args.prompt,
      cwd: runtimeCwd,
      runtimeOptions: {
        model: args.model,
        ...(args.runtimeOptions?.kiroBinaryPath
          ? { kiroBinaryPath: args.runtimeOptions.kiroBinaryPath }
          : {}),
      },
      onEvent: args.onEvent,
      registerAbort: args.registerAbort,
      registerApprovalResponder: args.registerApprovalResponder,
    },
    profile: {
      providerId: "kiro",
      displayName: "Kiro Worker",
      command: executablePath,
      // Manual on purpose: a nested Worker must not inherit the primary turn's
      // blanket approval grant. Worker approvals surface in the parent UI.
      commandArgs:
        args.acpArgsForTest ?? buildKiroAcpCommandArgs(args.effort, "manual"),
      cwd: runtimeCwd,
      env: buildKiroCliEnv({ executablePath }),
      resumeSessionId: args.resumeSessionId,
      requestedModel: args.model.trim() || "auto",
      modelSetter: "legacy-set-model",
      promptParameterName: "prompt+content",
      authenticationHelp: "Run `kiro-cli login` if authentication has expired.",
      decisionTimeoutMs: parsePositiveIntEnv({
        value: process.env.STAVE_KIRO_APPROVAL_TIMEOUT_MS,
        fallback: KIRO_APPROVAL_TIMEOUT_DEFAULT_MS,
      }),
      requestIdScope: args.requestIdScope,
      createExtensionRuntime: createKiroExtensionRuntime,
    },
  });
}
