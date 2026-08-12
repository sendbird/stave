import type { StoreApi } from "zustand";
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
} from "@/lib/providers/advisor";
import { mergeModelRuntimePreferenceSettings } from "@/lib/providers/model-runtime-preferences";
import {
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
} from "@/lib/providers/model-shortcuts";
import { normalizeTrustedToolEntries } from "@/lib/providers/trusted-tools";
import { normalizeSteerQueueEnterAction } from "@/lib/steer-queue-shortcuts";
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
  type AppSettings,
} from "@/store/app-settings";
import type { AppState } from "@/store/app-store.types";
import {
  normalizeAutoRoutingEligibleModels,
  normalizeAutoRoutingObjective,
} from "@/store/auto-routing";
import { normalizeProviderTimeoutMs } from "@/store/editor.utils";
import {
  captureCurrentProjectState,
  cloneRecentProjectState,
  normalizeProjectWorkspaceInitCommand,
  normalizeProjectWorkspaceRootNodeModulesSymlinkPreference,
  updateCurrentProjectAppearance,
  updateCurrentProjectTextPreference,
  upsertRecentProjectState,
} from "@/store/project.utils";
import {
  normalizeClaudeSettingSources,
  normalizeClaudeTaskBudgetTokens,
} from "@/store/provider-runtime-options";

type SettingsActionKey =
  | "setProjectWorkspaceInitCommand"
  | "setProjectBasePrompt"
  | "setProjectKickoffBranchNamingRule"
  | "setProjectAppearance"
  | "setProjectWorkspaceUseRootNodeModulesSymlink"
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
    setProjectWorkspaceInitCommand: ({ projectPath, command }) => {
      set((state) => {
        const normalizedProjectPath =
          projectPath?.trim() || state.projectPath?.trim() || "";
        if (!normalizedProjectPath) {
          return state;
        }

        const currentProjects = captureCurrentProjectState({
          recentProjects: state.recentProjects,
          projectPath: state.projectPath,
          projectName: state.projectName,
          defaultBranch: state.defaultBranch,
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceBranchById: state.workspaceBranchById,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
          workspaceLastActiveAtById: state.workspaceLastActiveAtById,
        });
        const existingProject = currentProjects.find(
          (project) => project.projectPath === normalizedProjectPath,
        );
        if (!existingProject) {
          return state;
        }

        const nextCommand = normalizeProjectWorkspaceInitCommand({
          value: command,
        });
        const currentCommand = normalizeProjectWorkspaceInitCommand({
          value: existingProject.newWorkspaceInitCommand,
        });
        if (currentCommand === nextCommand) {
          return state;
        }

        return {
          recentProjects: upsertRecentProjectState({
            projects: currentProjects,
            project: {
              ...cloneRecentProjectState(existingProject),
              newWorkspaceInitCommand: nextCommand,
            },
          }),
        };
      });
    },
    setProjectBasePrompt: ({ projectPath, prompt }) => {
      set((state) => {
        const recentProjects = updateCurrentProjectTextPreference({
          state,
          projectPath,
          preference: { key: "projectBasePrompt", value: prompt },
        });
        return recentProjects ? { recentProjects } : state;
      });
    },
    setProjectKickoffBranchNamingRule: ({ projectPath, rule }) => {
      set((state) => {
        const recentProjects = updateCurrentProjectTextPreference({
          state,
          projectPath,
          preference: { key: "kickoffBranchNamingRule", value: rule },
        });
        return recentProjects ? { recentProjects } : state;
      });
    },
    setProjectAppearance: ({ projectPath, icon, color }) => {
      set((state) => {
        const recentProjects = updateCurrentProjectAppearance({
          state,
          projectPath,
          icon,
          color,
        });
        return recentProjects ? { recentProjects } : state;
      });
    },
    setProjectWorkspaceUseRootNodeModulesSymlink: ({
      projectPath,
      enabled,
    }) => {
      set((state) => {
        const normalizedProjectPath =
          projectPath?.trim() || state.projectPath?.trim() || "";
        if (!normalizedProjectPath) {
          return state;
        }

        const currentProjects = captureCurrentProjectState({
          recentProjects: state.recentProjects,
          projectPath: state.projectPath,
          projectName: state.projectName,
          defaultBranch: state.defaultBranch,
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceBranchById: state.workspaceBranchById,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
          workspaceLastActiveAtById: state.workspaceLastActiveAtById,
        });
        const existingProject = currentProjects.find(
          (project) => project.projectPath === normalizedProjectPath,
        );
        if (!existingProject) {
          return state;
        }

        const nextEnabled =
          normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
            value: enabled,
          });
        const currentEnabled =
          normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
            value: existingProject.newWorkspaceUseRootNodeModulesSymlink,
          });
        if (currentEnabled === nextEnabled) {
          return state;
        }

        return {
          recentProjects: upsertRecentProjectState({
            projects: currentProjects,
            project: {
              ...cloneRecentProjectState(existingProject),
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
        const setProviderTimeout = window.api?.routines?.setProviderTimeout;
        if (setProviderTimeout) {
          void setProviderTimeout({ providerTimeoutMs }).catch((error) => {
            console.warn("[routines] failed to sync provider timeout", error);
          });
        }
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
