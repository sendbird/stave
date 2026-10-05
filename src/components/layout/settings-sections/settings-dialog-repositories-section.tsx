import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, RefreshCcw, Sparkles, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { type SectionId } from "@/components/layout/settings-dialog.schema";
import { useShallow } from "zustand/react/shallow";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import { useAppStore } from "@/store/app.store";
import {
  normalizeRepositoryAppearanceColor,
  normalizeRepositoryAppearanceIcon,
  normalizeRepositoryBasePrompt,
  normalizeRepositoryKickoffBranchNamingRule,
  normalizeRepositoryWorkspaceInitCommand,
  normalizeRepositoryWorkspaceRootNodeModulesSymlinkPreference,
  type RecentRepositoryState,
} from "@/store/repository.utils";
import {
  REPOSITORY_COLOR_OPTIONS,
  REPOSITORY_ICON_OPTIONS,
  RepositoryColorSwatch,
  RepositoryIdentityMark,
} from "@/components/layout/repository-appearance";
import { ResolvedWorkspaceScriptsConfig } from "@/lib/workspace-scripts/types";
import { WORKSPACE_TOOLS_LABEL_KEY } from "@/lib/workspace-scripts/constants";
import { LabeledField, SettingsCard } from "../settings-dialog.shared";
import { DraftTextarea } from "../settings-dialog.shared";

interface GitRemoteState {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
}

function parseGitRemotes(args: { stdout: string }) {
  const remoteStateByName = new Map<string, GitRemoteState>();
  const lines = args.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(.+?)\s+\((fetch|push)\)$/i);
    if (!match) {
      continue;
    }
    const [, name, url, kind] = match;
    if (!name || !url || !kind) {
      continue;
    }
    const current = remoteStateByName.get(name) ?? {
      name,
      fetchUrl: null,
      pushUrl: null,
    };
    if (kind.toLowerCase() === "fetch") {
      current.fetchUrl = url;
    } else {
      current.pushUrl = url;
    }
    remoteStateByName.set(name, current);
  }

  return Array.from(remoteStateByName.values());
}

