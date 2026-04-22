import type { PromptInputRuntimeStatusItem } from "@/components/ai-elements/prompt-input-runtime-bar";
import { resolveEffectiveCodexFileAccessMode } from "@/lib/providers/codex-runtime-options";
import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  CODEX_REASONING_SUMMARY_OPTIONS,
  CODEX_REASONING_SUPPORT_OPTIONS,
  formatClaudeSettingSources,
  findOptionLabel,
  formatProviderTimeoutLabel,
  formatShortRuntimePath,
  formatTokenBudget,
  formatTitleCaseRuntimeValue,
} from "@/lib/providers/runtime-option-contract";
import type { AppSettings } from "@/store/app.store";

interface ChatInputRuntimeArgs {
  activeProvider: ProviderId;
  providerTimeoutMs: number;
  claudePermissionMode: AppSettings["claudePermissionMode"];
  claudePermissionModeBeforePlan: AppSettings["claudePermissionModeBeforePlan"];
  claudeAllowDangerouslySkipPermissions: boolean;
  claudeSandboxEnabled: boolean;
  claudeAllowUnsandboxedCommands: boolean;
  claudeTaskBudgetTokens: number;
  claudeSettingSources: AppSettings["claudeSettingSources"];
  claudeEffort: AppSettings["claudeEffort"];
  claudeThinkingMode: AppSettings["claudeThinkingMode"];
  claudeAgentProgressSummaries: boolean;
  claudeBinaryPath: string;
  codexFileAccess: AppSettings["codexFileAccess"];
  codexNetworkAccess: boolean;
  codexApprovalPolicy: AppSettings["codexApprovalPolicy"];
  codexReasoningEffort: AppSettings["codexReasoningEffort"];
  codexWebSearch: AppSettings["codexWebSearch"];
  codexShowRawReasoning: boolean;
  codexReasoningSummary: AppSettings["codexReasoningSummary"];
  codexReasoningSummarySupport: AppSettings["codexReasoningSummarySupport"];
  codexFastMode: boolean;
  codexPlanMode: boolean;
  codexBinaryPath: string;
  staveAutoFastMode: boolean;
  staveAutoOrchestrationMode: AppSettings["staveAutoOrchestrationMode"];
  staveAutoMaxSubtasks: number;
  staveAutoAllowCrossProviderWorkers: boolean;
  staveAutoMaxParallelSubtasks: number;
}

type CommandCatalogRuntimeArgs = Pick<
  ChatInputRuntimeArgs,
  | "activeProvider"
  | "claudePermissionMode"
  | "claudeAllowDangerouslySkipPermissions"
  | "claudeSandboxEnabled"
  | "claudeAllowUnsandboxedCommands"
  | "claudeSettingSources"
  | "claudeEffort"
  | "claudeThinkingMode"
  | "claudeAgentProgressSummaries"
  | "claudeBinaryPath"
> & {
  model: string;
};

const CLAUDE_EFFORT_CYCLE_ORDER = CLAUDE_EFFORT_OPTIONS.map(
  (option) => option.value,
);
const CODEX_EFFORT_CYCLE_ORDER = [
  "low",
  "medium",
  "high",
  "xhigh",
  "minimal",
] as const satisfies readonly AppSettings["codexReasoningEffort"][];

function cycleOptionValue<T extends string>(args: {
  current: T;
  order: readonly T[];
}) {
  const index = args.order.indexOf(args.current);
  if (index < 0) {
    return args.order[0];
  }
  return args.order[(index + 1) % args.order.length] ?? args.order[0];
}

export function cycleClaudeEffortValue(current: AppSettings["claudeEffort"]) {
  return cycleOptionValue({
    current,
    order: CLAUDE_EFFORT_CYCLE_ORDER,
  });
}

export function cycleCodexEffortValue(
  current: AppSettings["codexReasoningEffort"],
) {
  return cycleOptionValue({
    current,
    order: CODEX_EFFORT_CYCLE_ORDER,
  });
}

