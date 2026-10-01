import { emptyRateLimitsSnapshot } from "@/lib/providers/account-usage-block";
import type { StoreApi } from "zustand";
import { normalizeMyStandards } from "@/lib/agents/standards";
import { normalizeTaskMode } from "@/lib/agents/task-mode";
import { normalizeAppShortcutKeys } from "@/lib/app-shortcuts";
import { normalizeComposerControlPlacements } from "@/lib/composer-controls";
import { normalizeLensHostList } from "@/lib/lens/lens-security";
import {
  normalizeNotificationSoundMode,
  normalizeNotificationSoundPreset,
  normalizeNotificationSoundVolume,
} from "@/lib/notifications/notification-sound";
import { normalizePromptCommentShortcut } from "@/lib/prompt-comment-shortcuts";
import {
  normalizeAdvisorConsultLimit,
  normalizeAdvisorTarget,
  normalizeAdvisorTargetByProvider,
} from "@/lib/providers/advisor";
import { mergeModelRuntimePreferenceSettings } from "@/lib/providers/model-runtime-preferences";
import { normalizeModelVisibility } from "@/lib/providers/model-visibility";
import {
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
} from "@/lib/providers/model-shortcuts";
import { normalizeTrustedToolEntries } from "@/lib/providers/trusted-tools";
import { normalizeSteerQueueEnterAction } from "@/lib/steer-queue-shortcuts";
import { normalizePersistedMacros } from "@/lib/macros/normalize";
import {
  normalizePersistedPlaybooks,
  warnPlaybookDiagnostics,
} from "@/lib/playbooks/normalize";
import { normalizePersistedTaskPresets } from "@/lib/task-presets";
import {
  applyCustomTheme,
  applyFontOverrides,
  applyThemeClass,
  applyThemeOverrides,
  BUILTIN_CUSTOM_THEMES,
  findCustomThemeById,
  MAX_USER_THEMES,
  resolveDarkModeForTheme,
} from "@/lib/themes";
import { normalizeVisualCommentShortcut } from "@/lib/visual-comment-shortcuts";
import { normalizeWorkspaceInformationSectionVisibility } from "@/lib/workspace-information-sections";
import { normalizeKickoffSourceConfigs } from "@/lib/workspace-kickoff";
import {
  defaultSettings,
  normalizeLensAgentPresentationMode,
  normalizeLensSessionScope,
  normalizeReasoningExpansionMode,
  normalizeSidebarNavView,
  normalizeTurnActivityPlacement,
  normalizeComposerLayoutMode,
  type AppSettings,
} from "@/store/app-settings";
import type { AppState } from "@/store/app-store.types";
import { providerToolingStatePatch } from "./provider-tooling";
import {
  normalizeAutoRoutingEligibleModels,
  normalizeAutoRoutingObjective,
} from "@/store/auto-routing";
import {
  STANCE_OBJECTIVE,
  validateProfile,
} from "@/lib/providers/auto-routing-profile";
import { normalizeProviderTimeoutMs } from "@/store/editor.utils";
import {
  captureCurrentRepositoryState,
  cloneRecentRepositoryState,
  normalizeRepositoryWorkspaceInitCommand,
  normalizeRepositoryWorkspaceRootNodeModulesSymlinkPreference,
  updateCurrentRepositoryAppearance,
  updateCurrentRepositoryTextPreference,
  upsertRecentRepositoryState,
} from "@/store/repository.utils";
import { normalizeCustomAgents } from "@/lib/agents/library";
import { normalizeAgentRevisions } from "@/lib/agents/revisions";
import { normalizeAgentSuggestions, normalizeLearningDisabled } from "@/lib/agents/learned-suggestions";
import {
  normalizeClaudeSettingSources,
  normalizeClaudeTaskBudgetTokens,
} from "@/store/provider-runtime-options";

function normalizeCustomAgentPatch(value: unknown) {
  const { agents, rejected } = normalizeCustomAgents(value);
  if (rejected.length > 0) console.warn("[agents] refused custom agents in a settings patch", rejected.map((entry) => entry.issues));
  return agents;
}

function normalizePlaybookPatch(value: unknown) {
  const { playbooks, diagnostics } = normalizePersistedPlaybooks(value);
  warnPlaybookDiagnostics(diagnostics);
  return playbooks;
}

