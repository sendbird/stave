import path from "node:path";
import { inspectOptionalProviderTooling } from "../optional-provider-tooling";
import { toolingAllowsProviderReads } from "../../../src/lib/providers/provider-readiness";
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
import {
  buildOpenCodeCliEnv,
  resolveOpenCodeExecutablePath,
} from "../opencode-cli-env";
import { parsePositiveIntEnv, runExecutableProbe } from "../runtime-shared";
import type { BridgeEvent, StreamTurnArgs } from "../types";
import { OPENCODE_AUTHENTICATION_HELP } from "./opencode-auth";
import { rememberOpenCodeAcpSessionId } from "./opencode-session-registry";
import {
  OPENCODE_BUILD_AGENT,
  OPENCODE_CONFIG_CONTENT_ENV,
  OPENCODE_LOCAL_MCP_DENIED_TOOLS,
  OPENCODE_STAVE_MANUAL_AGENT_PREFIX,
  OPENCODE_STAVE_READ_ONLY_AGENT_PREFIX,
  OpenCodeConfigContentError,
  buildOpenCodeConfigContent,
  buildOpenCodePermissionRules,
  parseOpenCodeConfigContent,
  resolveOpenCodeTurnAgent,
} from "./opencode-turn-config";
import { resolveOpenCodeVersionSupport } from "./opencode-version";

const OPENCODE_APPROVAL_TIMEOUT_DEFAULT_MS = 45 * 60 * 1000;

type OpenCodeRuntimeOptions = NonNullable<StreamTurnArgs["runtimeOptions"]>;

export {
  OPENCODE_BUILD_AGENT,
  OPENCODE_LOCAL_MCP_DENIED_TOOLS,
  OPENCODE_STAVE_MANUAL_AGENT_PREFIX,
  OPENCODE_STAVE_READ_ONLY_AGENT_PREFIX,
  buildOpenCodeConfigContent,
  buildOpenCodePermissionRules,
  parseOpenCodeConfigContent,
  resolveOpenCodeTurnAgent,
};

/** `opencode acp` has no approval or effort flags; both travel over ACP and env. */
export function buildOpenCodeAcpCommandArgs() {
  return ["acp"];
}

/**
 * The process env for a turn. Throws `OpenCodeConfigContentError` when the
 * inherited inline config cannot be read, so the caller fails the turn
 * instead of replacing that config.
 */
export function buildOpenCodeTurnEnv(args: {
  executablePath: string;
  runtimeOptions?: OpenCodeRuntimeOptions;
  /** The turn's agent, from `resolveOpenCodeTurnAgent`. */
  agent: string;
  baseEnv?: Record<string, string | undefined>;
}) {
  const env = buildOpenCodeCliEnv({
    executablePath: args.executablePath,
    baseEnv: args.baseEnv,
  });
  env[OPENCODE_CONFIG_CONTENT_ENV] = buildOpenCodeConfigContent({
    approvalMode: args.runtimeOptions?.opencodeApprovalMode,
    denyEdits: args.runtimeOptions?.opencodeDenyEdits,
    agent: args.agent,
    existing: env[OPENCODE_CONFIG_CONTENT_ENV],
  });
  return env;
}

/** Turns the agent's stderr into an actionable message when it names a cause. */
export function interpretOpenCodeFailure(error: Error, stderr: string) {
  const combined = `${error.message}\n${stderr}`;
  if (/authentication required|provider authentication|unauthorized|invalid api key/i.test(combined)) {
    return `${error.message}. ${OPENCODE_AUTHENTICATION_HELP}`;
  }
  if (/free tier can only be used from within OpenCode/i.test(combined)) {
    return `${error.message} Choose a model from a provider connected in OpenCode. ${OPENCODE_AUTHENTICATION_HELP}`;
  }
  return null;
}

function unavailableEvents(message: string): BridgeEvent[] {
  return [
    { type: "error", message, recoverable: true },
    { type: "done", stop_reason: "runtime_failure" },
  ];
}

export async function describeOpenCodeAvailability(
  args: { runtimeOptions?: StreamTurnArgs["runtimeOptions"] } = {},
) {
  const toolingStatus = await inspectOptionalProviderTooling({
    providerId: "opencode",
    opencodeBinaryPath: args.runtimeOptions?.opencodeBinaryPath,
  });
  const available = toolingAllowsProviderReads(toolingStatus);
  const version = extractRuntimeVersion(toolingStatus.version ?? "");
  return {
    available,
    detail: toolingStatus.detail,
    toolingStatus,
    ...(version ? { version } : {}),
    capabilities: resolveProviderRuntimeCapabilities({
      providerId: "opencode",
      versionText: toolingStatus.version ?? "",
      available,
    }),
  };
}

