import type { PromptInputRuntimeStatusItem } from "@/components/ai-elements/prompt-input-runtime-bar";
import type { PromptInputGoalStatus } from "@/components/ai-elements/prompt-input-goal-status";
import { resolveEffectiveCodexFileAccessMode } from "@/lib/providers/codex-runtime-options";
import { listCodexReasoningEffortsForModel } from "@/lib/providers/model-catalog";
import type {
  ProviderGoalSnapshot,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  CLAUDE_PERMISSION_MODE_OPTIONS,
  CLAUDE_THINKING_OPTIONS,
  CLAUDE_EFFORT_OPTIONS,
  CODEX_APPROVAL_POLICY_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  CODEX_REASONING_SUMMARY_OPTIONS,
  CODEX_REASONING_SUPPORT_OPTIONS,
  CODEX_WEB_SEARCH_OPTIONS,
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
  /**
   * Effective Advisor pair for the next turn, or "Off". Provider-neutral: the
   * Advisor can be either provider regardless of which one runs the turn.
   */
  advisorSummary: string;
  workerSummary: string;
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
}

interface ChatInputGoalStatusArgs {
  providerGoal?: ProviderGoalSnapshot | null;
}

/**
 * Deliberately narrow: only options that can actually change the native
 * slash-command catalog belong here.
 *
 * The catalog probe spawns a real `claude` subprocess, which connects every
 * configured MCP server — including remote OAuth connectors like Figma/Slack
 * that take seconds to handshake. Model, effort, thinking mode, permission
 * mode and the sandbox flags cannot change `supportedCommands()`, so including
 * them only caused that subprocess (and every connector handshake) to be
 * respawned on unrelated runtime toggles, competing with the real turn's
 * connector handshakes right around the first message of a session.
 */
type CommandCatalogRuntimeArgs = Pick<
  ChatInputRuntimeArgs,
  "activeProvider" | "claudeSettingSources" | "claudeBinaryPath"
>;

const CLAUDE_EFFORT_CYCLE_ORDER = CLAUDE_EFFORT_OPTIONS.map(
  (option) => option.value,
);
// Legacy "minimal" is intentionally absent — cycling from a persisted
// "minimal" value falls back to the first entry ("low").
const CODEX_EFFORT_CYCLE_ORDER = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
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

/**
 * Cycles the Codex reasoning effort. When `model` is provided, the cycle is
 * scoped to that model's supported efforts (e.g. GPT-5.6 Luna skips "ultra")
 * so clicking through the toolbar never lands on a value the model rejects.
 */
export function cycleCodexEffortValue(
  current: AppSettings["codexReasoningEffort"],
  model?: string,
) {
  const order = model
    ? listCodexReasoningEffortsForModel({ model })
    : CODEX_EFFORT_CYCLE_ORDER;
  return cycleOptionValue({
    current,
    order,
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
    const compact =
      value % 1000 === 0
        ? String(value / 1000)
        : (value / 1000).toFixed(1).replace(/\.0$/, "");
    return `${compact}k`;
  }
  return String(Math.floor(value));
}

function getGoalProgressPercent(goal: ProviderGoalSnapshot) {
  if (typeof goal.tokenBudget !== "number" || goal.tokenBudget <= 0) {
    return null;
  }
  const rawPercent = (goal.tokensUsed / goal.tokenBudget) * 100;
  if (!Number.isFinite(rawPercent)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(rawPercent)));
}

