import { i18n, useTranslation } from "@/i18n";
import { useAccountRuntimeOptions } from "@/lib/providers/use-provider-accounts";
import { selectedProviderAccount } from "@/lib/providers/provider-account-selection";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  buildAutoModelSelectorOption,
  buildModelEnrichmentFromCatalogs,
  buildModelSelectorOptions,
  buildModelSelectorValue,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector";
import type { PromptInputProviderModeStatus } from "@/components/ai-elements/prompt-input-provider-mode";
import {
  STANCE_LABELS,
  formatResolvedRouteLabel,
} from "@/lib/providers/auto-routing-profile";
import { formatAutoRoutingSignalSummary } from "@/lib/routing/auto-routing";
import { toast } from "@/components/ui";
import { buildCommandPaletteItems } from "@/lib/commands";
import {
  CLAUDE_PROVIDER_MODE_PRESETS,
  CODEX_PROVIDER_MODE_PRESETS,
  CURSOR_PROVIDER_MODE_PRESETS,
  KIRO_PROVIDER_MODE_PRESETS,
  detectClaudeProviderModePreset,
  detectCodexProviderModePreset,
  detectCursorProviderModePreset,
  detectKiroProviderModePreset,
  resolveClaudeProviderModePresentation,
  resolveCodexProviderModePresentation,
  resolveCursorProviderModePresentation,
  resolveKiroProviderModePresentation,
  type ProviderModePresetDefinition,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import { applyModelRuntimePreference } from "@/lib/providers/model-runtime-preferences";
import {
  buildAutoRoutingSelectionOverrides,
  buildModelSelectionRuntimeOverrides,
} from "@/lib/providers/model-effort";
import type { ClaudeSettingSource } from "@/lib/providers/provider.types";
import {
  getCachedProviderCommandCatalog,
  getInitialProviderCommandCatalog,
  setCachedProviderCommandCatalog,
  toProviderCommandCatalogState,
  type ProviderCommandCatalogState,
} from "@/lib/providers/provider-command-catalog";
import {
  clampCodexEffortToModel,
  getDefaultModelForProvider,
  getProviderLabel,
  listProviderIds,
  normalizeModelSelection,
  providerSupportsNativeCommandCatalog,
} from "@/lib/providers/model-catalog";
import {
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
  resolveModelShortcutEffort,
} from "@/lib/providers/model-shortcuts";
import { useProviderModelCatalogs } from "@/lib/providers/use-provider-model-catalogs";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  KIRO_EFFORT_OPTIONS,
  findOptionLabel,
} from "@/lib/providers/runtime-option-contract";
import { getEffectiveSkillEntries } from "@/lib/skills/catalog";
import {
  canTakeOverTask,
  getTaskControlOwner,
  isTaskArchived,
  isTaskManaged,
} from "@/lib/tasks";
import { useReviewTaskControls } from "@/components/session/use-review-task-controls";
import { holdsComposerTurn, usePendingAutoRoutingStore } from "@/store/pending-auto-routing-store";
import { useAppStore } from "@/store/app.store";
import { dispatchTopBarPrAction } from "@/components/layout/top-bar-pr-events";
import {
  resolvePromptDraftPlanModeChange,
  resolvePromptDraftModelForProvider,
  resolvePromptDraftRuntimeState,
} from "@/store/prompt-draft-runtime";
import { useShallow } from "zustand/react/shallow";
import {
  buildChatInputGoalStatus,
  buildChatInputRuntimeStatusItems,
  buildCommandCatalogRuntimeOptions,
} from "./chat-input.runtime";
import { useScopedTaskId } from "./task-scope-context";
import {
  EMPTY_MESSAGES,
  EMPTY_PROMPT_DRAFT,
  shouldEnablePromptInputWindowShortcuts,
} from "./chat-input.utils";
import { ChatInputComposer } from "./ChatInputComposer";

const PROVIDER_IDS = listProviderIds();
const INACTIVE_CLAUDE_SETTING_SOURCES: ClaudeSettingSource[] = ["project"];
const INACTIVE_CLAUDE_SETTINGS = [
  "auto",
  null,
  false,
  false,
  true,
  0,
  INACTIVE_CLAUDE_SETTING_SOURCES,
  "medium",
  "adaptive",
  false,
  "",
] as const;
const INACTIVE_CODEX_SETTINGS = [
  "workspace-write",
  false,
  "untrusted",
  "medium",
  "cached",
  false,
  "auto",
  "auto",
  "",
  false,
  false,
] as const;
const EMPTY_PROVIDER_MODE_PRESETS: readonly ProviderModePresetDefinition[] = [];

