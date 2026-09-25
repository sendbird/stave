import { Checkbox } from "@/components/ads/components/Checkbox";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import {
  ChevronRight,
  FolderOpen,
  FolderTree,
  LayoutGrid,
  ListChecks,
  PanelLeft,
  Plus,
  RefreshCw,
  Rocket,
  Rows2,
  Rows3,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { panelBarStyles } from "@/components/layout/panel-bar.constants";
import { projectSidebarStyles } from "@/components/layout/project-workspace-sidebar.styles";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { transition } from "@/components/ads/recipes/transition";
import { cx, sx } from "@/components/ads/utils/stylex";
import {
  buildCollapsedWorkspaceEntries,
  buildProjectSidebarAttentionAlert,
  buildSidebarWorkQueueEntries,
  buildWorkspaceArchiveDialogCopy,
  filterProjectSidebarProjects,
  buildVisibleWorkspaceShortcutTargets,
  getWorkspaceShortcutLabel,
  getWorkspaceLeadingAttentionKind,
  WORKSPACE_SHORTCUT_COUNT,
  type ProjectSidebarAttentionAlert,
  type ProjectSidebarCollapsedProjectView,
} from "@/components/layout/ProjectWorkspaceSidebar.utils";
import { isEditableShortcutTarget } from "@/components/layout/app-shell.shortcuts";
import { CreateWorkspaceDialog } from "@/components/layout/CreateWorkspaceDialog";
import { OpenPathDialog } from "@/components/layout/OpenPathDialog";
import { StaveAppMenuButton } from "@/components/layout/StaveAppMenuButton";
import { useFleetAttentionProjection } from "@/components/layout/useFleetAttentionProjection";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import { WorkspaceIdentityMark } from "@/components/layout/workspace-accent";
import { WorkspaceAccountLimitIcon } from "@/components/layout/WorkspaceAccountLimitIcon";
import { WorkspaceProgressTaskTree } from "@/components/layout/WorkspaceProgressTaskTree";
import { ProjectIdentityMark } from "@/components/layout/project-appearance";
import { useSortableListMonitor } from "@/hooks/use-sortable-list";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Loader,
  Input,
} from "@/components/ui";
import {
  classifyTaskStatus,
  compareFleetTaskStatus,
  type FleetTaskStatus,
} from "@/lib/fleet/task-status";
import {
  buildSidebarWorkQueueLanes,
  type SidebarWorkQueueLane,
  type SidebarWorkQueueSignals,
} from "@/lib/fleet/sidebar-work-queue";
import { isDelegatedChildTask, isTaskArchived } from "@/lib/tasks";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";
import { useAppStore } from "@/store/app.store";
import type { SidebarNavView } from "@/store/app-settings";
import type { WorkspaceSidebarItemDisplayMode } from "@/store/layout.utils";
import { getLinkedWorktreePathSetForProject } from "@/store/workspace-archive-cleanup";
import {
  isWorkspaceActivationKey,
  WorkspaceHoverPreviewTooltip,
  WorkspaceLeadingStatusIcon,
  WorkQueueRow,
  ProjectAttentionAlertIcon,
  WorkspaceRespondingCountBadge,
  InlineWorkspaceLabel,
  WorkspaceExpandedMeta,
  WorkspaceBorderBeam,
  IS_MAC,
  workspaceShortcutModifierLabel,
  SortableSidebarItem,
  WorkspaceRowActions,
} from "./workspace-sidebar-rows";

type ProjectSidebarView = ProjectSidebarCollapsedProjectView;

/**
 * The two sidebar views, in toggle order. Both list the same workspaces, so
 * either is a complete way to navigate — `projects` sorts by where a workspace
 * lives, `work-queue` sorts by what it wants from you.
 */
const SIDEBAR_NAV_VIEW_OPTIONS: readonly {
  value: SidebarNavView;
  label: string;
  Icon: typeof FolderTree;
}[] = [
  { value: "projects", label: "Projects", Icon: FolderTree },
  { value: "work-queue", label: "Work queue", Icon: ListChecks },
] as const;
const DEFAULT_COLLAPSED_PROJECT_SIDEBAR_WIDTH = 64;
/** Height reserved at the top of the collapsed sidebar for macOS traffic-light buttons. */
const MAC_TRAFFIC_LIGHT_CLEARANCE = 40;
/** Keep this aligned with the native traffic-light placement in `electron/main/window.ts`. */
const MAC_TRAFFIC_LIGHT_LEFT_INSET = 12;
const MAC_TRAFFIC_LIGHT_CLUSTER_WIDTH = 58;
const MAC_TRAFFIC_LIGHT_RIGHT_GUTTER = 10;
export const COLLAPSED_PROJECT_SIDEBAR_WIDTH = IS_MAC
  ? Math.max(
      DEFAULT_COLLAPSED_PROJECT_SIDEBAR_WIDTH,
      MAC_TRAFFIC_LIGHT_LEFT_INSET +
        MAC_TRAFFIC_LIGHT_CLUSTER_WIDTH +
        MAC_TRAFFIC_LIGHT_RIGHT_GUTTER,
    )
  : DEFAULT_COLLAPSED_PROJECT_SIDEBAR_WIDTH;

const PROJECT_SORTABLE_LIST_ID = "sidebar-projects";
const WORKSPACE_SORTABLE_LIST_PREFIX = "sidebar-workspaces:";

