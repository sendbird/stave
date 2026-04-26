import {
  buildModelSelectorOptions,
  buildRecommendedModelSelectorOptions,
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
  ClaudeSettingSource,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  buildStaveAutoModelSettingsPatch,
  detectStaveAutoModelPreset,
  resolveStaveProviderForModel,
  STAVE_AUTO_MODEL_PRESETS,
} from "@/lib/providers/stave-auto-profile";
import {
  DEFAULT_CLAUDE_OPUS_1M_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
  getDefaultModelForProvider,
} from "@/lib/providers/model-catalog";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import type {
  StaveAutoClaudeRoleRuntimeOverrides,
  StaveAutoCodexRoleRuntimeOverrides,
  StaveAutoRoleName,
  StaveAutoRoleRuntimeOverrides,
} from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import { useMemo, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  DraftInput,
  LabeledField,
  readInt,
  SectionHeading,
  SectionStack,
  SettingsFieldGuide,
  SettingsCard,
  SwitchField,
} from "./settings-dialog.shared";
import {
  ClaudeBinaryPathCard,
  ClaudeRuntimeToolsCard,
  CodexBinaryPathCard,
} from "./settings-dialog-developer-section";

const STAVE_AUTO_MODEL_PROVIDER_IDS = ["claude-code", "codex"] as const;
const CLAUDE_ADVISOR_SOURCE_MODEL_OPTIONS = buildModelSelectorOptions({
  providerIds: ["claude-code"],
  modelsByProvider: {
    "claude-code": [
      "claude-haiku-4-5",
      "claude-sonnet-4-6",
      DEFAULT_CLAUDE_OPUS_MODEL,
      DEFAULT_CLAUDE_OPUS_1M_MODEL,
    ],
  },
});

const STAVE_AUTO_BOOLEAN_OVERRIDE_OPTIONS = [
  { value: "on", label: "on" },
  { value: "off", label: "off" },
] as const;

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