function BaseChatInput() {
  useTranslation();
  const [providerCommandCatalog, setProviderCommandCatalog] = useState(() =>
    getCachedProviderCommandCatalog({
      providerId: "claude-code",
    }),
  );
  const activeTaskId = useScopedTaskId();
  const windowShortcutsEnabled = useAppStore((state) =>
    shouldEnablePromptInputWindowShortcuts({
      scopedTaskId: activeTaskId,
      activeTaskId: state.activeTaskId,
    }),
  );
  const [
    providerAvailability,
    providerCommandCatalogRefreshNonce,
    setTaskProvider,
    updatePromptDraft,
    clearTaskProviderSession,
    abortTaskTurn,
    updateSettings,
    updateModelRuntimePreference,
    refreshSkillCatalog,
    sendUserMessage,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.providerAvailability,
          state.providerCommandCatalogRefreshNonce,
          state.setTaskProvider,
          state.updatePromptDraft,
          state.clearTaskProviderSession,
          state.abortTaskTurn,
          state.updateSettings,
          state.updateModelRuntimePreference,
          state.refreshSkillCatalog,
          state.sendUserMessage,
        ] as const,
    ),
  );
  const activeTask = useAppStore(
    (state) =>
      state.tasks.find(
        (task) => task.id === activeTaskId && !isTaskArchived(task),
      ) ?? null,
  );
  const draftProvider = useAppStore((state) => state.draftProvider);
  const activeProvider = activeTask?.provider ?? draftProvider;
  const accountOptions = useAccountRuntimeOptions();
  const commandAccountId = selectedProviderAccount(activeProvider, accountOptions);
  const activeProviderGoal = useAppStore(
    (state) => state.providerGoalByTask[activeTaskId] ?? null,
  );
  const codexBinaryPathForCatalog = useAppStore(
    (state) => state.settings.codexBinaryPath,
  );
  const cursorBinaryPathForCatalog = useAppStore(
    (state) => state.settings.cursorBinaryPath,
  );
  const kiroBinaryPathForCatalog = useAppStore(
    (state) => state.settings.kiroBinaryPath,
  );
  const promptDraftRuntimeOverrides = useAppStore(
    (state) =>
      state.promptDraftByTask[activeTaskId || "draft:session"]
        ?.runtimeOverrides,
  );
  const workspaceCwd = useAppStore(
    (state) =>
      state.workspacePathById[state.activeWorkspaceId] ??
      state.repositoryPath ??
      undefined,
  );
  // Current-branch PR identity, so an attached PR-context part can be shown as
  // stale once the PR head moves (`src/lib/pr-context.ts`).
  const currentPrUrl = useAppStore(
    (state) =>
      state.workspacePrInfoById[state.activeWorkspaceId]?.pr?.url ?? null,
  );
  const currentPrHeadSha = useAppStore(
    (state) =>
      state.workspacePrInfoById[state.activeWorkspaceId]?.pr?.headRefOid ??
      null,
  );
  const activeMessageCount = useAppStore(
    (state) =>
      state.messageCountByTask[activeTaskId] ??
      (state.messagesByTask[activeTaskId] ?? EMPTY_MESSAGES).length,
  );
  const activeTurnId = useAppStore(
    (state) => state.activeTurnIdsByTask[activeTaskId] ?? null,
  );
  // A send waiting on Auto's classifier has no turn yet, but to the user it is
  // already running: Stop and Esc must reach it (abortTaskTurn cancels it).
  const autoRoutePending = usePendingAutoRoutingStore((state) =>
    holdsComposerTurn(state.byTaskId[activeTaskId]),
  );
  const isTurnActive = Boolean(activeTurnId) || autoRoutePending;
  const latestMessageIsPlanResponse = useAppStore((state) => {
    const messages = state.messagesByTask[activeTaskId] ?? EMPTY_MESSAGES;
    const lastMessage = messages[messages.length - 1];
    return Boolean(
      lastMessage &&
      lastMessage.role === "assistant" &&
      lastMessage.isPlanResponse === true &&
      lastMessage.planText?.trim(),
    );
  });
  const [
    modelClaude,
    modelCodex,
    modelCursor,
    modelKiro,
    skillsEnabled,
    skillsAutoSuggest,
    providerTimeoutMs,
    modelShortcutKeys,
    modelShortcutEfforts,
    autoRoutingEnabled,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelClaude,
          state.settings.modelCodex,
          state.settings.modelCursor,
          state.settings.modelKiro,
          state.settings.skillsEnabled,
          state.settings.skillsAutoSuggest,
          state.settings.providerTimeoutMs,
          state.settings.modelShortcutKeys,
          state.settings.modelShortcutEfforts,
          state.settings.autoRoutingEnabled,
        ] as const,
    ),
  );
  const autoRoutingStance = useAppStore(
    (state) => state.settings.autoRoutingProfile.stance,
  );
  const autoRoutingDecisionRecord = useAppStore(
    (state) => state.autoRoutingDecisionByTask[activeTaskId] ?? null,
  );
  const providerSelectionTarget = activeTaskId || "draft:session";
  const activeModel =
    activeProvider === "claude-code"
      ? resolvePromptDraftModelForProvider({
          providerId: activeProvider,
          runtimeOverrides: promptDraftRuntimeOverrides,
          fallbackModel: modelClaude,
        })
      : resolvePromptDraftModelForProvider({
          providerId: activeProvider,
          runtimeOverrides: promptDraftRuntimeOverrides,
          fallbackModel:
            activeProvider === "codex"
              ? modelCodex
              : activeProvider === "cursor"
                ? modelCursor
                : modelKiro,
        });
  const cursorMode = useAppStore((state) => state.settings.cursorMode);
  const cursorApprovalMode = useAppStore((state) =>
    activeProvider === "cursor"
      ? applyModelRuntimePreference({
          settings: state.settings,
          providerId: activeProvider,
          model: activeModel,
        }).cursorApprovalMode
      : state.settings.cursorApprovalMode,
  );
  const kiroApprovalMode = useAppStore((state) =>
    activeProvider === "kiro"
      ? applyModelRuntimePreference({
          settings: state.settings,
          providerId: activeProvider,
          model: activeModel,
        }).kiroApprovalMode
      : state.settings.kiroApprovalMode,
  );
  const kiroEffort = useAppStore((state) => {
    if (activeProvider !== "kiro") {
      return "medium" as const;
    }
    return applyModelRuntimePreference({
      settings: state.settings,
      providerId: activeProvider,
      model: activeModel,
    }).kiroEffort;
  });
  const [
    claudePermissionMode,
    claudePermissionModeBeforePlan,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    claudeTaskBudgetTokens,
    claudeSettingSources,
    savedClaudeEffort,
    claudeThinkingMode,
    claudeAgentProgressSummaries,
    claudeBinaryPath,
  ] = useAppStore(
    useShallow((state) => {
      if (activeProvider !== "claude-code") {
        return INACTIVE_CLAUDE_SETTINGS;
      }
      const settings = applyModelRuntimePreference({
        settings: state.settings,
        providerId: activeProvider,
        model: activeModel,
      });
      return [
        settings.claudePermissionMode,
        settings.claudePermissionModeBeforePlan,
        settings.claudeAllowDangerouslySkipPermissions,
        settings.claudeSandboxEnabled,
        settings.claudeAllowUnsandboxedCommands,
        settings.claudeTaskBudgetTokens,
        settings.claudeSettingSources,
        settings.claudeEffort,
        settings.claudeThinkingMode,
        settings.claudeAgentProgressSummaries,
        settings.claudeBinaryPath,
      ] as const;
    }),
  );
  const [
    codexFileAccess,
    codexNetworkAccess,
    codexApprovalPolicy,
    savedCodexReasoningEffort,
    codexWebSearch,
    codexShowRawReasoning,
    codexReasoningSummary,
    codexReasoningSummarySupport,
    codexBinaryPath,
    codexPlanMode,
    codexFastMode,
  ] = useAppStore(
    useShallow((state) => {
      if (activeProvider !== "codex") {
        return INACTIVE_CODEX_SETTINGS;
      }
      const settings = applyModelRuntimePreference({
        settings: state.settings,
        providerId: activeProvider,
        model: activeModel,
      });
      return [
        settings.codexFileAccess,
        settings.codexNetworkAccess,
        settings.codexApprovalPolicy,
        settings.codexReasoningEffort,
        settings.codexWebSearch,
        settings.codexShowRawReasoning,
        settings.codexReasoningSummary,
        settings.codexReasoningSummarySupport,
        settings.codexBinaryPath,
        settings.codexPlanMode,
        settings.codexFastMode,
      ] as const;
    }),
  );
  const claudeEffort =
    promptDraftRuntimeOverrides?.claudeEffort ?? savedClaudeEffort;
  const codexReasoningEffort =
    promptDraftRuntimeOverrides?.codexReasoningEffort ?? savedCodexReasoningEffort;
  const skillCatalog = useAppStore((state) => state.skillCatalog);
  const taskRuntimeState = useMemo(
    () =>
      resolvePromptDraftRuntimeState({
        promptDraft: promptDraftRuntimeOverrides
          ? {
              ...EMPTY_PROMPT_DRAFT,
              runtimeOverrides: promptDraftRuntimeOverrides,
            }
          : null,
        fallback: {
          claudePermissionMode,
          claudePermissionModeBeforePlan,
          codexPlanMode,
          cursorMode,
          kiroEffort,
        },
      }),
    [
      claudePermissionMode,
      claudePermissionModeBeforePlan,
      codexPlanMode,
      cursorMode,
      kiroEffort,
      promptDraftRuntimeOverrides,
    ],
  );
  const effectiveClaudePermissionMode = taskRuntimeState.claudePermissionMode;
  const effectiveClaudePermissionModeBeforePlan =
    taskRuntimeState.claudePermissionModeBeforePlan;
  const effectiveCodexPlanMode = taskRuntimeState.codexPlanMode;
  const effectiveCursorMode = taskRuntimeState.cursorMode;
  const effectiveKiroEffort = taskRuntimeState.kiroEffort ?? kiroEffort;
  const catalogRuntimeOptions = useMemo(
    () => ({
      ...(codexBinaryPathForCatalog
        ? { codexBinaryPath: codexBinaryPathForCatalog }
        : {}),
      ...(cursorBinaryPathForCatalog
        ? { cursorBinaryPath: cursorBinaryPathForCatalog }
        : {}),
      ...(kiroBinaryPathForCatalog
        ? { kiroBinaryPath: kiroBinaryPathForCatalog }
        : {}),
    }),
    [
      codexBinaryPathForCatalog,
      cursorBinaryPathForCatalog,
      kiroBinaryPathForCatalog,
    ],
  );
  const providerModelCatalogs = useProviderModelCatalogs({
    enabled: true,
    cwd: workspaceCwd,
    runtimeOptions: catalogRuntimeOptions,
  });
  const isEmpty = activeMessageCount === 0;
  const activeProviderAvailable = providerAvailability[activeProvider];
  const isAutoRoutingSelected =
    promptDraftRuntimeOverrides?.autoRouting === true;
  const autoModelOption = useMemo<ModelSelectorOption>(
    () =>
      buildAutoModelSelectorOption({
        providerId: activeProvider,
        available: autoRoutingEnabled,
        stanceLabel: STANCE_LABELS[autoRoutingStance],
        pending: autoRoutePending,
        routed:
          autoRoutingEnabled &&
          autoRoutingDecisionRecord &&
          autoRoutingDecisionRecord.decision.source !== "disabled" &&
          autoRoutingDecisionRecord.decision.source !== "manual"
            ? {
                label: formatResolvedRouteLabel({
                  model: autoRoutingDecisionRecord.decision.model,
                  effort:
                    autoRoutingDecisionRecord.decision.claudeEffort ??
                    autoRoutingDecisionRecord.decision.codexReasoningEffort,
                }),
                description: `${autoRoutingDecisionRecord.decision.ruleReason} — ${formatAutoRoutingSignalSummary(autoRoutingDecisionRecord.decision.signals)}`,
              }
            : null,
      }),
    [
      activeProvider,
      autoRoutePending,
      autoRoutingDecisionRecord,
      autoRoutingEnabled,
      autoRoutingStance,
    , i18n.language],
  );
  const selectedModelOption = isAutoRoutingSelected
    ? autoModelOption
    : buildModelSelectorValue({
        providerId: activeProvider,
        model: activeModel,
        label: providerModelCatalogs.catalogs[
          activeProvider
        ].entries.find((entry) => entry.model === activeModel)?.displayName,
        description: providerModelCatalogs.catalogs[activeProvider].entries.find((entry) => entry.model === activeModel)?.description,
        available: activeProviderAvailable,
      });
  const modelEnrichment = useMemo(
    () => buildModelEnrichmentFromCatalogs(providerModelCatalogs.catalogs),
    [providerModelCatalogs.catalogs],
  );
  const modelOptions = useMemo<ModelSelectorOption[]>(
    () => [
      autoModelOption,
      ...buildModelSelectorOptions({
        providerIds: PROVIDER_IDS,
        availabilityByProvider: providerAvailability,
        modelsByProvider: {
          "claude-code": providerModelCatalogs.catalogs["claude-code"].models,
          codex: providerModelCatalogs.catalogs.codex.models,
          cursor: providerModelCatalogs.catalogs.cursor.models,
          kiro: providerModelCatalogs.catalogs.kiro.models,
        },
        enrichmentByModel: modelEnrichment,
      }),
    ],
    [
      autoModelOption,
      modelEnrichment,
      providerModelCatalogs.catalogs,
      providerAvailability,
    ],
  );
  const normalizedModelShortcutKeys = useMemo(
    () => normalizeModelShortcutKeys(modelShortcutKeys),
    [modelShortcutKeys],
  );
  const normalizedModelShortcutEfforts = useMemo(
    () => normalizeModelShortcutEfforts(modelShortcutEfforts),
    [modelShortcutEfforts],
  );
  const managedTaskOwner = isTaskManaged(activeTask)
    ? getTaskControlOwner(activeTask)
    : null;
  const canTakeOverManagedTask = canTakeOverTask({
    task: activeTask,
  });
  const effortLabel = useMemo(() => {
    if (activeProvider === "claude-code") {
      return findOptionLabel(CLAUDE_EFFORT_OPTIONS, claudeEffort);
    }
    if (activeProvider === "codex") {
      return findOptionLabel(CODEX_EFFORT_OPTIONS, codexReasoningEffort);
    }
    if (activeProvider === "kiro") {
      return findOptionLabel(KIRO_EFFORT_OPTIONS, effectiveKiroEffort);
    }
    return undefined;
  }, [
    activeProvider,
    claudeEffort,
    codexReasoningEffort,
    effectiveKiroEffort,
  ]);
  const effortValue =
    activeProvider === "claude-code"
      ? claudeEffort
      : activeProvider === "codex"
        ? codexReasoningEffort
        : activeProvider === "kiro"
          ? effectiveKiroEffort
          : promptDraftRuntimeOverrides?.cursorEffort;
  const goalStatus = useMemo(
    () =>
      buildChatInputGoalStatus({
        providerGoal: activeProvider === "codex" ? activeProviderGoal : null,
      }),
    [activeProvider, activeProviderGoal, i18n.language],
  );
  const runtimeStatusItems = useMemo(() => {
    return buildChatInputRuntimeStatusItems({
      activeProvider,
      providerTimeoutMs,
      claudePermissionMode: effectiveClaudePermissionMode,
      claudeAllowDangerouslySkipPermissions,
      claudeSandboxEnabled,
      claudeAllowUnsandboxedCommands,
      claudeTaskBudgetTokens,
      claudeSettingSources,
      claudeEffort,
      claudeThinkingMode,
      claudeAgentProgressSummaries,
      claudeBinaryPath,
      codexFileAccess,
      codexNetworkAccess,
      codexApprovalPolicy,
      codexReasoningEffort,
      codexWebSearch,
      codexShowRawReasoning,
      codexReasoningSummary,
      codexReasoningSummarySupport,
      codexFastMode,
      codexPlanMode: effectiveCodexPlanMode,
      codexBinaryPath,
      claudePermissionModeBeforePlan: effectiveClaudePermissionModeBeforePlan,
    });
  }, [
    activeProvider,
    claudeAllowDangerouslySkipPermissions,
    claudeAgentProgressSummaries,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudeBinaryPath,
    claudeSandboxEnabled,
    claudeSettingSources,
    claudeTaskBudgetTokens,
    claudeThinkingMode,
    codexApprovalPolicy,
    codexFastMode,
    codexReasoningEffort,
    codexNetworkAccess,
    codexBinaryPath,
    codexReasoningSummary,
    codexFileAccess,
    codexShowRawReasoning,
    codexReasoningSummarySupport,
    codexWebSearch,
    effectiveClaudePermissionMode,
    effectiveClaudePermissionModeBeforePlan,
    effectiveCodexPlanMode,
    providerTimeoutMs,
  , i18n.language]);
  const providerModeStatus =
    useMemo<PromptInputProviderModeStatus | null>(() => {
      if (activeProvider === "claude-code") {
        return {
          providerLabel: "Claude",
          ...resolveClaudeProviderModePresentation({
            settings: {
              claudePermissionMode,
              claudeAllowDangerouslySkipPermissions,
              claudeSandboxEnabled,
              claudeAllowUnsandboxedCommands,
            },
            planMode: effectiveClaudePermissionMode === "plan",
          }),
        };
      }

      if (activeProvider === "codex") {
        return {
          providerLabel: "Codex",
          ...resolveCodexProviderModePresentation({
            settings: {
              codexFileAccess,
              codexApprovalPolicy,
              codexNetworkAccess,
              codexWebSearch,
            },
            planMode: effectiveCodexPlanMode,
          }),
        };
      }

      if (activeProvider === "cursor") {
        return {
          providerLabel: "Cursor",
          ...resolveCursorProviderModePresentation({
            settings: { cursorApprovalMode },
            planMode: effectiveCursorMode === "plan",
          }),
        };
      }

      if (activeProvider === "kiro") {
        return {
          providerLabel: "Kiro",
          ...resolveKiroProviderModePresentation({
            settings: { kiroApprovalMode },
          }),
        };
      }

      return null;
    }, [
      activeProvider,
      claudeAllowDangerouslySkipPermissions,
      claudeAllowUnsandboxedCommands,
      claudePermissionMode,
      claudeSandboxEnabled,
      codexApprovalPolicy,
      codexFileAccess,
      codexNetworkAccess,
      codexWebSearch,
      cursorApprovalMode,
      effectiveClaudePermissionMode,
      effectiveCodexPlanMode,
      effectiveCursorMode,
      kiroApprovalMode,
    ]);
  const activeProviderModePresetId =
    useMemo<ProviderModePresetId | null>(() => {
      if (activeProvider === "claude-code") {
        return detectClaudeProviderModePreset({
          settings: {
            claudePermissionMode,
            claudeAllowDangerouslySkipPermissions,
            claudeSandboxEnabled,
            claudeAllowUnsandboxedCommands,
          },
        });
      }

      if (activeProvider === "codex") {
        return detectCodexProviderModePreset({
          settings: {
            codexFileAccess,
            codexApprovalPolicy,
            codexNetworkAccess,
            codexWebSearch,
          },
        });
      }

      if (activeProvider === "cursor") {
        return detectCursorProviderModePreset({
          settings: { cursorApprovalMode },
        });
      }

      if (activeProvider === "kiro") {
        return detectKiroProviderModePreset({
          settings: { kiroApprovalMode },
        });
      }

      return null;
    }, [
      activeProvider,
      claudeAllowDangerouslySkipPermissions,
      claudeAllowUnsandboxedCommands,
      claudePermissionMode,
      claudeSandboxEnabled,
      codexApprovalPolicy,
      codexFileAccess,
      codexNetworkAccess,
      codexWebSearch,
      cursorApprovalMode,
      kiroApprovalMode,
    ]);
  const providerModePresets = useMemo(() => {
    if (activeProvider === "claude-code") {
      return CLAUDE_PROVIDER_MODE_PRESETS;
    }
    if (activeProvider === "codex") {
      return CODEX_PROVIDER_MODE_PRESETS;
    }
    if (activeProvider === "cursor") {
      return CURSOR_PROVIDER_MODE_PRESETS;
    }
    if (activeProvider === "kiro") {
      return KIRO_PROVIDER_MODE_PRESETS;
    }
    return EMPTY_PROVIDER_MODE_PRESETS;
  }, [activeProvider]);
  const onProviderModeSelect = useMemo(
    () => (presetId: ProviderModePresetId) =>
      updateModelRuntimePreference({
        providerId: activeProvider,
        model: activeModel,
        patch: { mode: presetId },
      }),
    [activeModel, activeProvider, updateModelRuntimePreference],
  );

  useEffect(() => {
    let cancelled = false;

    if (!providerSupportsNativeCommandCatalog({ providerId: activeProvider })) {
      const nextCatalog = getInitialProviderCommandCatalog({
        providerId: activeProvider,
      });
      setProviderCommandCatalog(nextCatalog);
      setCachedProviderCommandCatalog({
        providerId: activeProvider,
        cwd: workspaceCwd,
        accountProfileId: commandAccountId,
        catalog: nextCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    const getCommandCatalog = window.api?.provider?.getCommandCatalog;
    if (!getCommandCatalog) {
      const nextCatalog: ProviderCommandCatalogState = {
        providerId: activeProvider,
        status: "error",
        commands: [],
        detail: i18n.t("session:chatInput.detail"),
      };
      setProviderCommandCatalog(nextCatalog);
      setCachedProviderCommandCatalog({
        providerId: activeProvider,
        cwd: workspaceCwd,
        accountProfileId: commandAccountId,
        catalog: nextCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    const loadingCatalog: ProviderCommandCatalogState = {
      providerId: activeProvider,
      status: "loading",
      commands: [],
      detail: i18n.t("session:chatInput.detail2", { value1: getProviderLabel({ providerId: activeProvider }) }),
    };
    setProviderCommandCatalog(loadingCatalog);
    setCachedProviderCommandCatalog({
      providerId: activeProvider,
      cwd: workspaceCwd,
      accountProfileId: commandAccountId,
      catalog: loadingCatalog,
    });

    const runtimeOptions = buildCommandCatalogRuntimeOptions({
      activeProvider,
      claudeSettingSources,
      claudeBinaryPath,
    });

    void getCommandCatalog({
      providerId: activeProvider,
      cwd: workspaceCwd,
      runtimeOptions: { ...runtimeOptions, ...accountOptions },
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const nextCatalog = toProviderCommandCatalogState({
          providerId: activeProvider,
          response,
        });
        setProviderCommandCatalog(nextCatalog);
        setCachedProviderCommandCatalog({
          providerId: activeProvider,
          cwd: workspaceCwd,
          accountProfileId: commandAccountId,
          catalog: nextCatalog,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const nextCatalog = toProviderCommandCatalogState({
          providerId: activeProvider,
          error,
        });
        setProviderCommandCatalog(nextCatalog);
        setCachedProviderCommandCatalog({
          providerId: activeProvider,
          cwd: workspaceCwd,
          accountProfileId: commandAccountId,
          catalog: nextCatalog,
        });
      });

    return () => {
      cancelled = true;
    };
    // Deps are deliberately limited to inputs that can change the native
    // command catalog. Every re-run spawns a `claude` subprocess that
    // reconnects all MCP servers, so re-running on model / effort / thinking /
    // permission / sandbox changes used to duplicate remote connector
    // handshakes (Figma, Slack) around the first message of a session.
  }, [
    activeProvider,
    commandAccountId,
    accountOptions,
    claudeBinaryPath,
    claudeSettingSources,
    providerCommandCatalogRefreshNonce,
    workspaceCwd,
  ]);

  const commandPalette = useMemo(
    () =>
      buildCommandPaletteItems({
        provider: activeProvider,
        providerCommandCatalog,
      }),
    [activeProvider, providerCommandCatalog],
  );
  const skillPalette = useMemo(
    () =>
      getEffectiveSkillEntries({
        skills: skillCatalog.skills,
        providerId: activeProvider,
      }),
    [activeProvider, skillCatalog.skills],
  );
  const deferredCommandPaletteItems = useDeferredValue(commandPalette.items);
  const deferredSkillPalette = useDeferredValue(skillPalette);

  const { reviewModelOptions, preferredReviewModelKey, handleLocalChangeReview } =
    useReviewTaskControls({ activeTaskId, activeProvider, modelOptions, sendUserMessage });

  useEffect(() => {
    if (!skillsEnabled) {
      return;
    }
    const targetPath = workspaceCwd ?? null;
    if (skillCatalog.workspacePath === targetPath) {
      if (skillCatalog.status === "loading") {
        return;
      }
      const fetchedAtMs = skillCatalog.fetchedAt
        ? Date.parse(skillCatalog.fetchedAt)
        : 0;
      if (skillCatalog.status === "ready") {
        const CATALOG_TTL_MS = 5 * 60 * 1000;
        if (Date.now() - fetchedAtMs < CATALOG_TTL_MS) {
          return;
        }
      }
      if (skillCatalog.status === "error") {
        const ERROR_RETRY_TTL_MS = 30 * 1000;
        if (Date.now() - fetchedAtMs < ERROR_RETRY_TTL_MS) {
          return;
        }
      }
    }
    void refreshSkillCatalog({ workspacePath: targetPath });
  }, [
    refreshSkillCatalog,
    skillsEnabled,
    skillCatalog.status,
    skillCatalog.workspacePath,
    skillCatalog.fetchedAt,
    workspaceCwd,
  ]);

  return (
    <ChatInputComposer
      isEmpty={isEmpty}
      activeTaskId={activeTaskId}
      windowShortcutsEnabled={windowShortcutsEnabled}
      activeProvider={activeProvider}
      workspaceCwd={workspaceCwd}
      providerSelectionTarget={providerSelectionTarget}
      isTurnActive={isTurnActive}
      managedTaskOwner={managedTaskOwner}
      sourceContexts={activeTask?.sourceContexts ?? []}
      currentPrUrl={currentPrUrl}
      currentPrHeadSha={currentPrHeadSha}
      onRemoveSourceContext={(sourceId) => {
        useAppStore
          .getState()
          .removeTaskSourceContext({ taskId: activeTaskId, sourceId });
      }}
      onClearSourceContexts={() => {
        useAppStore
          .getState()
          .clearTaskSourceContexts({ taskId: activeTaskId });
      }}
      onRefreshPrContext={() => dispatchTopBarPrAction("attach-context")}
      canTakeOverManagedTask={canTakeOverManagedTask}
      onTakeOverManagedTask={() => {
        void useAppStore
          .getState()
          .takeOverTask({ taskId: activeTaskId })
          .then((result) => {
            if (!result.ok) {
              toast.error(i18n.t("session:chatInput.copy"), {
                description: result.message,
              });
              return;
            }
            if (result.craneReceiptPending) {
              toast.info(i18n.t("session:chatInput.copy2"), {
                description:
                  i18n.t("session:chatInput.description"),
              });
            }
          });
      }}
      selectedModelOption={selectedModelOption}
      modelOptions={modelOptions}
      modelCatalogs={providerModelCatalogs.catalogs}
      onRefreshModelCatalogs={providerModelCatalogs.refresh}
      modelShortcutKeys={normalizedModelShortcutKeys}
      modelShortcutEfforts={normalizedModelShortcutEfforts}
      commandPaletteItems={deferredCommandPaletteItems}
      commandPaletteProviderNote={commandPalette.providerNote}
      skillsEnabled={skillsEnabled}
      skillsAutoSuggest={skillsAutoSuggest}
      skillPaletteItems={deferredSkillPalette}
      providerModeStatus={providerModeStatus}
      providerModePresets={providerModePresets}
      activeProviderModePresetId={activeProviderModePresetId}
      goalStatus={goalStatus}
      onProviderModeSelect={onProviderModeSelect}
      runtimeStatusItems={runtimeStatusItems}
      effortLabel={effortLabel}
      effortValue={effortValue}
      reviewModelOptions={reviewModelOptions}
      preferredReviewModelKey={preferredReviewModelKey}
      onLocalChangeReview={handleLocalChangeReview}
      onModelSelect={({ selection, effort, fastMode: nextFastMode }) => {
        if (selection.isAuto) {
          updatePromptDraft({
            taskId: providerSelectionTarget,
            patch: {
              runtimeOverrides: buildAutoRoutingSelectionOverrides({
                runtimeOverrides: promptDraftRuntimeOverrides,
                planMode:
                  activeProvider === "claude-code"
                    ? effectiveClaudePermissionMode === "plan"
                    : activeProvider === "codex"
                      ? effectiveCodexPlanMode
                      : activeProvider === "cursor"
                        ? effectiveCursorMode === "plan"
                        : false,
              }),
            },
          });
          return;
        }
        const nextModel = normalizeModelSelection({
          value: selection.model,
          fallback: getDefaultModelForProvider({
            providerId: selection.providerId,
          }),
        });
        setTaskProvider({
          taskId: providerSelectionTarget,
          provider: selection.providerId,
        });
        updatePromptDraft({
          taskId: providerSelectionTarget,
          patch: {
            runtimeOverrides: buildModelSelectionRuntimeOverrides({
              runtimeOverrides: promptDraftRuntimeOverrides,
              settings: useAppStore.getState().settings,
              providerId: selection.providerId,
              model: nextModel,
              effort: resolveModelShortcutEffort({
                shortcutKey: selection.key,
                effort,
              }),
            }),
          },
        });
        if (selection.providerId === "claude-code") {
          const shortcutEffort = resolveModelShortcutEffort({
            shortcutKey: selection.key,
            effort,
          });
          if (
            shortcutEffort &&
            CLAUDE_EFFORT_OPTIONS.some(
              (option) => option.value === shortcutEffort,
            )
          ) {
            updateModelRuntimePreference({
              providerId: selection.providerId,
              model: nextModel,
              patch: { effort: shortcutEffort },
            });
          }
          return;
        }
        if (selection.providerId === "codex") {
          // Some Codex models accept a narrower effort scale than others
          // (e.g. GPT-5.6 Luna has no "Ultra") — clamp so switching models
          // never leaves an unsupported effort selected.
          const shortcutEffort = resolveModelShortcutEffort({
            shortcutKey: selection.key,
            effort,
          });
          if (shortcutEffort || nextFastMode !== undefined) {
            updateModelRuntimePreference({
              providerId: selection.providerId,
              model: nextModel,
              patch: {
                ...(shortcutEffort
                  ? {
                      effort: clampCodexEffortToModel({
                        model: nextModel,
                        effort: shortcutEffort as typeof codexReasoningEffort,
                      }),
                    }
                  : {}),
                ...(nextFastMode === undefined
                  ? {}
                  : { fastMode: nextFastMode }),
              },
            });
          }
          return;
        }
        if (selection.providerId === "kiro" && effort) {
          updateModelRuntimePreference({
            providerId: selection.providerId,
            model: nextModel,
            patch: { effort },
          });
        }
      }}
      fastMode={activeProvider === "codex" ? codexFastMode : undefined}
      onFastModeChange={
        activeProvider === "codex"
          ? (enabled) => {
              updateModelRuntimePreference({
                providerId: activeProvider,
                model: activeModel,
                patch: { fastMode: enabled },
              });
            }
          : undefined
      }
      planMode={
        isAutoRoutingSelected
          ? promptDraftRuntimeOverrides?.autoRoutingPlanMode === true
          : activeProvider === "codex"
            ? effectiveCodexPlanMode
            : activeProvider === "claude-code"
              ? effectiveClaudePermissionMode === "plan"
              : activeProvider === "cursor" && effectiveCursorMode === "plan"
      }
      onPlanModeChange={
        activeProvider === "codex" || activeProvider === "cursor"
          ? (enabled) => {
              const nextPlanModeState = resolvePromptDraftPlanModeChange({
                providerId: activeProvider,
                enabled,
                runtimeOverrides: promptDraftRuntimeOverrides,
                claudePermissionMode: effectiveClaudePermissionMode,
                claudePermissionModeBeforePlan:
                  effectiveClaudePermissionModeBeforePlan,
                codexPlanMode: effectiveCodexPlanMode,
                isTurnActive,
                hasPlanResponse: latestMessageIsPlanResponse,
              });
              updatePromptDraft({
                taskId: providerSelectionTarget,
                patch: {
                  runtimeOverrides: {
                    ...nextPlanModeState.runtimeOverrides,
                    ...(isAutoRoutingSelected
                      ? { autoRoutingPlanMode: enabled }
                      : {}),
                  },
                },
              });
              if (nextPlanModeState.shouldAbortActiveTurn) {
                abortTaskTurn({ taskId: providerSelectionTarget });
              } else if (nextPlanModeState.shouldClearCodexSession) {
                clearTaskProviderSession({
                  taskId: providerSelectionTarget,
                  providerId: "codex",
                });
              }
            }
          : activeProvider === "claude-code"
            ? (enabled) => {
                const nextPlanModeState = resolvePromptDraftPlanModeChange({
                  providerId: activeProvider,
                  enabled,
                  runtimeOverrides: promptDraftRuntimeOverrides,
                  claudePermissionMode: effectiveClaudePermissionMode,
                  claudePermissionModeBeforePlan:
                    effectiveClaudePermissionModeBeforePlan,
                  codexPlanMode: effectiveCodexPlanMode,
                });
                updatePromptDraft({
                  taskId: providerSelectionTarget,
                  patch: {
                    runtimeOverrides: {
                      ...nextPlanModeState.runtimeOverrides,
                      ...(isAutoRoutingSelected
                        ? { autoRoutingPlanMode: enabled }
                        : {}),
                    },
                  },
                });
              }
            : undefined
      }
      thinkingMode={
        activeProvider === "claude-code" ? claudeThinkingMode : undefined
      }
      onThinkingModeChange={
        activeProvider === "claude-code"
          ? (value) => updateSettings({ patch: { claudeThinkingMode: value } })
          : undefined
      }
    />
  );
}

export function ChatInput() {
  useTranslation();
  return <BaseChatInput />;
}
