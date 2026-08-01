import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  ModelSelector,
} from "@/components/ai-elements/model-selector";
import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLAUDE_EFFORT_OPTIONS,
  CLAUDE_PERMISSION_MODE_OPTIONS,
  CLAUDE_THINKING_OPTIONS,
  CODEX_APPROVAL_POLICY_OPTIONS,
  CODEX_EFFORT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import {
  formatTrustedToolEntry,
  removeTrustedToolEntry,
} from "@/lib/providers/trusted-tools";
import {
  buildClaudeProviderModeSettingsPatch,
  buildCodexProviderModeSettingsPatch,
  CLAUDE_PROVIDER_MODE_PRESETS,
  CODEX_PROVIDER_MODE_PRESETS,
  detectClaudeProviderModePreset,
  detectCodexProviderModePreset,
  type ProviderModePresetDefinition,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import type {
  AdvisorEffort,
  AdvisorTarget,
  ClaudeSettingSource,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  ADVISOR_EFFORT_AUTO_VALUE,
  buildAdvisorEffortOptions,
  formatAdvisorEffortLabel,
  resolveAdvisorEffortSelection,
} from "@/components/ai-elements/prompt-input-advisor-mode.utils";
import {
  getDefaultModelForProvider,
  getProviderLabel,
  getSdkModelOptions,
  listCodexReasoningEffortsForModel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import {
  ADVISOR_SETTING_FIELD_ID,
  isAdvisorEffortClamped,
  listAdvisorEffortsForProvider,
  resolveAdvisorEffort,
} from "@/lib/providers/advisor";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { useAppStore } from "@/store/app.store";
import { resolvePromptDraftModelForProvider } from "@/store/prompt-draft-runtime";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  readInt,
  SectionStack,
  SettingsFieldGuide,
  SettingsCard,
  SwitchField,
  ToggleChipGroup,
} from "./settings-dialog.shared";
import {
  ClaudeBinaryPathCard,
  ClaudeRuntimeToolsCard,
  CodexBinaryPathCard,
} from "./settings-dialog-developer-section";
type ExplainedSelectOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  example?: string;
};