function resolveClaudeAdvisorSourceModel(args: {
  model: string;
  fallback: string;
}) {
  const normalized = args.model.trim().toLowerCase();
  if (normalized.includes("haiku")) {
    return "claude-haiku-4-5";
  }
  if (normalized.includes("sonnet")) {
    return "claude-sonnet-4-6";
  }
  if (normalized.includes("opus")) {
    return DEFAULT_CLAUDE_OPUS_MODEL;
  }
  return args.fallback;
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
          position="popper"
          align="start"
          sideOffset={6}
          className={`${UI_LAYER_CLASS.popover} min-w-[var(--radix-select-trigger-width)] max-w-sm bg-popover`}
        >
          {args.options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              textValue={option.label}
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

function StaveAutoOverrideField(args: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground/90">{args.label}</p>
      {args.children}
    </div>
  );
}

function ProviderModePresetButtons(args: {
  presets: readonly ProviderModePresetDefinition[];
  activePresetId: ProviderModePresetId | null;
  onSelect: (presetId: ProviderModePresetId) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {args.presets.map((preset) => (
        <Button
          key={preset.id}
          className="h-auto min-h-16 items-start justify-start whitespace-normal rounded-md px-3 py-2.5 text-left"
          variant={args.activePresetId === preset.id ? "default" : "outline"}
          onClick={() => args.onSelect(preset.id)}
        >
          <div className="space-y-1">
            <p className="text-sm font-medium">{preset.label}</p>
            <p className="text-xs opacity-80">{preset.description}</p>
          </div>
        </Button>
      ))}
    </div>
  );
}

function StaveAutoRoleField(args: {
  role: StaveAutoRoleName;
  title: string;
  description: string;
  value: string;
  overrides: StaveAutoRoleRuntimeOverrides;
  modelOptions: ReturnType<typeof buildModelSelectorOptions>;
  recommendedModelOptions: ReturnType<
    typeof buildRecommendedModelSelectorOptions
  >;
  onModelSelect: (model: string) => void;
  onClaudeOverrideChange: <K extends keyof StaveAutoClaudeRoleRuntimeOverrides>(
    key: K,
    value: StaveAutoClaudeRoleRuntimeOverrides[K],
  ) => void;
  onCodexOverrideChange: <K extends keyof StaveAutoCodexRoleRuntimeOverrides>(
    key: K,
    value: StaveAutoCodexRoleRuntimeOverrides[K],
  ) => void;
}) {
  const providerId = resolveStaveProviderForModel({ model: args.value });
  const providerLabel =
    providerId === "claude-code" ? "Claude runtime" : "Codex runtime";

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">{args.title}</p>
          <p className="text-xs text-muted-foreground">{args.description}</p>
        </div>
        <Badge variant="secondary">{providerLabel}</Badge>
      </div>
      <ModelSelector
        value={buildModelSelectorValue({ model: args.value })}
        options={args.modelOptions}
        recommendedOptions={args.recommendedModelOptions}
        className="w-full"
        triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
        menuClassName="sm:max-w-lg"
        onSelect={({ selection }) => args.onModelSelect(selection.model)}
      />
      {providerId === "claude-code" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StaveAutoOverrideField label="Permission Mode">
            <Select
              value={args.overrides.claude.permissionMode ?? "auto"}
              onValueChange={(value) =>
                args.onClaudeOverrideChange(
                  "permissionMode",
                  value as StaveAutoClaudeRoleRuntimeOverrides["permissionMode"],
                )
              }
            >
              <SelectTrigger className="h-9 rounded-md border-border/80 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_PERMISSION_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StaveAutoOverrideField>
          <StaveAutoOverrideField label="Thinking">
            <Select
              value={args.overrides.claude.thinkingMode ?? "adaptive"}
              onValueChange={(value) =>
                args.onClaudeOverrideChange(
                  "thinkingMode",
                  value as StaveAutoClaudeRoleRuntimeOverrides["thinkingMode"],
                )
              }
            >
              <SelectTrigger className="h-9 rounded-md border-border/80 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_THINKING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StaveAutoOverrideField>
          <StaveAutoOverrideField label="Effort">
            <Select
              value={args.overrides.claude.effort ?? "medium"}
              onValueChange={(value) =>
                args.onClaudeOverrideChange(
                  "effort",
                  value as StaveAutoClaudeRoleRuntimeOverrides["effort"],
                )
              }
            >
              <SelectTrigger className="h-9 rounded-md border-border/80 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_EFFORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StaveAutoOverrideField>
          <StaveAutoOverrideField label="Fast">
            <Select
              value={(args.overrides.claude.fastMode ?? false) ? "on" : "off"}
              onValueChange={(value) =>
                args.onClaudeOverrideChange("fastMode", value === "on")
              }
            >
              <SelectTrigger className="h-9 rounded-md border-border/80 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAVE_AUTO_BOOLEAN_OVERRIDE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StaveAutoOverrideField>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <StaveAutoOverrideField label="Approvals">
            <Select
              value={args.overrides.codex.approvalPolicy ?? "untrusted"}
              onValueChange={(value) =>
                args.onCodexOverrideChange(
                  "approvalPolicy",
                  value as StaveAutoCodexRoleRuntimeOverrides["approvalPolicy"],
                )
              }
            >
              <SelectTrigger className="h-9 rounded-md border-border/80 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODEX_APPROVAL_POLICY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StaveAutoOverrideField>
          <StaveAutoOverrideField label="Effort">
            <Select
              value={args.overrides.codex.reasoningEffort ?? "medium"}
              onValueChange={(value) =>
                args.onCodexOverrideChange(
                  "reasoningEffort",
                  value as StaveAutoCodexRoleRuntimeOverrides["reasoningEffort"],
                )
              }
            >
              <SelectTrigger className="h-9 rounded-md border-border/80 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODEX_EFFORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StaveAutoOverrideField>
          <StaveAutoOverrideField label="Fast">
            <Select
              value={(args.overrides.codex.fastMode ?? false) ? "on" : "off"}
              onValueChange={(value) =>
                args.onCodexOverrideChange("fastMode", value === "on")
              }
            >
              <SelectTrigger className="h-9 rounded-md border-border/80 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAVE_AUTO_BOOLEAN_OVERRIDE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StaveAutoOverrideField>
        </div>
      )}
    </div>
  );
}

