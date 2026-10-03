import { Checkbox } from "@/components/ads/components/Checkbox";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import {
  ChevronRight,
  FolderOpen,
  FolderTree,
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
import { repositorySidebarStyles } from "@/components/layout/repository-workspace-sidebar.styles";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { transition } from "@/components/ads/recipes/transition";
import { cx, sx } from "@/components/ads/utils/stylex";
import {
  buildCollapsedWorkspaceEntries,
  buildRepositorySidebarAttentionAlert,
  buildSidebarWorkQueueEntries,
  buildWorkspaceArchiveDialogCopy,
  filterRepositorySidebarRepositories,
  buildVisibleWorkspaceShortcutTargets,
  getWorkspaceShortcutLabel,
  getWorkspaceLeadingAttentionKind,
  WORKSPACE_SHORTCUT_COUNT,
  type RepositorySidebarAttentionAlert,
  type RepositorySidebarCollapsedRepositoryView,
} from "@/components/layout/RepositoryWorkspaceSidebar.utils";
import { isEditableShortcutTarget } from "@/components/layout/app-shell.shortcuts";
import { CreateWorkspaceDialog } from "@/components/layout/CreateWorkspaceDialog";
import { OpenPathDialog } from "@/components/layout/OpenPathDialog";
import { StaveAppMenuButton } from "@/components/layout/StaveAppMenuButton";
import { useFleetAttentionProjection } from "@/components/layout/useFleetAttentionProjection";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import { WorkspaceIdentityMark } from "@/components/layout/workspace-accent";
import { WorkspaceAccountLimitIcon } from "@/components/layout/WorkspaceAccountLimitIcon";
import { WorkspaceProgressTaskTree } from "@/components/layout/WorkspaceProgressTaskTree";
import { RepositoryIdentityMark } from "@/components/layout/repository-appearance";
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
import { type SidebarWorkQueueLane } from "@/lib/fleet/sidebar-work-queue";
import { isDelegatedTask, isTaskArchived } from "@/lib/tasks";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";
import { useSidebarWorkQueueGroups } from "./useSidebarWorkQueueGroups";
import { SidebarEmptyState } from "@/components/layout/SidebarEmptyState";
import { SidebarPrimaryNav, SidebarPrimaryNavCollapsed } from "./SidebarPrimaryNav";
import { useAppStore } from "@/store/app.store";
import type { SidebarNavView } from "@/store/app-settings";
import type { WorkspaceSidebarItemDisplayMode } from "@/store/layout.utils";
import { getLinkedWorktreePathSetForRepository } from "@/store/workspace-archive-cleanup";
import {
  isWorkspaceActivationKey,
  WorkspaceHoverPreviewTooltip,
  WorkspaceLeadingStatusIcon,
  WorkQueueRow,
  RepositoryAttentionAlertIcon,
  WorkspaceRespondingCountBadge,
  InlineWorkspaceLabel,
  WorkspaceExpandedMeta,
  WorkspaceBorderBeam,
  IS_MAC,
  workspaceShortcutModifierLabel,
  SortableSidebarItem,
  WorkspaceRowActions,
} from "./workspace-sidebar-rows";

type RepositorySidebarView = RepositorySidebarCollapsedRepositoryView;

/**
 * The two sidebar views, in toggle order. Both list the same workspaces, so
 * either is a complete way to navigate — `repositories` sorts by where a workspace
 * lives, `work-queue` sorts by what it wants from you.
 */
const SIDEBAR_NAV_VIEW_OPTIONS: readonly {
  value: SidebarNavView;
  label: string;
  Icon: typeof FolderTree;
}[] = [
  { value: "projects", label: "Repositories", Icon: FolderTree },
  { value: "work-queue", label: "Work queue", Icon: ListChecks },
] as const;
const DEFAULT_COLLAPSED_REPOSITORY_SIDEBAR_WIDTH = 64;
/** Height reserved at the top of the collapsed sidebar for macOS traffic-light buttons. */
const MAC_TRAFFIC_LIGHT_CLEARANCE = 40;
/** Keep this aligned with the native traffic-light placement in `electron/main/window.ts`. */
const MAC_TRAFFIC_LIGHT_LEFT_INSET = 12;
const MAC_TRAFFIC_LIGHT_CLUSTER_WIDTH = 58;
const MAC_TRAFFIC_LIGHT_RIGHT_GUTTER = 10;
export const COLLAPSED_REPOSITORY_SIDEBAR_WIDTH = IS_MAC
  ? Math.max(
      DEFAULT_COLLAPSED_REPOSITORY_SIDEBAR_WIDTH,
      MAC_TRAFFIC_LIGHT_LEFT_INSET +
        MAC_TRAFFIC_LIGHT_CLUSTER_WIDTH +
        MAC_TRAFFIC_LIGHT_RIGHT_GUTTER,
    )
  : DEFAULT_COLLAPSED_REPOSITORY_SIDEBAR_WIDTH;

const REPOSITORY_SORTABLE_LIST_ID = "sidebar-projects";
const WORKSPACE_SORTABLE_LIST_PREFIX = "sidebar-workspaces:";

export function RepositoryWorkspaceSidebar(args: {
  width: number;
  collapsed: boolean;
  animate?: boolean;
  onOpenCommandPalette: () => void;
  onOpenKeyboardShortcuts: () => void;
  onOpenSettings: (options?: {
    repositoryPath?: string | null;
    section?: SectionId;
  }) => void;
  onPreloadSettings: () => void;
  onKickoffWorkspace: (repositoryPath: string) => Promise<void> | void;
}) {
  const [collapsedByRepositoryPath, setCollapsedByRepositoryPath] = useState<
    Record<string, boolean>
  >({});
  // Lane collapse is deliberately session-local, matching `collapsedByRepositoryPath`:
  // both answer "what am I ignoring right now", not "how do I like my sidebar".
  const [collapsedWorkQueueLanes, setCollapsedWorkQueueLanes] = useState<
    Partial<Record<SidebarWorkQueueLane, boolean>>
  >({});
  const [busyRepositoryPath, setBusyRepositoryPath] = useState<string | null>(null);
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
    currentRepositoryPath,
    currentRepositoryName,
    workspaces,
    activeWorkspaceId,
    recentRepositories,
    workspaceDefaultById,
    workspaceBranchById,
    workspacePathById,
    activeWorkspaceBranch,
    activeWorkspaceCwd,
    workspaceSidebarItemDisplayMode,
    sidebarShowFleetView,
    sidebarNavView,
    defaultBranch,
    repositoryWorkspaceInitCommand,
    repositoryUseRootNodeModulesSymlink,
    createRepository,
    openRepositoryFromPath,
    openRepository,
    moveRepositoryInList,
    switchWorkspace,
    moveWorkspaceInRepositoryList,
    createWorkspace,
    importWorkspaceFromWorktree,
    closeWorkspace,
    renameWorkspace,
    setLayout,
    updateSettings,
    fetchAllWorkspacePrStatuses,
    hydrateWorkspaces,
    activeTasks,
    messagesByTask,
    activeTurnIdsByTask,
    providerTurnActivityByTask,
    workspaceRuntimeCacheById,
  ] = useAppStore(
    useShallow((state) => {
      return [
        state.repositoryPath,
        state.repositoryName,
        state.workspaces,
        state.activeWorkspaceId,
        state.recentRepositories,
        state.workspaceDefaultById,
        state.workspaceBranchById,
        state.workspacePathById,
        state.workspaceBranchById[state.activeWorkspaceId] ?? "main",
        state.workspacePathById[state.activeWorkspaceId] ??
          state.repositoryPath ??
          undefined,
        state.layout.workspaceSidebarItemDisplayMode,
        state.settings.sidebarShowFleetView,
        state.settings.sidebarNavView,
        state.defaultBranch,
        (state.repositoryPath
          ? state.recentRepositories.find(
              (repository) => repository.repositoryPath === state.repositoryPath,
            )?.newWorkspaceInitCommand
          : "") ?? "",
        state.repositoryPath
          ? state.recentRepositories.find(
              (repository) => repository.repositoryPath === state.repositoryPath,
            )?.newWorkspaceUseRootNodeModulesSymlink === true
          : false,
        state.createRepository,
        state.openRepositoryFromPath,
        state.openRepository,
        state.moveRepositoryInList,
        state.switchWorkspace,
        state.moveWorkspaceInRepositoryList,
        state.createWorkspace,
        state.importWorkspaceFromWorktree,
        state.closeWorkspace,
        state.renameWorkspace,
        state.setLayout,
        state.updateSettings,
        state.fetchAllWorkspacePrStatuses,
        state.hydrateWorkspaces,
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

  const repositories = useMemo(() => {
    const rememberedCurrentRepository = currentRepositoryPath
      ? recentRepositories.find(
          (repository) => repository.repositoryPath === currentRepositoryPath,
        )
      : null;
    const currentRepository = currentRepositoryPath
      ? ({
          repositoryPath: currentRepositoryPath,
          repositoryName: currentRepositoryName ?? "project",
          appearanceIcon: rememberedCurrentRepository?.appearanceIcon,
          appearanceColor: rememberedCurrentRepository?.appearanceColor,
          workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(workspaceDefaultById[workspace.id]),
            branch: workspaceBranchById[workspace.id],
          })),
          workspacePathById,
          activeWorkspaceId,
          isCurrent: true,
        } satisfies RepositorySidebarView)
      : null;

    const rememberedRepositories = recentRepositories.map(
      (repository) =>
        ({
          repositoryPath: repository.repositoryPath,
          repositoryName: repository.repositoryName,
          appearanceIcon: repository.appearanceIcon,
          appearanceColor: repository.appearanceColor,
          workspaces: repository.workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(repository.workspaceDefaultById[workspace.id]),
            branch: repository.workspaceBranchById[workspace.id],
          })),
          workspacePathById: repository.workspacePathById,
          activeWorkspaceId: repository.activeWorkspaceId,
          isCurrent: repository.repositoryPath === currentRepositoryPath,
        }) satisfies RepositorySidebarView,
    );

    if (!currentRepository) {
      return rememberedRepositories;
    }

    const hasCurrentRepository = rememberedRepositories.some(
      (repository) => repository.repositoryPath === currentRepositoryPath,
    );
    if (!hasCurrentRepository) {
      return [...rememberedRepositories, currentRepository];
    }

    return rememberedRepositories.map((repository) =>
      repository.repositoryPath === currentRepositoryPath ? currentRepository : repository,
    );
  }, [
    activeWorkspaceId,
    currentRepositoryName,
    currentRepositoryPath,
    recentRepositories,
    workspaceBranchById,
    workspaceDefaultById,
    workspacePathById,
    workspaces,
  ]);
  const visibleRepositories = useMemo(
    () =>
      filterRepositorySidebarRepositories({
        repositories,
        query: workspaceSearchQuery,
      }),
    [repositories, workspaceSearchQuery],
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
      getLinkedWorktreePathSetForRepository({
        repositoryPath: currentRepositoryPath,
        recentRepositories,
      }).has(normalizeComparablePath(workspacePath)),
    );
    return buildWorkspaceArchiveDialogCopy({
      workspaceName: workspaceToClose.name,
      isLinkedWorktree,
    });
  }, [currentRepositoryPath, recentRepositories, workspacePathById, workspaceToClose]);
  const collapsedWorkspaceEntries = useMemo(
    () =>
      buildCollapsedWorkspaceEntries({
        repositories,
        activeWorkspaceId,
      }),
    [activeWorkspaceId, repositories],
  );
  const recentRepositoryLastOpenedAtByPath = useMemo(() => {
    const map: Record<string, string> = {};
    for (const repository of recentRepositories) {
      map[repository.repositoryPath] = repository.lastOpenedAt;
    }
    return map;
  }, [recentRepositories]);
  const workspaceFleetStatusById = useMemo(() => {
    const statusById: Record<string, FleetTaskStatus> = {};
    if (!isWorkQueueView) {
      // Only the Work queue view reads this — skip the per-task classification
      // pass entirely while the Projects tree is showing.
      return statusById;
    }
    for (const repository of repositories) {
      for (const workspace of repository.workspaces) {
        const isActiveWorkspace =
          repository.isCurrent && workspace.id === activeWorkspaceId;
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
          if (isTaskArchived(task) || isDelegatedTask(task)) {
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
    repositories,
    providerTurnActivityByTask,
    isWorkQueueView,
    workspaceRuntimeCacheById,
  ]);
  const workQueueEntries = useMemo(
    () =>
      isWorkQueueView
        ? buildSidebarWorkQueueEntries({
            // `visibleRepositories`, not `repositories`: the search box filters both
            // views through the same predicate, so a query narrows the queue
            // exactly the way it narrows the tree.
            repositories: visibleRepositories,
            recentRepositoryLastOpenedAtByPath,
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
      visibleRepositories,
      recentRepositoryLastOpenedAtByPath,
      highestAttentionByWorkspaceId,
      workspaceFleetStatusById,
    ],
  );
  const workQueueGroups = useSidebarWorkQueueGroups({
    entries: workQueueEntries,
    highestAttentionByWorkspaceId,
  });
  // Collapsing a repository hides its workspace rows, so the repository row carries
  // the rolled-up alert for anything blocking inside it.
  const attentionAlertByRepositoryPath = useMemo(() => {
    const alertByPath: Record<string, RepositorySidebarAttentionAlert> = {};
    for (const repository of repositories) {
      const alert = buildRepositorySidebarAttentionAlert({
        workspaces: repository.workspaces,
        attentionItemsByWorkspaceId,
      });
      if (alert) {
        alertByPath[repository.repositoryPath] = alert;
      }
    }
    return alertByPath;
  }, [attentionItemsByWorkspaceId, repositories]);
  const workspaceShortcutTargets = useMemo(
    () =>
      buildVisibleWorkspaceShortcutTargets({
        collapsed: args.collapsed,
        collapsedByRepositoryPath,
        repositories,
      }),
    [args.collapsed, collapsedByRepositoryPath, repositories],
  );
  const workspaceShortcutLabels = useMemo(
    () =>
      new Map(
        workspaceShortcutTargets.map((target, index) => [
          `${target.repositoryPath}:${target.workspaceId}`,
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
    isListMatch: (listId) => listId === REPOSITORY_SORTABLE_LIST_ID,
    onReorder: ({ sourceId, targetId, closestEdge }) => {
      const fromIndex = repositories.findIndex(
        (repository) => repository.repositoryPath === sourceId,
      );
      const targetIndex = repositories.findIndex(
        (repository) => repository.repositoryPath === targetId,
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
        moveRepositoryInList({ repositoryPath: sourceId, direction });
      }
      const repositoryName = repositories[fromIndex]?.repositoryName ?? "Repository";
      setReorderAnnouncement(
        `${repositoryName} moved to position ${destinationIndex + 1} of ${repositories.length}.`,
      );
      suppressNextRowClick();
    },
  });

  useSortableListMonitor({
    isListMatch: (listId) => listId.startsWith(WORKSPACE_SORTABLE_LIST_PREFIX),
    onReorder: ({ listId, sourceId, targetId, closestEdge }) => {
      const repositoryPath = listId.slice(WORKSPACE_SORTABLE_LIST_PREFIX.length);
      const repository = repositories.find((item) => item.repositoryPath === repositoryPath);
      if (!repository) {
        return;
      }
      const fromIndex = repository.workspaces.findIndex(
        (workspace) => workspace.id === sourceId,
      );
      const targetIndex = repository.workspaces.findIndex(
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
        moveWorkspaceInRepositoryList({
          repositoryPath,
          workspaceId: sourceId,
          direction,
        });
      }
      const workspaceName = repository.workspaces[fromIndex]?.name ?? "Workspace";
      setReorderAnnouncement(
        `${workspaceName} moved to position ${destinationIndex + 1} of ${repository.workspaces.length}.`,
      );
      suppressNextRowClick();
    },
  });

  useEffect(() => {
    setCollapsedByRepositoryPath((current) => {
      let changed = false;
      const next = { ...current };
      for (const repository of repositories) {
        if (!(repository.repositoryPath in next)) {
          next[repository.repositoryPath] = false;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [repositories]);

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
      void handleRepositoryWorkspaceOpen({
        repositoryPath: nextWorkspace.repositoryPath,
        workspaceId: nextWorkspace.workspaceId,
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRepositoryWorkspaceOpen, workspaceShortcutTargets]);
  async function handleRepositoryWorkspaceOpen(args: {
    repositoryPath: string;
    workspaceId?: string;
  }) {
    const workspaceKey = args.workspaceId
      ? `${args.repositoryPath}:${args.workspaceId}`
      : null;
    setBusyRepositoryPath(args.repositoryPath);
    setBusyWorkspaceKey(workspaceKey);
    try {
      if (args.repositoryPath !== useAppStore.getState().repositoryPath) {
        await openRepository({ repositoryPath: args.repositoryPath });
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
      setBusyRepositoryPath(null);
      setBusyWorkspaceKey(null);
    }
  }

  async function handleCreateWorkspaceRequest(repositoryPath: string) {
    setBusyRepositoryPath(repositoryPath);
    try {
      if (repositoryPath !== useAppStore.getState().repositoryPath) {
        await openRepository({ repositoryPath });
      }
      setCreateWorkspaceOpen(true);
    } finally {
      setBusyRepositoryPath(null);
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
            repositorySidebarStyles.aside,
            args.animate !== false && repositorySidebarStyles.asideAnimated,
          ),
        )}
        style={{
          width: `${args.collapsed ? COLLAPSED_REPOSITORY_SIDEBAR_WIDTH : args.width}px`,
          minWidth: `${args.collapsed ? COLLAPSED_REPOSITORY_SIDEBAR_WIDTH : args.width}px`,
        }}
      >
        <VisuallyHidden aria-live="polite" aria-atomic="true">
          {reorderAnnouncement}
        </VisuallyHidden>
        {/* Expanded height and hairline match TopBar so the chrome border continues. */}
        <div
          data-testid="project-workspace-sidebar-chrome"
          className={sx(
            repositorySidebarStyles.chrome,
            args.collapsed
              ? repositorySidebarStyles.chromeCollapsed
              : repositorySidebarStyles.chromeExpanded,
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
              <div className={sx(repositorySidebarStyles.columnCenter)}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        xstyle={repositorySidebarStyles.collapsedPrimaryButton}
                        onClick={() => setOpenPathDialogOpen(true)}
                        aria-label="open-project"
                      />
                    }
                  >
                    <FolderOpen className={sx(repositorySidebarStyles.iconMd)} />
                  </TooltipTrigger>
                  <TooltipContent side="right">Open Repository</TooltipContent>
                </Tooltip>
                <SidebarPrimaryNavCollapsed showFleetView={sidebarShowFleetView} />
              </div>
            ) : (
              <div className={sx(repositorySidebarStyles.chromeTrailing)}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        xstyle={repositorySidebarStyles.chromeButton}
                        onClick={() =>
                          setLayout({
                            patch: { workspaceSidebarCollapsed: true },
                          })
                        }
                        aria-label="collapse-project-list"
                      />
                    }
                  >
                    <PanelLeft className={sx(repositorySidebarStyles.iconMd)} />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Collapse Repository List
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </TooltipProvider>
        </div>
        {args.collapsed ? (
          <div className={sx(repositorySidebarStyles.scrollArea)}>
            <TooltipProvider>
              <div className={sx(repositorySidebarStyles.columnCenterGap)}>
                {collapsedWorkspaceEntries.map((entry) => {
                  const entryKey = `${entry.repositoryPath}:${entry.workspaceId}`;
                  const shortcutLabel = workspaceShortcutLabels.get(entryKey);
                  const workspaceBusy = busyWorkspaceKey === entryKey;

                  return (
                    <div
                      key={entryKey}
                      className={sx(repositorySidebarStyles.collapsedEntry)}
                    >
                      {entry.startsRepositoryGroup ? (
                        <div
                          aria-hidden="true"
                          className={sx(
                            repositorySidebarStyles.collapsedGroupRule,
                          )}
                        />
                      ) : null}
                      <WorkspaceHoverPreviewTooltip
                        workspaceId={entry.workspaceId}
                        workspaceName={entry.workspaceName}
                        branch={entry.branch}
                        repositoryName={entry.repositoryName}
                        shortcutLabel={shortcutLabel}
                        side="right"
                      >
                        <AdsButton
                          layout="host"
                          type="button"
                          xstyle={[
                            repositorySidebarStyles.collapsedWorkspaceButton,
                            transition.colors,
                            entry.isActive
                              ? repositorySidebarStyles.collapsedWorkspaceActive
                              : repositorySidebarStyles.collapsedWorkspaceIdle,
                          ]}
                          onClick={() =>
                            void handleRepositoryWorkspaceOpen({
                              repositoryPath: entry.repositoryPath,
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
          <div className={sx(repositorySidebarStyles.scrollAreaExpanded)}>
            <TooltipProvider>
              <div
                className={sx(
                  repositorySidebarStyles.navStack,
                  repositorySidebarStyles.navStackSpaced,
                )}
              >
                <SidebarPrimaryNav showFleetView={sidebarShowFleetView} />
              </div>
              <div
                className={sx(repositorySidebarStyles.viewBar, panelBarStyles.bar)}
              >
                {/* The toggle replaces the old static "Projects" heading: it
                    names the view you are in *and* is the control that leaves
                    it, so the bar never claims one thing while showing another. */}
                <div className={sx(repositorySidebarStyles.viewToggle)}>
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
                                repositorySidebarStyles.viewToggleButton,
                                isSelected
                                  ? repositorySidebarStyles.viewToggleButtonActive
                                  : repositorySidebarStyles.viewToggleButtonIdle,
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
                            className={sx(repositorySidebarStyles.iconSm)}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {option.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
                <div className={sx(repositorySidebarStyles.viewBarActions)}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          xstyle={repositorySidebarStyles.chromeButtonSidebar}
                          onClick={() => setOpenPathDialogOpen(true)}
                          aria-label="open-project"
                        />
                      }
                    >
                      <FolderOpen className={sx(repositorySidebarStyles.iconMd)} />
                    </TooltipTrigger>
                    <TooltipContent side="top">Open Repository</TooltipContent>
                  </Tooltip>
                  {/* Row density is a tree-only concern; the queue has one row shape. */}
                  {isWorkQueueView ? null : (
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              className={sx(repositorySidebarStyles.triggerHost)}
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
                                  repositorySidebarStyles.chromeButtonSidebar
                                }
                                aria-label="workspace-item-display-mode"
                              />
                            }
                          >
                            {workspaceSidebarItemDisplayMode === "expanded" ? (
                              <Rows3
                                className={sx(repositorySidebarStyles.iconMd)}
                              />
                            ) : (
                              <Rows2
                                className={sx(repositorySidebarStyles.iconMd)}
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
                        xstyle={repositorySidebarStyles.displayModeMenu}
                      >
                        <DropdownMenuLabel>Workspace rows</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup
                          value={workspaceSidebarItemDisplayMode}
                          onValueChange={handleWorkspaceItemDisplayModeChange}
                        >
                          <DropdownMenuRadioItem value="expanded">
                            <Rows3
                              className={sx(repositorySidebarStyles.iconMd)}
                            />
                            Expanded
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="compact">
                            <Rows2
                              className={sx(repositorySidebarStyles.iconMd)}
                            />
                            Compact
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              <div className={sx(repositorySidebarStyles.searchRow)}>
                <Search className={sx(repositorySidebarStyles.searchIcon)} />
                <Input
                  value={workspaceSearchQuery}
                  onChange={(event) =>
                    setWorkspaceSearchQuery(event.target.value)
                  }
                  placeholder="Search repos, labels, or branches"
                  xstyle={repositorySidebarStyles.searchInput}
                  aria-label="search-workspaces"
                />
                {workspaceSearchQuery.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    xstyle={repositorySidebarStyles.searchClear}
                    onClick={() => setWorkspaceSearchQuery("")}
                    aria-label="clear-workspace-search"
                  >
                    <X className={sx(repositorySidebarStyles.iconSm)} />
                  </Button>
                ) : null}
              </div>
              {repositories.length === 0 ? (
                <SidebarEmptyState kind="no-repositories" onOpenRepository={() => setOpenPathDialogOpen(true)} />
              ) : visibleRepositories.length === 0 ? (
                <SidebarEmptyState kind="no-matches" query={workspaceSearchQuery} onClearSearch={() => setWorkspaceSearchQuery("")} />
              ) : isWorkQueueView ? (
                <div className={sx(repositorySidebarStyles.navStack)}>
                  {workQueueGroups.length === 0 ? (
                    <SidebarEmptyState kind="no-workspaces" />
                  ) : (
                    workQueueGroups.map((group) => {
                      const laneCollapsed =
                        collapsedWorkQueueLanes[group.lane] === true;
                      return (
                        <div
                          key={group.lane}
                          className={sx(repositorySidebarStyles.laneStack)}
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
                              repositorySidebarStyles.laneButton,
                              transition.colors,
                            ]}
                          >
                            <ChevronRight
                              className={sx(
                                repositorySidebarStyles.laneChevron,
                                !laneCollapsed &&
                                  repositorySidebarStyles.laneChevronOpen,
                                transition.transform,
                              )}
                            />
                            <span
                              className={sx(repositorySidebarStyles.laneLabel)}
                            >
                              {group.label}
                            </span>
                            <span
                              className={sx(repositorySidebarStyles.laneCount)}
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
                                    void handleRepositoryWorkspaceOpen(target)
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
                  <div className={sx(repositorySidebarStyles.repositoryStack)}>
                    {visibleRepositories.map((repository) => {
                      const collapsed =
                        collapsedByRepositoryPath[repository.repositoryPath] ?? false;
                      const repositoryBusy =
                        busyRepositoryPath === repository.repositoryPath;
                      const repositoryReorderingDisabled =
                        repositoryBusy || repositories.length < 2;
                      const repositoryAttentionAlert =
                        attentionAlertByRepositoryPath[repository.repositoryPath];
                      // Only a blocking alert earns a reserved slot through
                      // hover. A review dot is a passive marker, so it yields to
                      // the row actions the way the workspace count does.
                      const repositoryAlertPinnedOnHover =
                        repositoryAttentionAlert?.tier === "blocking";

                      return (
                        <SortableSidebarItem
                          key={repository.repositoryPath}
                          listId={REPOSITORY_SORTABLE_LIST_ID}
                          id={repository.repositoryPath}
                          disabled={repositoryReorderingDisabled}
                          previewTitle={repository.repositoryName}
                          previewIcon={
                            <RepositoryIdentityMark
                              icon={repository.appearanceIcon}
                              color={repository.appearanceColor}
                              className={sx(
                                repositorySidebarStyles.repositoryDragPreviewMark,
                              )}
                              iconClassName={sx(
                                repositorySidebarStyles.repositoryDragPreviewIcon,
                              )}
                            />
                          }
                          indicatorGap="0.75rem"
                        >
                          {({ handleRef, isDragging }) => (
                            <section
                              className={sx(
                                isDragging &&
                                  repositorySidebarStyles.repositorySectionDragging,
                              )}
                            >
                              <div
                                className={sx(
                                  repositorySidebarStyles.repositoryHeaderRow,
                                )}
                              >
                                <div
                                  ref={handleRef ?? undefined}
                                  role={handleRef ? "group" : undefined}
                                  tabIndex={handleRef ? 0 : undefined}
                                  aria-label={
                                    handleRef
                                      ? `Reorder repository ${repository.repositoryName}`
                                      : undefined
                                  }
                                  aria-keyshortcuts={
                                    handleRef && !repositoryReorderingDisabled
                                      ? "Alt+ArrowUp Alt+ArrowDown"
                                      : undefined
                                  }
                                  aria-description={
                                    handleRef && !repositoryReorderingDisabled
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
                                            repositories.findIndex(
                                              (candidate) =>
                                                candidate.repositoryPath ===
                                                repository.repositoryPath,
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
                                            nextIndex >= repositories.length
                                          ) {
                                            return;
                                          }
                                          moveRepositoryInList({
                                            repositoryPath: repository.repositoryPath,
                                            direction,
                                          });
                                          setReorderAnnouncement(
                                            `${repository.repositoryName} moved to position ${nextIndex + 1} of ${repositories.length}.`,
                                          );
                                        }
                                      : undefined
                                  }
                                  className={sx(
                                    repositorySidebarStyles.repositoryRow,
                                    transition.colors,
                                    handleRef &&
                                      repositorySidebarStyles.repositoryRowDraggable,
                                    isDragging &&
                                      repositorySidebarStyles.repositoryRowDragging,
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
                                            repositorySidebarStyles.repositoryToggle
                                          }
                                          onClick={() => {
                                            setCollapsedByRepositoryPath(
                                              (current) => ({
                                                ...current,
                                                [repository.repositoryPath]:
                                                  !collapsed,
                                              }),
                                            );
                                          }}
                                          aria-label={`toggle-project-${repository.repositoryPath}`}
                                          aria-expanded={!collapsed}
                                        />
                                      }
                                    >
                                      {repositoryBusy ? (
                                        <Loader
                                          aria-hidden
                                          className={sx(
                                            repositorySidebarStyles.statusMuted,
                                          )}
                                          size="xs"
                                          variant="spinner"
                                        />
                                      ) : (
                                        <>
                                          <RepositoryIdentityMark
                                            icon={repository.appearanceIcon}
                                            color={repository.appearanceColor}
                                            className={sx(
                                              repositorySidebarStyles.repositoryMark,
                                            )}
                                            iconClassName={sx(
                                              repositorySidebarStyles.repositoryMarkIcon,
                                            )}
                                          />
                                          <span
                                            className={sx(
                                              repositorySidebarStyles.repositoryChevronSlot,
                                            )}
                                          >
                                            <ChevronRight
                                              className={sx(
                                                repositorySidebarStyles.repositoryChevron,
                                                !collapsed &&
                                                  repositorySidebarStyles.repositoryChevronOpen,
                                              )}
                                            />
                                          </span>
                                        </>
                                      )}
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                      {collapsed
                                        ? "Expand repository"
                                        : "Collapse repository"}
                                    </TooltipContent>
                                  </Tooltip>
                                  <div
                                    className={sx(
                                      repositorySidebarStyles.repositoryLead,
                                      // The row actions are absolutely positioned at the inline
                                      // end, so hovering reserves room for them. An attention
                                      // alert stays visible through that hover (unlike the count
                                      // badge it replaces), so it needs its own slot reserved
                                      // beyond the actions or the two would overlap.
                                      repositoryAlertPinnedOnHover
                                        ? repositorySidebarStyles.repositoryLeadPinned
                                        : repositorySidebarStyles.repositoryLeadDefault,
                                    )}
                                  >
                                    <span
                                      className={sx(
                                        repositorySidebarStyles.repositoryName,
                                      )}
                                    >
                                      {repository.repositoryName}
                                    </span>
                                    <div
                                      className={sx(
                                        repositorySidebarStyles.repositoryCountSlot,
                                        // The workspace count is decorative, so it yields to the
                                        // row actions on hover. An attention alert must not: the
                                        // moment you reach for the row is exactly when you need to
                                        // see that something inside it is blocked, and fading the
                                        // slot would also make its tooltip unreachable. The row
                                        // reserves hover padding, so the alert stays clear of the
                                        // absolutely positioned actions.
                                        !repositoryAlertPinnedOnHover &&
                                          repositorySidebarStyles.repositoryCountSlotYields,
                                      )}
                                    >
                                      {repositoryAttentionAlert ? (
                                        <RepositoryAttentionAlertIcon
                                          alert={repositoryAttentionAlert}
                                          repositoryName={repository.repositoryName}
                                        />
                                      ) : (
                                        <span
                                          className={sx(
                                            repositorySidebarStyles.repositoryCount,
                                          )}
                                          aria-label={`${repository.workspaces.length} workspaces`}
                                        >
                                          {repository.workspaces.length}
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className={sx(
                                        repositorySidebarStyles.repositoryActions,
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
                                                repositorySidebarStyles.repositoryActionButton
                                              }
                                              disabled={repositoryBusy}
                                              onClick={() =>
                                                void args.onKickoffWorkspace(
                                                  repository.repositoryPath,
                                                )
                                              }
                                              aria-label={`Kick off workspace for ${repository.repositoryName}`}
                                            />
                                          }
                                        >
                                          <Rocket
                                            className={sx(
                                              repositorySidebarStyles.iconSm,
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
                                                repositorySidebarStyles.repositoryActionButton
                                              }
                                              disabled={repositoryBusy}
                                              onClick={() =>
                                                void handleCreateWorkspaceRequest(
                                                  repository.repositoryPath,
                                                )
                                              }
                                              aria-label={`new-workspace-${repository.repositoryPath}`}
                                            />
                                          }
                                        >
                                          <Plus
                                            className={sx(
                                              repositorySidebarStyles.iconSm,
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
                                                repositorySidebarStyles.repositoryActionButton
                                              }
                                              disabled={repositoryBusy}
                                              onClick={() =>
                                                void hydrateWorkspaces()
                                              }
                                              aria-label={`refresh-workspaces-${repository.repositoryPath}`}
                                            />
                                          }
                                        >
                                          <RefreshCw
                                            className={sx(
                                              repositorySidebarStyles.iconSm,
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
                                                repositorySidebarStyles.repositoryActionButton
                                              }
                                              disabled={repositoryBusy}
                                              onMouseEnter={
                                                args.onPreloadSettings
                                              }
                                              onFocus={args.onPreloadSettings}
                                              onClick={() =>
                                                args.onOpenSettings({
                                                  section: "projects",
                                                  repositoryPath:
                                                    repository.repositoryPath,
                                                })
                                              }
                                              aria-label={`project-settings-${repository.repositoryPath}`}
                                            />
                                          }
                                        >
                                          <Settings
                                            className={sx(
                                              repositorySidebarStyles.iconSm,
                                            )}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          Repository settings
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {!collapsed ? (
                                <div
                                  className={sx(
                                    repositorySidebarStyles.workspaceList,
                                  )}
                                >
                                  <div
                                    className={sx(
                                      repositorySidebarStyles.workspaceListInner,
                                    )}
                                  >
                                    {repository.workspaces.map((workspace) => {
                                      const workspaceShortcutLabel =
                                        workspaceShortcutLabels.get(
                                          `${repository.repositoryPath}:${workspace.id}`,
                                        );
                                      const workspaceBusy =
                                        busyWorkspaceKey ===
                                        `${repository.repositoryPath}:${workspace.id}`;
                                      const isActive =
                                        repository.isCurrent &&
                                        workspace.id === activeWorkspaceId;
                                      const workspaceReorderingDisabled =
                                        repositoryBusy ||
                                        workspaceBusy ||
                                        repository.workspaces.length < 2;
                                      const canArchiveWorkspace =
                                        repository.isCurrent &&
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
                                          listId={`${WORKSPACE_SORTABLE_LIST_PREFIX}${repository.repositoryPath}`}
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
                                                repositorySidebarStyles.identityMark,
                                              )}
                                              iconClassName={sx(
                                                repositorySidebarStyles.identityMarkIcon,
                                              )}
                                            />
                                          }
                                          indicatorGap="0.25rem"
                                        >
                                          {({ handleRef, isDragging }) => (
                                            <div
                                              className={sx(
                                                repositorySidebarStyles.workspaceItem,
                                              )}
                                            >
                                              <WorkspaceBorderBeam
                                                workspaceId={workspace.id}
                                              >
                                                <div
                                                  className={sx(
                                                    repositorySidebarStyles.workspaceRow,
                                                    isExpandedWorkspaceItem
                                                      ? repositorySidebarStyles.workspaceRowExpanded
                                                      : repositorySidebarStyles.workspaceRowCompact,
                                                    isActive
                                                      ? repositorySidebarStyles.workspaceRowActive
                                                      : repositorySidebarStyles.workspaceRowIdle,
                                                    isDragging &&
                                                      repositorySidebarStyles.workspaceRowDragging,
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
                                                        repositorySidebarStyles.workspaceOpen,
                                                        isExpandedWorkspaceItem
                                                          ? repositorySidebarStyles.workspaceOpenExpanded
                                                          : repositorySidebarStyles.workspaceOpenCompact,
                                                        handleRef &&
                                                          repositorySidebarStyles.workspaceOpenDraggable,
                                                        isDragging &&
                                                          repositorySidebarStyles.workspaceOpenDragging,
                                                      )}
                                                      onClick={() => {
                                                        if (
                                                          suppressRowClickRef.current
                                                        ) {
                                                          return;
                                                        }
                                                        void handleRepositoryWorkspaceOpen(
                                                          {
                                                            repositoryPath:
                                                              repository.repositoryPath,
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
                                                            repository.workspaces.findIndex(
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
                                                              repository.workspaces
                                                                .length
                                                          ) {
                                                            return;
                                                          }
                                                          moveWorkspaceInRepositoryList(
                                                            {
                                                              repositoryPath:
                                                                repository.repositoryPath,
                                                              workspaceId:
                                                                workspace.id,
                                                              direction,
                                                            },
                                                          );
                                                          setReorderAnnouncement(
                                                            `${workspace.isDefault ? "Default" : workspace.name} moved to position ${nextIndex + 1} of ${repository.workspaces.length}.`,
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
                                                        void handleRepositoryWorkspaceOpen(
                                                          {
                                                            repositoryPath:
                                                              repository.repositoryPath,
                                                            workspaceId:
                                                              workspace.id,
                                                          },
                                                        );
                                                      }}
                                                    >
                                                      <span
                                                        className={sx(
                                                          repositorySidebarStyles.workspaceLeadSlot,
                                                          isExpandedWorkspaceItem &&
                                                            repositorySidebarStyles.workspaceLeadSlotExpanded,
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
                                                                repositoryPath:
                                                                  repository.repositoryPath,
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
                                                              repositoryPath:
                                                                repository.repositoryPath,
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
                                                      repositoryPath={
                                                        repository.repositoryPath
                                                      }
                                                      workspacePath={
                                                        repository
                                                          .workspacePathById[
                                                          workspace.id
                                                        ] ?? repository.repositoryPath
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
                                                          repositorySidebarStyles.workspaceCountHost,
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
                                                        repositoryPath={
                                                          repository.repositoryPath
                                                        }
                                                        workspacePath={
                                                          repository
                                                            .workspacePathById[
                                                            workspace.id
                                                          ] ??
                                                          repository.repositoryPath
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
                                                repositoryPath={
                                                  repository.repositoryPath
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
            repositorySidebarStyles.footer,
            args.collapsed
              ? repositorySidebarStyles.footerCollapsed
              : repositorySidebarStyles.footerExpanded,
          )}
        >
          <TooltipProvider>
            {args.collapsed ? (
              <div className={sx(repositorySidebarStyles.columnCenterGap)}>
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
                        xstyle={repositorySidebarStyles.collapsedButton}
                        aria-label="open-settings"
                        onMouseEnter={args.onPreloadSettings}
                        onFocus={args.onPreloadSettings}
                        onClick={() => args.onOpenSettings()}
                      />
                    }
                  >
                    <Settings className={sx(repositorySidebarStyles.iconMd)} />
                  </TooltipTrigger>
                  <TooltipContent side="right">Settings</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className={sx(repositorySidebarStyles.footerRow)}>
                <div className={sx(repositorySidebarStyles.footerGroup)}>
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
                        xstyle={repositorySidebarStyles.chromeButton}
                        aria-label="open-settings"
                        onMouseEnter={args.onPreloadSettings}
                        onFocus={args.onPreloadSettings}
                        onClick={() => args.onOpenSettings()}
                      />
                    }
                  >
                    <Settings className={sx(repositorySidebarStyles.iconSm)} />
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
          <label className={sx(repositorySidebarStyles.archiveOption)}>
            <Checkbox
              controlOnly
              xstyle={repositorySidebarStyles.archiveCheckbox}
              checked={archiveDeletesBranch}
              disabled={closingWorkspaceId !== null}
              onCheckedChange={(checked) => setArchiveDeletesBranch(checked)}
            />
            <span
              className={sx(
                archiveDeletesBranch
                  ? repositorySidebarStyles.archiveLabelOn
                  : repositorySidebarStyles.archiveLabelOff,
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
        defaultInitCommand={repositoryWorkspaceInitCommand}
        defaultUseRootNodeModulesSymlink={repositoryUseRootNodeModulesSymlink}
        onOpenChange={setCreateWorkspaceOpen}
        onCreateWorkspace={createWorkspace}
        onImportWorkspace={importWorkspaceFromWorktree}
      />
      <OpenPathDialog
        open={openPathDialogOpen}
        onOpenChange={setOpenPathDialogOpen}
        onSubmitPath={(inputPath) => openRepositoryFromPath({ inputPath })}
        onBrowse={async () => {
          await createRepository({});
        }}
      />
    </>
  );
}
