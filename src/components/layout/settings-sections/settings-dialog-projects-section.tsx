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
  normalizeProjectAppearanceColor,
  normalizeProjectAppearanceIcon,
  normalizeProjectBasePrompt,
  normalizeProjectKickoffBranchNamingRule,
  normalizeProjectWorkspaceInitCommand,
  normalizeProjectWorkspaceRootNodeModulesSymlinkPreference,
  type RecentProjectState,
} from "@/store/project.utils";
import {
  PROJECT_COLOR_OPTIONS,
  PROJECT_ICON_OPTIONS,
  ProjectColorSwatch,
  ProjectIdentityMark,
} from "@/components/layout/project-appearance";
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

function ProjectSettingsPanel(args: {
  project: RecentProjectState;
  isCurrent: boolean;
  onRequestRemove: (args: { projectPath: string; projectName: string }) => void;
  onNavigateSection?: (id: SectionId) => void;
}) {
  const setProjectBasePrompt = useAppStore(
    (state) => state.setProjectBasePrompt,
  );
  const setProjectKickoffBranchNamingRule = useAppStore(
    (state) => state.setProjectKickoffBranchNamingRule,
  );
  const setProjectWorkspaceInitCommand = useAppStore(
    (state) => state.setProjectWorkspaceInitCommand,
  );
  const setProjectWorkspaceUseRootNodeModulesSymlink = useAppStore(
    (state) => state.setProjectWorkspaceUseRootNodeModulesSymlink,
  );
  const setProjectAppearance = useAppStore(
    (state) => state.setProjectAppearance,
  );
  const [currentProjectPath, activeWorkspaceId, workspacePathById] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.projectPath,
            state.activeWorkspaceId,
            state.workspacePathById,
          ] as const,
      ),
    );
  const projectWorkspaceInitCommand = normalizeProjectWorkspaceInitCommand({
    value: args.project.newWorkspaceInitCommand,
  });
  const projectBasePrompt = normalizeProjectBasePrompt({
    value: args.project.projectBasePrompt,
  });
  const kickoffBranchNamingRule = normalizeProjectKickoffBranchNamingRule({
    value: args.project.kickoffBranchNamingRule,
  });
  const projectUseRootNodeModulesSymlink =
    normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
      value: args.project.newWorkspaceUseRootNodeModulesSymlink,
    });
  const projectAppearanceIcon = normalizeProjectAppearanceIcon(
    args.project.appearanceIcon,
  );
  const projectAppearanceColor = normalizeProjectAppearanceColor(
    args.project.appearanceColor,
  );
  const scriptsWorkspacePath = args.isCurrent
    ? (workspacePathById[activeWorkspaceId] ??
      currentProjectPath ??
      args.project.projectPath)
    : args.project.projectPath;
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
    if (!getConfig || !args.project.projectPath || !scriptsWorkspacePath) {
      setResolvedScriptsConfig(null);
      return;
    }

    const result = await getConfig({
      projectPath: args.project.projectPath,
      workspacePath: scriptsWorkspacePath,
    });
    setResolvedScriptsConfig(result.ok ? result.config : null);
  }, [args.project.projectPath, scriptsWorkspacePath]);

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
          cwd: args.project.projectPath,
          command: "git rev-parse --show-toplevel",
        }),
        runCommand({
          cwd: args.project.projectPath,
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
            "This project is unavailable or is not a git repository.",
        });
        return;
      }

      const rootPath =
        rootResult.stdout
          .split("\n")
          .map((line) => line.trim())
          .find(Boolean) ?? args.project.projectPath;
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
  }, [args.project.projectPath, repositoryRefreshNonce]);

  return (
    <div className={sx(styles.spaceY4)}>
      <div className={sx(styles.projectHeader)}>
        <div className={sx(styles.projectHeaderMain)}>
          <div className={sx(styles.rowWrapGap2)}>
            <Badge variant="secondary">Project Settings</Badge>
            {args.isCurrent ? <Badge>Current</Badge> : null}
            <Badge variant="secondary">
              {args.project.workspaces.length} workspace
              {args.project.workspaces.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="secondary">
              default: {args.project.defaultBranch}
            </Badge>
          </div>
          <div className={sx(styles.spaceY1)}>
            <h4 className={sx(styles.projectTitle)}>
              {args.project.projectName}
            </h4>
            <p className={sx(styles.mutedBody)}>
              Review repository-specific workspace defaults, git metadata,
              scripts config, and removal actions for this project.
            </p>
          </div>
          <p className={sx(styles.monoPath)}>{args.project.projectPath}</p>
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
        title="Project Appearance"
        description="Give each project a stable visual identity across the sidebar and project switcher."
      >
        <div className={sx(styles.appearanceGrid)}>
          <LabeledField
            title="Icon"
            description="Choose a shape that makes this repository recognizable at a glance."
          >
            <fieldset className={sx(styles.fieldset)}>
              <legend className={sx(styles.radioVisuallyHidden)}>
                Project icon
              </legend>
              {PROJECT_ICON_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  title={option.label}
                  className={sx(styles.swatchLabel)}
                >
                  <input
                    type="radio"
                    name={`project-icon-${args.project.projectPath}`}
                    value={option.id}
                    checked={projectAppearanceIcon === option.id}
                    aria-label={option.label}
                    className={sx(styles.radioVisuallyHidden)}
                    onChange={() =>
                      setProjectAppearance({
                        projectPath: args.project.projectPath,
                        icon: option.id,
                        color: projectAppearanceColor,
                      })
                    }
                  />
                  <span
                    className={sx(
                      styles.iconTile,
                      projectAppearanceIcon === option.id &&
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
            description="Color applies to the project icon while the surrounding surface follows the active theme."
          >
            <fieldset className={sx(styles.fieldset)}>
              <legend className={sx(styles.radioVisuallyHidden)}>
                Project color
              </legend>
              {PROJECT_COLOR_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  title={option.label}
                  className={sx(styles.swatchLabelRound)}
                >
                  <input
                    type="radio"
                    name={`project-color-${args.project.projectPath}`}
                    value={option.id}
                    checked={projectAppearanceColor === option.id}
                    aria-label={option.label}
                    className={sx(styles.radioVisuallyHidden)}
                    onChange={() =>
                      setProjectAppearance({
                        projectPath: args.project.projectPath,
                        icon: projectAppearanceIcon,
                        color: option.id,
                      })
                    }
                  />
                  <span
                    className={sx(
                      styles.colorTile,
                      projectAppearanceColor === option.id &&
                        styles.colorTileActive,
                    )}
                  >
                    <ProjectColorSwatch
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
          <ProjectIdentityMark
            icon={projectAppearanceIcon}
            color={projectAppearanceColor}
          />
          <div className={sx(styles.minW0)}>
            <p className={sx(styles.identityName)}>
              {args.project.projectName}
            </p>
            <p className={sx(styles.identityCaption)}>Sidebar preview</p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Repository Settings"
        description="Repository-specific defaults, git metadata, and list management for this project."
      >
        <LabeledField
          title="Project Instructions"
          description="Prepended to every Claude and Codex turn for this project. Use it for repo-specific guardrails, tooling preferences, and workflow rules."
        >
          <DraftTextarea
            xstyle={styles.textarea140}
            value={projectBasePrompt}
            onCommit={(nextValue) =>
              setProjectBasePrompt({
                projectPath: args.project.projectPath,
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
            value={projectWorkspaceInitCommand}
            onCommit={(nextValue) =>
              setProjectWorkspaceInitCommand({
                projectPath: args.project.projectPath,
                command: nextValue,
              })
            }
            placeholder="bun install"
          />
        </LabeledField>

        <LabeledField
          title="Kickoff Branch Naming Rule"
          description="Included in workspace kickoff resolution for this project. Use it to encode repository-specific prefixes, ticket conventions, or casing rules."
        >
          <DraftTextarea
            xstyle={styles.textarea110}
            value={kickoffBranchNamingRule}
            onCommit={(nextValue) =>
              setProjectKickoffBranchNamingRule({
                projectPath: args.project.projectPath,
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
            aria-pressed={projectUseRootNodeModulesSymlink}
            onClick={() =>
              setProjectWorkspaceUseRootNodeModulesSymlink({
                projectPath: args.project.projectPath,
                enabled: !projectUseRootNodeModulesSymlink,
              })
            }
            xstyle={[
              styles.toggleButton,
              projectUseRootNodeModulesSymlink && styles.toggleButtonActive,
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
                projectUseRootNodeModulesSymlink && styles.toggleBadgeActive,
              )}
            >
              {projectUseRootNodeModulesSymlink ? "On" : "Off"}
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
              <p className={sx(styles.dangerTitle)}>Remove project</p>
              <p className={sx(styles.mutedBody)}>
                Removes this project from Stave&apos;s registered project list
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
                  projectPath: args.project.projectPath,
                  projectName: args.project.projectName,
                })
              }
            >
              <Trash2 className={sx(styles.iconMd)} />
              Remove project
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title={WORKSPACE_TOOLS_LABEL}
        description="One-shot commands, long-running processes, lifecycle triggers, and execution environments for this project."
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

export function ProjectsSection(args: {
  currentProjectPath?: string | null;
  projects: RecentProjectState[];
  selectedProjectPath?: string | null;
  onNavigateSection?: (id: SectionId) => void;
}) {
  const removeProjectFromList = useAppStore(
    (state) => state.removeProjectFromList,
  );
  const [projectToRemove, setProjectToRemove] = useState<{
    projectPath: string;
    projectName: string;
  } | null>(null);
  const selectedProject =
    args.projects.find(
      (project) => project.projectPath === args.selectedProjectPath,
    ) ?? null;

  return (
    <>
      {args.projects.length === 0 ? (
        <SettingsCard
          title="No Projects Yet"
          description="Open a project from the sidebar to register it here."
        >
          <p className={sx(styles.mutedBody)}>
            Registered projects will show their repository defaults and metadata
            in this section.
          </p>
        </SettingsCard>
      ) : (
        <div className={sx(styles.minW0)}>
          {selectedProject ? (
            <ProjectSettingsPanel
              project={selectedProject}
              isCurrent={
                selectedProject.projectPath === args.currentProjectPath
              }
              onRequestRemove={setProjectToRemove}
              onNavigateSection={args.onNavigateSection}
            />
          ) : (
            <SettingsCard
              title="Project Details"
              description="Choose a project from the Settings sidebar to open its settings panel."
            >
              <p className={sx(styles.mutedBody)}>
                Pick a project from the sidebar to inspect its workspace
                defaults and repository metadata.
              </p>
            </SettingsCard>
          )}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(projectToRemove)}
        title="Remove Project"
        description={
          projectToRemove
            ? `Remove "${projectToRemove.projectName}" from Stave's project list? This does not delete files on disk.`
            : ""
        }
        confirmLabel="Remove Project"
        onCancel={() => setProjectToRemove(null)}
        onConfirm={() => {
          if (!projectToRemove) {
            return;
          }
          void removeProjectFromList({
            projectPath: projectToRemove.projectPath,
          });
          setProjectToRemove(null);
        }}
      />
    </>
  );
}
