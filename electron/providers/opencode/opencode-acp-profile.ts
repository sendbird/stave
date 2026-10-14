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
import { resolveOpenCodeVersionSupport } from "./opencode-version";

const OPENCODE_APPROVAL_TIMEOUT_DEFAULT_MS = 45 * 60 * 1000;
const OPENCODE_CONFIG_CONTENT_ENV = "OPENCODE_CONFIG_CONTENT";
/** OpenCode's primary agent; Stave turns always run it. */
export const OPENCODE_BUILD_AGENT = "build";
/**
 * Built-in agents a Stave turn can reach: the primary agents selectable as a
 * session mode and the subagents `build` delegates to. A permission rule a
 * user sets on one of these agents in their own OpenCode config outranks the
 * global rule, so Stave repeats its rule on each of them.
 */
const OPENCODE_BUILT_IN_AGENTS = ["build", "plan", "general", "explore"] as const;

type OpenCodeRuntimeOptions = NonNullable<StreamTurnArgs["runtimeOptions"]>;
type PermissionRules = Record<string, unknown>;

/** `opencode acp` has no approval or effort flags; both travel over ACP and env. */
export function buildOpenCodeAcpCommandArgs() {
  return ["acp"];
}

/**
 * The permission rules Stave adds for a turn, or null when it adds none.
 *
 * `manual` asks before every tool call (`"*": "ask"`); `denyEdits` removes
 * OpenCode's file edit tools. `auto` adds nothing: OpenCode keeps the user's
 * own rules, including `deny`, and Stave answers whatever OpenCode asks.
 */
export function buildOpenCodePermissionRules(args: {
  approvalMode?: OpenCodeRuntimeOptions["opencodeApprovalMode"];
  denyEdits?: boolean;
}): PermissionRules | null {
  const rules: PermissionRules = {
    ...(args.approvalMode !== "auto" ? { "*": "ask" } : {}),
    ...(args.denyEdits ? { edit: "deny" } : {}),
  };
  return Object.keys(rules).length > 0 ? rules : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * OpenCode evaluates permission rules last match wins, and its config layers
 * merge objects key by key. Stave's keys are removed from the existing rules
 * and appended so they come last; rules for other tools stay in place.
 */
function appendPermissionRules(existing: unknown, rules: PermissionRules) {
  const base = asRecord(existing) ?? {};
  const kept = Object.fromEntries(
    Object.entries(base).filter(([key]) => !(key in rules)),
  );
  return { ...kept, ...rules };
}

/**
 * The `OPENCODE_CONFIG_CONTENT` value for a turn, merged over the value
 * already in the environment. OpenCode applies this inline config over the
 * global and project config, so the rules hold even when a project
 * `opencode.json` allows a tool. Returns undefined when Stave adds no rules,
 * so the inherited value passes through untouched.
 */
export function buildOpenCodeConfigContent(args: {
  rules: PermissionRules | null;
  existing?: string;
}): string | undefined {
  if (!args.rules) {
    return undefined;
  }
  let base: Record<string, unknown> = {};
  if (args.existing?.trim()) {
    try {
      base = asRecord(JSON.parse(args.existing)) ?? {};
    } catch {
      // OpenCode would reject the malformed value anyway; Stave's rules win.
      base = {};
    }
  }
  const agents = { ...(asRecord(base.agent) ?? {}) };
  for (const name of OPENCODE_BUILT_IN_AGENTS) {
    const agent = asRecord(agents[name]) ?? {};
    agents[name] = {
      ...agent,
      permission: appendPermissionRules(agent.permission, args.rules),
    };
  }
  return JSON.stringify({
    ...base,
    permission: appendPermissionRules(base.permission, args.rules),
    agent: agents,
  });
}

export function buildOpenCodeTurnEnv(args: {
  executablePath: string;
  runtimeOptions?: OpenCodeRuntimeOptions;
  baseEnv?: Record<string, string | undefined>;
}) {
  const env = buildOpenCodeCliEnv({
    executablePath: args.executablePath,
    baseEnv: args.baseEnv,
  });
  const configContent = buildOpenCodeConfigContent({
    rules: buildOpenCodePermissionRules({
      approvalMode: args.runtimeOptions?.opencodeApprovalMode,
      denyEdits: args.runtimeOptions?.opencodeDenyEdits,
    }),
    existing: env[OPENCODE_CONFIG_CONTENT_ENV],
  });
  if (configContent !== undefined) {
    env[OPENCODE_CONFIG_CONTENT_ENV] = configContent;
  }
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
  const { servers: staveLocalMcpServers } =
    await resolveAcpEmbeddedStaveLocalMcpServers({
      turnGrants: args.staveTurnGrants,
    });
  const mcpServers = await resolveAcpTurnMcpServers({
    targetProvider: "opencode",
    cwd: runtimeCwd,
    env: { ...process.env, ...secretEnv },
    staveLocalMcpServers,
  });
  const effort = args.runtimeOptions?.opencodeEffort?.trim();
  return streamAcpProviderTurn({
    turn: args,
    profile: {
      providerId: "opencode",
      displayName: "OpenCode",
      command: executablePath,
      commandArgs: args.acpArgsForTest ?? buildOpenCodeAcpCommandArgs(),
      cwd: runtimeCwd,
      env: buildOpenCodeTurnEnv({
        executablePath,
        runtimeOptions: args.runtimeOptions,
        baseEnv: secretEnv,
      }),
      resumeSessionId: args.runtimeOptions?.opencodeResumeSessionId,
      requestedModel: args.runtimeOptions?.model?.trim() || "auto",
      modelSetter: "config-option",
      sessionConfigOptions: [
        { configId: "mode", value: OPENCODE_BUILD_AGENT, beforeModel: true },
        ...(effort ? [{ configId: "effort", value: effort }] : []),
      ],
      permissionPolicy:
        args.runtimeOptions?.opencodeApprovalMode === "auto"
          ? "auto-approve"
          : "interactive",
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
