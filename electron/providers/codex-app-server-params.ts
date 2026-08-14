import { createHash } from "node:crypto";
import type { StreamTurnArgs } from "./types";
import {
  resolveCodexAppServerReasoningEffort,
  resolveEffectiveCodexApprovalPolicy,
  resolveEffectiveCodexFileAccessMode,
} from "../../src/lib/providers/codex-runtime-options";
import {
  buildCodexDeveloperInstructions,
  buildCodexPluginConfigOverrides,
  buildCodexWorkerConfigOverrides,
} from "./codex-runtime-config";
import { buildExecutableLookupEnv } from "./executable-path";
import { parseBooleanEnv } from "./runtime-shared";
import { buildProjectNvmShellConfigOverrides } from "../shared/project-node-env";
import { isRecord } from "./codex-app-server-json";

type CodexRequest = (
  method: string,
  params: unknown,
  options?: { timeoutMs?: number },
) => Promise<unknown>;

/**
 * A `thread/start` / `thread/resume` config override value.
 *
 * Codex splits an override KEY on `.` and uses each segment verbatim; it does
 * not parse TOML quoting. Nested tables therefore have to be expressed as a
 * nested VALUE — see `buildCodexMcpDisableConfigOverrides`.
 */
export type CodexConfigOverrideValue =
  string | boolean | number | { [key: string]: CodexConfigOverrideValue };

export type CodexConfigOverrides = Record<string, CodexConfigOverrideValue>;

function resolveFileAccessMode(args: {
  runtimeValue?: "read-only" | "workspace-write" | "danger-full-access";
  envValue?: string;
  planMode?: boolean;
  fallback: "read-only" | "workspace-write" | "danger-full-access";
}) {
  return resolveEffectiveCodexFileAccessMode({
    fileAccessMode: args.runtimeValue ?? args.envValue,
    planMode: args.planMode,
    fallback: args.fallback,
  });
}

function resolveApprovalPolicy(args: {
  runtimeValue?: "never" | "on-request" | "on-failure" | "untrusted";
  envValue?: string;
  planMode?: boolean;
  fallback?: "never" | "on-request" | "on-failure" | "untrusted";
}): "never" | "on-request" | "on-failure" | "untrusted" | undefined {
  const candidate = args.runtimeValue ?? args.envValue;
  if (
    candidate !== "never" &&
    candidate !== "on-request" &&
    candidate !== "on-failure" &&
    candidate !== "untrusted"
  ) {
    return args.fallback == null
      ? undefined
      : resolveEffectiveCodexApprovalPolicy({
          planMode: args.planMode,
          fallback: args.fallback,
        });
  }
  return resolveEffectiveCodexApprovalPolicy({
    approvalPolicy: candidate,
    planMode: args.planMode,
    fallback: args.fallback,
  });
}

