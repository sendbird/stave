import type { PromptInputRuntimeStatusItem } from "@/components/ai-elements/prompt-input-runtime-bar";
import { resolveEffectiveCodexFileAccessMode } from "@/lib/providers/codex-runtime-options";
import type {
  ProviderGoalSnapshot,
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
  providerGoal?: ProviderGoalSnapshot | null;
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

function formatGoalStatusValue(status: ProviderGoalSnapshot["status"]) {
  switch (status) {
    case "usageLimited":
      return "usage limited";
    case "budgetLimited":
      return "budget limited";
    default:
      return status;
  }
}

function formatGoalTokenCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  if (value >= 1000) {
    const compact = value % 1000 === 0
      ? String(value / 1000)
      : (value / 1000).toFixed(1).replace(/\.0$/, "");
    return `${compact}k`;
  }
  return String(Math.floor(value));
}

function formatGoalTokenValue(goal: ProviderGoalSnapshot) {
  const used = formatGoalTokenCount(goal.tokensUsed);
  if (typeof goal.tokenBudget === "number" && goal.tokenBudget > 0) {
    return `${used}/${formatGoalTokenCount(goal.tokenBudget)} tokens`;
  }
  return `${used} tokens`;
}

function formatGoalElapsedValue(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0s";
  }
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function formatGoalObjectiveValue(objective: string) {
  const normalized = objective.replace(/\s+/g, " ").trim();
  if (normalized.length <= 48) {
    return normalized;
  }
  return `${normalized.slice(0, 45).trimEnd()}...`;
}

export function formatProviderGoalRuntimeValue(goal: ProviderGoalSnapshot) {
  return [
    formatGoalStatusValue(goal.status),
    formatGoalTokenValue(goal),
    formatGoalElapsedValue(goal.timeUsedSeconds),
    formatGoalObjectiveValue(goal.objective),
  ].join(" | ");
}

export function buildChatInputRuntimeStatusItems(
  args: ChatInputRuntimeArgs,
): PromptInputRuntimeStatusItem[] {
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
    ...(args.providerGoal
      ? [
          {
            id: "goal",
            label: "Goal",
            value: formatProviderGoalRuntimeValue(args.providerGoal),
            tone:
              args.providerGoal.status === "active"
              || args.providerGoal.status === "complete"
                ? "default"
                : "warning",
          } satisfies PromptInputRuntimeStatusItem,
        ]
      : []),
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