export function ProjectWorkspaceSidebar(args: {
  width: number;
  collapsed: boolean;
  animate?: boolean;
  onOpenCommandPalette: () => void;
  onOpenKeyboardShortcuts: () => void;
  onOpenSettings: (options?: {
    projectPath?: string | null;
    section?: SectionId;
  }) => void;
  onPreloadSettings: () => void;
  onKickoffWorkspace: (projectPath: string) => Promise<void> | void;
}) {
  const [collapsedByProjectPath, setCollapsedByProjectPath] = useState<
    Record<string, boolean>
  >({});
  // Lane collapse is deliberately session-local, matching `collapsedByProjectPath`:
  // both answer "what am I ignoring right now", not "how do I like my sidebar".
  const [collapsedWorkQueueLanes, setCollapsedWorkQueueLanes] = useState<
    Partial<Record<SidebarWorkQueueLane, boolean>>
  >({});
  const [busyProjectPath, setBusyProjectPath] = useState<string | null>(null);
  const [busyWorkspaceKey, setBusyWorkspaceKey] = useState<string | null>(null);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [openPathDialogOpen, setOpenPathDialogOpen] = useState(false);
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const [workspaceToClose, setWorkspaceToClose] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [closingWorkspaceId, setClosingWorkspaceId] = useState<string | null>(
    null,
  );
  const [archiveDeletesBranch, setArchiveDeletesBranch] = useState(true);
  const [
    currentProjectPath,
    currentProjectName,
    workspaces,
    activeWorkspaceId,
    recentProjects,
    workspaceDefaultById,
    workspaceBranchById,
    workspacePathById,
    activeWorkspaceBranch,
    activeWorkspaceCwd,
    workspaceSidebarItemDisplayMode,
    sidebarShowFleetView,
    sidebarNavView,
    defaultBranch,
    projectWorkspaceInitCommand,
    projectUseRootNodeModulesSymlink,
    createProject,
    openProjectFromPath,
    openProject,
    moveProjectInList,
    switchWorkspace,
    moveWorkspaceInProjectList,
    createWorkspace,
    importWorkspaceFromWorktree,
    closeWorkspace,
    renameWorkspace,
    setLayout,
    updateSettings,
    fetchAllWorkspacePrStatuses,
    hydrateWorkspaces,
    activeAppSurface,
    openFleetView,
    activeTasks,
    messagesByTask,
    activeTurnIdsByTask,
    providerTurnActivityByTask,
    workspaceRuntimeCacheById,
  ] = useAppStore(
    useShallow((state) => {
      return [
        state.projectPath,
        state.projectName,
        state.workspaces,
        state.activeWorkspaceId,
        state.recentProjects,
        state.workspaceDefaultById,
        state.workspaceBranchById,
        state.workspacePathById,
        state.workspaceBranchById[state.activeWorkspaceId] ?? "main",
        state.workspacePathById[state.activeWorkspaceId] ??
          state.projectPath ??
          undefined,
        state.layout.workspaceSidebarItemDisplayMode,
        state.settings.sidebarShowFleetView,
        state.settings.sidebarNavView,
        state.defaultBranch,
        (state.projectPath
          ? state.recentProjects.find(
              (project) => project.projectPath === state.projectPath,
            )?.newWorkspaceInitCommand
          : "") ?? "",
        state.projectPath
          ? state.recentProjects.find(
              (project) => project.projectPath === state.projectPath,
            )?.newWorkspaceUseRootNodeModulesSymlink === true
          : false,
        state.createProject,
        state.openProjectFromPath,
        state.openProject,
        state.moveProjectInList,
        state.switchWorkspace,
        state.moveWorkspaceInProjectList,
        state.createWorkspace,
        state.importWorkspaceFromWorktree,
        state.closeWorkspace,
        state.renameWorkspace,
        state.setLayout,
        state.updateSettings,
        state.fetchAllWorkspacePrStatuses,
        state.hydrateWorkspaces,
        state.activeAppSurface,
        state.openFleetView,
        state.tasks,
        state.messagesByTask,
        state.activeTurnIdsByTask,
        state.providerTurnActivityByTask,
        state.workspaceRuntimeCacheById,
      ] as const;
    }),
  );
  const { highestAttentionByWorkspaceId, attentionItemsByWorkspaceId } =
    useFleetAttentionProjection();
  const isWorkQueueView = sidebarNavView === "work-queue";

  const projects = useMemo(() => {
    const rememberedCurrentProject = currentProjectPath
      ? recentProjects.find(
          (project) => project.projectPath === currentProjectPath,
        )
      : null;
    const currentProject = currentProjectPath
      ? ({
          projectPath: currentProjectPath,
          projectName: currentProjectName ?? "project",
          appearanceIcon: rememberedCurrentProject?.appearanceIcon,
          appearanceColor: rememberedCurrentProject?.appearanceColor,
          workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(workspaceDefaultById[workspace.id]),
            branch: workspaceBranchById[workspace.id],
          })),
          workspacePathById,
          activeWorkspaceId,
          isCurrent: true,
        } satisfies ProjectSidebarView)
      : null;

    const rememberedProjects = recentProjects.map(
      (project) =>
        ({
          projectPath: project.projectPath,
          projectName: project.projectName,
          appearanceIcon: project.appearanceIcon,
          appearanceColor: project.appearanceColor,
          workspaces: project.workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(project.workspaceDefaultById[workspace.id]),
            branch: project.workspaceBranchById[workspace.id],
          })),
          workspacePathById: project.workspacePathById,
          activeWorkspaceId: project.activeWorkspaceId,
          isCurrent: project.projectPath === currentProjectPath,
        }) satisfies ProjectSidebarView,
    );

    if (!currentProject) {
      return rememberedProjects;
    }

    const hasCurrentProject = rememberedProjects.some(
      (project) => project.projectPath === currentProjectPath,
    );
    if (!hasCurrentProject) {
      return [...rememberedProjects, currentProject];
    }

    return rememberedProjects.map((project) =>
      project.projectPath === currentProjectPath ? currentProject : project,
    );
  }, [
    activeWorkspaceId,
    currentProjectName,
    currentProjectPath,
    recentProjects,
    workspaceBranchById,
    workspaceDefaultById,
    workspacePathById,
    workspaces,
  ]);
  const visibleProjects = useMemo(
    () =>
      filterProjectSidebarProjects({
        projects,
        query: workspaceSearchQuery,
      }),
    [projects, workspaceSearchQuery],
  );
  // Archive treats linked worktrees as externally owned, so the confirmation
  // must not promise a branch deletion that `performWorkspaceArchiveCleanup`
  // will never perform.
  const archiveDialogCopy = useMemo(() => {
    if (!workspaceToClose) {
      return null;
    }
    const workspacePath = workspacePathById[workspaceToClose.id];
    const isLinkedWorktree = Boolean(
      workspacePath &&
      getLinkedWorktreePathSetForProject({
        projectPath: currentProjectPath,
        recentProjects,
      }).has(normalizeComparablePath(workspacePath)),
    );
    return buildWorkspaceArchiveDialogCopy({
      workspaceName: workspaceToClose.name,
      isLinkedWorktree,
    });
  }, [currentProjectPath, recentProjects, workspacePathById, workspaceToClose]);
  const collapsedWorkspaceEntries = useMemo(
    () =>
      buildCollapsedWorkspaceEntries({
        projects,
        activeWorkspaceId,
      }),
    [activeWorkspaceId, projects],
  );
  const recentProjectLastOpenedAtByPath = useMemo(() => {
    const map: Record<string, string> = {};
    for (const project of recentProjects) {
      map[project.projectPath] = project.lastOpenedAt;
    }
    return map;
  }, [recentProjects]);
  const workspaceFleetStatusById = useMemo(() => {
    const statusById: Record<string, FleetTaskStatus> = {};
    if (!isWorkQueueView) {
      // Only the Work queue view reads this — skip the per-task classification
      // pass entirely while the Projects tree is showing.
      return statusById;
    }
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        const isActiveWorkspace =
          project.isCurrent && workspace.id === activeWorkspaceId;
        const runtimeState = isActiveWorkspace
          ? { tasks: activeTasks, messagesByTask, activeTurnIdsByTask }
          : workspaceRuntimeCacheById[workspace.id];
        if (!runtimeState) {
          continue;
        }

        let bestStatus: FleetTaskStatus = "idle";
        for (const task of runtimeState.tasks) {
          // A delegated child is surfaced under its parent, so its status must
          // not drive the workspace roll-up on its own.
          if (isTaskArchived(task) || isDelegatedChildTask(task)) {
            continue;
          }
          const status = classifyTaskStatus({
            task,
            messages: runtimeState.messagesByTask[task.id],
            activeTurnId: runtimeState.activeTurnIdsByTask[task.id] ?? null,
            activity: providerTurnActivityByTask[task.id] ?? null,
          });
          if (compareFleetTaskStatus(status, bestStatus) < 0) {
            bestStatus = status;
          }
        }
        statusById[workspace.id] = bestStatus;
      }
    }
    return statusById;
  }, [
    activeTasks,
    activeTurnIdsByTask,
    activeWorkspaceId,
    messagesByTask,
    projects,
    providerTurnActivityByTask,
    isWorkQueueView,
    workspaceRuntimeCacheById,
  ]);
  const workQueueEntries = useMemo(
    () =>
      isWorkQueueView
        ? buildSidebarWorkQueueEntries({
            // `visibleProjects`, not `projects`: the search box filters both
            // views through the same predicate, so a query narrows the queue
            // exactly the way it narrows the tree.
            projects: visibleProjects,
            recentProjectLastOpenedAtByPath,
            statusByWorkspaceId: workspaceFleetStatusById,
            // Only needs that show a leading icon may pull a workspace up the
            // order. A reviewed-later result must not outrank a live one with
            // no visible reason for it.
            attentionPriorityByWorkspaceId: Object.fromEntries(
              Object.entries(highestAttentionByWorkspaceId).flatMap(
                ([workspaceId, attentionItem]) =>
                  attentionItem &&
                  getWorkspaceLeadingAttentionKind(attentionItem.kind)
                    ? [[workspaceId, attentionItem.priority]]
                    : [],
              ),
            ),
            activeWorkspaceId,
          })
        : [],
    [
      activeWorkspaceId,
      isWorkQueueView,
      visibleProjects,
      recentProjectLastOpenedAtByPath,
      highestAttentionByWorkspaceId,
      workspaceFleetStatusById,
    ],
  );
  // Lane grouping runs here, outside the Zustand selector, so the store never
  // hands out a freshly built object on every subscriber notification. The
  // ranking itself already happened above; this only names the reason a row is
  // in the list. `highestAttentionByWorkspaceId` folds PR state into need kinds, so
  // no PR subscription is needed at this level.
  const workQueueGroups = useMemo(() => {
    const signalsByWorkspaceId: Record<string, SidebarWorkQueueSignals> = {};
    for (const entry of workQueueEntries) {
      signalsByWorkspaceId[entry.workspaceId] = {
        attentionKind: highestAttentionByWorkspaceId[entry.workspaceId]?.kind,
        status: entry.status,
      };
    }
    return buildSidebarWorkQueueLanes({
      entries: workQueueEntries,
      signalsByWorkspaceId,
    });
  }, [workQueueEntries, highestAttentionByWorkspaceId]);
  // Collapsing a project hides its workspace rows, so the project row carries
  // the rolled-up alert for anything blocking inside it.
  const attentionAlertByProjectPath = useMemo(() => {
    const alertByPath: Record<string, ProjectSidebarAttentionAlert> = {};
    for (const project of projects) {
      const alert = buildProjectSidebarAttentionAlert({
        workspaces: project.workspaces,
        attentionItemsByWorkspaceId,
      });
      if (alert) {
        alertByPath[project.projectPath] = alert;
      }
    }
    return alertByPath;
  }, [attentionItemsByWorkspaceId, projects]);
  const workspaceShortcutTargets = useMemo(
    () =>
      buildVisibleWorkspaceShortcutTargets({
        collapsed: args.collapsed,
        collapsedByProjectPath,
        projects,
      }),
    [args.collapsed, collapsedByProjectPath, projects],
  );
  const workspaceShortcutLabels = useMemo(
    () =>
      new Map(
        workspaceShortcutTargets.map((target, index) => [
          `${target.projectPath}:${target.workspaceId}`,
          getWorkspaceShortcutLabel(index) ?? "",
        ]),
      ),
    [workspaceShortcutTargets],
  );
  const suppressRowClickRef = useRef(false);

  const suppressNextRowClick = useCallback(() => {
    suppressRowClickRef.current = true;
    window.setTimeout(() => {
      suppressRowClickRef.current = false;
    }, 0);
  }, []);

  useSortableListMonitor({
    isListMatch: (listId) => listId === PROJECT_SORTABLE_LIST_ID,
    onReorder: ({ sourceId, targetId, closestEdge }) => {
      const fromIndex = projects.findIndex(
        (project) => project.projectPath === sourceId,
      );
      const targetIndex = projects.findIndex(
        (project) => project.projectPath === targetId,
      );
      if (fromIndex < 0 || targetIndex < 0) {
        return;
      }
      const destinationIndex = getReorderDestinationIndex({
        startIndex: fromIndex,
        indexOfTarget: targetIndex,
        closestEdgeOfTarget: closestEdge,
        axis: "vertical",
      });
      if (destinationIndex === fromIndex) {
        return;
      }
      const direction = destinationIndex > fromIndex ? "down" : "up";
      const steps = Math.abs(destinationIndex - fromIndex);
      for (let step = 0; step < steps; step += 1) {
        moveProjectInList({ projectPath: sourceId, direction });
      }
      const projectName = projects[fromIndex]?.projectName ?? "Project";
      setReorderAnnouncement(
        `${projectName} moved to position ${destinationIndex + 1} of ${projects.length}.`,
      );
      suppressNextRowClick();
    },
  });

  useSortableListMonitor({
    isListMatch: (listId) => listId.startsWith(WORKSPACE_SORTABLE_LIST_PREFIX),
    onReorder: ({ listId, sourceId, targetId, closestEdge }) => {
      const projectPath = listId.slice(WORKSPACE_SORTABLE_LIST_PREFIX.length);
      const project = projects.find((item) => item.projectPath === projectPath);
      if (!project) {
        return;
      }
      const fromIndex = project.workspaces.findIndex(
        (workspace) => workspace.id === sourceId,
      );
      const targetIndex = project.workspaces.findIndex(
        (workspace) => workspace.id === targetId,
      );
      if (fromIndex < 0 || targetIndex < 0) {
        return;
      }
      const destinationIndex = getReorderDestinationIndex({
        startIndex: fromIndex,
        indexOfTarget: targetIndex,
        closestEdgeOfTarget: closestEdge,
        axis: "vertical",
      });
      if (destinationIndex === fromIndex) {
        return;
      }
      const direction = destinationIndex > fromIndex ? "down" : "up";
      const steps = Math.abs(destinationIndex - fromIndex);
      for (let step = 0; step < steps; step += 1) {
        moveWorkspaceInProjectList({
          projectPath,
          workspaceId: sourceId,
          direction,
        });
      }
      const workspaceName = project.workspaces[fromIndex]?.name ?? "Workspace";
      setReorderAnnouncement(
        `${workspaceName} moved to position ${destinationIndex + 1} of ${project.workspaces.length}.`,
      );
      suppressNextRowClick();
    },
  });

  useEffect(() => {
    setCollapsedByProjectPath((current) => {
      let changed = false;
      const next = { ...current };
      for (const project of projects) {
        if (!(project.projectPath in next)) {
          next[project.projectPath] = false;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [projects]);

  // Fetch PR status for all non-default workspaces on mount and every 5 min.
  useEffect(() => {
    void fetchAllWorkspacePrStatuses();
    const interval = setInterval(
      () => {
        void fetchAllWorkspacePrStatuses();
      },
      5 * 60 * 1000,
    );
    return () => clearInterval(interval);
  }, [fetchAllWorkspacePrStatuses]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasMod = event.ctrlKey || event.metaKey;
      if (!hasMod || event.altKey || !event.shiftKey) {
        return;
      }

      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      const digitMatch = event.code.match(/^Digit([1-9])$/);
      const shortcutIndex = digitMatch
        ? Number.parseInt(digitMatch[1] ?? "", 10) - 1
        : Number.parseInt(event.key, 10) - 1;
      if (
        Number.isNaN(shortcutIndex) ||
        shortcutIndex < 0 ||
        shortcutIndex >= WORKSPACE_SHORTCUT_COUNT
      ) {
        return;
      }

      const nextWorkspace = workspaceShortcutTargets[shortcutIndex];
      if (!nextWorkspace) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void handleProjectWorkspaceOpen({
        projectPath: nextWorkspace.projectPath,
        workspaceId: nextWorkspace.workspaceId,
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleProjectWorkspaceOpen, workspaceShortcutTargets]);
  async function handleProjectWorkspaceOpen(args: {
    projectPath: string;
    workspaceId?: string;
  }) {
    const workspaceKey = args.workspaceId
      ? `${args.projectPath}:${args.workspaceId}`
      : null;
    setBusyProjectPath(args.projectPath);
    setBusyWorkspaceKey(workspaceKey);
    try {
      if (args.projectPath !== useAppStore.getState().projectPath) {
        await openProject({ projectPath: args.projectPath });
      }
      if (args.workspaceId) {
        const stateNow = useAppStore.getState();
        if (
          stateNow.activeWorkspaceId !== args.workspaceId ||
          stateNow.activeAppSurface.kind !== "workspace"
        ) {
          await switchWorkspace({ workspaceId: args.workspaceId });
        }
      }
    } finally {
      setBusyProjectPath(null);
      setBusyWorkspaceKey(null);
    }
  }

  async function handleCreateWorkspaceRequest(projectPath: string) {
    setBusyProjectPath(projectPath);
    try {
      if (projectPath !== useAppStore.getState().projectPath) {
        await openProject({ projectPath });
      }
      setCreateWorkspaceOpen(true);
    } finally {
      setBusyProjectPath(null);
    }
  }

  function handleWorkspaceItemDisplayModeChange(value: string) {
    if (value !== "expanded" && value !== "compact") {
      return;
    }
    setLayout({
      patch: {
        workspaceSidebarItemDisplayMode:
          value as WorkspaceSidebarItemDisplayMode,
      },
    });
  }

  return (
    <>
      <aside
        data-testid="project-workspace-sidebar"
        className={cx(
          "stave-project-sidebar",
          sx(
            projectSidebarStyles.aside,
            args.animate !== false && projectSidebarStyles.asideAnimated,
          ),
        )}
        style={{
          width: `${args.collapsed ? COLLAPSED_PROJECT_SIDEBAR_WIDTH : args.width}px`,
          minWidth: `${args.collapsed ? COLLAPSED_PROJECT_SIDEBAR_WIDTH : args.width}px`,
        }}
      >
        <VisuallyHidden aria-live="polite" aria-atomic="true">
          {reorderAnnouncement}
        </VisuallyHidden>
        {/* Expanded height and hairline match TopBar so the chrome border continues. */}
        <div
          data-testid="project-workspace-sidebar-chrome"
          className={sx(
            projectSidebarStyles.chrome,
            args.collapsed
              ? projectSidebarStyles.chromeCollapsed
              : projectSidebarStyles.chromeExpanded,
          )}
          style={
            args.collapsed && IS_MAC
              ? { paddingTop: MAC_TRAFFIC_LIGHT_CLEARANCE }
              : args.collapsed
                ? { paddingTop: 12 }
                : undefined
          }
        >
          <TooltipProvider>
            {args.collapsed ? (
              <div className={sx(projectSidebarStyles.columnCenter)}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        xstyle={projectSidebarStyles.collapsedPrimaryButton}
                        onClick={() => setOpenPathDialogOpen(true)}
                        aria-label="open-project"
                      />
                    }
                  >
                    <FolderOpen className={sx(projectSidebarStyles.iconMd)} />
                  </TooltipTrigger>
                  <TooltipContent side="right">Open Project</TooltipContent>
                </Tooltip>
                {sidebarShowFleetView ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          xstyle={[
                            projectSidebarStyles.collapsedButton,
                            activeAppSurface.kind === "fleet-view"
                              ? projectSidebarStyles.collapsedButtonActive
                              : projectSidebarStyles.collapsedButtonIdle,
                          ]}
                          onClick={() => openFleetView()}
                          aria-label="open-fleet-view"
                        />
                      }
                    >
                      <LayoutGrid className={sx(projectSidebarStyles.iconMd)} />
                    </TooltipTrigger>
                    <TooltipContent side="right">Fleet View</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            ) : (
              <div className={sx(projectSidebarStyles.chromeTrailing)}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        xstyle={projectSidebarStyles.chromeButton}
                        onClick={() =>
                          setLayout({
                            patch: { workspaceSidebarCollapsed: true },
                          })
                        }
                        aria-label="collapse-project-list"
                      />
                    }
                  >
                    <PanelLeft className={sx(projectSidebarStyles.iconMd)} />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Collapse Project List
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </TooltipProvider>
        </div>
        {args.collapsed ? (
          <div className={sx(projectSidebarStyles.scrollArea)}>
            <TooltipProvider>
              <div className={sx(projectSidebarStyles.columnCenterGap)}>
                {collapsedWorkspaceEntries.map((entry) => {
                  const entryKey = `${entry.projectPath}:${entry.workspaceId}`;
                  const shortcutLabel = workspaceShortcutLabels.get(entryKey);
                  const workspaceBusy = busyWorkspaceKey === entryKey;

                  return (
                    <div
                      key={entryKey}
                      className={sx(projectSidebarStyles.collapsedEntry)}
                    >
                      {entry.startsProjectGroup ? (
                        <div
                          aria-hidden="true"
                          className={sx(
                            projectSidebarStyles.collapsedGroupRule,
                          )}
                        />
                      ) : null}
                      <WorkspaceHoverPreviewTooltip
                        workspaceId={entry.workspaceId}
                        workspaceName={entry.workspaceName}
                        branch={entry.branch}
                        projectName={entry.projectName}
                        shortcutLabel={shortcutLabel}
                        side="right"
                      >
                        <AdsButton
                          layout="host"
                          type="button"
                          xstyle={[
                            projectSidebarStyles.collapsedWorkspaceButton,
                            transition.colors,
                            entry.isActive
                              ? projectSidebarStyles.collapsedWorkspaceActive
                              : projectSidebarStyles.collapsedWorkspaceIdle,
                          ]}
                          onClick={() =>
                            void handleProjectWorkspaceOpen({
                              projectPath: entry.projectPath,
                              workspaceId: entry.workspaceId,
                            })
                          }
                          aria-label={`collapsed-workspace-${entry.workspaceId}`}
                        >
                          <WorkspaceLeadingStatusIcon
                            workspaceId={entry.workspaceId}
                            workspaceName={entry.workspaceName}
                            isDefault={entry.isDefault}
                            busy={workspaceBusy}
                            attentionKind={
                              highestAttentionByWorkspaceId[entry.workspaceId]
                                ?.kind
                            }
                          />
                        </AdsButton>
                      </WorkspaceHoverPreviewTooltip>
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
        ) : null}
        {!args.collapsed ? (
          <div className={sx(projectSidebarStyles.scrollAreaExpanded)}>
            <TooltipProvider>
              <div
                className={sx(
                  projectSidebarStyles.navStack,
                  sidebarShowFleetView && projectSidebarStyles.navStackSpaced,
                )}
              >
                {sidebarShowFleetView ? (
                  <AdsButton
                    layout="host"
                    type="button"
                    onClick={() => openFleetView()}
                    aria-label="open-fleet-view"
                    xstyle={[
                      projectSidebarStyles.navButton,
                      transition.colors,
                      activeAppSurface.kind === "fleet-view"
                        ? projectSidebarStyles.navButtonActive
                        : projectSidebarStyles.navButtonIdle,
                    ]}
                  >
                    <LayoutGrid className={sx(projectSidebarStyles.iconMd)} />
                    Fleet View
                  </AdsButton>
                ) : null}
              </div>
              <div
                className={sx(projectSidebarStyles.viewBar, panelBarStyles.bar)}
              >
                {/* The toggle replaces the old static "Projects" heading: it
                    names the view you are in *and* is the control that leaves
                    it, so the bar never claims one thing while showing another. */}
                <div className={sx(projectSidebarStyles.viewToggle)}>
                  {SIDEBAR_NAV_VIEW_OPTIONS.map((option) => {
                    const isSelected = sidebarNavView === option.value;
                    return (
                      <Tooltip key={option.value}>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              xstyle={[
                                projectSidebarStyles.viewToggleButton,
                                isSelected
                                  ? projectSidebarStyles.viewToggleButtonActive
                                  : projectSidebarStyles.viewToggleButtonIdle,
                              ]}
                              aria-label={`sidebar-view-${option.value}`}
                              aria-pressed={isSelected}
                              onClick={() =>
                                updateSettings({
                                  patch: { sidebarNavView: option.value },
                                })
                              }
                            />
                          }
                        >
                          <option.Icon
                            className={sx(projectSidebarStyles.iconSm)}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {option.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
                <div className={sx(projectSidebarStyles.viewBarActions)}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          xstyle={projectSidebarStyles.chromeButtonSidebar}
                          onClick={() => setOpenPathDialogOpen(true)}
                          aria-label="open-project"
                        />
                      }
                    >
                      <FolderOpen className={sx(projectSidebarStyles.iconMd)} />
                    </TooltipTrigger>
                    <TooltipContent side="top">Open Project</TooltipContent>
                  </Tooltip>
                  {/* Row density is a tree-only concern; the queue has one row shape. */}
                  {isWorkQueueView ? null : (
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              className={sx(projectSidebarStyles.triggerHost)}
                            />
                          }
                        >
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                xstyle={
                                  projectSidebarStyles.chromeButtonSidebar
                                }
                                aria-label="workspace-item-display-mode"
                              />
                            }
                          >
                            {workspaceSidebarItemDisplayMode === "expanded" ? (
                              <Rows3
                                className={sx(projectSidebarStyles.iconMd)}
                              />
                            ) : (
                              <Rows2
                                className={sx(projectSidebarStyles.iconMd)}
                              />
                            )}
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          Workspace row display
                        </TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent
                        align="end"
                        xstyle={projectSidebarStyles.displayModeMenu}
                      >
                        <DropdownMenuLabel>Workspace rows</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup
                          value={workspaceSidebarItemDisplayMode}
                          onValueChange={handleWorkspaceItemDisplayModeChange}
                        >
                          <DropdownMenuRadioItem value="expanded">
                            <Rows3
                              className={sx(projectSidebarStyles.iconMd)}
                            />
                            Expanded
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="compact">
                            <Rows2
                              className={sx(projectSidebarStyles.iconMd)}
                            />
                            Compact
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              <div className={sx(projectSidebarStyles.searchRow)}>
                <Search className={sx(projectSidebarStyles.searchIcon)} />
                <Input
                  value={workspaceSearchQuery}
                  onChange={(event) =>
                    setWorkspaceSearchQuery(event.target.value)
                  }
                  placeholder="Search labels or branches"
                  xstyle={projectSidebarStyles.searchInput}
                  aria-label="search-workspaces"
                />
                {workspaceSearchQuery.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    xstyle={projectSidebarStyles.searchClear}
                    onClick={() => setWorkspaceSearchQuery("")}
                    aria-label="clear-workspace-search"
                  >
                    <X className={sx(projectSidebarStyles.iconSm)} />
                  </Button>
                ) : null}
              </div>
              {projects.length === 0 ? (
                <div className={sx(projectSidebarStyles.emptyState)}>
                  No projects yet.
                </div>
              ) : visibleProjects.length === 0 ? (
                <div className={sx(projectSidebarStyles.emptyState)}>
                  No matching workspaces.
                </div>
              ) : isWorkQueueView ? (
                <div className={sx(projectSidebarStyles.navStack)}>
                  {workQueueGroups.length === 0 ? (
                    <div className={sx(projectSidebarStyles.emptyState)}>
                      No workspaces yet.
                    </div>
                  ) : (
                    workQueueGroups.map((group) => {
                      const laneCollapsed =
                        collapsedWorkQueueLanes[group.lane] === true;
                      return (
                        <div
                          key={group.lane}
                          className={sx(projectSidebarStyles.laneStack)}
                        >
                          <AdsButton
                            layout="host"
                            type="button"
                            onClick={() =>
                              setCollapsedWorkQueueLanes((previous) => ({
                                ...previous,
                                [group.lane]: !laneCollapsed,
                              }))
                            }
                            aria-label={`work-queue-lane-${group.lane}`}
                            aria-expanded={!laneCollapsed}
                            xstyle={[
                              projectSidebarStyles.laneButton,
                              transition.colors,
                            ]}
                          >
                            <ChevronRight
                              className={sx(
                                projectSidebarStyles.laneChevron,
                                !laneCollapsed &&
                                  projectSidebarStyles.laneChevronOpen,
                                transition.transform,
                              )}
                            />
                            <span
                              className={sx(projectSidebarStyles.laneLabel)}
                            >
                              {group.label}
                            </span>
                            <span
                              className={sx(projectSidebarStyles.laneCount)}
                            >
                              {group.entries.length}
                            </span>
                          </AdsButton>
                          {laneCollapsed
                            ? null
                            : group.entries.map((entry) => (
                                <WorkQueueRow
                                  key={entry.workspaceId}
                                  entry={entry}
                                  attentionKind={
                                    highestAttentionByWorkspaceId[
                                      entry.workspaceId
                                    ]?.kind
                                  }
                                  onOpen={(target) =>
                                    void handleProjectWorkspaceOpen(target)
                                  }
                                />
                              ))}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <>
                  <div className={sx(projectSidebarStyles.projectStack)}>
                    {visibleProjects.map((project) => {
                      const collapsed =
                        collapsedByProjectPath[project.projectPath] ?? false;
                      const projectBusy =
                        busyProjectPath === project.projectPath;
                      const projectReorderingDisabled =
                        projectBusy || projects.length < 2;
                      const projectAttentionAlert =
                        attentionAlertByProjectPath[project.projectPath];
                      // Only a blocking alert earns a reserved slot through
                      // hover. A review dot is a passive marker, so it yields to
                      // the row actions the way the workspace count does.
                      const projectAlertPinnedOnHover =
                        projectAttentionAlert?.tier === "blocking";

                      return (
                        <SortableSidebarItem
                          key={project.projectPath}
                          listId={PROJECT_SORTABLE_LIST_ID}
                          id={project.projectPath}
                          disabled={projectReorderingDisabled}
                          previewTitle={project.projectName}
                          previewIcon={
                            <ProjectIdentityMark
                              icon={project.appearanceIcon}
                              color={project.appearanceColor}
                              className={sx(
                                projectSidebarStyles.projectDragPreviewMark,
                              )}
                              iconClassName={sx(
                                projectSidebarStyles.projectDragPreviewIcon,
                              )}
                            />
                          }
                          indicatorGap="0.75rem"
                        >
                          {({ handleRef, isDragging }) => (
                            <section
                              className={sx(
                                isDragging &&
                                  projectSidebarStyles.projectSectionDragging,
                              )}
                            >
                              <div
                                className={sx(
                                  projectSidebarStyles.projectHeaderRow,
                                )}
                              >
                                <div
                                  ref={handleRef ?? undefined}
                                  role={handleRef ? "group" : undefined}
                                  tabIndex={handleRef ? 0 : undefined}
                                  aria-label={
                                    handleRef
                                      ? `Reorder project ${project.projectName}`
                                      : undefined
                                  }
                                  aria-keyshortcuts={
                                    handleRef && !projectReorderingDisabled
                                      ? "Alt+ArrowUp Alt+ArrowDown"
                                      : undefined
                                  }
                                  aria-description={
                                    handleRef && !projectReorderingDisabled
                                      ? "Use Alt plus Arrow Up or Arrow Down to reorder."
                                      : undefined
                                  }
                                  onKeyDown={
                                    handleRef
                                      ? (event) => {
                                          if (
                                            !event.altKey ||
                                            (event.key !== "ArrowUp" &&
                                              event.key !== "ArrowDown")
                                          ) {
                                            return;
                                          }
                                          event.preventDefault();
                                          event.stopPropagation();
                                          const currentIndex =
                                            projects.findIndex(
                                              (candidate) =>
                                                candidate.projectPath ===
                                                project.projectPath,
                                            );
                                          const direction =
                                            event.key === "ArrowUp"
                                              ? "up"
                                              : "down";
                                          const nextIndex =
                                            direction === "up"
                                              ? currentIndex - 1
                                              : currentIndex + 1;
                                          if (
                                            currentIndex < 0 ||
                                            nextIndex < 0 ||
                                            nextIndex >= projects.length
                                          ) {
                                            return;
                                          }
                                          moveProjectInList({
                                            projectPath: project.projectPath,
                                            direction,
                                          });
                                          setReorderAnnouncement(
                                            `${project.projectName} moved to position ${nextIndex + 1} of ${projects.length}.`,
                                          );
                                        }
                                      : undefined
                                  }
                                  className={sx(
                                    projectSidebarStyles.projectRow,
                                    transition.colors,
                                    handleRef &&
                                      projectSidebarStyles.projectRowDraggable,
                                    isDragging &&
                                      projectSidebarStyles.projectRowDragging,
                                  )}
                                >
                                  <Tooltip>
                                    <TooltipTrigger
                                      render={
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          xstyle={
                                            projectSidebarStyles.projectToggle
                                          }
                                          onClick={() => {
                                            setCollapsedByProjectPath(
                                              (current) => ({
                                                ...current,
                                                [project.projectPath]:
                                                  !collapsed,
                                              }),
                                            );
                                          }}
                                          aria-label={`toggle-project-${project.projectPath}`}
                                          aria-expanded={!collapsed}
                                        />
                                      }
                                    >
                                      {projectBusy ? (
                                        <Loader
                                          aria-hidden
                                          className={sx(
                                            projectSidebarStyles.statusMuted,
                                          )}
                                          size="xs"
                                          variant="spinner"
                                        />
                                      ) : (
                                        <>
                                          <ProjectIdentityMark
                                            icon={project.appearanceIcon}
                                            color={project.appearanceColor}
                                            className={sx(
                                              projectSidebarStyles.projectMark,
                                            )}
                                            iconClassName={sx(
                                              projectSidebarStyles.projectMarkIcon,
                                            )}
                                          />
                                          <span
                                            className={sx(
                                              projectSidebarStyles.projectChevronSlot,
                                            )}
                                          >
                                            <ChevronRight
                                              className={sx(
                                                projectSidebarStyles.projectChevron,
                                                !collapsed &&
                                                  projectSidebarStyles.projectChevronOpen,
                                              )}
                                            />
                                          </span>
                                        </>
                                      )}
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                      {collapsed
                                        ? "Expand project"
                                        : "Collapse project"}
                                    </TooltipContent>
                                  </Tooltip>
                                  <div
                                    className={sx(
                                      projectSidebarStyles.projectLead,
                                      // The row actions are absolutely positioned at the inline
                                      // end, so hovering reserves room for them. An attention
                                      // alert stays visible through that hover (unlike the count
                                      // badge it replaces), so it needs its own slot reserved
                                      // beyond the actions or the two would overlap.
                                      projectAlertPinnedOnHover
                                        ? projectSidebarStyles.projectLeadPinned
                                        : projectSidebarStyles.projectLeadDefault,
                                    )}
                                  >
                                    <span
                                      className={sx(
                                        projectSidebarStyles.projectName,
                                      )}
                                    >
                                      {project.projectName}
                                    </span>
                                    <div
                                      className={sx(
                                        projectSidebarStyles.projectCountSlot,
                                        // The workspace count is decorative, so it yields to the
                                        // row actions on hover. An attention alert must not: the
                                        // moment you reach for the row is exactly when you need to
                                        // see that something inside it is blocked, and fading the
                                        // slot would also make its tooltip unreachable. The row
                                        // reserves hover padding, so the alert stays clear of the
                                        // absolutely positioned actions.
                                        !projectAlertPinnedOnHover &&
                                          projectSidebarStyles.projectCountSlotYields,
                                      )}
                                    >
                                      {projectAttentionAlert ? (
                                        <ProjectAttentionAlertIcon
                                          alert={projectAttentionAlert}
                                          projectName={project.projectName}
                                        />
                                      ) : (
                                        <span
                                          className={sx(
                                            projectSidebarStyles.projectCount,
                                          )}
                                          aria-label={`${project.workspaces.length} workspaces`}
                                        >
                                          {project.workspaces.length}
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className={sx(
                                        projectSidebarStyles.projectActions,
                                      )}
                                    >
                                      <Tooltip>
                                        <TooltipTrigger
                                          render={
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              xstyle={
                                                projectSidebarStyles.projectActionButton
                                              }
                                              disabled={projectBusy}
                                              onClick={() =>
                                                void args.onKickoffWorkspace(
                                                  project.projectPath,
                                                )
                                              }
                                              aria-label={`Kick off workspace for ${project.projectName}`}
                                            />
                                          }
                                        >
                                          <Rocket
                                            className={sx(
                                              projectSidebarStyles.iconSm,
                                            )}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          Kick off workspace
                                        </TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger
                                          render={
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              xstyle={
                                                projectSidebarStyles.projectActionButton
                                              }
                                              disabled={projectBusy}
                                              onClick={() =>
                                                void handleCreateWorkspaceRequest(
                                                  project.projectPath,
                                                )
                                              }
                                              aria-label={`new-workspace-${project.projectPath}`}
                                            />
                                          }
                                        >
                                          <Plus
                                            className={sx(
                                              projectSidebarStyles.iconSm,
                                            )}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          New workspace
                                        </TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger
                                          render={
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              xstyle={
                                                projectSidebarStyles.projectActionButton
                                              }
                                              disabled={projectBusy}
                                              onClick={() =>
                                                void hydrateWorkspaces()
                                              }
                                              aria-label={`refresh-workspaces-${project.projectPath}`}
                                            />
                                          }
                                        >
                                          <RefreshCw
                                            className={sx(
                                              projectSidebarStyles.iconSm,
                                            )}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          Refresh workspaces
                                        </TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger
                                          render={
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              xstyle={
                                                projectSidebarStyles.projectActionButton
                                              }
                                              disabled={projectBusy}
                                              onMouseEnter={
                                                args.onPreloadSettings
                                              }
                                              onFocus={args.onPreloadSettings}
                                              onClick={() =>
                                                args.onOpenSettings({
                                                  section: "projects",
                                                  projectPath:
                                                    project.projectPath,
                                                })
                                              }
                                              aria-label={`project-settings-${project.projectPath}`}
                                            />
                                          }
                                        >
                                          <Settings
                                            className={sx(
                                              projectSidebarStyles.iconSm,
                                            )}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          Project settings
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {!collapsed ? (
                                <div
                                  className={sx(
                                    projectSidebarStyles.workspaceList,
                                  )}
                                >
                                  <div
                                    className={sx(
                                      projectSidebarStyles.workspaceListInner,
                                    )}
                                  >
                                    {project.workspaces.map((workspace) => {
                                      const workspaceShortcutLabel =
                                        workspaceShortcutLabels.get(
                                          `${project.projectPath}:${workspace.id}`,
                                        );
                                      const workspaceBusy =
                                        busyWorkspaceKey ===
                                        `${project.projectPath}:${workspace.id}`;
                                      const isActive =
                                        project.isCurrent &&
                                        workspace.id === activeWorkspaceId;
                                      const workspaceReorderingDisabled =
                                        projectBusy ||
                                        workspaceBusy ||
                                        project.workspaces.length < 2;
                                      const canArchiveWorkspace =
                                        project.isCurrent &&
                                        !workspace.isDefault;
                                      const isExpandedWorkspaceItem =
                                        workspaceSidebarItemDisplayMode ===
                                        "expanded";
                                      const isClosingWorkspace =
                                        closingWorkspaceId === workspace.id;
                                      // The ⋮ row-actions menu is always shown, so hover
                                      // actions are always present (compact: chip + ⋮,
                                      // expanded: ⋮; the chip lives in WorkspaceExpandedMeta).
                                      const hasHoverActions = true;

                                      return (
                                        <SortableSidebarItem
                                          key={workspace.id}
                                          listId={`${WORKSPACE_SORTABLE_LIST_PREFIX}${project.projectPath}`}
                                          id={workspace.id}
                                          disabled={workspaceReorderingDisabled}
                                          previewTitle={
                                            workspace.isDefault
                                              ? "Default"
                                              : workspace.name
                                          }
                                          previewIcon={
                                            <WorkspaceIdentityMark
                                              workspaceName={workspace.name}
                                              isDefault={workspace.isDefault}
                                              className={sx(
                                                projectSidebarStyles.identityMark,
                                              )}
                                              iconClassName={sx(
                                                projectSidebarStyles.identityMarkIcon,
                                              )}
                                            />
                                          }
                                          indicatorGap="0.25rem"
                                        >
                                          {({ handleRef, isDragging }) => (
                                            <div
                                              className={sx(
                                                projectSidebarStyles.workspaceItem,
                                              )}
                                            >
                                              <WorkspaceBorderBeam
                                                workspaceId={workspace.id}
                                              >
                                                <div
                                                  className={sx(
                                                    projectSidebarStyles.workspaceRow,
                                                    isExpandedWorkspaceItem
                                                      ? projectSidebarStyles.workspaceRowExpanded
                                                      : projectSidebarStyles.workspaceRowCompact,
                                                    isActive
                                                      ? projectSidebarStyles.workspaceRowActive
                                                      : projectSidebarStyles.workspaceRowIdle,
                                                    isDragging &&
                                                      projectSidebarStyles.workspaceRowDragging,
                                                  )}
                                                >
                                                  <WorkspaceHoverPreviewTooltip
                                                    workspaceId={workspace.id}
                                                    workspaceName={
                                                      workspace.name
                                                    }
                                                    branch={workspace.branch}
                                                    shortcutLabel={
                                                      workspaceShortcutLabel
                                                    }
                                                    side="right"
                                                  >
                                                    <div
                                                      ref={
                                                        handleRef ?? undefined
                                                      }
                                                      role="button"
                                                      tabIndex={0}
                                                      aria-label={`Open workspace ${workspace.isDefault ? "Default" : workspace.name}`}
                                                      aria-keyshortcuts={
                                                        !workspaceReorderingDisabled
                                                          ? "Alt+ArrowUp Alt+ArrowDown"
                                                          : undefined
                                                      }
                                                      aria-description={
                                                        !workspaceReorderingDisabled
                                                          ? "Use Alt plus Arrow Up or Arrow Down to reorder."
                                                          : undefined
                                                      }
                                                      className={sx(
                                                        projectSidebarStyles.workspaceOpen,
                                                        isExpandedWorkspaceItem
                                                          ? projectSidebarStyles.workspaceOpenExpanded
                                                          : projectSidebarStyles.workspaceOpenCompact,
                                                        handleRef &&
                                                          projectSidebarStyles.workspaceOpenDraggable,
                                                        isDragging &&
                                                          projectSidebarStyles.workspaceOpenDragging,
                                                      )}
                                                      onClick={() => {
                                                        if (
                                                          suppressRowClickRef.current
                                                        ) {
                                                          return;
                                                        }
                                                        void handleProjectWorkspaceOpen(
                                                          {
                                                            projectPath:
                                                              project.projectPath,
                                                            workspaceId:
                                                              workspace.id,
                                                          },
                                                        );
                                                      }}
                                                      onKeyDown={(event) => {
                                                        if (
                                                          event.altKey &&
                                                          (event.key ===
                                                            "ArrowUp" ||
                                                            event.key ===
                                                              "ArrowDown")
                                                        ) {
                                                          if (
                                                            workspaceReorderingDisabled
                                                          ) {
                                                            return;
                                                          }
                                                          event.preventDefault();
                                                          event.stopPropagation();
                                                          const currentIndex =
                                                            project.workspaces.findIndex(
                                                              (candidate) =>
                                                                candidate.id ===
                                                                workspace.id,
                                                            );
                                                          const direction =
                                                            event.key ===
                                                            "ArrowUp"
                                                              ? "up"
                                                              : "down";
                                                          const nextIndex =
                                                            direction === "up"
                                                              ? currentIndex - 1
                                                              : currentIndex +
                                                                1;
                                                          if (
                                                            currentIndex < 0 ||
                                                            nextIndex < 0 ||
                                                            nextIndex >=
                                                              project.workspaces
                                                                .length
                                                          ) {
                                                            return;
                                                          }
                                                          moveWorkspaceInProjectList(
                                                            {
                                                              projectPath:
                                                                project.projectPath,
                                                              workspaceId:
                                                                workspace.id,
                                                              direction,
                                                            },
                                                          );
                                                          setReorderAnnouncement(
                                                            `${workspace.isDefault ? "Default" : workspace.name} moved to position ${nextIndex + 1} of ${project.workspaces.length}.`,
                                                          );
                                                          return;
                                                        }
                                                        if (
                                                          !isWorkspaceActivationKey(
                                                            event,
                                                          )
                                                        ) {
                                                          return;
                                                        }
                                                        event.preventDefault();
                                                        void handleProjectWorkspaceOpen(
                                                          {
                                                            projectPath:
                                                              project.projectPath,
                                                            workspaceId:
                                                              workspace.id,
                                                          },
                                                        );
                                                      }}
                                                    >
                                                      <span
                                                        className={sx(
                                                          projectSidebarStyles.workspaceLeadSlot,
                                                          isExpandedWorkspaceItem &&
                                                            projectSidebarStyles.workspaceLeadSlotExpanded,
                                                        )}
                                                      >
                                                        <WorkspaceLeadingStatusIcon
                                                          workspaceId={
                                                            workspace.id
                                                          }
                                                          workspaceName={
                                                            workspace.name
                                                          }
                                                          isDefault={
                                                            workspace.isDefault
                                                          }
                                                          busy={workspaceBusy}
                                                          attentionKind={
                                                            highestAttentionByWorkspaceId[
                                                              workspace.id
                                                            ]?.kind
                                                          }
                                                        />
                                                      </span>
                                                      {isExpandedWorkspaceItem ? (
                                                        <>
                                                          <InlineWorkspaceLabel
                                                            workspaceId={
                                                              workspace.id
                                                            }
                                                            workspaceName={
                                                              workspace.name
                                                            }
                                                            branch={
                                                              workspace.branch
                                                            }
                                                            isDefault={
                                                              workspace.isDefault
                                                            }
                                                            isActive={isActive}
                                                            compact={false}
                                                            showBranchContext={
                                                              false
                                                            }
                                                            onRename={({
                                                              workspaceId,
                                                              name,
                                                            }) =>
                                                              renameWorkspace({
                                                                projectPath:
                                                                  project.projectPath,
                                                                workspaceId,
                                                                name,
                                                              })
                                                            }
                                                          />
                                                          <WorkspaceExpandedMeta
                                                            workspaceId={
                                                              workspace.id
                                                            }
                                                            branch={
                                                              workspace.branch
                                                            }
                                                            isDefault={
                                                              workspace.isDefault
                                                            }
                                                            shortcutLabel={
                                                              workspaceShortcutLabel
                                                            }
                                                            hasHoverActions={
                                                              hasHoverActions
                                                            }
                                                            isClosing={
                                                              isClosingWorkspace
                                                            }
                                                          />
                                                        </>
                                                      ) : (
                                                        <InlineWorkspaceLabel
                                                          workspaceId={
                                                            workspace.id
                                                          }
                                                          workspaceName={
                                                            workspace.name
                                                          }
                                                          branch={
                                                            workspace.branch
                                                          }
                                                          isDefault={
                                                            workspace.isDefault
                                                          }
                                                          isActive={isActive}
                                                          compact
                                                          showBranchContext
                                                          onRename={({
                                                            workspaceId,
                                                            name,
                                                          }) =>
                                                            renameWorkspace({
                                                              projectPath:
                                                                project.projectPath,
                                                              workspaceId,
                                                              name,
                                                            })
                                                          }
                                                        />
                                                      )}
                                                    </div>
                                                  </WorkspaceHoverPreviewTooltip>
                                                  <WorkspaceAccountLimitIcon
                                                    workspaceId={workspace.id}
                                                  />
                                                  {isExpandedWorkspaceItem ? (
                                                    <WorkspaceRowActions
                                                      workspaceId={workspace.id}
                                                      workspaceName={
                                                        workspace.name
                                                      }
                                                      isDefault={
                                                        workspace.isDefault
                                                      }
                                                      branch={
                                                        workspaceBranchById[
                                                          workspace.id
                                                        ]
                                                      }
                                                      projectPath={
                                                        project.projectPath
                                                      }
                                                      workspacePath={
                                                        project
                                                          .workspacePathById[
                                                          workspace.id
                                                        ] ?? project.projectPath
                                                      }
                                                      canArchiveWorkspace={
                                                        canArchiveWorkspace
                                                      }
                                                      closingWorkspaceId={
                                                        closingWorkspaceId
                                                      }
                                                      onArchive={() =>
                                                        setWorkspaceToClose({
                                                          id: workspace.id,
                                                          name: workspace.name,
                                                        })
                                                      }
                                                      onRename={renameWorkspace}
                                                      shortcutLabel={undefined}
                                                      shortcutModifier={
                                                        workspaceShortcutModifierLabel
                                                      }
                                                      placement="top"
                                                    />
                                                  ) : (
                                                    <>
                                                      <div
                                                        className={sx(
                                                          projectSidebarStyles.workspaceCountHost,
                                                        )}
                                                      >
                                                        <WorkspaceRespondingCountBadge
                                                          workspaceId={
                                                            workspace.id
                                                          }
                                                          hasHoverActions={
                                                            hasHoverActions
                                                          }
                                                          isClosing={
                                                            isClosingWorkspace
                                                          }
                                                        />
                                                      </div>
                                                      <WorkspaceRowActions
                                                        workspaceId={
                                                          workspace.id
                                                        }
                                                        workspaceName={
                                                          workspace.name
                                                        }
                                                        isDefault={
                                                          workspace.isDefault
                                                        }
                                                        branch={
                                                          workspaceBranchById[
                                                            workspace.id
                                                          ]
                                                        }
                                                        projectPath={
                                                          project.projectPath
                                                        }
                                                        workspacePath={
                                                          project
                                                            .workspacePathById[
                                                            workspace.id
                                                          ] ??
                                                          project.projectPath
                                                        }
                                                        canArchiveWorkspace={
                                                          canArchiveWorkspace
                                                        }
                                                        closingWorkspaceId={
                                                          closingWorkspaceId
                                                        }
                                                        onArchive={() =>
                                                          setWorkspaceToClose({
                                                            id: workspace.id,
                                                            name: workspace.name,
                                                          })
                                                        }
                                                        onRename={
                                                          renameWorkspace
                                                        }
                                                        shortcutLabel={
                                                          workspaceShortcutLabel
                                                        }
                                                        shortcutModifier={
                                                          workspaceShortcutModifierLabel
                                                        }
                                                      />
                                                    </>
                                                  )}
                                                </div>
                                              </WorkspaceBorderBeam>
                                              <WorkspaceProgressTaskTree
                                                workspaceId={workspace.id}
                                                projectPath={
                                                  project.projectPath
                                                }
                                              />
                                            </div>
                                          )}
                                        </SortableSidebarItem>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </section>
                          )}
                        </SortableSidebarItem>
                      );
                    })}
                  </div>
                </>
              )}
            </TooltipProvider>
          </div>
        ) : null}
        <div
          className={sx(
            projectSidebarStyles.footer,
            args.collapsed
              ? projectSidebarStyles.footerCollapsed
              : projectSidebarStyles.footerExpanded,
          )}
        >
          <TooltipProvider>
            {args.collapsed ? (
              <div className={sx(projectSidebarStyles.columnCenterGap)}>
                <StaveAppMenuButton
                  compact
                  onOpenCommandPalette={args.onOpenCommandPalette}
                  onOpenKeyboardShortcuts={args.onOpenKeyboardShortcuts}
                  onOpenSettings={() => args.onOpenSettings()}
                />
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        xstyle={projectSidebarStyles.collapsedButton}
                        aria-label="open-settings"
                        onMouseEnter={args.onPreloadSettings}
                        onFocus={args.onPreloadSettings}
                        onClick={() => args.onOpenSettings()}
                      />
                    }
                  >
                    <Settings className={sx(projectSidebarStyles.iconMd)} />
                  </TooltipTrigger>
                  <TooltipContent side="right">Settings</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className={sx(projectSidebarStyles.footerRow)}>
                <div className={sx(projectSidebarStyles.footerGroup)}>
                  <StaveAppMenuButton
                    compact
                    onOpenCommandPalette={args.onOpenCommandPalette}
                    onOpenKeyboardShortcuts={args.onOpenKeyboardShortcuts}
                    onOpenSettings={() => args.onOpenSettings()}
                  />
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        xstyle={projectSidebarStyles.chromeButton}
                        aria-label="open-settings"
                        onMouseEnter={args.onPreloadSettings}
                        onFocus={args.onPreloadSettings}
                        onClick={() => args.onOpenSettings()}
                      />
                    }
                  >
                    <Settings className={sx(projectSidebarStyles.iconSm)} />
                  </TooltipTrigger>
                  <TooltipContent side="top">Settings</TooltipContent>
                </Tooltip>
              </div>
            )}
          </TooltipProvider>
        </div>
      </aside>
      <ConfirmDialog
        open={Boolean(workspaceToClose)}
        title="Archive Workspace"
        description={archiveDialogCopy?.description ?? ""}
        confirmLabel="Archive"
        loading={closingWorkspaceId !== null}
        onCancel={() => {
          setWorkspaceToClose(null);
          setArchiveDeletesBranch(true);
        }}
        onConfirm={() => {
          if (!workspaceToClose) {
            return;
          }
          setClosingWorkspaceId(workspaceToClose.id);
          void closeWorkspace({
            workspaceId: workspaceToClose.id,
            deleteBranch:
              archiveDeletesBranch &&
              archiveDialogCopy?.canDeleteBranch !== false,
          }).finally(() => {
            setClosingWorkspaceId(null);
            setWorkspaceToClose(null);
            setArchiveDeletesBranch(true);
          });
        }}
      >
        {archiveDialogCopy?.canDeleteBranch ? (
          <label className={sx(projectSidebarStyles.archiveOption)}>
            <Checkbox
              controlOnly
              xstyle={projectSidebarStyles.archiveCheckbox}
              checked={archiveDeletesBranch}
              disabled={closingWorkspaceId !== null}
              onCheckedChange={(checked) => setArchiveDeletesBranch(checked)}
            />
            <span
              className={sx(
                archiveDeletesBranch
                  ? projectSidebarStyles.archiveLabelOn
                  : projectSidebarStyles.archiveLabelOff,
              )}
            >
              Delete the git branch too
            </span>
          </label>
        ) : null}
      </ConfirmDialog>
      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        activeBranch={activeWorkspaceBranch}
        defaultBranch={defaultBranch}
        cwd={activeWorkspaceCwd}
        defaultInitCommand={projectWorkspaceInitCommand}
        defaultUseRootNodeModulesSymlink={projectUseRootNodeModulesSymlink}
        onOpenChange={setCreateWorkspaceOpen}
        onCreateWorkspace={createWorkspace}
        onImportWorkspace={importWorkspaceFromWorktree}
      />
      <OpenPathDialog
        open={openPathDialogOpen}
        onOpenChange={setOpenPathDialogOpen}
        onSubmitPath={(inputPath) => openProjectFromPath({ inputPath })}
        onBrowse={async () => {
          await createProject({});
        }}
      />
    </>
  );
}