export function buildChatInputRuntimeStatusItems(
  args: ChatInputRuntimeArgs,
): PromptInputRuntimeStatusItem[] {
  if (args.activeProvider === "stave") {
    return [];
  }

  if (args.activeProvider === "claude-code") {
    return [
      {
        id: "timeout",
        label: "Timeout",
        value: formatProviderTimeoutLabel(args.providerTimeoutMs),
      },
      {
        id: "sandbox",
        label: "Sandbox",
        value: args.claudeSandboxEnabled ? "Enabled" : "Disabled",
      },
      {
        id: "unsandboxed",
        label: "Unsandboxed",
        value: args.claudeAllowUnsandboxedCommands ? "On" : "Off",
      },
      {
        id: "setting-sources",
        label: "Settings",
        value: formatClaudeSettingSources(args.claudeSettingSources),
      },
      {
        id: "task-budget",
        label: "Task Budget",
        value: formatTokenBudget(args.claudeTaskBudgetTokens),
        tone: args.claudeTaskBudgetTokens > 0 ? "warning" : "default",
      },
      {
        id: "dangerous-skip",
        label: "Dangerous Skip",
        value: args.claudeAllowDangerouslySkipPermissions ? "On" : "Off",
      },
      {
        id: "progress-summaries",
        label: "Progress Summaries",
        value: args.claudeAgentProgressSummaries ? "On" : "Off",
      },
      ...(args.claudeBinaryPath.trim()
        ? [
            {
              id: "claude-binary",
              label: "Claude Binary",
              value: formatShortRuntimePath(args.claudeBinaryPath),
            } satisfies PromptInputRuntimeStatusItem,
          ]
        : []),
    ];
  }

  const effectiveCodexFileAccess = resolveEffectiveCodexFileAccessMode({
    fileAccessMode: args.codexFileAccess,
    planMode: args.codexPlanMode,
    fallback: "workspace-write",
  });

  return [
    {
      id: "timeout",
      label: "Timeout",
      value: formatProviderTimeoutLabel(args.providerTimeoutMs),
    },
    {
      id: "sandbox",
      label: "Files",
      value: formatTitleCaseRuntimeValue(effectiveCodexFileAccess),
      tone:
        effectiveCodexFileAccess === "danger-full-access"
          ? "warning"
          : "default",
    },
    {
      id: "network",
      label: "Network",
      value: args.codexNetworkAccess ? "On" : "Off",
    },
    {
      id: "raw-reasoning",
      label: "Raw Reasoning",
      value: args.codexShowRawReasoning ? "On" : "Off",
    },
    {
      id: "summary",
      label: "Summary",
      value: findOptionLabel(
        CODEX_REASONING_SUMMARY_OPTIONS,
        args.codexReasoningSummary,
      ),
    },
    {
      id: "summary-support",
      label: "Summary Support",
      value: findOptionLabel(
        CODEX_REASONING_SUPPORT_OPTIONS,
        args.codexReasoningSummarySupport,
      ),
    },
    {
      id: "plan-mode",
      label: "Planning",
      value: args.codexPlanMode ? "On" : "Off",
      tone: args.codexPlanMode ? "warning" : "default",
    },
    {
      id: "fast-mode",
      label: "Fast Mode",
      value: args.codexFastMode ? "On" : "Off",
      tone: args.codexFastMode ? "warning" : "default",
    },
    ...(args.codexBinaryPath.trim()
      ? [
          {
            id: "codex-binary",
            label: "Codex Binary",
            value: formatShortRuntimePath(args.codexBinaryPath),
          } satisfies PromptInputRuntimeStatusItem,
        ]
      : []),
  ];
}

export function buildCommandCatalogRuntimeOptions(
  args: CommandCatalogRuntimeArgs,
): ProviderRuntimeOptions | undefined {
  if (args.activeProvider !== "claude-code") {
    return undefined;
  }

  return {
    model: args.model,
    claudePermissionMode: args.claudePermissionMode,
    claudeAllowDangerouslySkipPermissions:
      args.claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled: args.claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands: args.claudeAllowUnsandboxedCommands,
    claudeSettingSources: args.claudeSettingSources,
    claudeEffort: args.claudeEffort,
    claudeThinkingMode: args.claudeThinkingMode,
    claudeAgentProgressSummaries: args.claudeAgentProgressSummaries,
    claudeBinaryPath: args.claudeBinaryPath || undefined,
  };
}