type SettingsActionKey =
  | "clearAutoRoutingDecision"
  | "setRepositoryWorkspaceInitCommand"
  | "setRepositoryBasePrompt"
  | "setRepositoryKickoffBranchNamingRule"
  | "setRepositoryAppearance"
  | "setRepositoryWorkspaceUseRootNodeModulesSymlink"
  | "setDarkMode"
  | "installCustomTheme"
  | "removeCustomTheme"
  | "updateSettings"
  | "updateModelRuntimePreference"
  | "setPersistenceBootstrapStatus"
  | "refreshProviderCommandCatalog"
  | "notifyWorkspacePlansChanged";

type SettingsActions = Pick<AppState, SettingsActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createSettingsActions(args: {
  set: StoreSet;
  get: StoreGet;
  normalizeSharedSkillsHomeSetting: (value?: string | null) => string;
}): SettingsActions {
  const { set, get, normalizeSharedSkillsHomeSetting } = args;

  return {
    clearAutoRoutingDecision: (taskId) => {
      set((state) => {
        if (!(taskId in state.autoRoutingDecisionByTask)) {
          return state;
        }
        const { [taskId]: _dropped, ...autoRoutingDecisionByTask } =
          state.autoRoutingDecisionByTask;
        return { autoRoutingDecisionByTask };
      });
    },
    setRepositoryWorkspaceInitCommand: ({ repositoryPath, command }) => {
      set((state) => {
        const normalizedRepositoryPath =
          repositoryPath?.trim() || state.repositoryPath?.trim() || "";
        if (!normalizedRepositoryPath) {
          return state;
        }

        const currentRepositories = captureCurrentRepositoryState({
          recentRepositories: state.recentRepositories,
          repositoryPath: state.repositoryPath,
          repositoryName: state.repositoryName,
          defaultBranch: state.defaultBranch,
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceBranchById: state.workspaceBranchById,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
          workspaceLastActiveAtById: state.workspaceLastActiveAtById,
        });
        const existingRepository = currentRepositories.find(
          (repository) => repository.repositoryPath === normalizedRepositoryPath,
        );
        if (!existingRepository) {
          return state;
        }

        const nextCommand = normalizeRepositoryWorkspaceInitCommand({
          value: command,
        });
        const currentCommand = normalizeRepositoryWorkspaceInitCommand({
          value: existingRepository.newWorkspaceInitCommand,
        });
        if (currentCommand === nextCommand) {
          return state;
        }

        return {
          recentRepositories: upsertRecentRepositoryState({
            repositories: currentRepositories,
            repository: {
              ...cloneRecentRepositoryState(existingRepository),
              newWorkspaceInitCommand: nextCommand,
            },
          }),
        };
      });
    },
    setRepositoryBasePrompt: ({ repositoryPath, prompt }) => {
      set((state) => {
        const recentRepositories = updateCurrentRepositoryTextPreference({
          state,
          repositoryPath,
          preference: { key: "repositoryBasePrompt", value: prompt },
        });
        return recentRepositories ? { recentRepositories } : state;
      });
    },
    setRepositoryKickoffBranchNamingRule: ({ repositoryPath, rule }) => {
      set((state) => {
        const recentRepositories = updateCurrentRepositoryTextPreference({
          state,
          repositoryPath,
          preference: { key: "kickoffBranchNamingRule", value: rule },
        });
        return recentRepositories ? { recentRepositories } : state;
      });
    },
    setRepositoryAppearance: ({ repositoryPath, icon, color }) => {
      set((state) => {
        const recentRepositories = updateCurrentRepositoryAppearance({
          state,
          repositoryPath,
          icon,
          color,
        });
        return recentRepositories ? { recentRepositories } : state;
      });
    },
    setRepositoryWorkspaceUseRootNodeModulesSymlink: ({
      repositoryPath,
      enabled,
    }) => {
      set((state) => {
        const normalizedRepositoryPath =
          repositoryPath?.trim() || state.repositoryPath?.trim() || "";
        if (!normalizedRepositoryPath) {
          return state;
        }

        const currentRepositories = captureCurrentRepositoryState({
          recentRepositories: state.recentRepositories,
          repositoryPath: state.repositoryPath,
          repositoryName: state.repositoryName,
          defaultBranch: state.defaultBranch,
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceBranchById: state.workspaceBranchById,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
          workspaceLastActiveAtById: state.workspaceLastActiveAtById,
        });
        const existingRepository = currentRepositories.find(
          (repository) => repository.repositoryPath === normalizedRepositoryPath,
        );
        if (!existingRepository) {
          return state;
        }

        const nextEnabled =
          normalizeRepositoryWorkspaceRootNodeModulesSymlinkPreference({
            value: enabled,
          });
        const currentEnabled =
          normalizeRepositoryWorkspaceRootNodeModulesSymlinkPreference({
            value: existingRepository.newWorkspaceUseRootNodeModulesSymlink,
          });
        if (currentEnabled === nextEnabled) {
          return state;
        }

        return {
          recentRepositories: upsertRecentRepositoryState({
            repositories: currentRepositories,
            repository: {
              ...cloneRecentRepositoryState(existingRepository),
              newWorkspaceUseRootNodeModulesSymlink: nextEnabled,
            },
          }),
        };
      });
    },
    setDarkMode: ({ enabled }) => {
      const nextThemeMode: AppSettings["themeMode"] = enabled
        ? "dark"
        : "light";
      const hadCustomTheme = Boolean(get().settings.customThemeId);
      set((state) => {
        if (
          state.isDarkMode === enabled &&
          state.settings.themeMode === nextThemeMode &&
          !state.settings.customThemeId
        ) {
          return state;
        }
        return {
          isDarkMode: enabled,
          settings: {
            ...state.settings,
            themeMode: nextThemeMode,
            customThemeId: null,
          },
        };
      });
      if (hadCustomTheme) {
        applyCustomTheme({ theme: null });
      }
      applyThemeClass({ enabled });
    },
    installCustomTheme: ({ theme }) => {
      const state = get();
      const existing = state.settings.userCustomThemes;
      if (existing.length >= MAX_USER_THEMES) {
        return {
          ok: false,
          error: `Maximum of ${MAX_USER_THEMES} user themes reached.`,
        };
      }
      const allIds = new Set([
        ...BUILTIN_CUSTOM_THEMES.map((t) => t.id),
        ...existing.map((t) => t.id),
      ]);
      if (allIds.has(theme.id)) {
        return {
          ok: false,
          error: `Theme id "${theme.id}" already exists.`,
        };
      }
      set((s) => ({
        settings: {
          ...s.settings,
          userCustomThemes: [...s.settings.userCustomThemes, theme],
        },
      }));
      return { ok: true };
    },
    removeCustomTheme: ({ themeId }) => {
      const state = get();
      const wasActive = state.settings.customThemeId === themeId;
      set((s) => ({
        settings: {
          ...s.settings,
          userCustomThemes: s.settings.userCustomThemes.filter(
            (t) => t.id !== themeId,
          ),
          customThemeId: wasActive ? null : s.settings.customThemeId,
        },
      }));
      if (wasActive) {
        applyCustomTheme({ theme: null });
      }
    },
    updateSettings: ({ patch }) => {
      const normalizedPatch: Partial<AppSettings> = {
        ...patch,
        ...(patch.sharedSkillsHome === undefined
          ? {}
          : {
              sharedSkillsHome: normalizeSharedSkillsHomeSetting(
                patch.sharedSkillsHome,
              ),
            }),
        ...(patch.appShortcutKeys === undefined
          ? {}
          : {
              appShortcutKeys: normalizeAppShortcutKeys(patch.appShortcutKeys),
            }),
        ...(patch.modelShortcutKeys === undefined
          ? {}
          : {
              modelShortcutKeys: normalizeModelShortcutKeys(
                patch.modelShortcutKeys,
              ),
            }),
        ...(patch.modelShortcutEfforts === undefined
          ? {}
          : {
              modelShortcutEfforts: normalizeModelShortcutEfforts(
                patch.modelShortcutEfforts,
              ),
            }),
        ...(patch.promptCommentShortcut === undefined
          ? {}
          : {
              promptCommentShortcut: normalizePromptCommentShortcut(
                patch.promptCommentShortcut,
              ),
            }),
        ...(patch.steerQueueEnterAction === undefined
          ? {}
          : {
              steerQueueEnterAction: normalizeSteerQueueEnterAction(
                patch.steerQueueEnterAction,
              ),
            }),
        ...(patch.visualCommentShortcut === undefined
          ? {}
          : {
              visualCommentShortcut: normalizeVisualCommentShortcut(
                patch.visualCommentShortcut,
              ),
            }),
        ...(patch.trustedTools === undefined
          ? {}
          : {
              trustedTools: normalizeTrustedToolEntries(patch.trustedTools),
            }),
        ...(patch.advisorTarget === undefined
          ? {}
          : {
              advisorTarget: normalizeAdvisorTarget(patch.advisorTarget),
            }),
        ...(patch.advisorTargetByProvider === undefined
          ? {}
          : {
              advisorTargetByProvider: normalizeAdvisorTargetByProvider(
                patch.advisorTargetByProvider,
              ),
            }),
        ...(patch.advisorConsultLimit === undefined
          ? {}
          : {
              advisorConsultLimit: normalizeAdvisorConsultLimit(
                patch.advisorConsultLimit,
              ),
            }),
        ...(patch.reasoningExpansionMode === undefined
          ? {}
          : {
              reasoningExpansionMode: normalizeReasoningExpansionMode(
                patch.reasoningExpansionMode,
              ),
            }),
        ...(patch.showTaskStartExamples === undefined
          ? {}
          : {
              showTaskStartExamples:
                typeof patch.showTaskStartExamples === "boolean"
                  ? patch.showTaskStartExamples
                  : defaultSettings.showTaskStartExamples,
            }),
        ...(patch.sidebarNavView === undefined
          ? {}
          : {
              sidebarNavView: normalizeSidebarNavView(patch.sidebarNavView),
            }),
        ...(patch.turnActivityPlacement === undefined
          ? {}
          : {
              turnActivityPlacement: normalizeTurnActivityPlacement(
                patch.turnActivityPlacement,
              ),
            }),
        ...(patch.composerLayout === undefined
          ? {}
          : {
              composerLayout: normalizeComposerLayoutMode(patch.composerLayout),
            }),
        ...(patch.infoPanelSectionVisibility === undefined
          ? {}
          : {
              infoPanelSectionVisibility:
                normalizeWorkspaceInformationSectionVisibility(
                  patch.infoPanelSectionVisibility,
                ),
            }),
        ...(patch.composerControlPlacements === undefined
          ? {}
          : {
              composerControlPlacements: normalizeComposerControlPlacements(
                patch.composerControlPlacements,
              ),
            }),
        ...(patch.kickoffSourceConfigs === undefined
          ? {}
          : {
              kickoffSourceConfigs: normalizeKickoffSourceConfigs(
                patch.kickoffSourceConfigs,
              ),
            }),
        ...(patch.providerTimeoutMs === undefined
          ? {}
          : {
              providerTimeoutMs: normalizeProviderTimeoutMs({
                value: patch.providerTimeoutMs,
              }),
            }),
        ...(patch.autoRoutingObjective === undefined
          ? {}
          : {
              autoRoutingObjective: normalizeAutoRoutingObjective(
                patch.autoRoutingObjective,
              ),
            }),
        ...(patch.modelVisibility === undefined
          ? {}
          : {
              modelVisibility: normalizeModelVisibility(patch.modelVisibility),
            }),
        ...(patch.autoRoutingProfile === undefined
          ? {}
          : (() => {
              const autoRoutingProfile = validateProfile(
                patch.autoRoutingProfile,
              );
              // Keep the v1 mirrors coherent for anything still reading them.
              return {
                autoRoutingProfile,
                autoRoutingObjective: STANCE_OBJECTIVE[autoRoutingProfile.stance],
                autoRoutingUseClassifier: autoRoutingProfile.signals.classifier,
                autoRoutingSafetyEscalation:
                  autoRoutingProfile.signals.safetyEscalation,
                autoRoutingAllowProviderSwitch:
                  autoRoutingProfile.signals.providerSwitch,
                autoRoutingEligibleClaudeModels: [
                  ...(autoRoutingProfile.eligibleModelsByProvider["claude-code"] ??
                    []),
                ],
                autoRoutingEligibleCodexModels: [
                  ...(autoRoutingProfile.eligibleModelsByProvider.codex ?? []),
                ],
              };
            })()),
        ...(patch.autoRoutingEligibleClaudeModels === undefined
          ? {}
          : {
              autoRoutingEligibleClaudeModels:
                normalizeAutoRoutingEligibleModels(
                  patch.autoRoutingEligibleClaudeModels,
                ),
            }),
        ...(patch.autoRoutingEligibleCodexModels === undefined
          ? {}
          : {
              autoRoutingEligibleCodexModels:
                normalizeAutoRoutingEligibleModels(
                  patch.autoRoutingEligibleCodexModels,
                ),
            }),
        ...(patch.claudeTaskBudgetTokens === undefined
          ? {}
          : {
              claudeTaskBudgetTokens: normalizeClaudeTaskBudgetTokens({
                value: patch.claudeTaskBudgetTokens,
              }),
            }),
        ...(patch.claudeSettingSources === undefined
          ? {}
          : {
              claudeSettingSources: normalizeClaudeSettingSources({
                value: patch.claudeSettingSources,
              }),
            }),
        ...(patch.taskPresets === undefined
          ? {}
          : {
              taskPresets: normalizePersistedTaskPresets(patch.taskPresets),
            }),
        ...(patch.macros === undefined
          ? {}
          : {
              macros: normalizePersistedMacros(patch.macros),
            }),
        ...(patch.playbooks === undefined
          ? {}
          : { playbooks: normalizePlaybookPatch(patch.playbooks) }),
        ...(patch.customAgents === undefined
          ? {}
          : { customAgents: normalizeCustomAgentPatch(patch.customAgents) }),
        ...(patch.customAgentRevisions === undefined
          ? {}
          : { customAgentRevisions: normalizeAgentRevisions(patch.customAgentRevisions) }),
        ...(patch.agentSuggestions === undefined
          ? {}
          : { agentSuggestions: normalizeAgentSuggestions(patch.agentSuggestions) }),
        ...(patch.agentLearningDisabled === undefined
          ? {}
          : { agentLearningDisabled: normalizeLearningDisabled(patch.agentLearningDisabled) }),
        ...(patch.myStandards === undefined ? {} : { myStandards: normalizeMyStandards(patch.myStandards) }),
        ...(patch.taskMode === undefined ? {} : { taskMode: normalizeTaskMode(patch.taskMode) }),
        ...(patch.lensSessionScope === undefined
          ? {}
          : {
              lensSessionScope: normalizeLensSessionScope(
                patch.lensSessionScope,
              ),
            }),
        ...(patch.lensAgentPresentationMode === undefined
          ? {}
          : {
              lensAgentPresentationMode: normalizeLensAgentPresentationMode(
                patch.lensAgentPresentationMode,
              ),
            }),
        ...(patch.lensAllowedHosts === undefined
          ? {}
          : {
              lensAllowedHosts: normalizeLensHostList(
                patch.lensAllowedHosts,
                defaultSettings.lensAllowedHosts,
              ),
            }),
        ...(patch.lensBlockedHosts === undefined
          ? {}
          : {
              lensBlockedHosts: normalizeLensHostList(
                patch.lensBlockedHosts,
                defaultSettings.lensBlockedHosts,
              ),
            }),
        ...(patch.lensCdpApprovedHosts === undefined
          ? {}
          : {
              lensCdpApprovedHosts: normalizeLensHostList(
                patch.lensCdpApprovedHosts,
                defaultSettings.lensCdpApprovedHosts,
              ),
            }),
        ...(patch.notificationSoundVolume === undefined
          ? {}
          : {
              notificationSoundVolume: normalizeNotificationSoundVolume(
                patch.notificationSoundVolume,
              ),
            }),
        ...(patch.notificationSoundPreset === undefined
          ? {}
          : {
              notificationSoundPreset: normalizeNotificationSoundPreset(
                patch.notificationSoundPreset,
              ),
            }),
        ...(patch.notificationSoundMode === undefined
          ? {}
          : {
              notificationSoundMode: normalizeNotificationSoundMode(
                patch.notificationSoundMode,
              ),
            }),
        ...(patch.attentionNotificationSoundVolume === undefined
          ? {}
          : {
              attentionNotificationSoundVolume: normalizeNotificationSoundVolume(
                patch.attentionNotificationSoundVolume,
              ),
            }),
        ...(patch.attentionNotificationSoundPreset === undefined
          ? {}
          : {
              attentionNotificationSoundPreset: normalizeNotificationSoundPreset(
                patch.attentionNotificationSoundPreset,
              ),
            }),
        ...(patch.attentionNotificationSoundMode === undefined
          ? {}
          : {
              attentionNotificationSoundMode: normalizeNotificationSoundMode(
                patch.attentionNotificationSoundMode,
              ),
            }),
      };

      // ── resolve custom-theme side-effects ───────────────────────
      // When a custom theme is selected, automatically align themeMode
      // to the theme's base mode so the correct CSS selector activates.
      const customThemeIdChanged = normalizedPatch.customThemeId !== undefined;
      if (customThemeIdChanged && normalizedPatch.customThemeId) {
        const userThemes = get().settings.userCustomThemes;
        const theme = findCustomThemeById({
          themeId: normalizedPatch.customThemeId,
          userThemes,
        });
        if (theme && normalizedPatch.themeMode === undefined) {
          normalizedPatch.themeMode = theme.baseMode;
        }
      }

      const nextThemeMode = normalizedPatch.themeMode;
      const nextIsDark = nextThemeMode
        ? resolveDarkModeForTheme({ themeMode: nextThemeMode })
        : null;

      set((state) => {
        const nextSettings = { ...state.settings, ...normalizedPatch };
        const settingsChanged = Object.keys(normalizedPatch).some(
          (key) =>
            nextSettings[key as keyof AppSettings] !==
            state.settings[key as keyof AppSettings],
        );
        if (
          !settingsChanged &&
          (nextIsDark === null || nextIsDark === state.isDarkMode)
        ) {
          return state;
        }
        const nextState: Partial<AppState> = {
          settings: nextSettings,
          ...(nextSettings.claudeAccountProfileId !== state.settings.claudeAccountProfileId || nextSettings.codexAccountProfileId !== state.settings.codexAccountProfileId
            ? { rateLimitsSnapshot: emptyRateLimitsSnapshot(), rateLimitsUpdatedAtByProvider: {}, rateLimitsError: null } : {}),
        };
        if (nextIsDark !== null) {
          nextState.isDarkMode = nextIsDark;
        }
        return {
          ...nextState,
        };
      });

      if (normalizedPatch.providerTimeoutMs !== undefined) {
        const providerTimeoutMs = get().settings.providerTimeoutMs;
        const setProviderTimeout = window.api?.automations?.setProviderTimeout;
        if (setProviderTimeout) {
          void setProviderTimeout({ providerTimeoutMs }).catch((error) => {
            console.warn("[automations] failed to sync provider timeout", error);
          });
        }
      }
      if (normalizedPatch.claudeAccountProfileId !== undefined || normalizedPatch.codexAccountProfileId !== undefined) {
        void get().refreshRateLimits();
        void get().refreshProviderAvailability();
      }
      if (normalizedPatch.cursorBinaryPath !== undefined || normalizedPatch.kiroBinaryPath !== undefined) {
        set(providerToolingStatePatch(get()));
        void get().refreshProviderAvailability();
      }

      // ── apply custom theme ────────────────────────────────────────
      if (customThemeIdChanged) {
        const s = get().settings;
        const theme = s.customThemeId
          ? findCustomThemeById({
              themeId: s.customThemeId,
              userThemes: s.userCustomThemes,
            })
          : null;
        applyCustomTheme({ theme });
      }

      if (normalizedPatch.themeOverrides) {
        applyThemeOverrides({
          themeOverrides: normalizedPatch.themeOverrides,
        });
      }
      if (nextIsDark !== null) {
        applyThemeClass({ enabled: nextIsDark });
      }
      if (
        normalizedPatch.messageFontFamily !== undefined ||
        normalizedPatch.messageMonoFontFamily !== undefined ||
        normalizedPatch.messageKoreanFontFamily !== undefined
      ) {
        const s = get().settings;
        applyFontOverrides({
          messageFontFamily: s.messageFontFamily,
          messageMonoFontFamily: s.messageMonoFontFamily,
          messageKoreanFontFamily: s.messageKoreanFontFamily,
        });
      }
    },
    updateModelRuntimePreference: (args) => {
      set((state) => {
        const settings = mergeModelRuntimePreferenceSettings(
          state.settings,
          args,
        );
        return settings === state.settings ? state : { settings };
      });
    },
    setPersistenceBootstrapStatus: ({ phase, message }) => {
      set(() => ({
        persistenceBootstrapPhase: phase,
        persistenceBootstrapMessage: message ?? "",
      }));
    },
    refreshProviderCommandCatalog: () => {
      set((state) => ({
        providerCommandCatalogRefreshNonce:
          state.providerCommandCatalogRefreshNonce + 1,
      }));
    },
    notifyWorkspacePlansChanged: () => {
      set((state) => ({
        workspacePlansRefreshNonce: state.workspacePlansRefreshNonce + 1,
      }));
    },
  };
}
