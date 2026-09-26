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
import { WORKSPACE_TOOLS_LABEL } from "@/lib/workspace-scripts/constants";
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
    detail: "Refreshing repository metadata...",
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
        detail: "Terminal bridge unavailable.",
      });
      return;
    }

    let cancelled = false;
    setRepositoryState((current) => ({
      ...current,
      status: "loading",
      detail: "Refreshing repository metadata...",
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
            "This repository folder is unavailable or is no longer a git repository.",
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
          ? `${remotes.length} remote${remotes.length === 1 ? "" : "s"} configured.`
          : "No git remotes configured."
        : remoteResult.stderr?.trim() || "Failed to inspect git remotes.";

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
            <Badge variant="secondary">Repository Settings</Badge>
            {args.isCurrent ? <Badge>Current</Badge> : null}
            <Badge variant="secondary">
              {args.repository.workspaces.length} workspace
              {args.repository.workspaces.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="secondary">
              default: {args.repository.defaultBranch}
            </Badge>
          </div>
          <div className={sx(styles.spaceY1)}>
            <h4 className={sx(styles.repositoryTitle)}>
              {args.repository.repositoryName}
            </h4>
            <p className={sx(styles.mutedBody)}>
              Review repository-specific workspace defaults, git metadata,
              scripts config, and removal actions for this repository.
            </p>
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
            Refresh
          </Button>
        </div>
      </div>

      <SettingsCard
        title="Repository Appearance"
        description="Give each repository a stable visual identity across the sidebar and repository switcher."
      >
        <div className={sx(styles.appearanceGrid)}>
          <LabeledField
            title="Icon"
            description="Choose a shape that makes this repository recognizable at a glance."
          >
            <fieldset className={sx(styles.fieldset)}>
              <legend className={sx(styles.radioVisuallyHidden)}>
                Repository icon
              </legend>
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
            title="Color"
            description="Color applies to the repository icon while the surrounding surface follows the active theme."
          >
            <fieldset className={sx(styles.fieldset)}>
              <legend className={sx(styles.radioVisuallyHidden)}>
                Repository color
              </legend>
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
            <p className={sx(styles.identityCaption)}>Sidebar preview</p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Repository Settings"
        description="Repository-specific defaults, git metadata, and list management for this repository."
      >
        <LabeledField
          title="Repository Instructions"
          description="Prepended to every Claude and Codex turn for this repository. Use it for repo-specific guardrails, tooling preferences, and workflow rules."
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
            placeholder="Prefer bun over npm. Preserve existing Zustand selector stability patterns. Keep documentation in sync with user-facing changes."
          />
        </LabeledField>

        <LabeledField
          title="Post-Create Command"
          description="Runs once in the new workspace root after creation. Useful for `bun install`, `npm install`, or multi-line bootstrap commands."
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
            placeholder="bun install"
          />
        </LabeledField>

        <LabeledField
          title="Kickoff Branch Naming Rule"
          description="Included in workspace kickoff resolution for this repository. Use it to encode repository-specific prefixes, ticket conventions, or casing rules."
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
            placeholder="Use feat/<jira-key>-<short-description> for feature work and fix/<jira-key>-<short-description> for bugs."
          />
        </LabeledField>

        <LabeledField
          title="Reuse Root node_modules"
          description="Creates `node_modules` in each new worktree as a symlink to the repository root install. Faster startup, but later installs in that workspace will modify the shared dependency tree."
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
                Enable shared `node_modules` symlink
              </p>
              <p className={sx(styles.toggleButtonHint)}>
                The symlink exists only inside the created workspace, so
                deleting the workspace leaves the repository root untouched.
              </p>
            </div>
            <span
              className={sx(
                styles.toggleBadge,
                repositoryUseRootNodeModulesSymlink && styles.toggleBadgeActive,
              )}
            >
              {repositoryUseRootNodeModulesSymlink ? "On" : "Off"}
            </span>
          </Button>
        </LabeledField>

        <LabeledField title="Repository Root Path">
          <div className={sx(styles.infoBox)}>
            {repositoryState.rootPath ?? "Not detected"}
          </div>
        </LabeledField>

        <LabeledField
          title="Remote Status"
          description={repositoryState.detail}
        >
          {repositoryState.status === "error" ? (
            <p className={sx(styles.errorText)}>{repositoryState.detail}</p>
          ) : repositoryState.remotes.length === 0 ? (
            <p className={sx(styles.mutedBody)}>No remotes configured.</p>
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
                      configured
                    </Badge>
                  </div>
                  <p className={sx(styles.remoteMono)}>
                    fetch: {remote.fetchUrl ?? "-"}
                  </p>
                  <p className={sx(styles.remoteMono)}>
                    push: {remote.pushUrl ?? remote.fetchUrl ?? "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </LabeledField>

        <div className={sx(styles.dangerZone)}>
          <div className={sx(styles.dangerRow)}>
            <div className={sx(styles.spaceY1)}>
              <p className={sx(styles.dangerTitle)}>Remove repository</p>
              <p className={sx(styles.mutedBody)}>
                Removes this repository from Stave&apos;s registered repository list
                without deleting files on disk.
              </p>
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
              Remove repository
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title={WORKSPACE_TOOLS_LABEL}
        description="One-shot commands, long-running processes, lifecycle triggers, and execution environments for this repository."
        titleAccessory={
          <Button
            type="button"
            size="sm"
            variant="outline"
            xstyle={styles.titleAccessoryButton}
            onClick={() => args.onNavigateSection?.("scripts")}
          >
            <Sparkles className={sx(styles.iconSm)} />
            Manage workspace tools
            <ChevronRight className={sx(styles.iconSm)} />
          </Button>
        }
      >
        <div className={sx(styles.rowWrapGap2)}>
          {(
            [
              ["Commands", resolvedScriptsConfig?.actions.length ?? 0],
              ["Processes", resolvedScriptsConfig?.services.length ?? 0],
              [
                "Triggers",
                Object.keys(resolvedScriptsConfig?.hooks ?? {}).length,
              ],
              [
                "Environments",
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
        <p className={sx(styles.mutedBody)}>
          Configure and run them from the dedicated {WORKSPACE_TOOLS_LABEL}{" "}
          section.
        </p>
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
          title="No Repositories Yet"
          description="Open a repository from the sidebar to register it here."
        >
          <p className={sx(styles.mutedBody)}>
            Registered repositories will show their repository defaults and metadata
            in this section.
          </p>
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
              title="Repository Details"
              description="Choose a repository from the Settings sidebar to open its settings panel."
            >
              <p className={sx(styles.mutedBody)}>
                Pick a repository from the sidebar to inspect its workspace
                defaults and repository metadata.
              </p>
            </SettingsCard>
          )}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(repositoryToRemove)}
        title="Remove Repository"
        description={
          repositoryToRemove
            ? `Remove "${repositoryToRemove.repositoryName}" from Stave's repository list? This does not delete files on disk.`
            : ""
        }
        confirmLabel="Remove Repository"
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
