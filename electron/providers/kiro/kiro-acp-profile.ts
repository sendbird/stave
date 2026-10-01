import { inspectOptionalProviderTooling } from "../optional-provider-tooling";
import { toolingAllowsProviderReads } from "../../../src/lib/providers/provider-readiness";
import path from "node:path";
import { resolveBoundSecretEnv } from "../../main/browser/secret-service";
import {
  resolveAcpEmbeddedStaveLocalMcpServers,
  resolveAcpTurnMcpServers,
} from "../acp/acp-shared-mcp";
import {
  extractRuntimeVersion,
  resolveProviderRuntimeCapabilities,
} from "../../../src/lib/providers/runtime-capabilities";
import {
  streamAcpProviderTurn,
  type AcpProviderStreamTurnArgs,
} from "../acp/acp-provider-runtime";
import { buildKiroCliEnv, resolveKiroExecutablePath } from "../kiro-cli-env";
import { parsePositiveIntEnv } from "../runtime-shared";
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
  const toolingStatus = await inspectOptionalProviderTooling({
    providerId: "kiro",
    kiroBinaryPath: args.runtimeOptions?.kiroBinaryPath,
  });
  const available = toolingAllowsProviderReads(toolingStatus);
  const version = extractRuntimeVersion(toolingStatus.version ?? "");
  return {
    available,
    detail: toolingStatus.detail,
    toolingStatus,
    ...(version ? { version } : {}),
    capabilities: resolveProviderRuntimeCapabilities({
      providerId: "kiro",
      versionText: toolingStatus.version ?? "",
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
  const { servers: staveLocalMcpServers } =
    await resolveAcpEmbeddedStaveLocalMcpServers({
      turnGrants: args.staveTurnGrants,
    });
  const mcpServers = await resolveAcpTurnMcpServers({
    targetProvider: "kiro",
    cwd: runtimeCwd,
    env: { ...process.env, ...secretEnv },
    staveLocalMcpServers,
  });
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