function StaveAutoCard() {
  const codexBinaryPath = useAppStore(
    (state) => state.settings.codexBinaryPath,
  );
  const [
    staveAutoClassifierModel,
    staveAutoSupervisorModel,
    staveAutoPlanModel,
    staveAutoAnalyzeModel,
    staveAutoImplementModel,
    staveAutoQuickEditModel,
    staveAutoGeneralModel,
    staveAutoVerifyModel,
    staveAutoOrchestrationMode,
    staveAutoMaxSubtasks,
    staveAutoMaxParallelSubtasks,
    staveAutoAllowCrossProviderWorkers,
    staveAutoFastMode,
    staveAutoRoleRuntimeOverrides,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.staveAutoClassifierModel,
          state.settings.staveAutoSupervisorModel,
          state.settings.staveAutoPlanModel,
          state.settings.staveAutoAnalyzeModel,
          state.settings.staveAutoImplementModel,
          state.settings.staveAutoQuickEditModel,
          state.settings.staveAutoGeneralModel,
          state.settings.staveAutoVerifyModel,
          state.settings.staveAutoOrchestrationMode,
          state.settings.staveAutoMaxSubtasks,
          state.settings.staveAutoMaxParallelSubtasks,
          state.settings.staveAutoAllowCrossProviderWorkers,
          state.settings.staveAutoFastMode,
          state.settings.staveAutoRoleRuntimeOverrides,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const codexModelCatalog = useCodexModelCatalog({
    enabled: true,
    codexBinaryPath,
  });
  const codexModelEnrichment = useMemo(() => {
    if (codexModelCatalog.entries.length === 0) {
      return undefined;
    }
    const map = new Map<
      string,
      { description?: string; isDefault?: boolean }
    >();
    for (const entry of codexModelCatalog.entries) {
      const id = entry.model.trim();
      if (id) {
        map.set(id, {
          description: entry.description || undefined,
          isDefault: entry.isDefault || undefined,
        });
      }
    }
    return map.size > 0 ? map : undefined;
  }, [codexModelCatalog.entries]);
  const roleModelOptions = useMemo(
    () =>
      buildModelSelectorOptions({
        providerIds: STAVE_AUTO_MODEL_PROVIDER_IDS,
        modelsByProvider: {
          codex: codexModelCatalog.models,
        },
        enrichmentByModel: codexModelEnrichment,
      }),
    [codexModelCatalog.models, codexModelEnrichment],
  );
  const recommendedRoleModelOptions = useMemo(
    () => buildRecommendedModelSelectorOptions({ options: roleModelOptions }),
    [roleModelOptions],
  );
  const currentPresetId = detectStaveAutoModelPreset({
    settings: {
      staveAutoClassifierModel,
      staveAutoSupervisorModel,
      staveAutoPlanModel,
      staveAutoAnalyzeModel,
      staveAutoImplementModel,
      staveAutoQuickEditModel,
      staveAutoGeneralModel,
      staveAutoVerifyModel,
    },
  });
  const currentPreset =
    STAVE_AUTO_MODEL_PRESETS.find((preset) => preset.id === currentPresetId) ??
    null;

  type StaveAutoModelSettingKey =
    | "staveAutoClassifierModel"
    | "staveAutoSupervisorModel"
    | "staveAutoPlanModel"
    | "staveAutoAnalyzeModel"
    | "staveAutoImplementModel"
    | "staveAutoQuickEditModel"
    | "staveAutoGeneralModel"
    | "staveAutoVerifyModel";

  const updateRoleModel = (key: StaveAutoModelSettingKey, model: string) => {
    updateSettings({
      patch: {
        [key]: model,
      } as Partial<Record<StaveAutoModelSettingKey, string>>,
    });
  };

  const updateClaudeRoleOverride = <
    K extends keyof StaveAutoClaudeRoleRuntimeOverrides,
  >(
    role: StaveAutoRoleName,
    key: K,
    value: StaveAutoClaudeRoleRuntimeOverrides[K],
  ) => {
    updateSettings({
      patch: {
        staveAutoRoleRuntimeOverrides: {
          ...staveAutoRoleRuntimeOverrides,
          [role]: {
            ...staveAutoRoleRuntimeOverrides[role],
            claude: {
              ...staveAutoRoleRuntimeOverrides[role].claude,
              [key]: value,
            },
          },
        },
      },
    });
  };

  const updateCodexRoleOverride = <
    K extends keyof StaveAutoCodexRoleRuntimeOverrides,
  >(
    role: StaveAutoRoleName,
    key: K,
    value: StaveAutoCodexRoleRuntimeOverrides[K],
  ) => {
    updateSettings({
      patch: {
        staveAutoRoleRuntimeOverrides: {
          ...staveAutoRoleRuntimeOverrides,
          [role]: {
            ...staveAutoRoleRuntimeOverrides[role],
            codex: {
              ...staveAutoRoleRuntimeOverrides[role].codex,
              [key]: value,
            },
          },
        },
      },
    });
  };

  const roleFields = [
    {
      role: "supervisor" as const,
      title: "Supervisor Model",
      description:
        "Used for orchestration planning and synthesis. Default: claude-sonnet-4-6.",
      value: staveAutoSupervisorModel,
      onSelect: (model: string) =>
        updateRoleModel("staveAutoSupervisorModel", model),
    },
    {
      role: "plan" as const,
      title: "Plan Model",
      description: "Used for strategy, design, and plan-only requests.",
      value: staveAutoPlanModel,
      onSelect: (model: string) => updateRoleModel("staveAutoPlanModel", model),
    },
    {
      role: "analyze" as const,
      title: "Analyze Model",
      description:
        "Used for debugging, review, explanation, architecture, and root-cause analysis.",
      value: staveAutoAnalyzeModel,
      onSelect: (model: string) =>
        updateRoleModel("staveAutoAnalyzeModel", model),
    },
    {
      role: "implement" as const,
      title: "Implement Model",
      description:
        "Used for feature work, code generation, patching, refactors, and test writing.",
      value: staveAutoImplementModel,
      onSelect: (model: string) =>
        updateRoleModel("staveAutoImplementModel", model),
    },
    {
      role: "quick_edit" as const,
      title: "Quick Edit Model",
      description: "Used for rename, typo, and tiny targeted edits.",
      value: staveAutoQuickEditModel,
      onSelect: (model: string) =>
        updateRoleModel("staveAutoQuickEditModel", model),
    },
    {
      role: "general" as const,
      title: "General Model",
      description:
        "Used when the request does not strongly match another role.",
      value: staveAutoGeneralModel,
      onSelect: (model: string) =>
        updateRoleModel("staveAutoGeneralModel", model),
    },
    {
      role: "verify" as const,
      title: "Verify Model",
      description:
        "Used for validation, sanity checks, and review after implementation.",
      value: staveAutoVerifyModel,
      onSelect: (model: string) =>
        updateRoleModel("staveAutoVerifyModel", model),
    },
    {
      role: "classifier" as const,
      title: "Classifier Model",
      description:
        "Lightweight model that decides whether to route directly or orchestrate.",
      value: staveAutoClassifierModel,
      onSelect: (model: string) =>
        updateRoleModel("staveAutoClassifierModel", model),
    },
  ];

  return (
    <SettingsCard
      title="Stave Auto"
      description="Role-based defaults for Stave Auto. Apply a preset for a full role map, then fine-tune any individual model below."
    >
      <LabeledField
        title="Model Preset"
        description="Applying a preset rewrites every Stave Auto role model at once."
      >
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {STAVE_AUTO_MODEL_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                className="h-auto min-h-20 items-start justify-start whitespace-normal px-4 py-3 text-left"
                variant={currentPresetId === preset.id ? "default" : "outline"}
                onClick={() =>
                  updateSettings({
                    patch: buildStaveAutoModelSettingsPatch({
                      presetId: preset.id,
                    }),
                  })
                }
              >
                <div className="w-full space-y-1">
                  <p className="text-sm font-medium">{preset.label}</p>
                  <p className="text-xs opacity-80">{preset.description}</p>
                </div>
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
            <Badge variant={currentPreset ? "default" : "secondary"}>
              {currentPreset
                ? `Current: ${currentPreset.label}`
                : "Current: Custom"}
            </Badge>
            <p className="text-xs text-muted-foreground">
              {currentPreset
                ? currentPreset.description
                : "Manual overrides are active. Pick a preset again to reapply a full Stave Auto model map."}
            </p>
          </div>
        </div>
      </LabeledField>
      <LabeledField
        title="Orchestration Mode"
        description="Off = direct routing only. Auto = orchestrate only when needed. Aggressive = bias toward multi-step workflows."
      >
        <Select
          value={staveAutoOrchestrationMode}
          onValueChange={(value) =>
            updateSettings({
              patch: {
                staveAutoOrchestrationMode: value as
                  | "off"
                  | "auto"
                  | "aggressive",
              },
            })
          }
        >
          <SelectTrigger className="h-10 rounded-md border-border/80 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">off</SelectItem>
            <SelectItem value="auto">auto</SelectItem>
            <SelectItem value="aggressive">aggressive</SelectItem>
          </SelectContent>
        </Select>
      </LabeledField>
      <SwitchField
        title="Fast Mode"
        description="Requests fast execution for Stave Auto turns. It is only applied to providers whose fast mode is available in this workspace."
        checked={staveAutoFastMode}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { staveAutoFastMode: checked } })
        }
      />
      <LabeledField
        title="Role Runtime Overrides"
        description="Each role has its own default settings that you can customize per selected model provider."
      >
        <div className="space-y-3">
          {roleFields.map((field) => (
            <StaveAutoRoleField
              key={field.role}
              role={field.role}
              title={field.title}
              description={field.description}
              value={field.value}
              overrides={staveAutoRoleRuntimeOverrides[field.role]}
              modelOptions={roleModelOptions}
              recommendedModelOptions={recommendedRoleModelOptions}
              onModelSelect={field.onSelect}
              onClaudeOverrideChange={(key, value) =>
                updateClaudeRoleOverride(field.role, key, value)
              }
              onCodexOverrideChange={(key, value) =>
                updateCodexRoleOverride(field.role, key, value)
              }
            />
          ))}
        </div>
      </LabeledField>
      <LabeledField
        title="Max Subtasks"
        description="Upper bound for supervisor-generated subtasks per orchestration run."
      >
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          value={String(staveAutoMaxSubtasks)}
          onCommit={(value) =>
            updateSettings({
              patch: {
                staveAutoMaxSubtasks: Math.min(
                  8,
                  Math.max(1, readInt(value, 3)),
                ),
              },
            })
          }
        />
      </LabeledField>
      <LabeledField
        title="Max Parallel Subtasks"
        description="How many independent subtasks Stave may execute at the same time."
      >
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          value={String(staveAutoMaxParallelSubtasks)}
          onCommit={(value) =>
            updateSettings({
              patch: {
                staveAutoMaxParallelSubtasks: Math.min(
                  8,
                  Math.max(1, readInt(value, 2)),
                ),
              },
            })
          }
        />
      </LabeledField>
      <SwitchField
        title="Cross-Provider Workers"
        description="Allow orchestration to mix Claude and Codex workers in the same request."
        checked={staveAutoAllowCrossProviderWorkers}
        onCheckedChange={(checked) =>
          updateSettings({
            patch: { staveAutoAllowCrossProviderWorkers: checked },
          })
        }
      />
    </SettingsCard>
  );
}