export function buildCodexConfigOverrides(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  configOverrides?: CodexConfigOverrides;
  /**
   * Set for `secondary-read-only` turns. A secondary run must not delegate: it
   * is a bounded read-only analysis pass, and a worker would both escape that
   * budget and bill a second model. The Claude adapter gates Worker mode the
   * same way, so keep the two in step.
   */
  secondaryReadOnly?: boolean;
}) {
  const workerRuntimeOptions = args.secondaryReadOnly
    ? undefined
    : args.runtimeOptions;
  const config: CodexConfigOverrides = {
    ...buildCodexPluginConfigOverrides(),
    ...(args.cwd
      ? buildProjectNvmShellConfigOverrides({
          cwd: args.cwd,
          baseEnv: buildExecutableLookupEnv(),
        })
      : {}),
    // Pins the Worker-mode subagent. Empty when Worker mode is off or fails
    // semantic resolution, so the solo path stays byte-identical.
    ...buildCodexWorkerConfigOverrides({
      runtimeOptions: workerRuntimeOptions,
    }),
  };
  const planModeEnabled = args.runtimeOptions?.codexPlanMode === true;
  const reasoningEffort = resolveCodexAppServerReasoningEffort({
    reasoningEffort: args.runtimeOptions?.codexReasoningEffort,
  });
  const developerInstructions = buildCodexDeveloperInstructions({
    runtimeOptions: args.runtimeOptions,
    ...(args.secondaryReadOnly ? { secondaryReadOnly: true } : {}),
  });
  const summaryMode = args.runtimeOptions?.codexReasoningSummary;
  const supportsSummaries = args.runtimeOptions?.codexReasoningSummarySupport;
  const hasExplicitRawReasoningToggle = Object.prototype.hasOwnProperty.call(
    args.runtimeOptions ?? {},
    "codexShowRawReasoning",
  );

  if (developerInstructions) {
    config.developer_instructions = developerInstructions;
  }
  if (hasExplicitRawReasoningToggle) {
    config.show_raw_agent_reasoning = Boolean(
      args.runtimeOptions?.codexShowRawReasoning,
    );
  }
  if (summaryMode && summaryMode !== "auto") {
    config.model_reasoning_summary = summaryMode;
  }
  if (supportsSummaries === "enabled") {
    config.model_supports_reasoning_summaries = true;
  } else if (supportsSummaries === "disabled") {
    config.model_supports_reasoning_summaries = false;
  }
  if (typeof args.runtimeOptions?.codexNetworkAccess === "boolean") {
    config.network_access = args.runtimeOptions.codexNetworkAccess;
  }
  if (args.runtimeOptions?.codexWebSearch) {
    config.web_search = args.runtimeOptions.codexWebSearch;
  }
  const appToolApprovalMode = args.runtimeOptions?.codexAppToolApprovalMode;
  if (appToolApprovalMode && appToolApprovalMode !== "inherit") {
    config["apps._default.default_tools_approval_mode"] = appToolApprovalMode;
  }
  const codexFastMode = args.runtimeOptions?.codexFastMode;
  if (codexFastMode !== undefined) {
    config["features.fast_mode"] = codexFastMode;
  }
  if (planModeEnabled) {
    config.collaboration_mode_kind = "plan";
    if (reasoningEffort) {
      config.plan_mode_reasoning_effort = reasoningEffort;
    }
  }

  Object.assign(config, args.configOverrides);
  return Object.keys(config).length > 0 ? config : undefined;
}

