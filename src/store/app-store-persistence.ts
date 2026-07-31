import { normalizeAppShortcutKeys } from "@/lib/app-shortcuts";
import { normalizePersistedCompareRuns } from "@/lib/compare-runs";
import { normalizeCraneConnectorSettings } from "@/lib/crane-connector/types";
import {
  normalizeNotificationSoundMode,
  normalizeNotificationSoundPreset,
  normalizeNotificationSoundVolume,
} from "@/lib/notifications/notification-sound";
import { normalizePromptCommentShortcut } from "@/lib/prompt-comment-shortcuts";
import { normalizePersistedAdvisorTarget } from "@/lib/providers/advisor";
import { normalizeModelRuntimePreferences } from "@/lib/providers/model-runtime-preferences";
import {
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
} from "@/lib/providers/model-shortcuts";
import { normalizeResponseStylePrompt } from "@/lib/providers/prompt-defaults";
import { normalizeUtilityInferenceProvider } from "@/lib/providers/utility-inference";
import { upgradeSettingsScopedClaudeModel } from "@/lib/providers/model-catalog";
import { normalizeTrustedToolEntries } from "@/lib/providers/trusted-tools";
import { normalizePrePrReviewProvider } from "@/lib/source-control-review";
import { normalizeSteerQueueEnterAction } from "@/lib/steer-queue-shortcuts";
import { normalizePersistedTaskPresets } from "@/lib/task-presets";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  LEGACY_TERMINAL_FONT_FAMILY,
} from "@/lib/terminal/defaults";
import {
  applyCustomTheme,
  applyFontOverrides,
  applyThemeClass,
  applyThemeOverrides,
  findCustomThemeById,
  resolveDarkModeForTheme,
} from "@/lib/themes";
import {
  DEFAULT_VISUAL_COMMENT_SHORTCUT,
  normalizeVisualCommentShortcut,
} from "@/lib/visual-comment-shortcuts";
import { normalizeWorkspaceInformationSectionVisibility } from "@/lib/workspace-information-sections";
import { normalizeKickoffSourceConfigs } from "@/lib/workspace-kickoff";
import {
  normalizeAutoRoutingEligibleModels,
  normalizeAutoRoutingObjective,
} from "@/store/auto-routing";
import {
  defaultSettings,
  normalizeBorderBeamSize,
  normalizeBorderBeamStrength,
  normalizeBorderBeamVariant,
  normalizePersistedLensSettings,
  normalizeReasoningExpansionMode,
  normalizeSidebarActiveWorkspaceLimit,
  type AppSettings,
} from "@/store/app-settings";
import { normalizeAppActiveSurface } from "@/store/app-surface";
import type { AppState } from "@/store/app-store.types";
import { buildRecentTimestamp } from "@/store/chat-state-helpers";
import { normalizeProviderTimeoutMs } from "@/store/editor.utils";
import { normalizeLayoutState } from "@/store/layout.utils";
import {
  cloneRecentProjectState,
  captureCurrentProjectState,
  normalizeCurrentProjectState,
  normalizeProjectDisplayName,
  normalizeProjectWorkspaceInitCommand,
  normalizeRecentProjectStates,
} from "@/store/project.utils";
import {
  normalizeClaudeSettingSources,
  normalizeClaudeTaskBudgetTokens,
  normalizeCodexApprovalPolicy,
} from "@/store/provider-runtime-options";

const APP_STORE_KEY = "stave-store";

export function normalizeSharedSkillsHomeSetting(value?: string | null) {
  return value?.trim() ?? "";
}