export function ProvidersSection() {
  const [
    modelClaude,
    claudePermissionMode,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    claudeTaskBudgetTokens,
    claudeAdvisorModel,
    claudeSettingSources,
    claudeEffort,
    claudeThinkingMode,
    claudeAgentProgressSummaries,
    codexFileAccess,
    codexNetworkAccess,
    codexApprovalPolicy,
    codexReasoningEffort,
    codexWebSearch,
    codexShowRawReasoning,
    codexReasoningSummary,
    codexReasoningSummarySupport,
    codexFastMode,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelClaude,
          state.settings.claudePermissionMode,
          state.settings.claudeAllowDangerouslySkipPermissions,
          state.settings.claudeSandboxEnabled,
          state.settings.claudeAllowUnsandboxedCommands,
          state.settings.claudeTaskBudgetTokens,
          state.settings.claudeAdvisorModel,
          state.settings.claudeSettingSources,
          state.settings.claudeEffort,
          state.settings.claudeThinkingMode,
          state.settings.claudeAgentProgressSummaries,
          state.settings.codexFileAccess,
          state.settings.codexNetworkAccess,
          state.settings.codexApprovalPolicy,
          state.settings.codexReasoningEffort,
          state.settings.codexWebSearch,
          state.settings.codexShowRawReasoning,
          state.settings.codexReasoningSummary,
          state.settings.codexReasoningSummarySupport,
          state.settings.codexFastMode,
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
  const defaultClaudeAdvisorModel = getDefaultModelForProvider({
    providerId: "claude-code",
  });
  const defaultClaudeAdvisorSourceModel = resolveClaudeAdvisorSourceModel({
    model: defaultClaudeAdvisorModel,
    fallback: "claude-sonnet-4-6",
  });
  const claudeAdvisorModelEnabled = claudeAdvisorModel.trim().length > 0;
  const activeClaudeAdvisorSourceModel = resolveClaudeAdvisorSourceModel({
    model: claudeAdvisorModel.trim() || modelClaude,
    fallback: defaultClaudeAdvisorSourceModel,
  });
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
      <SectionHeading
        title="Providers"
        description="Provider-specific runtime controls and connected feature status for Stave, Claude, and Codex."
      />
      <Tabs defaultValue="stave" className="gap-4">
        <TabsList className="h-auto w-full justify-start rounded-xl border border-border/70 bg-muted/30 p-1">
          <TabsTrigger
            value="stave"
            className="h-8 flex-none rounded-lg px-3 text-xs font-medium"
          >
            Stave
          </TabsTrigger>
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

        <TabsContent value="stave">
          <SectionStack>
            <StaveAutoCard />
          </SectionStack>
        </TabsContent>

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
                <div className="grid gap-2 sm:grid-cols-3">
                  {CLAUDE_SETTING_SOURCE_HELP.map((option) => (
                    <Button
                      key={option.value}
                      className="h-auto min-h-16 items-start justify-start whitespace-normal rounded-md px-3 py-2.5 text-left"
                      variant={
                        claudeSettingSources.includes(option.value)
                          ? "default"
                          : "outline"
                      }
                      onClick={() => toggleClaudeSettingSource(option.value)}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="text-xs opacity-80">
                          {option.description}
                        </p>
                      </div>
                    </Button>
                  ))}
                </div>
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
              <SwitchField
                title="Use Advisor"
                description="Control whether Stave passes `advisorModel` to the Claude SDK."
                checked={claudeAdvisorModelEnabled}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: {
                      claudeAdvisorModel: checked
                        ? activeClaudeAdvisorSourceModel
                        : "",
                    },
                  })
                }
              />
              {claudeAdvisorModelEnabled ? (
                <LabeledField
                  title="Claude Model"
                  description="Select a Claude model family for advisor mapping. Stave maps it as haiku->sonnet, sonnet->opus, opus->opus before sending `advisorModel`."
                >
                  <ModelSelector
                    value={buildModelSelectorValue({
                      model: activeClaudeAdvisorSourceModel,
                    })}
                    options={CLAUDE_ADVISOR_SOURCE_MODEL_OPTIONS}
                    className="w-full"
                    triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
                    menuClassName="sm:max-w-lg"
                    onSelect={({ selection }) =>
                      updateSettings({
                        patch: {
                          claudeAdvisorModel: selection.model,
                        },
                      })
                    }
                  />
                </LabeledField>
              ) : null}
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
              <LabeledField
                title="Reasoning"
                guide={
                  <SettingsFieldGuide
                    title="Codex Reasoning Effort"
                    summary="Higher effort gives Codex more room to reason, but it also tends to slow the turn down."
                    items={buildGuideItems(CODEX_REASONING_EFFORT_HELP)}
                    examples={buildGuideExamples(CODEX_REASONING_EFFORT_HELP)}
                    tooltip="Compare Codex reasoning effort levels"
                  />
                }
              >
                <DescribedSelect
                  value={codexReasoningEffort}
                  options={CODEX_REASONING_EFFORT_HELP}
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
                  value={codexWebSearch}
                  options={CODEX_WEB_SEARCH_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexWebSearch: value,
                      },
                    })
                  }
                />
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