export function buildSandboxPolicy(args: {
  cwd: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const planModeEnabled = args.runtimeOptions?.codexPlanMode === true;
  const networkAccessEnabled =
    args.runtimeOptions?.codexNetworkAccess ??
    parseBooleanEnv({
      value: process.env.STAVE_CODEX_NETWORK_ACCESS,
      fallback: false,
    });
  const fileAccessMode = resolveFileAccessMode({
    runtimeValue: args.runtimeOptions?.codexFileAccess,
    envValue: process.env.STAVE_CODEX_SANDBOX_MODE?.trim(),
    planMode: planModeEnabled,
    fallback: "workspace-write",
  });
  switch (fileAccessMode) {
    case "danger-full-access":
      return { type: "dangerFullAccess" as const };
    case "read-only":
      return {
        type: "readOnly" as const,
        networkAccess: networkAccessEnabled,
      };
    case "workspace-write":
    default:
      return {
        type: "workspaceWrite" as const,
        writableRoots: [args.cwd],
        networkAccess: networkAccessEnabled,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
  }
}

export function buildCodexTurnStartParams(args: {
  threadId: string;
  prompt: string;
  cwd: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  outputSchema?: unknown;
}) {
  const reasoningEffort = resolveCodexAppServerReasoningEffort({
    reasoningEffort: args.runtimeOptions?.codexReasoningEffort,
  });
  const approvalPolicy = resolveApprovalPolicy({
    runtimeValue: args.runtimeOptions?.codexApprovalPolicy,
    envValue: process.env.STAVE_CODEX_APPROVAL_POLICY?.trim(),
    planMode: args.runtimeOptions?.codexPlanMode === true,
    fallback: "untrusted",
  });

  return {
    threadId: args.threadId,
    input: [
      {
        type: "text" as const,
        text: args.prompt,
        text_elements: [],
      },
    ],
    cwd: args.cwd,
    ...(approvalPolicy ? { approvalPolicy } : {}),
    sandboxPolicy: buildSandboxPolicy({
      cwd: args.cwd,
      runtimeOptions: args.runtimeOptions,
    }),
    ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
    ...(reasoningEffort ? { effort: reasoningEffort } : {}),
    ...(args.runtimeOptions?.codexReasoningSummary
      ? { summary: args.runtimeOptions.codexReasoningSummary }
      : {}),
    ...(args.outputSchema ? { outputSchema: args.outputSchema } : {}),
  };
}

export function buildCodexThreadStartParams(args: {
  cwd: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  ephemeral?: boolean;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  approvalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
  configOverrides?: CodexConfigOverrides;
  isolated?: boolean;
  secondaryReadOnly?: boolean;
}) {
  const config = args.isolated
    ? {
        ...buildCodexPluginConfigOverrides(),
        network_access: false,
        web_search: "disabled",
        ...args.configOverrides,
      }
    : buildCodexConfigOverrides({
        cwd: args.cwd,
        runtimeOptions: args.runtimeOptions,
        configOverrides: args.configOverrides,
        ...(args.secondaryReadOnly ? { secondaryReadOnly: true } : {}),
      });

  return {
    ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
    cwd: args.cwd,
    ...(args.approvalPolicy ? { approvalPolicy: args.approvalPolicy } : {}),
    ...(args.sandbox ? { sandbox: args.sandbox } : {}),
    ...(config ? { config } : {}),
    ...(args.ephemeral !== undefined ? { ephemeral: args.ephemeral } : {}),
    ...(args.isolated
      ? {
          developerInstructions:
            "This is an isolated read-only analysis turn. Do not call tools, MCP servers, apps, plugins, shells, or subagents. Return only concise advice based on the supplied prompt.",
        }
      : {}),
  };
}

/**
 * Convert a resolved secret env map into Codex `shell_environment_policy.set.*`
 * config overrides. This is the same per-thread channel the NVM PATH shim uses,
 * so the values reach Codex's shell tool env without respawning the shared
 * app-server — and they travel over the JSON-RPC control channel, never as
 * model-visible text.
 */
export function buildSecretShellOverrides(
  secretEnv: Record<string, string>,
): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const [name, value] of Object.entries(secretEnv)) {
    overrides[`shell_environment_policy.set.${name}`] = value;
  }
  return overrides;
}

/**
 * Stable, non-reversible fingerprint of the bound-secret variable NAMES (never
 * values). Folded into the Codex thread key so that changing which secrets are
 * bound forces a fresh `thread/start` instead of resuming a thread provisioned
 * with the previous set. Rotating a value does not change names, so the resume
 * config-override forwarding covers that case; this backstops add/remove.
 */
export function buildBoundSecretFingerprint(secretEnv: Record<string, string>) {
  const names = Object.keys(secretEnv).sort();
  if (names.length === 0) {
    return "none";
  }
  return createHash("sha1").update(names.join("\n")).digest("hex").slice(0, 12);
}

export function buildCodexThreadResumeParams(args: {
  threadId: string;
  cwd: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  configOverrides?: CodexConfigOverrides;
  secondaryReadOnly?: boolean;
}) {
  const config = buildCodexConfigOverrides({
    cwd: args.cwd,
    runtimeOptions: args.runtimeOptions,
    configOverrides: args.configOverrides,
    ...(args.secondaryReadOnly ? { secondaryReadOnly: true } : {}),
  });

  return {
    threadId: args.threadId,
    ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
    cwd: args.cwd,
    ...(config ? { config } : {}),
  };
}

/**
 * Turns off the named MCP servers for one thread.
 *
 * The disables travel as a single `mcp_servers` key whose value is a nested
 * table, never as `mcp_servers."<name>".enabled` dotted keys. Codex splits an
 * override key on `.` and takes each segment literally, so a quoted segment
 * addresses a server whose name really does contain quote characters — a table
 * with an `enabled` flag and no transport, which makes Codex reject the entire
 * configuration:
 *
 *     failed to load configuration: invalid transport in `mcp_servers."slack"`
 *
 * Values, by contrast, are parsed as data, so every name — including one with a
 * `.` in it — addresses the entry it names.
 */
export function buildCodexMcpDisableConfigOverrides(
  serverNames: string[],
): CodexConfigOverrides {
  const servers: Record<string, CodexConfigOverrideValue> = {};
  for (const name of serverNames) {
    servers[name] = { enabled: false };
  }
  return Object.keys(servers).length > 0 ? { mcp_servers: servers } : {};
}