function formatGoalTokenProgressValue(goal: ProviderGoalSnapshot) {
  const used = formatGoalTokenCount(goal.tokensUsed);
  const progressPercent = getGoalProgressPercent(goal);
  if (typeof goal.tokenBudget === "number" && goal.tokenBudget > 0) {
    const budget = formatGoalTokenCount(goal.tokenBudget);
    return progressPercent == null
      ? `${used} / ${budget} tokens`
      : `${used} / ${budget} tokens (${progressPercent}%)`;
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

function normalizeGoalObjectiveValue(objective: string) {
  return objective.replace(/\s+/g, " ").trim();
}

function formatRuntimeEnumValue(value: string) {
  return formatTitleCaseRuntimeValue(
    value.replace(/([a-z0-9])([A-Z])/g, "$1-$2"),
  );
}

export function buildChatInputGoalStatus(
  args: ChatInputGoalStatusArgs,
): PromptInputGoalStatus | null {
  const goal = args.providerGoal;
  if (!goal) {
    return null;
  }

  const tone =
    goal.status === "complete"
      ? "success"
      : goal.status === "active"
        ? "default"
        : "warning";

  return {
    statusLabel: formatGoalStatusValue(goal.status),
    objective: normalizeGoalObjectiveValue(goal.objective),
    tokenLabel: formatGoalTokenProgressValue(goal),
    elapsedLabel: `${formatGoalElapsedValue(goal.timeUsedSeconds)} elapsed`,
    progressPercent: getGoalProgressPercent(goal),
    tone,
  };
}

function buildAdvisorRuntimeStatusItem(
  advisorSummary: string,
): PromptInputRuntimeStatusItem {
  return {
    id: "advisor",
    label: "Advisor",
    value: advisorSummary,
  };
}

function buildWorkerRuntimeStatusItem(
  workerSummary: string,
): PromptInputRuntimeStatusItem {
  return {
    id: "worker",
    label: "Worker",
    value: workerSummary,
  };
}

export function buildChatInputRuntimeStatusItems(
  args: ChatInputRuntimeArgs,
): PromptInputRuntimeStatusItem[] {
  if (args.activeProvider === "claude-code") {
    return [
      {
        id: "permissions",
        label: "Permissions",
        value: formatRuntimeEnumValue(
          findOptionLabel(
            CLAUDE_PERMISSION_MODE_OPTIONS,
            args.claudePermissionMode,
          ),
        ),
        tone:
          args.claudePermissionMode === "bypassPermissions"
            ? "warning"
            : "default",
      },
      {
        id: "sandbox",
        label: "Sandbox",
        value: args.claudeSandboxEnabled ? "Enabled" : "Disabled",
        tone: args.claudeSandboxEnabled ? "default" : "warning",
      },
      {
        id: "unsandboxed",
        label: "Unsandboxed",
        value: args.claudeAllowUnsandboxedCommands ? "On" : "Off",
        tone: args.claudeAllowUnsandboxedCommands ? "warning" : "default",
      },
      {
        id: "dangerous-skip",
        label: "Permission Bypass",
        value: args.claudeAllowDangerouslySkipPermissions ? "On" : "Off",
        tone: args.claudeAllowDangerouslySkipPermissions
          ? "warning"
          : "default",
      },
      {
        id: "setting-sources",
        label: "Settings",
        value: formatClaudeSettingSources(args.claudeSettingSources),
      },
      {
        id: "effort",
        label: "Effort",
        value: findOptionLabel(CLAUDE_EFFORT_OPTIONS, args.claudeEffort),
      },
      {
        id: "thinking",
        label: "Thinking",
        value: findOptionLabel(
          CLAUDE_THINKING_OPTIONS,
          args.claudeThinkingMode,
        ),
      },
      {
        id: "timeout",
        label: "Timeout",
        value: formatProviderTimeoutLabel(args.providerTimeoutMs),
      },
      {
        id: "task-budget",
        label: "Task Budget",
        value: formatTokenBudget(args.claudeTaskBudgetTokens),
        tone: args.claudeTaskBudgetTokens > 0 ? "warning" : "default",
      },
      {
        id: "progress-summaries",
        label: "Progress Summaries",
        value: args.claudeAgentProgressSummaries ? "On" : "Off",
      },
      buildAdvisorRuntimeStatusItem(args.advisorSummary),
    buildWorkerRuntimeStatusItem(args.workerSummary),
      buildWorkerRuntimeStatusItem(args.workerSummary),
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
      id: "approvals",
      label: "Approvals",
      value: formatRuntimeEnumValue(
        findOptionLabel(
          CODEX_APPROVAL_POLICY_OPTIONS,
          args.codexApprovalPolicy,
        ),
      ),
      tone: args.codexApprovalPolicy === "never" ? "warning" : "default",
    },
    {
      id: "web-search",
      label: "Web Search",
      value: findOptionLabel(CODEX_WEB_SEARCH_OPTIONS, args.codexWebSearch),
    },
    {
      id: "effort",
      label: "Effort",
      value: findOptionLabel(CODEX_EFFORT_OPTIONS, args.codexReasoningEffort),
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
      id: "timeout",
      label: "Timeout",
      value: formatProviderTimeoutLabel(args.providerTimeoutMs),
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
    buildAdvisorRuntimeStatusItem(args.advisorSummary),
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
    claudeSettingSources: args.claudeSettingSources,
    claudeBinaryPath: args.claudeBinaryPath || undefined,
  };
}