export function createAppStorePersistenceOptions() {
  return {
    name: APP_STORE_KEY,
    partialize: (state: AppState) => ({
      // Keep localStorage limited to lightweight UI/session state.
      // Project/workspace history is mirrored into SQLite so this cache is not the only durable source.
      workspaces: state.workspaces,
      activeWorkspaceId: state.activeWorkspaceId,
      activeAppSurface: state.activeAppSurface,
      projectPath: state.projectPath,
      recentProjects: captureCurrentProjectState({
        recentProjects: state.recentProjects,
        projectPath: state.projectPath,
        projectName: state.projectName,
        defaultBranch: state.defaultBranch,
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        workspaceBranchById: state.workspaceBranchById,
        workspacePathById: state.workspacePathById,
        workspaceDefaultById: state.workspaceDefaultById,
      }),
      defaultBranch: state.defaultBranch,
      workspaceBranchById: state.workspaceBranchById,
      workspacePathById: state.workspacePathById,
      workspaceDefaultById: state.workspaceDefaultById,
      taskCheckpointById: state.taskCheckpointById,
      compareRunsById: state.compareRunsById,
      isDarkMode: state.isDarkMode,
      draftProvider: state.draftProvider,
      layout: state.layout,
      settings: state.settings,
      projectName: state.projectName,
    }),
    onRehydrateStorage: () => (state?: AppState) => {
      if (!state) {
        return;
      }
      const persistedSettings = state.settings;
      state.activeAppSurface = normalizeAppActiveSurface(
        state.activeAppSurface,
      );
      // Merge with defaultSettings so newly added fields are never undefined
      // for users whose persisted state pre-dates those fields.
      state.settings = { ...defaultSettings, ...persistedSettings };
      delete (
        state.settings as AppSettings & {
          appShellMode?: unknown;
        }
      ).appShellMode;
      // Migrate legacy fastModeVisible → per-provider fields.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = state.settings as any;
      state.settings.craneConnector = normalizeCraneConnectorSettings(
        raw.craneConnector,
      );
      state.compareRunsById = normalizePersistedCompareRuns({
        runsById: state.compareRunsById,
        now: buildRecentTimestamp(),
      });
      state.settings.modelRuntimePreferences = normalizeModelRuntimePreferences(
        raw.modelRuntimePreferences,
      );
      state.settings.infoPanelSectionVisibility =
        normalizeWorkspaceInformationSectionVisibility(
          raw.infoPanelSectionVisibility,
        );
      state.settings.kickoffSourceConfigs = normalizeKickoffSourceConfigs(
        raw.kickoffSourceConfigs,
      );
      state.settings.showPresetBar =
        typeof raw.showPresetBar === "boolean"
          ? raw.showPresetBar
          : defaultSettings.showPresetBar;
      state.settings.borderBeamSize = normalizeBorderBeamSize(
        raw.borderBeamSize,
      );
      state.settings.borderBeamVariant = normalizeBorderBeamVariant(
        raw.borderBeamVariant,
      );
      state.settings.borderBeamStrength = normalizeBorderBeamStrength(
        raw.borderBeamStrength,
      );
      state.settings.sidebarShowFleetView =
        typeof raw.sidebarShowFleetView === "boolean"
          ? raw.sidebarShowFleetView
          : defaultSettings.sidebarShowFleetView;
      state.settings.sidebarShowActiveWorkspaces =
        typeof raw.sidebarShowActiveWorkspaces === "boolean"
          ? raw.sidebarShowActiveWorkspaces
          : defaultSettings.sidebarShowActiveWorkspaces;
      state.settings.sidebarActiveWorkspaceLimit =
        normalizeSidebarActiveWorkspaceLimit(raw.sidebarActiveWorkspaceLimit);
      if (
        typeof persistedSettings?.terminalFontFamily === "string" &&
        persistedSettings.terminalFontFamily.trim() ===
          LEGACY_TERMINAL_FONT_FAMILY
      ) {
        state.settings.terminalFontFamily = DEFAULT_TERMINAL_FONT_FAMILY;
      }
      state.settings.notificationSoundEnabled =
        typeof raw.notificationSoundEnabled === "boolean"
          ? raw.notificationSoundEnabled
          : defaultSettings.notificationSoundEnabled;
      state.settings.nativeNotificationsEnabled =
        typeof raw.nativeNotificationsEnabled === "boolean"
          ? raw.nativeNotificationsEnabled
          : defaultSettings.nativeNotificationsEnabled;
      state.settings.notificationSoundVolume = normalizeNotificationSoundVolume(
        raw.notificationSoundVolume,
      );
      state.settings.notificationSoundPreset = normalizeNotificationSoundPreset(
        raw.notificationSoundPreset,
      );
      state.settings.notificationSoundMode = normalizeNotificationSoundMode(
        raw.notificationSoundMode,
      );
      state.settings.commandPaletteShowRecent =
        typeof raw.commandPaletteShowRecent === "boolean"
          ? raw.commandPaletteShowRecent
          : defaultSettings.commandPaletteShowRecent;
      state.settings.sharedSkillsHome = normalizeSharedSkillsHomeSetting(
        raw.sharedSkillsHome,
      );
      state.settings.commandPalettePinnedCommandIds = Array.isArray(
        raw.commandPalettePinnedCommandIds,
      )
        ? raw.commandPalettePinnedCommandIds.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : defaultSettings.commandPalettePinnedCommandIds;
      state.settings.commandPaletteHiddenCommandIds = Array.isArray(
        raw.commandPaletteHiddenCommandIds,
      )
        ? raw.commandPaletteHiddenCommandIds.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : defaultSettings.commandPaletteHiddenCommandIds;
      state.settings.commandPaletteRecentCommandIds = Array.isArray(
        raw.commandPaletteRecentCommandIds,
      )
        ? raw.commandPaletteRecentCommandIds.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : defaultSettings.commandPaletteRecentCommandIds;
      Object.assign(state.settings, normalizePersistedLensSettings(raw));
      state.settings.appShortcutKeys = normalizeAppShortcutKeys(
        raw.appShortcutKeys,
      );
      state.settings.taskPresets = normalizePersistedTaskPresets(
        raw.taskPresets,
      );
      state.settings.modelShortcutKeys = normalizeModelShortcutKeys(
        raw.modelShortcutKeys,
      );
      state.settings.modelShortcutEfforts = normalizeModelShortcutEfforts(
        raw.modelShortcutEfforts,
      );
      state.settings.autoRoutingObjective = normalizeAutoRoutingObjective(
        raw.autoRoutingObjective,
      );
      state.settings.utilityInferenceProvider =
        normalizeUtilityInferenceProvider(raw.utilityInferenceProvider);
      state.settings.autoRoutingEligibleClaudeModels =
        normalizeAutoRoutingEligibleModels(raw.autoRoutingEligibleClaudeModels);
      state.settings.autoRoutingEligibleCodexModels =
        normalizeAutoRoutingEligibleModels(raw.autoRoutingEligibleCodexModels);
      state.settings.promptCommentShortcut = normalizePromptCommentShortcut(
        raw.promptCommentShortcut,
      );
      state.settings.steerQueueEnterAction = normalizeSteerQueueEnterAction(
        raw.steerQueueEnterAction,
      );
      state.settings.midTurnSteeringEnabled =
        typeof raw.midTurnSteeringEnabled === "boolean"
          ? raw.midTurnSteeringEnabled
          : defaultSettings.midTurnSteeringEnabled;
      state.settings.visualCommentShortcut =
        raw.visualCommentShortcut === "mod-period"
          ? DEFAULT_VISUAL_COMMENT_SHORTCUT
          : normalizeVisualCommentShortcut(raw.visualCommentShortcut);
      state.settings.lensVisualCommentScreenshotsAsImageContext =
        typeof raw.lensVisualCommentScreenshotsAsImageContext === "boolean"
          ? raw.lensVisualCommentScreenshotsAsImageContext
          : defaultSettings.lensVisualCommentScreenshotsAsImageContext;
      state.settings.trustedTools = normalizeTrustedToolEntries(
        raw.trustedTools,
      );
      delete raw.staveModelPlanner;
      delete raw.staveModelEcosystem;
      delete raw.staveModelComplex;
      delete raw.staveModelCodeGen;
      delete raw.staveModelQuickEdit;
      delete raw.staveModelDefault;
      delete raw.stavePreprocessorModel;
      delete raw.staveSupervisorModel;
      delete raw.staveOrchestrationEnabled;
      delete raw.staveAutoClassifierModel;
      delete raw.staveAutoSupervisorModel;
      delete raw.staveAutoPlanModel;
      delete raw.staveAutoAnalyzeModel;
      delete raw.staveAutoImplementModel;
      delete raw.staveAutoQuickEditModel;
      delete raw.staveAutoGeneralModel;
      delete raw.staveAutoVerifyModel;
      delete raw.staveAutoOrchestrationMode;
      delete raw.staveAutoMaxSubtasks;
      delete raw.staveAutoMaxParallelSubtasks;
      delete raw.staveAutoAllowCrossProviderWorkers;
      delete raw.staveAutoFastMode;
      delete raw.staveAutoRoleRuntimeOverrides;
      delete raw.modelStave;
      delete raw.sidebarArtworkMode;
      delete raw.museDefaultTarget;
      delete raw.museRouterModel;
      delete raw.museChatModel;
      delete raw.musePlannerModel;
      delete raw.museRouterPrompt;
      delete raw.museChatPrompt;
      delete raw.musePlannerPrompt;
      delete raw.museAutoHandoffToTask;
      delete raw.museAllowDirectWorkspaceInfoEdits;
      // Migrate string font sizes ("base"/"lg"/"xl") to numeric pixel values.
      const _legacyFontSizeMap: Record<string, number> = {
        base: 16,
        lg: 18,
        xl: 20,
      };
      if (typeof raw.messageFontSize === "string") {
        raw.messageFontSize = _legacyFontSizeMap[raw.messageFontSize] ?? 18;
      }
      if (typeof raw.messageCodeFontSize === "string") {
        raw.messageCodeFontSize =
          _legacyFontSizeMap[raw.messageCodeFontSize] ?? 14;
      }
      if (typeof raw.fastModeVisible === "boolean") {
        state.settings.codexFastModeVisible ??= raw.fastModeVisible;
        delete raw.fastModeVisible;
      }
      if (
        typeof raw.reasoningDefaultExpanded === "boolean" &&
        typeof persistedSettings?.reasoningExpansionMode !== "string"
      ) {
        raw.reasoningExpansionMode = raw.reasoningDefaultExpanded
          ? "auto"
          : "manual";
      }
      delete raw.reasoningDefaultExpanded;
      delete raw.codexSandboxMode;
      delete raw.codexSkipGitRepoCheck;
      delete raw.codexNetworkAccessEnabled;
      delete raw.codexPathOverride;
      delete raw.codexModelReasoningEffort;
      delete raw.codexWebSearchMode;
      delete raw.codexShowRawAgentReasoning;
      delete raw.codexSupportsReasoningSummaries;
      delete raw.codexExperimentalPlanMode;
      delete raw.codexAdditionalReadableRoots;
      delete raw.language;
      delete raw.updateMode;
      delete raw.httpProxy;
      delete raw.smartSuggestions;
      delete raw.chatSendPreview;
      delete raw.thinkingPhraseAnimationStyle;
      delete raw.claudeFastModeVisible;
      delete raw.rulesPresetPrimary;
      delete raw.rulesPresetSecondary;
      delete raw.subagentsEnabled;
      delete raw.subagentsProfile;
      delete raw.reviewStrictMode;
      delete raw.reviewChecklistPreset;
      delete raw.planAutoApprove;
      state.settings.promptResponseStyle = normalizeResponseStylePrompt(
        state.settings.promptResponseStyle,
      );
      state.settings.prePrReviewProvider = normalizePrePrReviewProvider(
        state.settings.prePrReviewProvider,
      );
      state.settings.createPrAutoMergeEnabled =
        typeof raw.createPrAutoMergeEnabled === "boolean"
          ? raw.createPrAutoMergeEnabled
          : defaultSettings.createPrAutoMergeEnabled;
      state.settings.createPrMergeMethod =
        raw.createPrMergeMethod === "default" ||
        raw.createPrMergeMethod === "merge" ||
        raw.createPrMergeMethod === "squash" ||
        raw.createPrMergeMethod === "rebase"
          ? raw.createPrMergeMethod
          : defaultSettings.createPrMergeMethod;
      const legacyProjectInitCommand = normalizeProjectWorkspaceInitCommand({
        value: raw.newWorkspaceInitCommand,
      });
      delete raw.newWorkspaceInitCommand;
      state.settings.codexApprovalPolicy = normalizeCodexApprovalPolicy({
        value: state.settings.codexApprovalPolicy,
      });
      state.settings.claudeTaskBudgetTokens = normalizeClaudeTaskBudgetTokens({
        value: state.settings.claudeTaskBudgetTokens,
      });
      state.settings.claudeSettingSources = normalizeClaudeSettingSources({
        value: state.settings.claudeSettingSources,
      });
      state.settings.reasoningExpansionMode = normalizeReasoningExpansionMode(
        state.settings.reasoningExpansionMode,
      );
      state.settings.modelClaude = upgradeSettingsScopedClaudeModel({
        model: state.settings.modelClaude,
      });
      state.settings.advisorTarget =
        normalizePersistedAdvisorTarget(persistedSettings);
      delete raw.claudeAdvisorModel;
      state.settings.providerTimeoutMs = normalizeProviderTimeoutMs({
        value: state.settings.providerTimeoutMs,
      });
      const setRoutineProviderTimeout =
        window.api?.routines?.setProviderTimeout;
      if (setRoutineProviderTimeout) {
        void setRoutineProviderTimeout({
          providerTimeoutMs: state.settings.providerTimeoutMs,
        }).catch((error) => {
          console.warn("[routines] failed to restore provider timeout", error);
        });
      }
      state.settings.codexPlanMode ??= false;
      state.promptDraftByTask = Object.fromEntries(
        Object.entries(state.promptDraftByTask).map(([taskId, draft]) => {
          const runtimeOverrides = draft.runtimeOverrides;
          if (
            !runtimeOverrides ||
            !Object.hasOwn(runtimeOverrides, "codexExperimentalPlanMode")
          ) {
            return [taskId, draft];
          }
          const {
            codexExperimentalPlanMode: _unused,
            ...nextRuntimeOverrides
          } = runtimeOverrides as typeof runtimeOverrides & {
            codexExperimentalPlanMode?: boolean;
          };
          return [
            taskId,
            {
              ...draft,
              runtimeOverrides: nextRuntimeOverrides,
            },
          ];
        }),
      );
      state.recentProjects = normalizeRecentProjectStates({
        projects: state.recentProjects,
      });
      const normalizedCurrentProject = normalizeCurrentProjectState({
        projectPath: state.projectPath,
        projectName: state.projectName,
        defaultBranch: state.defaultBranch,
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        workspaceBranchById: state.workspaceBranchById,
        workspacePathById: state.workspacePathById,
        workspaceDefaultById: state.workspaceDefaultById,
        recentProjects: state.recentProjects,
      });
      if (state.projectPath && normalizedCurrentProject) {
        state.projectName = normalizeProjectDisplayName({
          projectPath: normalizedCurrentProject.projectPath,
          projectName:
            state.projectName?.trim() || normalizedCurrentProject.projectName,
        });
        state.defaultBranch = normalizedCurrentProject.defaultBranch;
        state.workspaces = normalizedCurrentProject.workspaces;
        state.activeWorkspaceId = normalizedCurrentProject.activeWorkspaceId;
        state.workspaceBranchById =
          normalizedCurrentProject.workspaceBranchById;
        state.workspacePathById = normalizedCurrentProject.workspacePathById;
        state.workspaceDefaultById =
          normalizedCurrentProject.workspaceDefaultById;
      } else if (state.projectPath) {
        state.workspaces = [];
        state.activeWorkspaceId = "";
        state.workspaceBranchById = {};
        state.workspacePathById = {};
        state.workspaceDefaultById = {};
      }
      if (legacyProjectInitCommand) {
        state.recentProjects = state.recentProjects.map((project) => ({
          ...cloneRecentProjectState(project),
          newWorkspaceInitCommand: normalizeProjectWorkspaceInitCommand({
            value: project.newWorkspaceInitCommand || legacyProjectInitCommand,
          }),
        }));
      }
      state.layout = normalizeLayoutState(state.layout);
      const isDark = resolveDarkModeForTheme({
        themeMode: state.settings?.themeMode ?? "dark",
        fallback: state.isDarkMode,
      });
      state.isDarkMode = isDark;
      applyThemeClass({ enabled: isDark });
      // Apply persisted custom theme before user overrides so cascade order
      // is correct: base → custom-theme → manual overrides.
      if (state.settings.customThemeId) {
        const theme = findCustomThemeById({
          themeId: state.settings.customThemeId,
          userThemes: state.settings.userCustomThemes,
        });
        applyCustomTheme({ theme });
      }
      applyThemeOverrides({ themeOverrides: state.settings.themeOverrides });
      applyFontOverrides({
        messageFontFamily: state.settings.messageFontFamily,
        messageMonoFontFamily: state.settings.messageMonoFontFamily,
        messageKoreanFontFamily: state.settings.messageKoreanFontFamily,
      });
    },
  };
}
