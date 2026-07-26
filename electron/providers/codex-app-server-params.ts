import type { StreamTurnArgs } from "./types";
import {
  resolveCodexAppServerReasoningEffort,
  resolveEffectiveCodexApprovalPolicy,
  resolveEffectiveCodexFileAccessMode,
} from "../../src/lib/providers/codex-runtime-options";
import {
  buildCodexDeveloperInstructions,
  buildCodexPluginConfigOverrides,
} from "./codex-runtime-config";
import { parseBooleanEnv } from "./runtime-shared";

type CodexRequest = (
  method: string,
  params: unknown,
  options?: { timeoutMs?: number },
) => Promise<unknown>;

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
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  configOverrides?: Record<string, string | boolean>;
}) {
  const config: Record<string, string | boolean> = {
    ...buildCodexPluginConfigOverrides(),
  };
  const planModeEnabled = args.runtimeOptions?.codexPlanMode === true;
  const reasoningEffort = resolveCodexAppServerReasoningEffort({
    reasoningEffort: args.runtimeOptions?.codexReasoningEffort,
  });
  const developerInstructions = buildCodexDeveloperInstructions({
    runtimeOptions: args.runtimeOptions,
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
  configOverrides?: Record<string, string | boolean>;
  isolated?: boolean;
}) {
  const config = args.isolated
    ? {
        ...buildCodexPluginConfigOverrides(),
        network_access: false,
        web_search: "disabled",
        ...args.configOverrides,
      }
    : buildCodexConfigOverrides({
        runtimeOptions: args.runtimeOptions,
        configOverrides: args.configOverrides,
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

export function buildCodexThreadResumeParams(args: {
  threadId: string;
  cwd: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const config = buildCodexConfigOverrides({
    runtimeOptions: args.runtimeOptions,
  });

  return {
    threadId: args.threadId,
    ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
    cwd: args.cwd,
    ...(config ? { config } : {}),
  };
}

export function buildCodexMcpDisableConfigOverrides(
  servers: Array<{ name?: unknown }>,
) {
  const config: Record<string, boolean> = {};
  for (const server of servers) {
    const name = typeof server.name === "string" ? server.name.trim() : "";
    if (name) {
      config[`mcp_servers.${JSON.stringify(name)}.enabled`] = false;
    }
  }
  return config;
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
) {
  const response = (await request("mcpServerStatus/list", {})) as {
    data?: unknown;
  };
  if (
    !Array.isArray(response.data) ||
    response.data.some(
      (server) =>
        !server ||
        typeof server !== "object" ||
        Array.isArray(server) ||
        typeof (server as { name?: unknown }).name !== "string" ||
        !(server as { name: string }).name.trim(),
    )
  ) {
    throw new Error("Codex returned an invalid MCP server catalog.");
  }
  return {
    developer_instructions:
      "This is an isolated secondary read-only analysis turn. Use only local read-only inspection. Do not use MCP, web, network access, approvals, or file mutation.",
    ...buildCodexMcpDisableConfigOverrides(response.data),
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
