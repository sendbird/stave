import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderTree,
  GripVertical,
  LoaderCircle,
  PanelLeft,
  Plus,
  RefreshCw,
  Settings,
  Swords,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { PANEL_BAR_HEIGHT_CLASS } from "@/components/layout/panel-bar.constants";
import {
  buildCollapsedWorkspaceEntries,
  buildWorkspaceHoverPreview,
  buildVisibleWorkspaceShortcutTargets,
  getWorkspaceShortcutLabel,
  getWorkspaceHoverActionVisibilityClasses,
  getWorkspaceRespondingCountVisibilityClasses,
  WORKSPACE_SHORTCUT_COUNT,
  type ProjectSidebarCollapsedProjectView,
} from "@/components/layout/ProjectWorkspaceSidebar.utils";
import { isEditableShortcutTarget } from "@/components/layout/app-shell.shortcuts";
import { CreateWorkspaceDialog } from "@/components/layout/CreateWorkspaceDialog";
import { OpenPathDialog } from "@/components/layout/OpenPathDialog";
import { MemoryUsagePopover } from "@/components/layout/ResourcesPopover";
import { StaveAppMenuButton } from "@/components/layout/StaveAppMenuButton";
import { StaveMuseTriggerButton } from "@/components/layout/StaveMuseTriggerButton";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import { WorkspaceShortcutChip } from "@/components/layout/WorkspaceShortcutChip";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import { WorkspaceIdentityMark } from "@/components/layout/workspace-accent";
import {
  Badge,
  BorderBeam,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WaveIndicator,
} from "@/components/ui";
import {
  loadWorkspaceShellSummary,
  type WorkspaceShellSummary,
} from "@/lib/db/workspaces.db";
import { getProviderWaveToneClass } from "@/lib/providers/model-catalog";
import {
  resolveProviderTurnDisplayState,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
import { getRespondingProviderId, getRespondingTasks } from "@/lib/tasks";
import { resolveSidebarArtworkClass } from "@/lib/themes";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { summarizeColiseumActivity } from "@/store/coliseum.utils";
import { isDefaultWorkspaceName } from "@/store/project.utils";
import type { ChatMessage, ColiseumGroupState, Task } from "@/types/chat";

type ProjectSidebarView = ProjectSidebarCollapsedProjectView;
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_TASKS: Task[] = [];
const EMPTY_MESSAGES_BY_TASK: Record<string, ChatMessage[]> = {};
const EMPTY_MESSAGE_COUNT_BY_TASK: Record<string, number> = {};
const EMPTY_ACTIVE_TURN_IDS_BY_TASK: Record<string, string | undefined> = {};
const EMPTY_ACTIVE_COLISEUMS_BY_TASK: Record<
  string,
  ColiseumGroupState | undefined
> = {};

function resolveRespondingToneClass(args: {
  tasks: ReturnType<typeof useAppStore.getState>["tasks"];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerTurnActivityByTask: Record<
    string,
    ProviderTurnActivitySnapshot | undefined
  >;
}) {
  const respondingTasks = getRespondingTasks({
    tasks: args.tasks,
    activeTurnIdsByTask: args.activeTurnIdsByTask,
  });
  if (respondingTasks.length === 0) {
    return {
      respondingTaskCount: 0,
      respondingToneClass: "text-primary",
    };
  }

  const providers = Array.from(
    new Set(
      respondingTasks.map((task) =>
        getRespondingProviderId({
          fallbackProviderId: task.provider,
          messages: args.messagesByTask[task.id] ?? EMPTY_MESSAGES,
        }),
      ),
    ),
  );
  const hasStalledTask = respondingTasks.some(
    (task) =>
      resolveProviderTurnDisplayState({
        activeTurnId: args.activeTurnIdsByTask[task.id] ?? null,
        activity: args.providerTurnActivityByTask[task.id] ?? null,
      }) === "stalled",
  );

  return {
    respondingTaskCount: respondingTasks.length,
    respondingToneClass: hasStalledTask
      ? "text-warning"
      : providers.length === 1 && providers[0]
        ? getProviderWaveToneClass({ providerId: providers[0] })
        : "text-primary",
  };
}

function formatWorkspaceName(name: string, branch?: string) {
  if (isDefaultWorkspaceName(name)) {
    return (
      <>
        Default
        {branch ? (
          <span className="ml-1 inline-flex max-w-20 truncate rounded border border-border/60 bg-muted/60 px-1 py-px text-[10px] font-medium leading-tight text-muted-foreground">
            {branch}
          </span>
        ) : null}
      </>
    );
  }
  return name;
}

function formatCountLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function useWorkspaceSidebarActivityState(workspaceId: string) {
  const [
    tasks,
    messagesByTask,
    activeTurnIdsByTask,
    activeColiseumsByTask,
    providerTurnActivityByTask,
    prStatus,
  ] = useAppStore(
    useShallow((state) => {
      if (state.activeWorkspaceId === workspaceId) {
        return [
          state.tasks,
          state.messagesByTask,
          state.activeTurnIdsByTask,
          state.activeColiseumsByTask,
          state.providerTurnActivityByTask,
          state.workspacePrInfoById[workspaceId]?.derived ?? null,
        ] as const;
      }
      const runtimeState = state.workspaceRuntimeCacheById[workspaceId];
        return [
          runtimeState?.tasks ?? EMPTY_TASKS,
          runtimeState?.messagesByTask ?? EMPTY_MESSAGES_BY_TASK,
          runtimeState?.activeTurnIdsByTask ?? EMPTY_ACTIVE_TURN_IDS_BY_TASK,
          runtimeState?.activeColiseumsByTask ?? EMPTY_ACTIVE_COLISEUMS_BY_TASK,
          state.providerTurnActivityByTask,
          state.workspacePrInfoById[workspaceId]?.derived ?? null,
        ] as const;
      }),
  );

  return useMemo(
    () => ({
      ...resolveRespondingToneClass({
        tasks,
        messagesByTask,
        activeTurnIdsByTask,
        providerTurnActivityByTask,
      }),
      hasColiseumActivity: summarizeColiseumActivity({
        activeColiseumsByTask,
        activeTurnIdsByTask,
      }).hasActivity,
      prStatus,
    }),
    [
      activeColiseumsByTask,
      activeTurnIdsByTask,
      messagesByTask,
      prStatus,
      providerTurnActivityByTask,
      tasks,
    ],
  );
}

function useWorkspaceHoverPreviewState(workspaceId: string) {
  const [tasks, messageCountByTask, activeTurnIdsByTask, hasRuntimeState] =
    useAppStore(
      useShallow((state) => {
        if (state.activeWorkspaceId === workspaceId) {
          return [
            state.tasks,
            state.messageCountByTask,
            state.activeTurnIdsByTask,
            true,
          ] as const;
        }
        const runtimeState = state.workspaceRuntimeCacheById[workspaceId];
        return [
          runtimeState?.tasks ?? EMPTY_TASKS,
          runtimeState?.messageCountByTask ?? EMPTY_MESSAGE_COUNT_BY_TASK,
          runtimeState?.activeTurnIdsByTask ?? EMPTY_ACTIVE_TURN_IDS_BY_TASK,
          Boolean(runtimeState),
        ] as const;
      }),
    );

  return useMemo(
    () => ({
      tasks,
      messageCountByTask,
      activeTurnIdsByTask,
      hasRuntimeState,
    }),
    [activeTurnIdsByTask, hasRuntimeState, messageCountByTask, tasks],
  );
}

function WorkspaceHoverPreviewTooltip(args: {
  workspaceId: string;
  workspaceName: string;
  branch?: string;
  projectName?: string;
  shortcutLabel?: string | null;
  side: "top" | "right";
  children: ReactNode;
}) {
  const { tasks, messageCountByTask, activeTurnIdsByTask, hasRuntimeState } =
    useWorkspaceHoverPreviewState(args.workspaceId);
  const [loadedShell, setLoadedShell] = useState<
    WorkspaceShellSummary | null | undefined
  >(undefined);
  const [isShellLoading, setIsShellLoading] = useState(false);
  const [didShellLoadFail, setDidShellLoadFail] = useState(false);

  const preview = useMemo(() => {
    if (hasRuntimeState) {
      return buildWorkspaceHoverPreview({
        tasks,
        messageCountByTask,
        activeTurnIdsByTask,
      });
    }
    if (loadedShell !== undefined) {
      return buildWorkspaceHoverPreview({
        tasks: loadedShell?.tasks ?? EMPTY_TASKS,
        messageCountByTask:
          loadedShell?.messageCountByTask ?? EMPTY_MESSAGE_COUNT_BY_TASK,
      });
    }
    return null;
  }, [
    activeTurnIdsByTask,
    hasRuntimeState,
    loadedShell,
    messageCountByTask,
    tasks,
  ]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (
        !open ||
        hasRuntimeState ||
        loadedShell !== undefined ||
        isShellLoading
      ) {
        return;
      }

      setIsShellLoading(true);
      setDidShellLoadFail(false);
      void loadWorkspaceShellSummary({ workspaceId: args.workspaceId })
        .then((shell) => {
          setLoadedShell(shell);
        })
        .catch(() => {
          setDidShellLoadFail(true);
        })
        .finally(() => {
          setIsShellLoading(false);
        });
    },
    [args.workspaceId, hasRuntimeState, isShellLoading, loadedShell],
  );

  const metaLabel = preview
    ? [
        formatCountLabel(preview.taskCount, "task"),
        preview.messageCount > 0
          ? formatCountLabel(preview.messageCount, "message")
          : null,
      ]
        .filter(Boolean)
        .join(" • ")
    : "";

  return (
    <Tooltip onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>{args.children}</TooltipTrigger>
      <TooltipContent
        side={args.side}
        align="start"
        className="max-w-[260px] break-words px-3 py-2"
      >
        <div className="space-y-2">
          <div className="space-y-0.5">
            <p className="text-sm font-medium leading-snug text-background">
              {formatWorkspaceName(args.workspaceName, args.branch)}
            </p>
            {args.projectName ? (
              <p className="text-[11px] leading-snug text-background/70">
                {args.projectName}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            {didShellLoadFail && !preview ? (
              <p className="text-[11px] leading-snug text-background/70">
                Preview unavailable
              </p>
            ) : !preview || isShellLoading ? (
              <p className="text-[11px] leading-snug text-background/70">
                Loading summary...
              </p>
            ) : preview.isEmpty ? (
              <p className="text-[11px] leading-snug text-background/70">
                No tasks yet
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-snug text-background/70">
                  <span>{metaLabel}</span>
                  {preview.runningTaskCount > 0 ? (
                    <span className="rounded-sm border border-background/20 bg-background/10 px-1 py-0.5 font-medium text-background">
                      {`${preview.runningTaskCount} running`}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1">
                  {preview.taskTitles.map((title, index) => (
                    <p
                      key={`${args.workspaceId}:${index}`}
                      className="text-xs leading-4 text-background"
                    >
                      {title}
                    </p>
                  ))}
                  {preview.moreTaskCount > 0 ? (
                    <p className="text-[11px] leading-snug text-background/70">
                      +{preview.moreTaskCount} more
                    </p>
                  ) : null}
                </div>
              </>
            )}
            {args.shortcutLabel ? (
              <WorkspaceShortcutChip
                modifier={workspaceShortcutModifierLabel}
                label={args.shortcutLabel}
                className="mt-0.5 h-4 px-1 text-[10px]"
              />
            ) : null}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const WorkspaceLeadingStatusIcon = memo(
  function WorkspaceLeadingStatusIcon(args: {
    workspaceId: string;
    workspaceName: string;
    isDefault: boolean;
    busy: boolean;
  }) {
    const { respondingTaskCount, respondingToneClass, hasColiseumActivity, prStatus } =
      useWorkspaceSidebarActivityState(args.workspaceId);

    if (args.busy) {
      return (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
      );
    }

    if (hasColiseumActivity) {
      return <Swords className="size-4 animate-pulse text-primary" />;
    }

    if (respondingTaskCount > 0) {
      return (
        <WaveIndicator
          className={cn("gap-px", respondingToneClass)}
          barClassName="h-3 w-0.5 rounded-[2px]"
        />
      );
    }

    if (!args.isDefault && prStatus) {
      return <PrStatusIcon status={prStatus} />;
    }

    return (
      <WorkspaceIdentityMark
        workspaceName={args.workspaceName}
        isDefault={args.isDefault}
      />
    );
  },
);

const WorkspaceRespondingCountBadge = memo(
  function WorkspaceRespondingCountBadge(args: {
    workspaceId: string;
    hasHoverActions: boolean;
    isClosing: boolean;
  }) {
    const { respondingTaskCount } = useWorkspaceSidebarActivityState(
      args.workspaceId,
    );

    if (respondingTaskCount === 0) {
      return null;
    }

    return (
      <div className="flex h-7 min-w-7 items-center justify-center pr-1">
        <Badge
          variant="outline"
          className={cn(
            "min-w-7 justify-center rounded-sm border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary transition-opacity",
            getWorkspaceRespondingCountVisibilityClasses({
              hasHoverActions: args.hasHoverActions,
              isClosing: args.isClosing,
            }),
          )}
        >
          {respondingTaskCount}
        </Badge>
      </div>
    );
  },
);

/**
 * Wrap the workspace row with the `border-beam` library's animated glow when a
 * task in the workspace is streaming and the user opted into the Border Beam
 * motion setting. The wrapper is always mounted so the DOM stays stable; only
 * the `active` prop toggles — that lets the library handle fade-in / fade-out
 * transitions itself. The library's wrapper is `position: relative;
 * overflow: hidden;`, which would clip the row's subtle `ring-1` / `shadow-sm`
 * decorations — an intentional trade-off since those states are barely visible
 * and rewriting them onto this wrapper would bleed per-row state upward.
 */
const WorkspaceBorderBeam = memo(function WorkspaceBorderBeam(args: {
  workspaceId: string;
  children: ReactNode;
}) {
  const { respondingTaskCount } = useWorkspaceSidebarActivityState(
    args.workspaceId,
  );
  const borderBeamEnabled = useAppStore(
    (state) => state.settings.borderBeamEnabled,
  );
  const borderBeamSize = useAppStore(
    (state) => state.settings.borderBeamSize,
  );
  const borderBeamVariant = useAppStore(
    (state) => state.settings.borderBeamVariant,
  );

  const active = borderBeamEnabled && respondingTaskCount > 0;

  return (
    <BorderBeam
      active={active}
      size={borderBeamSize}
      colorVariant={borderBeamVariant}
      theme="auto"
    >
      {args.children}
    </BorderBeam>
  );
});

const IS_MAC =
  typeof window !== "undefined" && window.api?.platform === "darwin";
const workspaceShortcutModifierLabel = IS_MAC ? "\u2318\u21E7" : "Ctrl+Shift";
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

interface SortableSidebarItemProps {
  id: string;
  disabled?: boolean;
  handleLabel: string;
  handleVisible?: boolean;
  children: (args: {
    dragHandle: ReactNode | null;
    isDragging: boolean;
  }) => ReactNode;
}

function SortableSidebarItem(args: SortableSidebarItemProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: args.id,
    disabled: args.disabled || !args.handleVisible,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-pan-y", isDragging && "z-20 opacity-80")}
    >
      {args.children({
        isDragging,
        dragHandle: args.handleVisible ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={args.handleLabel}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors",
              args.disabled
                ? "cursor-default opacity-40"
                : "cursor-grab hover:border-border/80 hover:bg-card/90 hover:text-foreground active:cursor-grabbing",
            )}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null,
      })}
    </div>
  );
}

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
}) {
  const sidebarArtworkMode = useAppStore(
    (state) => state.settings.sidebarArtworkMode,
  );
  const [collapsedByProjectPath, setCollapsedByProjectPath] = useState<
    Record<string, boolean>
  >({});
  const [busyProjectPath, setBusyProjectPath] = useState<string | null>(null);
  const [busyWorkspaceKey, setBusyWorkspaceKey] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [openPathDialogOpen, setOpenPathDialogOpen] = useState(false);
  const [workspaceToClose, setWorkspaceToClose] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [closingWorkspaceId, setClosingWorkspaceId] = useState<string | null>(
    null,
  );
  const [
    currentProjectPath,
    currentProjectName,
    workspaces,
    activeWorkspaceId,
    recentProjects,
    workspaceDefaultById,
    workspaceBranchById,
    activeWorkspaceBranch,
    activeWorkspaceCwd,
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
    closeWorkspace,
    setLayout,
    fetchAllWorkspacePrStatuses,
    hydrateWorkspaces,
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
        state.workspaceBranchById[state.activeWorkspaceId] ?? "main",
        state.workspacePathById[state.activeWorkspaceId] ??
          state.projectPath ??
          undefined,
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
        state.closeWorkspace,
        state.setLayout,
        state.fetchAllWorkspacePrStatuses,
        state.hydrateWorkspaces,
      ] as const;
    }),
  );

  const projects = useMemo(() => {
    const currentProject = currentProjectPath
      ? ({
          projectPath: currentProjectPath,
          projectName: currentProjectName ?? "project",
          workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(workspaceDefaultById[workspace.id]),
            branch: workspaceBranchById[workspace.id],
          })),
          activeWorkspaceId,
          isCurrent: true,
        } satisfies ProjectSidebarView)
      : null;

    const rememberedProjects = recentProjects.map(
      (project) =>
        ({
          projectPath: project.projectPath,
          projectName: project.projectName,
          workspaces: project.workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(project.workspaceDefaultById[workspace.id]),
            branch: project.workspaceBranchById[workspace.id],
          })),
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
    workspaces,
  ]);
  const collapsedWorkspaceEntries = useMemo(
    () =>
      buildCollapsedWorkspaceEntries({
        projects,
        activeWorkspaceId,
      }),
    [activeWorkspaceId, projects],
  );
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
  const projectSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const workspaceSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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

  useEffect(() => {
    if (args.collapsed && reorderMode) {
      setReorderMode(false);
    }
  }, [args.collapsed, reorderMode]);

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
      if (
        args.workspaceId &&
        useAppStore.getState().activeWorkspaceId !== args.workspaceId
      ) {
        await switchWorkspace({ workspaceId: args.workspaceId });
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

  function handleProjectDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const projectPath = String(active.id);
    const fromIndex = projects.findIndex(
      (project) => project.projectPath === projectPath,
    );
    const toIndex = projects.findIndex(
      (project) => project.projectPath === String(over.id),
    );
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const direction = toIndex > fromIndex ? "down" : "up";
    const steps = Math.abs(toIndex - fromIndex);
    for (let step = 0; step < steps; step += 1) {
      moveProjectInList({ projectPath, direction });
    }
  }

  function handleWorkspaceDragEnd(args: {
    projectPath: string;
    event: DragEndEvent;
  }) {
    const { active, over } = args.event;
    if (!over || active.id === over.id) {
      return;
    }
    const project = projects.find(
      (item) => item.projectPath === args.projectPath,
    );
    if (!project) {
      return;
    }
    const workspaceId = String(active.id);
    const fromIndex = project.workspaces.findIndex(
      (workspace) => workspace.id === workspaceId,
    );
    const toIndex = project.workspaces.findIndex(
      (workspace) => workspace.id === String(over.id),
    );
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const direction = toIndex > fromIndex ? "down" : "up";
    const steps = Math.abs(toIndex - fromIndex);
    for (let step = 0; step < steps; step += 1) {
      moveWorkspaceInProjectList({
        projectPath: args.projectPath,
        workspaceId,
        direction,
      });
    }
  }

  return (
    <>
      <aside
        data-testid="project-workspace-sidebar"
        data-sidebar-artwork={sidebarArtworkMode}
        className={cn(
          `sidebar-liquid-glass ${UI_LAYER_CLASS.floatingChrome} hidden h-full shrink-0 overflow-hidden text-sidebar-foreground lg:flex lg:flex-col`,
          resolveSidebarArtworkClass({ mode: sidebarArtworkMode }),
          args.collapsed && "border-r border-sidebar-border/60",
        )}
        style={{
          width: `${args.collapsed ? COLLAPSED_PROJECT_SIDEBAR_WIDTH : args.width}px`,
          minWidth: `${args.collapsed ? COLLAPSED_PROJECT_SIDEBAR_WIDTH : args.width}px`,
          transition:
            args.animate !== false
              ? "width 200ms ease, min-width 200ms ease"
              : undefined,
        }}
      >
        <div
          className={cn(
            "border-b border-sidebar-border/55",
            args.collapsed ? "px-2 pb-3" : "flex h-12 items-center px-3",
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
              <div className="flex flex-col items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 w-10 rounded-md bg-background/35 p-0 hover:bg-background/50"
                      onClick={() => setOpenPathDialogOpen(true)}
                      aria-label="open-project"
                    >
                      <FolderOpen className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Open Project</TooltipContent>
                </Tooltip>
                <MemoryUsagePopover collapsed />
              </div>
            ) : (
              <div className="flex w-full items-center justify-end gap-2">
                <MemoryUsagePopover />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                      onClick={() =>
                        setLayout({
                          patch: { workspaceSidebarCollapsed: true },
                        })
                      }
                      aria-label="collapse-project-list"
                    >
                      <PanelLeft className="size-4" />
                    </Button>
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
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <TooltipProvider>
              <div className="flex flex-col items-center gap-2">
                {collapsedWorkspaceEntries.map((entry) => {
                  const entryKey = `${entry.projectPath}:${entry.workspaceId}`;
                  const shortcutLabel = workspaceShortcutLabels.get(entryKey);
                  const workspaceBusy = busyWorkspaceKey === entryKey;

                  return (
                    <div
                      key={entryKey}
                      className="flex w-full flex-col items-center"
                    >
                      {entry.startsProjectGroup ? (
                        <div
                          aria-hidden="true"
                          className="mb-2 h-px w-5 rounded-full bg-sidebar-border/70"
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
                        <button
                          type="button"
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-md border transition-colors",
                            entry.isActive
                              ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                              : "border-transparent bg-background/60 text-muted-foreground hover:border-border/70 hover:bg-secondary/70 hover:text-foreground",
                          )}
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
                          />
                        </button>
                      </WorkspaceHoverPreviewTooltip>
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
        ) : null}
        {!args.collapsed ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1.5">
            <TooltipProvider>
              <div
                className={cn(
                  "mb-1.5 flex items-center justify-between border-b border-sidebar-border/45 px-2",
                  PANEL_BAR_HEIGHT_CLASS,
                )}
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Projects
                </span>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0 text-muted-foreground hover:bg-background/20 hover:text-foreground"
                        onClick={() => setOpenPathDialogOpen(true)}
                        aria-label="open-project"
                      >
                        <FolderOpen className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Open Project</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 w-8 rounded-md p-0 text-muted-foreground hover:bg-background/20 hover:text-foreground",
                          reorderMode &&
                            "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                        )}
                        onClick={() => setReorderMode((current) => !current)}
                        aria-label="toggle-sidebar-reorder-mode"
                        aria-pressed={reorderMode}
                      >
                        <ArrowUpDown className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {reorderMode
                        ? "Finish reordering"
                        : "Reorder projects and workspaces"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              {projects.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                  No projects yet.
                </div>
              ) : (
                <>
                  <DndContext
                    sensors={projectSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleProjectDragEnd}
                  >
                    <SortableContext
                      items={projects.map((project) => project.projectPath)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {projects.map((project) => {
                          const collapsed =
                            collapsedByProjectPath[project.projectPath] ??
                            false;
                          const projectBusy =
                            busyProjectPath === project.projectPath;
                          const projectReorderingDisabled =
                            !reorderMode || projectBusy || projects.length < 2;

                          return (
                            <SortableSidebarItem
                              key={project.projectPath}
                              id={project.projectPath}
                              disabled={projectReorderingDisabled}
                              handleLabel={`reorder-project-${project.projectPath}`}
                              handleVisible={reorderMode}
                            >
                              {({ dragHandle, isDragging }) => (
                                <section
                                  className={cn(
                                    "sidebar-liquid-panel rounded-[20px] border border-sidebar-border/35 transition-colors",
                                    isDragging && "ring-1 ring-primary/20",
                                  )}
                                >
                                  <div className="flex items-center gap-1 px-1.5 py-1.5">
                                    {dragHandle}
                                    <div
                                      className={cn(
                                        "group/project-row flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-background/20 focus-within:bg-background/20",
                                      )}
                                    >
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="relative h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground"
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
                                          >
                                            {projectBusy ? (
                                              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                                            ) : (
                                              <>
                                                <FolderTree
                                                  className={cn(
                                                    "size-4 transition-all duration-200",
                                                    "group-hover/project-row:scale-75 group-hover/project-row:opacity-0",
                                                    "group-focus-within/project-row:scale-75 group-focus-within/project-row:opacity-0",
                                                  )}
                                                />
                                                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                  {collapsed ? (
                                                    <ChevronRight
                                                      className={cn(
                                                        "size-4 scale-75 opacity-0 transition-all duration-200",
                                                        "group-hover/project-row:scale-100 group-hover/project-row:opacity-100",
                                                        "group-focus-within/project-row:scale-100 group-focus-within/project-row:opacity-100",
                                                      )}
                                                    />
                                                  ) : (
                                                    <ChevronDown
                                                      className={cn(
                                                        "size-4 scale-75 opacity-0 transition-all duration-200",
                                                        "group-hover/project-row:scale-100 group-hover/project-row:opacity-100",
                                                        "group-focus-within/project-row:scale-100 group-focus-within/project-row:opacity-100",
                                                      )}
                                                    />
                                                  )}
                                                </span>
                                              </>
                                            )}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                          {collapsed
                                            ? "Expand project"
                                            : "Collapse project"}
                                        </TooltipContent>
                                      </Tooltip>
                                      <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate font-medium">
                                          {project.projectName}
                                        </span>
                                        <div
                                          className={cn(
                                            "flex shrink-0 items-center gap-0.5 transition-all duration-200",
                                            "pointer-events-none translate-x-1 opacity-0",
                                            "group-hover/project-row:pointer-events-auto group-hover/project-row:translate-x-0 group-hover/project-row:opacity-100",
                                            "group-focus-within/project-row:pointer-events-auto group-focus-within/project-row:translate-x-0 group-focus-within/project-row:opacity-100",
                                          )}
                                        >
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 rounded-md p-0"
                                                disabled={projectBusy}
                                                onClick={() =>
                                                  void handleCreateWorkspaceRequest(
                                                    project.projectPath,
                                                  )
                                                }
                                                aria-label={`new-workspace-${project.projectPath}`}
                                              >
                                                <Plus className="size-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">
                                              New workspace
                                            </TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 rounded-md p-0"
                                                disabled={projectBusy}
                                                onClick={() =>
                                                  void hydrateWorkspaces()
                                                }
                                                aria-label={`refresh-workspaces-${project.projectPath}`}
                                              >
                                                <RefreshCw className="size-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">
                                              Refresh workspaces
                                            </TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 rounded-md p-0"
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
                                              >
                                                <Settings className="size-3.5" />
                                              </Button>
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
                                    <div className="border-t border-sidebar-border/35 px-1.5 py-1.5">
                                      <DndContext
                                        sensors={workspaceSensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={(event) =>
                                          handleWorkspaceDragEnd({
                                            projectPath: project.projectPath,
                                            event,
                                          })
                                        }
                                      >
                                        <SortableContext
                                          items={project.workspaces.map(
                                            (workspace) => workspace.id,
                                          )}
                                          strategy={verticalListSortingStrategy}
                                        >
                                          <div className="space-y-1">
                                            {project.workspaces.map(
                                              (workspace) => {
                                                const workspaceShortcutLabel =
                                                  workspaceShortcutLabels.get(
                                                    `${project.projectPath}:${workspace.id}`,
                                                  );
                                                const workspaceBusy =
                                                  busyWorkspaceKey ===
                                                  `${project.projectPath}:${workspace.id}`;
                                                const isActive =
                                                  project.isCurrent &&
                                                  workspace.id ===
                                                    activeWorkspaceId;
                                                const workspaceReorderingDisabled =
                                                  !reorderMode ||
                                                  projectBusy ||
                                                  workspaceBusy ||
                                                  project.workspaces.length < 2;
                                                const canArchiveWorkspace =
                                                  project.isCurrent &&
                                                  !workspace.isDefault;
                                                const hasHoverActions = Boolean(
                                                  workspaceShortcutLabel ||
                                                  canArchiveWorkspace,
                                                );

                                                return (
                                                  <SortableSidebarItem
                                                    key={workspace.id}
                                                    id={workspace.id}
                                                    disabled={
                                                      workspaceReorderingDisabled
                                                    }
                                                    handleLabel={`reorder-workspace-${workspace.id}`}
                                                    handleVisible={reorderMode}
                                                  >
                                                    {({
                                                      dragHandle,
                                                      isDragging,
                                                    }) => (
                                                      <WorkspaceBorderBeam
                                                        workspaceId={
                                                          workspace.id
                                                        }
                                                      >
                                                      <div
                                                        className={cn(
                                                          "group/workspace-row relative flex items-center gap-1 rounded-lg border border-transparent bg-transparent transition-[background-color,border-color,box-shadow,color] hover:border-sidebar-border/45 hover:bg-background/20 hover:text-foreground hover:shadow-sm",
                                                          isActive &&
                                                            "border-sidebar-border/60 bg-background/24 text-foreground ring-1 ring-primary/20 shadow-sm backdrop-blur-sm",
                                                          isDragging &&
                                                            "border-sidebar-border/45 bg-background/22 shadow-sm",
                                                        )}
                                                      >
                                                        {dragHandle}
                                                        <WorkspaceHoverPreviewTooltip
                                                          workspaceId={
                                                            workspace.id
                                                          }
                                                          workspaceName={
                                                            workspace.name
                                                          }
                                                          branch={
                                                            workspace.branch
                                                          }
                                                          shortcutLabel={
                                                            workspaceShortcutLabel
                                                          }
                                                          side="right"
                                                        >
                                                          <button
                                                            type="button"
                                                            className={cn(
                                                              "flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm",
                                                            )}
                                                            onClick={() =>
                                                              void handleProjectWorkspaceOpen(
                                                                {
                                                                  projectPath:
                                                                    project.projectPath,
                                                                  workspaceId:
                                                                    workspace.id,
                                                                },
                                                              )
                                                            }
                                                          >
                                                            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
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
                                                                busy={
                                                                  workspaceBusy
                                                                }
                                                              />
                                                            </span>
                                                            <span
                                                              className={cn(
                                                                "min-w-0 flex-1 truncate",
                                                                isActive &&
                                                                  "font-medium text-foreground",
                                                              )}
                                                            >
                                                              {formatWorkspaceName(
                                                                workspace.name,
                                                                workspace.branch,
                                                              )}
                                                            </span>
                                                          </button>
                                                        </WorkspaceHoverPreviewTooltip>
                                                        <div className="relative shrink-0">
                                                          <WorkspaceRespondingCountBadge
                                                            workspaceId={
                                                              workspace.id
                                                            }
                                                            hasHoverActions={
                                                              hasHoverActions
                                                            }
                                                            isClosing={
                                                              closingWorkspaceId ===
                                                              workspace.id
                                                            }
                                                          />
                                                          {hasHoverActions ? (
                                                            <div
                                                              className={cn(
                                                                "absolute inset-y-0 right-0 flex items-center gap-1 pr-1 transition-opacity",
                                                                getWorkspaceHoverActionVisibilityClasses(
                                                                  {
                                                                    isClosing:
                                                                      closingWorkspaceId ===
                                                                      workspace.id,
                                                                  },
                                                                ),
                                                              )}
                                                            >
                                                              {workspaceShortcutLabel ? (
                                                                <WorkspaceShortcutChip
                                                                  modifier={
                                                                    workspaceShortcutModifierLabel
                                                                  }
                                                                  label={
                                                                    workspaceShortcutLabel
                                                                  }
                                                                  className="shrink-0"
                                                                />
                                                              ) : null}
                                                              {canArchiveWorkspace ? (
                                                                <Tooltip>
                                                                  <TooltipTrigger
                                                                    asChild
                                                                  >
                                                                    <Button
                                                                      type="button"
                                                                      variant="ghost"
                                                                      size="sm"
                                                                      className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:text-destructive focus-visible:text-destructive"
                                                                      disabled={
                                                                        closingWorkspaceId ===
                                                                        workspace.id
                                                                      }
                                                                      onClick={() =>
                                                                        setWorkspaceToClose(
                                                                          {
                                                                            id: workspace.id,
                                                                            name: workspace.name,
                                                                          },
                                                                        )
                                                                      }
                                                                      aria-label={`archive-workspace-${workspace.id}`}
                                                                    >
                                                                      {closingWorkspaceId ===
                                                                      workspace.id ? (
                                                                        <LoaderCircle className="size-3.5 animate-spin" />
                                                                      ) : (
                                                                        <Archive className="size-3.5" />
                                                                      )}
                                                                    </Button>
                                                                  </TooltipTrigger>
                                                                  <TooltipContent side="right">
                                                                    Archive
                                                                  </TooltipContent>
                                                                </Tooltip>
                                                              ) : null}
                                                            </div>
                                                          ) : null}
                                                        </div>
                                                      </div>
                                                      </WorkspaceBorderBeam>
                                                    )}
                                                  </SortableSidebarItem>
                                                );
                                              },
                                            )}
                                          </div>
                                        </SortableContext>
                                      </DndContext>
                                    </div>
                                  ) : null}
                                </section>
                              )}
                            </SortableSidebarItem>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                </>
              )}
            </TooltipProvider>
          </div>
        ) : null}
        <div
          className={cn(
            "border-t border-sidebar-border/55",
            args.collapsed ? "px-2 py-2" : "px-3 py-2",
          )}
        >
          <TooltipProvider>
            {args.collapsed ? (
              <div className="flex flex-col items-center gap-2">
                <StaveMuseTriggerButton />
                <StaveAppMenuButton
                  compact
                  onOpenCommandPalette={args.onOpenCommandPalette}
                  onOpenKeyboardShortcuts={args.onOpenKeyboardShortcuts}
                  onOpenSettings={() => args.onOpenSettings()}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 rounded-md p-0"
                      aria-label="open-settings"
                      onMouseEnter={args.onPreloadSettings}
                      onFocus={args.onPreloadSettings}
                      onClick={() => args.onOpenSettings()}
                    >
                      <Settings className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Settings</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StaveAppMenuButton
                    compact
                    onOpenCommandPalette={args.onOpenCommandPalette}
                    onOpenKeyboardShortcuts={args.onOpenKeyboardShortcuts}
                    onOpenSettings={() => args.onOpenSettings()}
                  />
                  <StaveMuseTriggerButton />
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 rounded-md p-0"
                      aria-label="open-settings"
                      onMouseEnter={args.onPreloadSettings}
                      onFocus={args.onPreloadSettings}
                      onClick={() => args.onOpenSettings()}
                    >
                      <Settings className="size-3.5" />
                    </Button>
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
        description={
          workspaceToClose
            ? `Archive workspace "${workspaceToClose.name}"? The associated git worktree will be permanently removed. Any uncommitted changes will be lost.`
            : ""
        }
        confirmLabel="Archive"
        loading={closingWorkspaceId !== null}
        onCancel={() => setWorkspaceToClose(null)}
        onConfirm={() => {
          if (!workspaceToClose) {
            return;
          }
          setClosingWorkspaceId(workspaceToClose.id);
          void closeWorkspace({ workspaceId: workspaceToClose.id }).finally(
            () => {
              setClosingWorkspaceId(null);
              setWorkspaceToClose(null);
            },
          );
        }}
      />
      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        activeBranch={activeWorkspaceBranch}
        defaultBranch={defaultBranch}
        cwd={activeWorkspaceCwd}
        defaultInitCommand={projectWorkspaceInitCommand}
        defaultUseRootNodeModulesSymlink={projectUseRootNodeModulesSymlink}
        onOpenChange={setCreateWorkspaceOpen}
        onCreateWorkspace={createWorkspace}
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