function RepositorySettingsPanel(args: {
  repository: RecentRepositoryState;
  isCurrent: boolean;
  onRequestRemove: (args: { repositoryPath: string; repositoryName: string }) => void;
  onNavigateSection?: (id: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const setRepositoryBasePrompt = useAppStore(
    (state) => state.setRepositoryBasePrompt,
  );
  const setRepositoryKickoffBranchNamingRule = useAppStore(
    (state) => state.setRepositoryKickoffBranchNamingRule,
  );
  const setRepositoryWorkspaceInitCommand = useAppStore(
    (state) => state.setRepositoryWorkspaceInitCommand,
  );
  const setRepositoryWorkspaceUseRootNodeModulesSymlink = useAppStore(
    (state) => state.setRepositoryWorkspaceUseRootNodeModulesSymlink,
  );
  const setRepositoryAppearance = useAppStore(
    (state) => state.setRepositoryAppearance,
  );
  const [currentRepositoryPath, activeWorkspaceId, workspacePathById] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.repositoryPath,
            state.activeWorkspaceId,
            state.workspacePathById,
          ] as const,
      ),
    );
  const repositoryWorkspaceInitCommand = normalizeRepositoryWorkspaceInitCommand({
    value: args.repository.newWorkspaceInitCommand,
  });
  const repositoryBasePrompt = normalizeRepositoryBasePrompt({
    value: args.repository.repositoryBasePrompt,
  });
  const kickoffBranchNamingRule = normalizeRepositoryKickoffBranchNamingRule({
    value: args.repository.kickoffBranchNamingRule,
  });
  const repositoryUseRootNodeModulesSymlink =
    normalizeRepositoryWorkspaceRootNodeModulesSymlinkPreference({
      value: args.repository.newWorkspaceUseRootNodeModulesSymlink,
    });
  const repositoryAppearanceIcon = normalizeRepositoryAppearanceIcon(
    args.repository.appearanceIcon,
  );
  const repositoryAppearanceColor = normalizeRepositoryAppearanceColor(
    args.repository.appearanceColor,
  );
  const scriptsWorkspacePath = args.isCurrent
    ? (workspacePathById[activeWorkspaceId] ??
      currentRepositoryPath ??
      args.repository.repositoryPath)
    : args.repository.repositoryPath;
  const [resolvedScriptsConfig, setResolvedScriptsConfig] =
    useState<ResolvedWorkspaceScriptsConfig | null>(null);
  const [repositoryRefreshNonce, setRepositoryRefreshNonce] = useState(0);
  const [repositoryState, setRepositoryState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    rootPath: string | null;
    remotes: GitRemoteState[];
    detail: string;
  }>({
    status: "idle",
    rootPath: null,
    remotes: [],
    detail: t("settings:repositoriesSection.metadata.refreshing"),
  });

  const loadResolvedScriptsConfig = useCallback(async () => {
    const getConfig = window.api?.scripts?.getConfig;
    if (!getConfig || !args.repository.repositoryPath || !scriptsWorkspacePath) {
      setResolvedScriptsConfig(null);
      return;
    }

    const result = await getConfig({
      repositoryPath: args.repository.repositoryPath,
      workspacePath: scriptsWorkspacePath,
    });
    setResolvedScriptsConfig(result.ok ? result.config : null);
  }, [args.repository.repositoryPath, scriptsWorkspacePath]);

  useEffect(() => {
    void loadResolvedScriptsConfig();
  }, [loadResolvedScriptsConfig]);

  useEffect(() => {
    const runCommand = window.api?.terminal?.runCommand;
    if (!runCommand) {
      setRepositoryState({
        status: "error",
        rootPath: null,
        remotes: [],
        detail: i18n.t("settings:repositoriesSection.metadata.terminalUnavailable"),
      });
      return;
    }

    let cancelled = false;
    setRepositoryState((current) => ({
      ...current,
      status: "loading",
      detail: i18n.t("settings:repositoriesSection.metadata.refreshing"),
    }));

    void (async () => {
      const [rootResult, remoteResult] = await Promise.all([
        runCommand({
          cwd: args.repository.repositoryPath,
          command: "git rev-parse --show-toplevel",
        }),
        runCommand({
          cwd: args.repository.repositoryPath,
          command: "git remote -v",
        }),
      ]);
      if (cancelled) {
        return;
      }

      if (!rootResult.ok) {
        setRepositoryState({
          status: "error",
          rootPath: null,
          remotes: [],
          detail:
            rootResult.stderr?.trim() ||
            i18n.t("settings:repositoriesSection.metadata.notGitRepository"),
        });
        return;
      }

      const rootPath =
        rootResult.stdout
          .split("\n")
          .map((line) => line.trim())
          .find(Boolean) ?? args.repository.repositoryPath;
      const remotes = remoteResult.ok
        ? parseGitRemotes({ stdout: remoteResult.stdout })
        : [];
      const detail = remoteResult.ok
        ? remotes.length > 0
          ? i18n.t("settings:messages.remotesConfigured", { count: remotes.length })
          : i18n.t("settings:repositoriesSection.metadata.noGitRemotes")
        : remoteResult.stderr?.trim() || i18n.t("settings:repositoriesSection.metadata.inspectRemotesFailed");

      setRepositoryState({
        status: "ready",
        rootPath,
        remotes,
        detail,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [args.repository.repositoryPath, repositoryRefreshNonce]);

  return (
    <div className={sx(styles.spaceY4)}>
      <div className={sx(styles.repositoryHeader)}>
        <div className={sx(styles.repositoryHeaderMain)}>
          <div className={sx(styles.rowWrapGap2)}>
            <Badge variant="secondary">{t("settings:repositoriesSection.settings.title")}</Badge>
            {args.isCurrent ? <Badge>{t("settingsProviders:modelVisibility.panel.current")}</Badge> : null}
            <Badge variant="secondary">
              {t("settings:messages.workspaces", { count: args.repository.workspaces.length })}
            </Badge>
            <Badge variant="secondary">{t("settings:messages.defaultBranch", { branch: args.repository.defaultBranch })}</Badge>
          </div>
          <div className={sx(styles.spaceY1)}>
            <h4 className={sx(styles.repositoryTitle)}>
              {args.repository.repositoryName}
            </h4>
            <p className={sx(styles.mutedBody)}>
              {t("settings:repositoriesSection.panel.intro")}</p>
          </div>
          <p className={sx(styles.monoPath)}>{args.repository.repositoryPath}</p>
        </div>
        <div className={sx(styles.rowCenter)}>
          <Button
            size="sm"
            variant="outline"
            disabled={repositoryState.status === "loading"}
            onClick={() => setRepositoryRefreshNonce((value) => value + 1)}
          >
            <RefreshCcw
              className={sx(
                repositoryState.status === "loading"
                  ? styles.spinIcon
                  : styles.refreshIcon,
              )}
            />
            {t("common:actions.refresh")}</Button>
        </div>
      </div>

      <SettingsCard
        title={t("settings:repositoriesSection.appearance.title")}
        description={t("settings:repositoriesSection.appearance.description")}
      >
        <div className={sx(styles.appearanceGrid)}>
          <LabeledField
            title={t("settings:repositoriesSection.appearance.icon.title")}
            description={t("settings:repositoriesSection.appearance.icon.description")}
          >
            <fieldset className={sx(styles.fieldset)}>
              <legend className={sx(styles.radioVisuallyHidden)}>
                {t("settings:repositoriesSection.appearance.icon.legend")}</legend>
              {REPOSITORY_ICON_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  title={option.label}
                  className={sx(styles.swatchLabel)}
                >
                  <input
                    type="radio"
                    name={`project-icon-${args.repository.repositoryPath}`}
                    value={option.id}
                    checked={repositoryAppearanceIcon === option.id}
                    aria-label={option.label}
                    className={sx(styles.radioVisuallyHidden)}
                    onChange={() =>
                      setRepositoryAppearance({
                        repositoryPath: args.repository.repositoryPath,
                        icon: option.id,
                        color: repositoryAppearanceColor,
                      })
                    }
                  />
                  <span
                    className={sx(
                      styles.iconTile,
                      repositoryAppearanceIcon === option.id &&
                        styles.iconTileActive,
                    )}
                  >
                    <option.icon className={sx(styles.tileGlyph)} />
                  </span>
                </label>
              ))}
            </fieldset>
          </LabeledField>

          <LabeledField
            title={t("settings:repositoriesSection.appearance.color.title")}
            description={t("settings:repositoriesSection.appearance.color.description")}
          >
            <fieldset className={sx(styles.fieldset)}>
              <legend className={sx(styles.radioVisuallyHidden)}>
                {t("settings:repositoriesSection.appearance.color.legend")}</legend>
              {REPOSITORY_COLOR_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  title={option.label}
                  className={sx(styles.swatchLabelRound)}
                >
                  <input
                    type="radio"
                    name={`project-color-${args.repository.repositoryPath}`}
                    value={option.id}
                    checked={repositoryAppearanceColor === option.id}
                    aria-label={option.label}
                    className={sx(styles.radioVisuallyHidden)}
                    onChange={() =>
                      setRepositoryAppearance({
                        repositoryPath: args.repository.repositoryPath,
                        icon: repositoryAppearanceIcon,
                        color: option.id,
                      })
                    }
                  />
                  <span
                    className={sx(
                      styles.colorTile,
                      repositoryAppearanceColor === option.id &&
                        styles.colorTileActive,
                    )}
                  >
                    <RepositoryColorSwatch
                      color={option.id}
                      className={sx(styles.swatchGlyph)}
                    />
                  </span>
                </label>
              ))}
            </fieldset>
          </LabeledField>
        </div>
        <div className={sx(styles.identityPreview)}>
          <RepositoryIdentityMark
            icon={repositoryAppearanceIcon}
            color={repositoryAppearanceColor}
          />
          <div className={sx(styles.minW0)}>
            <p className={sx(styles.identityName)}>
              {args.repository.repositoryName}
            </p>
            <p className={sx(styles.identityCaption)}>{t("settings:repositoriesSection.appearance.sidebarPreview")}</p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("settings:repositoriesSection.settings.title")}
        description={t("settings:repositoriesSection.settings.description")}
      >
        <LabeledField
          title={t("settings:repositoriesSection.settings.instructions.title")}
          description={t("settings:repositoriesSection.settings.instructions.description")}
        >
          <DraftTextarea
            xstyle={styles.textarea140}
            value={repositoryBasePrompt}
            onCommit={(nextValue) =>
              setRepositoryBasePrompt({
                repositoryPath: args.repository.repositoryPath,
                prompt: nextValue,
              })
            }
            placeholder={t("settings:repositoriesSection.settings.instructions.placeholder")}
          />
        </LabeledField>

        <LabeledField
          title={t("settings:repositoriesSection.settings.postCreateCommand.title")}
          description={t("settings:repositoriesSection.settings.postCreateCommand.description")}
        >
          <DraftTextarea
            xstyle={styles.textarea120Mono}
            value={repositoryWorkspaceInitCommand}
            onCommit={(nextValue) =>
              setRepositoryWorkspaceInitCommand({
                repositoryPath: args.repository.repositoryPath,
                command: nextValue,
              })
            }
            // i18n-ignore: example shell command
            placeholder="bun install"
          />
        </LabeledField>

        <LabeledField
          title={t("settings:repositoriesSection.settings.kickoffBranchNaming.title")}
          description={t("settings:repositoriesSection.settings.kickoffBranchNaming.description")}
        >
          <DraftTextarea
            xstyle={styles.textarea110}
            value={kickoffBranchNamingRule}
            onCommit={(nextValue) =>
              setRepositoryKickoffBranchNamingRule({
                repositoryPath: args.repository.repositoryPath,
                rule: nextValue,
              })
            }
            placeholder={t("settings:repositoriesSection.settings.kickoffBranchNaming.placeholder")}
          />
        </LabeledField>

        <LabeledField
          title={t("settings:repositoriesSection.settings.rootNodeModules.title")}
          description={t("settings:repositoriesSection.settings.rootNodeModules.description")}
        >
          <Button
            layout="host"
            type="button"
            aria-pressed={repositoryUseRootNodeModulesSymlink}
            onClick={() =>
              setRepositoryWorkspaceUseRootNodeModulesSymlink({
                repositoryPath: args.repository.repositoryPath,
                enabled: !repositoryUseRootNodeModulesSymlink,
              })
            }
            xstyle={[
              styles.toggleButton,
              repositoryUseRootNodeModulesSymlink && styles.toggleButtonActive,
            ]}
          >
            <div>
              <p className={sx(styles.toggleButtonTitle)}>
                {t("settings:repositoriesSection.settings.rootNodeModules.toggleTitle")}</p>
              <p className={sx(styles.toggleButtonHint)}>
                {t("settings:repositoriesSection.settings.rootNodeModules.toggleHint")}</p>
            </div>
            <span
              className={sx(
                styles.toggleBadge,
                repositoryUseRootNodeModulesSymlink && styles.toggleBadgeActive,
              )}
            >
              {repositoryUseRootNodeModulesSymlink ? t("common:status.on") : t("common:status.off")}
            </span>
          </Button>
        </LabeledField>

        <LabeledField title={t("settings:repositoriesSection.settings.rootPath.title")}>
          <div className={sx(styles.infoBox)}>
            {repositoryState.rootPath ?? t("settings:repositoriesSection.settings.rootPath.notDetected")}
          </div>
        </LabeledField>

        <LabeledField
          title={t("settings:repositoriesSection.settings.remoteStatus.title")}
          description={repositoryState.detail}
        >
          {repositoryState.status === "error" ? (
            <p className={sx(styles.errorText)}>{repositoryState.detail}</p>
          ) : repositoryState.remotes.length === 0 ? (
            <p className={sx(styles.mutedBody)}>{t("settings:repositoriesSection.settings.remoteStatus.noRemotes")}</p>
          ) : (
            <div className={sx(styles.spaceY2)}>
              {repositoryState.remotes.map((remote) => (
                <div key={remote.name} className={sx(styles.remoteCard)}>
                  <div className={sx(styles.rowCenter)}>
                    <p className={sx(styles.remoteName)}>{remote.name}</p>
                    <Badge
                      variant="secondary"
                      className={sx(styles.remoteBadge)}
                    >
                      {i18n.t("settings:repositoriesSection.settings.remoteStatus.configured")}</Badge>
                  </div>
                  <p className={sx(styles.remoteMono)}>
                    {i18n.t("settings:settingsDialogRepositoriesSection.fetch")}{remote.fetchUrl ?? "-"}
                  </p>
                  <p className={sx(styles.remoteMono)}>
                    {i18n.t("settings:settingsDialogRepositoriesSection.push")}{remote.pushUrl ?? remote.fetchUrl ?? "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </LabeledField>

        <div className={sx(styles.dangerZone)}>
          <div className={sx(styles.dangerRow)}>
            <div className={sx(styles.spaceY1)}>
              <p className={sx(styles.dangerTitle)}>{t("settings:repositoriesSection.settings.remove.button")}</p>
              <p className={sx(styles.mutedBody)}>
                {t("settings:settingsDialogRepositoriesSection.removesThisRepositoryFromStaveApos")}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="soft"
              tone="danger"
              onClick={() =>
                args.onRequestRemove({
                  repositoryPath: args.repository.repositoryPath,
                  repositoryName: args.repository.repositoryName,
                })
              }
            >
              <Trash2 className={sx(styles.iconMd)} />
              {t("settings:repositoriesSection.settings.remove.button")}</Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t(WORKSPACE_TOOLS_LABEL_KEY)}
        description={t("settings:repositoriesSection.workspaceTools.description")}
        titleAccessory={
          <Button
            type="button"
            size="sm"
            variant="outline"
            xstyle={styles.titleAccessoryButton}
            onClick={() => args.onNavigateSection?.("scripts")}
          >
            <Sparkles className={sx(styles.iconSm)} />
            {t("settings:repositoriesSection.workspaceTools.manage")}<ChevronRight className={sx(styles.iconSm)} />
          </Button>
        }
      >
        <div className={sx(styles.rowWrapGap2)}>
          {(
            [
              [t("settingsProviders:codexSection.tabs.commands"), resolvedScriptsConfig?.actions.length ?? 0],
              [t("settings:settingsDialogRepositoriesSection.processes"), resolvedScriptsConfig?.services.length ?? 0],
              [
                t("settings:settingsDialogRepositoriesSection.triggers"),
                Object.keys(resolvedScriptsConfig?.hooks ?? {}).length,
              ],
              [
                t("settings:settingsDialogRepositoriesSection.environments"),
                Object.keys(resolvedScriptsConfig?.targets ?? {}).length,
              ],
            ] as const
          ).map(([label, count]) => (
            <Badge
              key={label}
              variant="secondary"
              className={sx(styles.toolsBadge)}
            >
              {count} {label}
            </Badge>
          ))}
        </div>
        <p className={sx(styles.mutedBody)}>{t("settings:messages.workspaceToolsLink", { section: t(WORKSPACE_TOOLS_LABEL_KEY) })}</p>
      </SettingsCard>
    </div>
  );
}

export function RepositoriesSection(args: {
  currentRepositoryPath?: string | null;
  repositories: RecentRepositoryState[];
  selectedRepositoryPath?: string | null;
  onNavigateSection?: (id: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const removeRepositoryFromList = useAppStore(
    (state) => state.removeRepositoryFromList,
  );
  const [repositoryToRemove, setRepositoryToRemove] = useState<{
    repositoryPath: string;
    repositoryName: string;
  } | null>(null);
  const selectedRepository =
    args.repositories.find(
      (repository) => repository.repositoryPath === args.selectedRepositoryPath,
    ) ?? null;

  return (
    <>
      {args.repositories.length === 0 ? (
        <SettingsCard
          title={t("settings:repositoriesSection.empty.title")}
          description={t("settings:repositoriesSection.empty.description")}
        >
          <p className={sx(styles.mutedBody)}>
            {t("settings:repositoriesSection.empty.body")}</p>
        </SettingsCard>
      ) : (
        <div className={sx(styles.minW0)}>
          {selectedRepository ? (
            <RepositorySettingsPanel
              repository={selectedRepository}
              isCurrent={
                selectedRepository.repositoryPath === args.currentRepositoryPath
              }
              onRequestRemove={setRepositoryToRemove}
              onNavigateSection={args.onNavigateSection}
            />
          ) : (
            <SettingsCard
              title={t("settings:repositoriesSection.noSelection.title")}
              description={t("settings:repositoriesSection.noSelection.description")}
            >
              <p className={sx(styles.mutedBody)}>
                {t("settings:repositoriesSection.noSelection.body")}</p>
            </SettingsCard>
          )}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(repositoryToRemove)}
        title={t("settings:repositoriesSection.removeDialog.confirm")}
        description={
          repositoryToRemove
            ? t("settings:settingsDialogRepositoriesSection.removeFromStaveSRepositoryList", { value1: repositoryToRemove.repositoryName })
            : ""
        }
        confirmLabel={t("settings:repositoriesSection.removeDialog.confirm")}
        onCancel={() => setRepositoryToRemove(null)}
        onConfirm={() => {
          if (!repositoryToRemove) {
            return;
          }
          void removeRepositoryFromList({
            repositoryPath: repositoryToRemove.repositoryPath,
          });
          setRepositoryToRemove(null);
        }}
      />
    </>
  );
}