function readCodexCatalogServerNames(response: unknown) {
  const data = isRecord(response) ? response.data : undefined;
  if (!Array.isArray(data)) {
    throw new Error("Codex returned an invalid MCP server catalog.");
  }
  return data.map((server) => {
    const name = isRecord(server) ? server.name : undefined;
    if (typeof name !== "string" || !name.trim()) {
      throw new Error("Codex returned an invalid MCP server catalog.");
    }
    return name.trim();
  });
}

function readCodexConfiguredServerNames(response: unknown) {
  const config = isRecord(response) ? response.config : undefined;
  if (!isRecord(config)) {
    throw new Error("Codex returned an unreadable configuration.");
  }
  const servers = isRecord(config.mcp_servers)
    ? config.mcp_servers
    : isRecord(config.mcpServers)
      ? config.mcpServers
      : {};
  return new Set(Object.keys(servers));
}

/**
 * Config overrides that strip an isolated thread of everything MCP can reach.
 *
 * Two origins need two mechanisms. Servers declared under `mcp_servers` are
 * switched off by name. Servers Codex registers itself — the `codex_apps`
 * plugin runtime — have no `mcp_servers` entry, so naming one would *create* a
 * transport-less table and fail config load; the `apps` feature is turned off
 * instead, which also takes `read_mcp_resource`, `list_mcp_resources`, and
 * `request_plugin_install` out of the thread's tool set.
 *
 * Fails closed. Running with weaker isolation than the caller was promised is
 * worse than not running at all.
 */
export async function resolveCodexIsolationConfigOverrides(args: {
  request: CodexRequest;
  cwd?: string;
}): Promise<CodexConfigOverrides> {
  const reachable = readCodexCatalogServerNames(
    await args.request("mcpServerStatus/list", {}),
  );
  const configured = readCodexConfiguredServerNames(
    await args.request("config/read", {
      ...(args.cwd ? { cwd: args.cwd } : {}),
    }),
  );
  return {
    "features.apps": false,
    ...buildCodexMcpDisableConfigOverrides(
      reachable.filter((name) => configured.has(name)),
    ),
  };
}

export function buildCodexSecondaryServerRequestDenial(method: string) {
  switch (method) {
    case "item/commandExecution/requestApproval":
    case "item/fileChange/requestApproval":
    case "applyPatchApproval":
    case "execCommandApproval":
      return { decision: "decline" as const };
    case "item/permissions/requestApproval":
      return { permissions: {}, scope: "turn" as const };
    case "item/tool/requestUserInput":
      return { answers: {} };
    case "mcpServer/elicitation/request":
      return { action: "decline" as const };
    case "item/tool/call":
      return {};
    default:
      return null;
  }
}

export function resolveCodexSecondaryRuntimeOptions(args: {
  enabled: boolean;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): StreamTurnArgs["runtimeOptions"] {
  return args.enabled
    ? {
        ...args.runtimeOptions,
        codexResumeThreadId: undefined,
        codexAutoApproveStaveLocalMcpTools: undefined,
        codexApprovalPolicy: "never",
        codexFileAccess: "read-only",
        codexNetworkAccess: false,
        codexWebSearch: "disabled",
        codexShowRawReasoning: false,
        codexPlanMode: false,
      }
    : args.runtimeOptions;
}

export async function resolveCodexSecondaryConfigOverrides(
  request: CodexRequest,
  cwd?: string,
): Promise<CodexConfigOverrides> {
  return {
    developer_instructions:
      "This is an isolated secondary read-only analysis turn. Use only local read-only inspection. Do not use MCP, web, network access, approvals, or file mutation.",
    ...(await resolveCodexIsolationConfigOverrides({ request, cwd })),
  };
}

export async function deleteCodexSecondaryThread(args: {
  enabled: boolean;
  threadId: string;
  request: CodexRequest;
}) {
  if (!args.enabled) {
    return;
  }
  await args
    .request("thread/delete", { threadId: args.threadId }, { timeoutMs: 5_000 })
    .catch(() => {});
}