export async function streamOpenCodeWithAcp(
  args: AcpProviderStreamTurnArgs & {
    /** Test-only subprocess arguments for the provider fixture. */
    acpArgsForTest?: readonly string[];
    /** Test-only version text; production reads `opencode --version`. */
    versionTextForTest?: string;
    /** Test-only executable lookup result; production resolves the path. */
    executablePathForTest?: string;
  },
): Promise<BridgeEvent[]> {
  const fail = (message: string) => {
    const events = unavailableEvents(message);
    events.forEach((event) => args.onEvent?.(event));
    return events;
  };
  if (args.executionPolicy || args.unattendedAutomation) {
    return fail("OpenCode is available only for interactive primary task turns.");
  }

  const executablePath =
    args.executablePathForTest ??
    resolveOpenCodeExecutablePath({
      explicitPath: args.runtimeOptions?.opencodeBinaryPath,
    });
  if (!executablePath) {
    return fail(
      "OpenCode CLI was not found. Install it or configure the OpenCode CLI path in Settings.",
    );
  }

  const runtimeCwd =
    args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const versionText =
    args.versionTextForTest ??
    (
      await runExecutableProbe({
        executablePath,
        commandArgs: ["--version"],
        cwd: runtimeCwd,
        env: buildOpenCodeCliEnv({ executablePath }),
      })
    ).text;
  const support = resolveOpenCodeVersionSupport(versionText);
  if (!support.supported) {
    return fail(support.reason);
  }

  const secretEnv = args.runtimeOptions?.boundSecretIds?.length
    ? await resolveBoundSecretEnv({ ids: args.runtimeOptions.boundSecretIds })
    : {};
  // One name per turn: the config defines it and the session selects it.
  const agent = resolveOpenCodeTurnAgent({
    approvalMode: args.runtimeOptions?.opencodeApprovalMode,
    denyEdits: args.runtimeOptions?.opencodeDenyEdits,
  });
  let env: Record<string, string | undefined>;
  try {
    env = buildOpenCodeTurnEnv({
      executablePath,
      runtimeOptions: args.runtimeOptions,
      agent,
      baseEnv: secretEnv,
    });
  } catch (error) {
    if (error instanceof OpenCodeConfigContentError) {
      return fail(error.message);
    }
    throw error;
  }
  const { servers: staveLocalMcpServers } =
    await resolveAcpEmbeddedStaveLocalMcpServers({
      turnGrants: args.staveTurnGrants,
      deniedToolNames: OPENCODE_LOCAL_MCP_DENIED_TOOLS,
    });
  const mcpServers = await resolveAcpTurnMcpServers({
    targetProvider: "opencode",
    cwd: runtimeCwd,
    env: { ...process.env, ...secretEnv },
    staveLocalMcpServers,
  });
  const resumeSessionId = args.runtimeOptions?.opencodeResumeSessionId;
  if (resumeSessionId) {
    rememberOpenCodeAcpSessionId(resumeSessionId);
  }
  const effort = args.runtimeOptions?.opencodeEffort?.trim();
  return streamAcpProviderTurn({
    turn: {
      ...args,
      // Standalone CLI discovery must never adopt a session an ACP turn made.
      onEvent: (event) => {
        if (event.type === "provider_session") {
          rememberOpenCodeAcpSessionId(event.nativeSessionId);
        }
        args.onEvent?.(event);
      },
    },
    profile: {
      providerId: "opencode",
      displayName: "OpenCode",
      command: executablePath,
      commandArgs: args.acpArgsForTest ?? buildOpenCodeAcpCommandArgs(),
      cwd: runtimeCwd,
      env,
      resumeSessionId,
      requestedModel: args.runtimeOptions?.model?.trim() || "auto",
      modelSetter: "config-option",
      sessionConfigOptions: [
        // A Stave agent carries the turn's whole permission ceiling, so a
        // session that does not offer it must not fall back to `build`.
        {
          configId: "mode",
          value: agent,
          beforeModel: true,
          required: agent !== OPENCODE_BUILD_AGENT,
        },
        ...(effort ? [{ configId: "effort", value: effort }] : []),
      ],
      permissionPolicy: agent === OPENCODE_BUILD_AGENT ? "auto-approve" : "interactive",
      promptParameterName: "prompt",
      supportsMidTurnSteering: false,
      authenticationHelp: OPENCODE_AUTHENTICATION_HELP,
      interpretFailure: interpretOpenCodeFailure,
      decisionTimeoutMs: parsePositiveIntEnv({
        value: process.env.STAVE_OPENCODE_APPROVAL_TIMEOUT_MS,
        fallback: OPENCODE_APPROVAL_TIMEOUT_DEFAULT_MS,
      }),
      ...(mcpServers.length > 0 ? { mcpServers } : {}),
    },
  });
}