const CLAUDE_PERMISSION_MODE_HELP = [
  {
    value: "default",
    label: "default",
    description:
      "Use Claude's standard permission behavior without asking Stave to bias the mode.",
    example:
      "Pick this when you want the least opinionated baseline and do not need a special workflow.",
  },
  {
    value: "acceptEdits",
    label: "acceptEdits",
    description:
      "Good default for normal coding sessions where edits are expected but you still want guardrails.",
    example:
      "Use this for day-to-day feature work, bug fixes, and iterative patching.",
  },
  {
    value: "bypassPermissions",
    label: "bypassPermissions",
    description:
      "Most autonomous Claude path. Pair it carefully with permission-skipping controls.",
    example:
      "Use this only when you trust the task scope and want Claude to move with minimal interruption.",
  },
  {
    value: "plan",
    label: "plan",
    description:
      "Planning-only mode. Stave keeps plan turns separate so you can review strategy before implementation.",
    example:
      "Use this for architecture, investigation, or task breakdowns before writing code.",
  },
  {
    value: "dontAsk",
    label: "dontAsk",
    description:
      "Tell Claude not to stop for interactive permission questions during the turn.",
    example:
      "Useful for fast local workflows when you want fewer pauses but do not want plan mode.",
  },
  {
    value: "auto",
    label: "auto",
    description:
      "Let Claude choose the most appropriate permission behavior for the turn. Claude CLI sessions require Claude Code 2.1.71+ for this mode; older CLI builds fall back to `default`.",
    example:
      "Good when your workload shifts between analysis, coding, and light automation throughout the day.",
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["claudePermissionMode"]>
>[];

const CLAUDE_PLAN_MODE_APPROVAL_SCOPE_HELP = [
  {
    value: "strict",
    label: "Strict",
    description:
      "Only read-only built-ins (Read/Grep/Glob/…) and Stave workspace tools auto-run. Bash, subagents, and other MCP tools each prompt. Most interruptions.",
    example:
      "Pick this when you want to confirm every shell command and tool call during planning.",
  },
  {
    value: "bash",
    label: "Read-only Bash",
    description:
      "Also auto-runs Bash commands that don't mutate files or task state (git status, cat, ls, typecheck). Mutating commands stay hard-denied.",
    example:
      "Good when you mostly want quiet read-only inspection but keep subagents and MCP gated.",
  },
  {
    value: "bashAndTask",
    label: "Bash + Subagents",
    description:
      "Also auto-runs read-only Bash and lets Claude spawn subagents (Task) without a prompt. Subagent mutations are still hard-denied.",
    example: "Useful when planning fans out research across Explore subagents.",
  },
  {
    value: "bashTaskAndMcp",
    label: "Bash + Subagents + MCP reads",
    description:
      "Broadest. Also auto-runs read-only third-party / lens MCP tools (classified by name). Mutating-looking MCP tools still prompt. Closest to auto mode.",
    example:
      "Default. Fewest plan-mode interruptions while every mutation stays blocked.",
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["claudePlanModeApprovalScope"]>
>[];

const CLAUDE_THINKING_MODE_HELP = [
  {
    value: "adaptive",
    label: "Adaptive",
    description:
      "Claude decides when deeper thinking is worth the extra latency.",
    example:
      "Best default when some turns are simple and others need real analysis.",
  },
  {
    value: "enabled",
    label: "Enabled",
    description: "Always ask for explicit thinking, even on simpler prompts.",
    example:
      "Use this when you prioritize careful reasoning over response speed.",
  },
  {
    value: "disabled",
    label: "Disabled",
    description: "Prefer direct answers without extra thinking overhead.",
    example: "Useful for tiny edits, routing, or repetitive low-risk tasks.",
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["claudeThinkingMode"]>
>[];

const CLAUDE_EFFORT_HELP = [
  {
    value: "low",
    label: "Low",
    description: "Fastest and lightest reasoning budget.",
    example: "Good for short questions, quick rewrites, and simple code edits.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced reasoning depth for most day-to-day tasks.",
    example:
      "Use this as the default if you frequently switch between analysis and implementation.",
  },
  {
    value: "high",
    label: "High",
    description:
      "Spend more effort on difficult debugging, design, or review work.",
    example:
      "Useful for tricky bugs, architecture questions, or larger refactors.",
  },
  {
    value: "xhigh",
    label: "X-High",
    description:
      "Go deeper than `high` when the Claude model supports it, with a larger latency cost.",
    example:
      "Best for complex root-cause analysis or hard multi-step implementation planning.",
  },
  {
    value: "max",
    label: "Max",
    description: "Highest deliberation and the most latency.",
    example:
      "Reserve this for genuinely hard tasks where accuracy matters more than speed.",
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["claudeEffort"]>
>[];

const CLAUDE_SETTING_SOURCE_HELP = [
  {
    value: "project",
    label: "Project",
    description:
      "Load repo-level Claude settings such as `CLAUDE.md` and project-native slash commands.",
  },
  {
    value: "local",
    label: "Local",
    description:
      "Load machine-local or workspace-local Claude settings from the runtime environment.",
  },
  {
    value: "user",
    label: "User",
    description: "Load your user-wide Claude settings and personal defaults.",
  },
] as const satisfies ReadonlyArray<{
  value: ClaudeSettingSource;
  label: string;
  description: string;
}>;

const CODEX_FILE_ACCESS_HELP = [
  {
    value: "read-only",
    label: "read-only",
    description: "Read and inspect only. Codex should not mutate files.",
    example: "Use this for reviews, audits, repo exploration, or planning.",
  },
  {
    value: "workspace-write",
    label: "workspace-write",
    description: "Allow edits inside the current workspace and writable roots.",
    example:
      "Recommended App Server-style starting point for normal local work.",
  },
  {
    value: "danger-full-access",
    label: "danger-full-access",
    description:
      "Remove most filesystem restrictions and allow broad mutation.",
    example:
      "Use this only for trusted automation that truly needs unrestricted file access.",
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexFileAccess"]>
>[];

const CODEX_APPROVAL_POLICY_HELP = [
  {
    value: "untrusted",
    label: "untrusted",
    description:
      "Only pause for actions the runtime treats as untrusted or higher risk.",
    example:
      "Recommended App Server-style baseline when you want fewer routine approval pauses.",
  },
  {
    value: "never",
    label: "never",
    description: "Do not stop for approval prompts. Codex proceeds directly.",
    example:
      "Good for trusted local workflows when you want continuous execution.",
  },
  {
    value: "on-request",
    label: "on-request",
    description: "Pause when approval is needed and ask you to confirm.",
    example:
      "Use this when you want more explicit checkpoints than the default low-friction setup.",
  },
  {
    value: "on-failure",
    label: "on-failure",
    description:
      "Let Codex retry with approval only after an operation fails without it.",
    example:
      "Useful when you want low-friction execution but still want a recovery path for blocked commands.",
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]>
>[];

const CODEX_REASONING_EFFORT_HELP = [
  {
    value: "minimal",
    label: "Minimal",
    description: "Shortest reasoning path and the least latency.",
    example:
      "Use this for rote edits, quick file lookups, or tiny transformations.",
  },
  {
    value: "low",
    label: "Low",
    description: "Light reasoning for straightforward work.",
    example: "Good for small implementation tasks and direct answers.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced depth for everyday coding and debugging.",
    example: "Recommended default when task difficulty varies.",
  },
  {
    value: "high",
    label: "High",
    description:
      "More deliberate reasoning for harder or more ambiguous tasks.",
    example:
      "Use this for larger bug hunts, refactors, or multi-step design questions.",
  },
  {
    value: "xhigh",
    label: "X-High",
    description: "Deepest reasoning budget and the highest latency cost.",
    example:
      "Reserve this for genuinely complex work where you want Codex to think much longer.",
  },
  {
    value: "max",
    label: "Max",
    description:
      "Highest deliberation on the GPT-5.6 effort scale, above `xhigh`.",
    example:
      "Reserve this for hard multi-step implementation or debugging work where accuracy matters more than speed.",
  },
  {
    value: "ultra",
    label: "Ultra",
    description:
      "The deepest reasoning budget Codex offers and the highest latency cost. Not every model accepts this tier (e.g. GPT-5.6 Luna caps at `max`).",
    example:
      "Reserve this for the hardest frontier-model tasks where you want Codex to think as long as possible.",
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>
>[];

const CODEX_REASONING_SUMMARY_HELP = [
  {
    value: "auto",
    label: "Auto",
    description:
      "Let Codex decide whether and how much reasoning summary to return.",
    example:
      "Good default when you want Stave to adapt across different models.",
  },
  {
    value: "concise",
    label: "Concise",
    description: "Request a short summary of model-side reasoning.",
    example:
      "Useful when you want quick visibility without a lot of extra text.",
  },
  {
    value: "detailed",
    label: "Detailed",
    description:
      "Request a fuller reasoning summary when the model supports it.",
    example:
      "Use this when you care about understanding why Codex chose a path.",
  },
  {
    value: "none",
    label: "None",
    description: "Do not request a reasoning summary.",
    example: "Useful when you want the leanest possible UI output.",
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexReasoningSummary"]>
>[];

const CODEX_REASONING_SUPPORT_HELP = [
  {
    value: "auto",
    label: "Auto",
    description:
      "Let Stave and the Codex runtime infer whether reasoning summaries are supported.",
    example:
      "Start here unless you know a model is being detected incorrectly.",
  },
  {
    value: "enabled",
    label: "Enabled",
    description:
      "Force-enable reasoning summary support even if automatic detection misses it.",
    example:
      "Use this when a model supports summaries but the runtime does not infer it correctly.",
  },
  {
    value: "disabled",
    label: "Disabled",
    description: "Force-disable reasoning summary support.",
    example:
      "Use this if a model claims support but returns noisy or broken summary behavior.",
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexReasoningSummarySupport"]>
>[];

const CODEX_WEB_SEARCH_HELP = [
  {
    value: "cached",
    label: "Cached",
    description:
      "Allow search in a lower-volatility mode when cached results are available.",
    example:
      "Recommended default when you want some search help without always relying on live web access.",
  },
  {
    value: "disabled",
    label: "Disabled",
    description: "Do not let Codex use web search.",
    example:
      "Best when you want fully local reasoning or reproducible offline behavior.",
  },
  {
    value: "indexed",
    label: "Indexed",
    description:
      "Use Codex's indexed search corpus without requesting a live fetch for every query.",
    example:
      "Use this for broad documentation discovery when the selected Codex runtime is 0.142 or newer.",
  },
  {
    value: "live",
    label: "Live",
    description:
      "Allow live web search when the task needs current external information.",
    example:
      "Use this for latest docs, breaking API changes, or recent news-style facts.",
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexWebSearch"]>
>[];

const CODEX_APP_TOOL_APPROVAL_HELP = [
  {
    value: "inherit",
    label: "Inherit",
    description: "Keep the user's Codex config for App and MCP tool approvals.",
    example: "Use this when Codex config.toml is the source of truth.",
  },
  {
    value: "auto",
    label: "Auto",
    description: "Let Codex choose when an App or MCP tool needs approval.",
  },
  {
    value: "prompt",
    label: "Prompt",
    description: "Ask before every App or MCP tool call.",
  },
  {
    value: "writes",
    label: "Writes",
    description:
      "Ask only for tools not marked read-only by their tool annotation.",
    example:
      "This is an approval hint, not a filesystem or network sandbox boundary.",
  },
  {
    value: "approve",
    label: "Approve",
    description: "Approve App and MCP tool calls without prompting.",
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexAppToolApprovalMode"]>
>[];

function buildGuideItems<T extends string>(
  options: readonly ExplainedSelectOption<T>[],
) {
  return options.map((option) => ({
    label: option.label,
    description: option.description,
  }));
}

function buildGuideExamples<T extends string>(
  options: readonly ExplainedSelectOption<T>[],
) {
  return options
    .filter((option) => option.example)
    .map((option) => ({
      label: option.label,
      description: option.example ?? "",
    }));
}

function findExplainedOption<T extends string>(
  options: readonly ExplainedSelectOption<T>[],
  value: T,
) {
  return options.find((option) => option.value === value) ?? null;
}

function DescribedSelect<T extends string>(args: {
  value: T;
  options: readonly ExplainedSelectOption<T>[];
  onValueChange: (value: T) => void;
  triggerClassName?: string;
}) {
  const selected = findExplainedOption(args.options, args.value);
  const fallbackValue = args.options[0]?.value;
  const selectValue = selected?.value ?? fallbackValue;
  const triggerLabel = selected?.label ?? fallbackValue ?? args.value;

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(value) => args.onValueChange(value as T)}
      >
        <SelectTrigger
          className={
            args.triggerClassName ??
            "w-64 rounded-md border-border/80 bg-background"
          }
        >
          <SelectValue placeholder={triggerLabel} />
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          align="start"
          sideOffset={6}
          className={`${UI_LAYER_CLASS.popover} min-w-[var(--anchor-width)] max-w-sm bg-popover`}
        >
          {args.options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              label={option.label}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected ? (
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">{selected.label}:</span>{" "}
          {selected.description}
          {selected.example ? ` Example: ${selected.example}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function ProviderModePresetButtons(args: {
  presets: readonly ProviderModePresetDefinition[];
  activePresetId: ProviderModePresetId | null;
  onSelect: (presetId: ProviderModePresetId) => void;
}) {
  return (
    <ChoiceButtons
      columns={3}
      value={args.activePresetId ?? ""}
      onChange={(value) => args.onSelect(value as ProviderModePresetId)}
      options={args.presets.map((preset) => ({
        value: preset.id,
        label: preset.label,
        description: preset.description,
      }))}
    />
  );
}

export function ProvidersSection() {
  const [
    modelClaude,
    claudePermissionMode,
    claudePlanModeApprovalScope,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    claudeSandboxCredentialFiles,
    claudeSandboxCredentialEnvVars,
    claudeTaskBudgetTokens,
    advisorTarget,
    claudeSettingSources,
    claudeEffort,
    claudeThinkingMode,
    claudeAgentProgressSummaries,
    claudePromptSuggestions,
    claudeForwardSubagentText,
    claudeEnableFileCheckpointing,
    claudeForkSession,
    claudeStrictMcpConfig,
    claudeSkills,
    claudePluginPaths,
    claudeAgentName,
    claudeFallbackModel,
    claudeResumeSessionAt,
    codexFileAccess,
    codexNetworkAccess,
    codexApprovalPolicy,
    codexReasoningEffort,
    modelCodex,
    codexWebSearch,
    codexAppToolApprovalMode,
    codexShowRawReasoning,
    codexReasoningSummary,
    codexReasoningSummarySupport,
    codexFastMode,
    trustedTools,
    draftProvider,
    codexBinaryPath,
    activeTaskProvider,
    activeTaskModelOverride,
    claudeRuntimeCapabilities,
    codexRuntimeCapabilities,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelClaude,
          state.settings.claudePermissionMode,
          state.settings.claudePlanModeApprovalScope,
          state.settings.claudeAllowDangerouslySkipPermissions,
          state.settings.claudeSandboxEnabled,
          state.settings.claudeAllowUnsandboxedCommands,
          state.settings.claudeSandboxCredentialFiles,
          state.settings.claudeSandboxCredentialEnvVars,
          state.settings.claudeTaskBudgetTokens,
          state.settings.advisorTarget,
          state.settings.claudeSettingSources,
          state.settings.claudeEffort,
          state.settings.claudeThinkingMode,
          state.settings.claudeAgentProgressSummaries,
          state.settings.claudePromptSuggestions,
          state.settings.claudeForwardSubagentText,
          state.settings.claudeEnableFileCheckpointing,
          state.settings.claudeForkSession,
          state.settings.claudeStrictMcpConfig,
          state.settings.claudeSkills,
          state.settings.claudePluginPaths,
          state.settings.claudeAgentName,
          state.settings.claudeFallbackModel,
          state.settings.claudeResumeSessionAt,
          state.settings.codexFileAccess,
          state.settings.codexNetworkAccess,
          state.settings.codexApprovalPolicy,
          state.settings.codexReasoningEffort,
          state.settings.modelCodex,
          state.settings.codexWebSearch,
          state.settings.codexAppToolApprovalMode,
          state.settings.codexShowRawReasoning,
          state.settings.codexReasoningSummary,
          state.settings.codexReasoningSummarySupport,
          state.settings.codexFastMode,
          state.settings.trustedTools,
          state.draftProvider,
          state.settings.codexBinaryPath,
          state.tasks.find((task) => task.id === state.activeTaskId)
            ?.provider ?? null,
          state.promptDraftByTask[state.activeTaskId]?.runtimeOverrides
            ?.model ?? null,
          state.providerRuntimeCapabilities["claude-code"],
          state.providerRuntimeCapabilities.codex,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const currentClaudeModePresetId = detectClaudeProviderModePreset({
    settings: {
      claudePermissionMode,
      claudeAllowDangerouslySkipPermissions,
      claudeSandboxEnabled,
      claudeAllowUnsandboxedCommands,
    },
  });
  const currentCodexModePresetId = detectCodexProviderModePreset({
    settings: {
      codexFileAccess,
      codexApprovalPolicy,
      codexNetworkAccess,
      codexWebSearch,
    },
  });
  const currentClaudeModeLabel = currentClaudeModePresetId
    ? (CLAUDE_PROVIDER_MODE_PRESETS.find(
        (preset) => preset.id === currentClaudeModePresetId,
      )?.label ?? "Custom")
    : "Custom";
  const currentCodexModeLabel = currentCodexModePresetId
    ? (CODEX_PROVIDER_MODE_PRESETS.find(
        (preset) => preset.id === currentCodexModePresetId,
      )?.label ?? "Custom")
    : "Custom";
  // Scoped to the default Codex model so, e.g., GPT-5.6 Luna never offers
  // "Ultra" here — a value only Sol/Terra accept. "Minimal" is always kept
  // available since it's a legacy value Stave still maps to "low" at
  // runtime, not part of the current model-reported effort scale.
  const codexReasoningEffortOptions = useMemo(() => {
    const supported = listCodexReasoningEffortsForModel({ model: modelCodex });
    return CODEX_REASONING_EFFORT_HELP.filter(
      (option) =>
        option.value === "minimal" ||
        (supported as readonly string[]).includes(option.value),
    );
  }, [modelCodex]);
  const codexWebSearchOptions = useMemo(
    () =>
      CODEX_WEB_SEARCH_HELP.filter(
        (option) =>
          option.value !== "indexed" ||
          codexRuntimeCapabilities.webSearchModes.includes("indexed"),
      ),
    [codexRuntimeCapabilities.webSearchModes],
  );
  const effectiveCodexWebSearch =
    codexWebSearch === "indexed" &&
    !codexRuntimeCapabilities.webSearchModes.includes("indexed")
      ? "cached"
      : codexWebSearch;
  const advisorMode: "off" | ProviderId = advisorTarget?.providerId ?? "off";
  const codexModelCatalog = useCodexModelCatalog({
    enabled: advisorTarget?.providerId === "codex",
    codexBinaryPath,
  });
  const advisorModelOptions = useMemo(
    () =>
      advisorTarget
        ? buildModelSelectorOptions({
            providerIds: [advisorTarget.providerId],
            modelsByProvider: {
              [advisorTarget.providerId]:
                advisorTarget.providerId === "codex"
                  ? codexModelCatalog.models
                  : getSdkModelOptions({
                      providerId: advisorTarget.providerId,
                    }),
            },
          })
        : [],
    [advisorTarget, codexModelCatalog.models],
  );
  const advisorTargetSupported =
    advisorTarget !== null &&
    advisorModelOptions.some(
      (option) =>
        option.providerId === advisorTarget.providerId &&
        option.model === advisorTarget.model,
    );
  const executorProvider = activeTaskProvider ?? draftProvider;
  const executorModel = resolvePromptDraftModelForProvider({
    providerId: executorProvider,
    runtimeOverrides: activeTaskModelOverride
      ? { model: activeTaskModelOverride }
      : undefined,
    fallbackModel:
      executorProvider === "claude-code" ? modelClaude : modelCodex,
  });
  const updateAdvisorProvider = (providerId: "off" | ProviderId) => {
    if (providerId === "off") {
      updateSettings({ patch: { advisorTarget: null } });
      return;
    }
    const nextTarget: AdvisorTarget = {
      providerId,
      model:
        advisorTarget?.providerId === providerId && advisorTargetSupported
          ? advisorTarget.model
          : getDefaultModelForProvider({ providerId }),
      ...(advisorTarget?.effort &&
      listAdvisorEffortsForProvider(providerId).includes(advisorTarget.effort)
        ? { effort: advisorTarget.effort }
        : {}),
    };
    updateSettings({ patch: { advisorTarget: nextTarget } });
  };
  const updateAdvisorEffort = (value: string) => {
    if (!advisorTarget) {
      return;
    }
    updateSettings({
      patch: {
        advisorTarget: {
          providerId: advisorTarget.providerId,
          model: advisorTarget.model,
          ...(value === ADVISOR_EFFORT_AUTO_VALUE
            ? {}
            : { effort: value as AdvisorEffort }),
        },
      },
    });
  };
  const toggleClaudeSettingSource = (source: "user" | "project" | "local") => {
    updateSettings({
      patch: {
        claudeSettingSources: claudeSettingSources.includes(source)
          ? claudeSettingSources.filter((item) => item !== source)
          : [...claudeSettingSources, source],
      },
    });
  };

  return (
    <>
      <SettingsCard
        id={ADVISOR_SETTING_FIELD_ID}
        tabIndex={-1}
        title="Advisor"
        description="Default for new tasks: run one isolated, read-only preflight before each normal user chat turn. The Advisor can be Claude or Codex regardless of the primary provider, and each task can arm or disarm it from the composer."
        titleAccessory={
          <Badge
            variant={
              advisorTarget
                ? advisorTargetSupported
                  ? "secondary"
                  : "destructive"
                : "outline"
            }
          >
            {advisorTarget
              ? advisorTargetSupported
                ? "Default on"
                : "Invalid model"
              : "Default off"}
          </Badge>
        }
      >
        <ChoiceButtons
          columns={3}
          value={advisorMode}
          onChange={updateAdvisorProvider}
          options={[
            {
              value: "off",
              label: "Off",
              description:
                "Start the primary provider immediately unless a task arms the Advisor itself.",
            },
            {
              value: "claude-code",
              label: "Claude",
              description: "Use an isolated Claude SDK turn.",
              icon: <ModelIcon providerId="claude-code" className="size-3.5" />,
            },
            {
              value: "codex",
              label: "Codex",
              description: "Use an ephemeral Codex App Server thread.",
              icon: <ModelIcon providerId="codex" className="size-3.5" />,
            },
          ]}
        />
        {advisorTarget ? (
          <LabeledField
            title="Advisor Model"
            description="Claude runs with tools disabled; Codex uses a read-only sandbox and isolated no-tool instructions. Neither uses network or conversation resume state."
          >
            <ModelSelector
              value={buildModelSelectorValue({
                providerId: advisorTarget.providerId,
                model: advisorTarget.model,
                available: advisorTargetSupported,
              })}
              options={advisorModelOptions}
              className="w-full"
              triggerAriaLabel={`Advisor model: ${toHumanModelName({
                model: advisorTarget.model,
              })}`}
              triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
              menuClassName="sm:max-w-lg"
              onSelect={({ selection }) =>
                updateSettings({
                  patch: {
                    advisorTarget: {
                      providerId: selection.providerId,
                      model: selection.model,
                      // Switching models must not silently reset the pinned
                      // tier; an unsupported one is clamped at resolution time.
                      ...(advisorTarget.effort
                        ? { effort: advisorTarget.effort }
                        : {}),
                    },
                  },
                })
              }
            />
            {!advisorTargetSupported ? (
              <p className="text-xs leading-5 text-destructive">
                This persisted model is not in Stave&apos;s current{" "}
                {getProviderLabel({
                  providerId: advisorTarget.providerId,
                })}{" "}
                catalog. Advisor will stay skipped until you select a valid
                model or turn it off.
              </p>
            ) : null}
          </LabeledField>
        ) : null}
        {advisorTarget ? (
          <LabeledField
            title="Advisor Effort"
            description="The Advisor holds the turn while it thinks, so the tier is a direct latency choice. Auto follows the model's own default, which for Codex is deliberately high."
          >
            <ChoiceButtons
              value={
                resolveAdvisorEffortSelection(advisorTarget) ??
                ADVISOR_EFFORT_AUTO_VALUE
              }
              onChange={updateAdvisorEffort}
              options={buildAdvisorEffortOptions(advisorTarget).map(
                (option) => ({
                  value: option.value ?? ADVISOR_EFFORT_AUTO_VALUE,
                  // The full title carries what Auto resolves to, which is the
                  // number that decides whether this default is expensive.
                  label: option.title,
                }),
              )}
            />
            {advisorTarget.effort && isAdvisorEffortClamped(advisorTarget) ? (
              <p className="text-xs leading-5 text-muted-foreground">
                The saved tier is{" "}
                {formatAdvisorEffortLabel(advisorTarget.effort)}, which{" "}
                {toHumanModelName({ model: advisorTarget.model })} does not
                accept, so the Advisor runs at{" "}
                {formatAdvisorEffortLabel(resolveAdvisorEffort(advisorTarget))}.
              </p>
            ) : null}
          </LabeledField>
        ) : null}
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              {activeTaskProvider ? "Active pair:" : "Default pair:"}
            </span>{" "}
            {getProviderLabel({ providerId: executorProvider })} ·{" "}
            {toHumanModelName({ model: executorModel })}
            {" → "}
            {advisorTarget
              ? `${getProviderLabel({
                  providerId: advisorTarget.providerId,
                })} Advisor · ${toHumanModelName({
                  model: advisorTarget.model,
                })} · ${formatAdvisorEffortLabel(
                  resolveAdvisorEffort(advisorTarget),
                )}`
              : "Advisor off"}
          </p>
          <p className="mt-1">
            Adds one model call, latency, and usage. A recoverable Advisor
            failure is traced and the primary turn still runs; Stave never
            switches Advisor models automatically.
          </p>
          <p className="mt-1">
            This is only the default. Each task&apos;s composer has an Advisor
            control that can turn it on or off, or point it at a different
            model, for that task alone.
          </p>
        </div>
      </SettingsCard>
      <SettingsCard
        title="Trusted Approvals"
        description="Approvals marked as always allowed. Bash entries are stored as command prefixes instead of trusting every shell command."
        titleAccessory={
          <Badge variant={trustedTools.length > 0 ? "secondary" : "outline"}>
            {trustedTools.length}
          </Badge>
        }
      >
        {trustedTools.length > 0 ? (
          <div className="space-y-2">
            {trustedTools.map((entry) => (
              <div
                key={entry}
                className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm">
                  {formatTrustedToolEntry(entry)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() =>
                    updateSettings({
                      patch: {
                        trustedTools: removeTrustedToolEntry({
                          entries: trustedTools,
                          entry,
                        }),
                      },
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No trusted approvals yet. Use approve and always allow from an
            approval prompt to add one.
          </p>
        )}
      </SettingsCard>
      <Tabs defaultValue="claude" className="gap-4">
        <TabsList className="h-auto w-full justify-start rounded-xl border border-border/70 bg-muted/30 p-1">
          <TabsTrigger
            value="claude"
            className="h-8 flex-none rounded-lg px-3 text-xs font-medium"
          >
            Claude
          </TabsTrigger>
          <TabsTrigger
            value="codex"
            className="h-8 flex-none rounded-lg px-3 text-xs font-medium"
          >
            Codex
          </TabsTrigger>
        </TabsList>

        <TabsContent value="claude">
          <SectionStack>
            <SettingsCard
              title="Claude Runtime Controls"
              description="Permission, sandbox, thinking, and subagent progress behavior passed into each Claude turn."
              titleAccessory={
                <Badge
                  variant={currentClaudeModePresetId ? "secondary" : "outline"}
                >
                  {currentClaudeModeLabel}
                </Badge>
              }
            >
              <LabeledField
                title="Mode Preset"
                description="Apply a recommended Claude autonomy preset. Editing the fields below can move the card into Custom."
              >
                <ProviderModePresetButtons
                  presets={CLAUDE_PROVIDER_MODE_PRESETS}
                  activePresetId={currentClaudeModePresetId}
                  onSelect={(presetId) =>
                    updateSettings({
                      patch: buildClaudeProviderModeSettingsPatch({ presetId }),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {currentClaudeModePresetId
                    ? `${currentClaudeModeLabel} is active. Reapply a preset any time to restore its full permission and sandbox combination.`
                    : "Custom is active. The current Claude permission and sandbox combination does not match a built-in preset."}
                </p>
              </LabeledField>
              <LabeledField
                title="Permission Mode"
                description="Controls how aggressively Claude asks for permission during a chat turn. Claude CLI sessions always launch in `auto`."
                guide={
                  <SettingsFieldGuide
                    title="Claude Permission Mode"
                    summary="This is the main autonomy dial for Claude turns."
                    items={buildGuideItems(CLAUDE_PERMISSION_MODE_HELP)}
                    examples={buildGuideExamples(CLAUDE_PERMISSION_MODE_HELP)}
                    note="`plan` is special in Stave: it becomes a planning workflow rather than a normal implementation turn."
                    tooltip="Compare Claude permission modes"
                  />
                }
              >
                <DescribedSelect
                  value={claudePermissionMode}
                  options={CLAUDE_PERMISSION_MODE_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        claudePermissionMode: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <SwitchField
                title="Dangerous Skip Permissions"
                description="Only applies when `bypassPermissions` is active."
                checked={claudeAllowDangerouslySkipPermissions}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeAllowDangerouslySkipPermissions: checked },
                  })
                }
              />
              <SwitchField
                title="Sandbox Enabled"
                description="Wrap Claude tool execution in its sandbox configuration."
                checked={claudeSandboxEnabled}
                onCheckedChange={(checked) =>
                  updateSettings({ patch: { claudeSandboxEnabled: checked } })
                }
              />
              <SwitchField
                title="Allow Unsandboxed Commands"
                description="Controls whether Claude may fall back to commands outside the sandbox."
                checked={claudeAllowUnsandboxedCommands}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeAllowUnsandboxedCommands: checked },
                  })
                }
              />
              {claudeRuntimeCapabilities.sandbox.credentialGuards ? (
                <>
                  <LabeledField
                    title="Protected Credential Files"
                    description="Comma-separated file paths Claude's sandbox must deny as credentials. Enter paths only, never secret contents."
                  >
                    <DraftInput
                      className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
                      value={claudeSandboxCredentialFiles}
                      placeholder="~/.config/example/credentials.json"
                      onCommit={(value) =>
                        updateSettings({
                          patch: { claudeSandboxCredentialFiles: value },
                        })
                      }
                    />
                  </LabeledField>
                  <LabeledField
                    title="Protected Credential Variables"
                    description="Comma-separated environment variable names Claude's sandbox must deny. Enter names only; values never belong here."
                  >
                    <DraftInput
                      className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
                      value={claudeSandboxCredentialEnvVars}
                      placeholder="EXAMPLE_TOKEN, SERVICE_PASSWORD"
                      onCommit={(value) =>
                        updateSettings({
                          patch: { claudeSandboxCredentialEnvVars: value },
                        })
                      }
                    />
                  </LabeledField>
                </>
              ) : null}
              <LabeledField
                title="Setting Sources"
                description="Controls which Claude filesystem setting layers are loaded. `project` is required for CLAUDE.md and project slash commands."
                guide={
                  <SettingsFieldGuide
                    title="Claude Setting Sources"
                    summary="These layers decide which Claude configuration files and commands participate in each turn."
                    items={CLAUDE_SETTING_SOURCE_HELP.map((option) => ({
                      label: option.label,
                      description: option.description,
                    }))}
                    tooltip="What each Claude setting source does"
                  />
                }
              >
                <ToggleChipGroup
                  options={CLAUDE_SETTING_SOURCE_HELP}
                  selected={claudeSettingSources}
                  onToggle={toggleClaudeSettingSource}
                />
                <p className="text-xs text-muted-foreground">
                  Active:{" "}
                  {claudeSettingSources.length > 0
                    ? claudeSettingSources.join(" + ")
                    : "none"}
                </p>
              </LabeledField>
              <LabeledField
                title="Task Budget (Tokens)"
                description="Advisory token budget sent to Claude so it can pace tool use and wrap up earlier. Use `0` to disable."
              >
                <DraftInput
                  className="h-10 rounded-md border-border/80 bg-background"
                  value={String(claudeTaskBudgetTokens)}
                  onCommit={(value) =>
                    updateSettings({
                      patch: {
                        claudeTaskBudgetTokens: Math.min(
                          1_000_000,
                          Math.max(0, readInt(value, claudeTaskBudgetTokens)),
                        ),
                      },
                    })
                  }
                />
              </LabeledField>
              <LabeledField
                title="Thinking Mode"
                guide={
                  <SettingsFieldGuide
                    title="Claude Thinking Mode"
                    summary="Thinking controls whether Claude spends extra effort on explicit reasoning before answering."
                    items={buildGuideItems(CLAUDE_THINKING_MODE_HELP)}
                    examples={buildGuideExamples(CLAUDE_THINKING_MODE_HELP)}
                    tooltip="Compare Claude thinking modes"
                  />
                }
              >
                <DescribedSelect
                  value={claudeThinkingMode}
                  options={CLAUDE_THINKING_MODE_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        claudeThinkingMode: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <LabeledField
                title="Effort"
                guide={
                  <SettingsFieldGuide
                    title="Claude Effort"
                    summary="Higher effort spends more model budget on reasoning and usually increases latency."
                    items={buildGuideItems(CLAUDE_EFFORT_HELP)}
                    examples={buildGuideExamples(CLAUDE_EFFORT_HELP)}
                    tooltip="Compare Claude effort levels"
                  />
                }
              >
                <DescribedSelect
                  value={claudeEffort}
                  options={CLAUDE_EFFORT_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        claudeEffort: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <SwitchField
                title="Agent Progress Summaries"
                description="Enables Claude SDK `task_progress.summary` updates for running subagents."
                checked={claudeAgentProgressSummaries}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeAgentProgressSummaries: checked },
                  })
                }
              />
              <SwitchField
                title="Prompt Suggestions"
                description="Enables Claude SDK prompt_suggestion events after completed turns."
                checked={claudePromptSuggestions}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudePromptSuggestions: checked },
                  })
                }
              />
              <SwitchField
                title="Forward Subagent Text"
                description="Streams nested subagent transcript text instead of only subagent progress heartbeats."
                checked={claudeForwardSubagentText}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeForwardSubagentText: checked },
                  })
                }
              />
              <SwitchField
                title="File Checkpointing"
                description="Enables Claude SDK file checkpoints so changed files can be rewound by session controls."
                checked={claudeEnableFileCheckpointing}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeEnableFileCheckpointing: checked },
                  })
                }
              />
              <SwitchField
                title="Fork Resumed Session"
                description="When resuming a Claude session, fork to a new session instead of continuing the previous one."
                checked={claudeForkSession}
                onCheckedChange={(checked) =>
                  updateSettings({ patch: { claudeForkSession: checked } })
                }
              />
              <SwitchField
                title="Strict MCP Config"
                description="Only use MCP servers passed by Stave and explicitly configured SDK agents."
                checked={claudeStrictMcpConfig}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeStrictMcpConfig: checked },
                  })
                }
              />
              <LabeledField
                title="Plan Mode Approvals"
                guide={
                  <SettingsFieldGuide
                    title="Claude Plan Mode Approvals"
                    summary="Controls how many approval prompts plan mode shows. Plan mode is always read-only — mutating file edits and mutating Bash are hard-denied at every level; these options only relax the prompt for non-mutating Bash, subagents, and read-only MCP tools."
                    items={buildGuideItems(
                      CLAUDE_PLAN_MODE_APPROVAL_SCOPE_HELP,
                    )}
                    examples={buildGuideExamples(
                      CLAUDE_PLAN_MODE_APPROVAL_SCOPE_HELP,
                    )}
                    tooltip="Compare plan-mode approval scopes"
                  />
                }
              >
                <DescribedSelect
                  value={claudePlanModeApprovalScope}
                  options={CLAUDE_PLAN_MODE_APPROVAL_SCOPE_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        claudePlanModeApprovalScope: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <LabeledField
                title="Skills"
                description="Comma- or newline-separated Claude skill names. Use `all` to enable every discovered skill."
              >
                <DraftInput
                  className="h-10 rounded-md border-border/80 bg-background"
                  value={claudeSkills}
                  placeholder="all"
                  onCommit={(value) =>
                    updateSettings({ patch: { claudeSkills: value } })
                  }
                />
              </LabeledField>
              <LabeledField
                title="Plugin Paths"
                description="Comma- or newline-separated local Claude plugin directories. Stave owns MCP discovery for these plugins."
              >
                <DraftInput
                  className="h-10 rounded-md border-border/80 bg-background"
                  value={claudePluginPaths}
                  placeholder="<workspace>/plugin"
                  onCommit={(value) =>
                    updateSettings({ patch: { claudePluginPaths: value } })
                  }
                />
              </LabeledField>
              <LabeledField
                title="Main Agent"
                description="Optional Claude agent name from settings or loaded plugins for the main conversation."
              >
                <DraftInput
                  className="h-10 rounded-md border-border/80 bg-background"
                  value={claudeAgentName}
                  placeholder="code-reviewer"
                  onCommit={(value) =>
                    updateSettings({ patch: { claudeAgentName: value } })
                  }
                />
              </LabeledField>
              <LabeledField
                title="Fallback Models"
                description="Comma-separated Claude fallback models used when the primary model is overloaded or unavailable. Opus 5 automatically falls back to Opus 4.8 when left blank."
              >
                <DraftInput
                  className="h-10 rounded-md border-border/80 bg-background"
                  value={claudeFallbackModel}
                  placeholder="claude-opus-4-8"
                  onCommit={(value) =>
                    updateSettings({ patch: { claudeFallbackModel: value } })
                  }
                />
              </LabeledField>
              <LabeledField
                title="Resume At Message"
                description="Optional Claude assistant message UUID for partial resume from a previous session."
              >
                <DraftInput
                  className="h-10 rounded-md border-border/80 bg-background"
                  value={claudeResumeSessionAt}
                  placeholder="message uuid"
                  onCommit={(value) =>
                    updateSettings({
                      patch: { claudeResumeSessionAt: value },
                    })
                  }
                />
              </LabeledField>
            </SettingsCard>
            <ClaudeBinaryPathCard />
            <ClaudeRuntimeToolsCard />
          </SectionStack>
        </TabsContent>

        <TabsContent value="codex">
          <SectionStack>
            <SettingsCard
              title="Codex Runtime Controls"
              description="Per-turn Codex file access, approvals, network, reasoning, and search settings."
              titleAccessory={
                <Badge
                  variant={currentCodexModePresetId ? "secondary" : "outline"}
                >
                  {currentCodexModeLabel}
                </Badge>
              }
            >
              <LabeledField
                title="Mode Preset"
                description="Apply a recommended Codex autonomy preset. Editing the fields below can move the card into Custom."
              >
                <ProviderModePresetButtons
                  presets={CODEX_PROVIDER_MODE_PRESETS}
                  activePresetId={currentCodexModePresetId}
                  onSelect={(presetId) =>
                    updateSettings({
                      patch: buildCodexProviderModeSettingsPatch({ presetId }),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {currentCodexModePresetId
                    ? `${currentCodexModeLabel} is active. Reapply a preset any time to restore its full file access, approval, and network combination.`
                    : "Custom is active. The current Codex file-access and approval combination does not match a built-in preset."}
                </p>
              </LabeledField>
              <SwitchField
                title="Network Access"
                description="Controls whether Codex may use networked capabilities during a turn."
                checked={codexNetworkAccess}
                onCheckedChange={(checked) =>
                  updateSettings({ patch: { codexNetworkAccess: checked } })
                }
              />
              <LabeledField
                title="File Access"
                guide={
                  <SettingsFieldGuide
                    title="Codex File Access"
                    summary="This setting controls where Codex can read and write on disk."
                    items={buildGuideItems(CODEX_FILE_ACCESS_HELP)}
                    examples={buildGuideExamples(CODEX_FILE_ACCESS_HELP)}
                    note="When Stave runs Codex in plan mode, it forces `read-only` regardless of the normal setting."
                    tooltip="Compare Codex file access levels"
                  />
                }
              >
                <DescribedSelect
                  value={codexFileAccess}
                  options={CODEX_FILE_ACCESS_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexFileAccess: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <LabeledField
                title="Approvals"
                guide={
                  <SettingsFieldGuide
                    title="Codex Approvals"
                    summary="Approval policy controls when Codex pauses to ask before acting."
                    items={buildGuideItems(CODEX_APPROVAL_POLICY_HELP)}
                    examples={buildGuideExamples(CODEX_APPROVAL_POLICY_HELP)}
                    note="Stave forces `never` during Codex plan mode so planning turns do not stop on approval prompts."
                    tooltip="Compare Codex approval policies"
                  />
                }
              >
                <DescribedSelect
                  value={codexApprovalPolicy}
                  options={CODEX_APPROVAL_POLICY_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexApprovalPolicy: value,
                      },
                    })
                  }
                />
              </LabeledField>
              {codexRuntimeCapabilities.approval.appToolModes.length > 0 ? (
                <LabeledField
                  title="App Tool Approvals"
                  description="Controls App and MCP tools separately from shell command approvals."
                  guide={
                    <SettingsFieldGuide
                      title="Codex App Tool Approvals"
                      summary="This controls approval prompts for connected App and MCP tools, not shell commands or sandbox permissions."
                      items={buildGuideItems(CODEX_APP_TOOL_APPROVAL_HELP)}
                      examples={buildGuideExamples(
                        CODEX_APP_TOOL_APPROVAL_HELP,
                      )}
                      note="`writes` trusts each tool's read-only annotation; it is not a security boundary."
                      tooltip="Compare App tool approval modes"
                    />
                  }
                >
                  <DescribedSelect
                    value={codexAppToolApprovalMode}
                    options={CODEX_APP_TOOL_APPROVAL_HELP}
                    onValueChange={(value) =>
                      updateSettings({
                        patch: { codexAppToolApprovalMode: value },
                      })
                    }
                  />
                </LabeledField>
              ) : null}
              <LabeledField
                title="Reasoning"
                guide={
                  <SettingsFieldGuide
                    title="Codex Reasoning Effort"
                    summary="Higher effort gives Codex more room to reason, but it also tends to slow the turn down."
                    items={buildGuideItems(codexReasoningEffortOptions)}
                    examples={buildGuideExamples(codexReasoningEffortOptions)}
                    tooltip="Compare Codex reasoning effort levels"
                  />
                }
              >
                <DescribedSelect
                  value={codexReasoningEffort}
                  options={codexReasoningEffortOptions}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexReasoningEffort: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <LabeledField
                title="Reasoning Summary"
                description="Codex config for model-side reasoning summaries when supported."
                guide={
                  <SettingsFieldGuide
                    title="Codex Reasoning Summary"
                    summary="This controls how much reasoning summary Codex should try to return when the model supports it."
                    items={buildGuideItems(CODEX_REASONING_SUMMARY_HELP)}
                    examples={buildGuideExamples(CODEX_REASONING_SUMMARY_HELP)}
                    tooltip="Compare Codex reasoning summary modes"
                  />
                }
              >
                <DescribedSelect
                  value={codexReasoningSummary}
                  options={CODEX_REASONING_SUMMARY_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexReasoningSummary: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <LabeledField
                title="Summary Support"
                description="Override Codex capability detection when a model supports reasoning summaries but the runtime cannot infer it."
                guide={
                  <SettingsFieldGuide
                    title="Reasoning Summary Capability Override"
                    summary="Only touch this when automatic capability detection is wrong."
                    items={buildGuideItems(CODEX_REASONING_SUPPORT_HELP)}
                    examples={buildGuideExamples(CODEX_REASONING_SUPPORT_HELP)}
                    tooltip="How reasoning summary support override works"
                  />
                }
              >
                <DescribedSelect
                  value={codexReasoningSummarySupport}
                  options={CODEX_REASONING_SUPPORT_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexReasoningSummarySupport: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <SwitchField
                title="Raw Reasoning"
                description="Shows low-level reasoning traces when Codex emits them."
                checked={codexShowRawReasoning}
                onCheckedChange={(checked) =>
                  updateSettings({ patch: { codexShowRawReasoning: checked } })
                }
              />
              <LabeledField
                title="Web Search"
                description="Default is `cached`, which allows lower-volatility search without turning on live external lookup."
                guide={
                  <SettingsFieldGuide
                    title="Codex Web Search"
                    summary="Use this when Codex needs outside knowledge rather than only repo-local context."
                    items={buildGuideItems(CODEX_WEB_SEARCH_HELP)}
                    examples={buildGuideExamples(CODEX_WEB_SEARCH_HELP)}
                    tooltip="Compare Codex web search modes"
                  />
                }
              >
                <DescribedSelect
                  value={effectiveCodexWebSearch}
                  options={codexWebSearchOptions}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexWebSearch: value,
                      },
                    })
                  }
                />
                {codexWebSearch === "indexed" &&
                effectiveCodexWebSearch !== "indexed" ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    Indexed search is unavailable in the selected Codex version;
                    Stave will use cached search instead.
                  </p>
                ) : null}
              </LabeledField>
              <SwitchField
                title="Fast Mode"
                description="Enables Codex fast_mode feature flag for faster responses on simpler tasks."
                checked={codexFastMode}
                onCheckedChange={(checked) =>
                  updateSettings({ patch: { codexFastMode: checked } })
                }
              />
            </SettingsCard>
            <CodexBinaryPathCard />
          </SectionStack>
        </TabsContent>
      </Tabs>
    </>
  );
}
