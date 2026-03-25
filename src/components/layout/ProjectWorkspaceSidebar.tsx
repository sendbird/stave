import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowUpDown, ChevronDown, ChevronRight, Folder, FolderOpen, GripVertical, LoaderCircle, PanelLeft, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { CreateWorkspaceDialog } from "@/components/layout/CreateWorkspaceDialog";
import { OpenPathDialog } from "@/components/layout/OpenPathDialog";
import { StaveAppMenuButton } from "@/components/layout/StaveAppMenuButton";
import { WorkspaceIdentityMark } from "@/components/layout/workspace-accent";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, WaveIndicator } from "@/components/ui";
import { getProviderWaveToneClass } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

interface ProjectSidebarView {
  projectPath: string;
  projectName: string;
  workspaces: Array<{ id: string; name: string; isDefault: boolean; branch?: string }>;
  activeWorkspaceId: string;
  isCurrent: boolean;
}

function formatWorkspaceName(name: string, branch?: string) {
  if (name.toLowerCase() === "default workspace") {
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

const COLLAPSED_PROJECT_SIDEBAR_WIDTH = 64;

interface SortableSidebarItemProps {
  id: string;
  disabled?: boolean;
  handleLabel: string;
  handleVisible?: boolean;
  children: (args: { dragHandle: ReactNode | null; isDragging: boolean }) => ReactNode;
}

function SortableSidebarItem(args: SortableSidebarItemProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
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
                : "cursor-grab hover:border-border/80 hover:bg-card/90 hover:text-foreground active:cursor-grabbing"
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

export function ProjectWorkspaceSidebar(args: { width: number; collapsed: boolean }) {
  const [collapsedByProjectPath, setCollapsedByProjectPath] = useState<Record<string, boolean>>({});
  const [busyProjectPath, setBusyProjectPath] = useState<string | null>(null);
  const [busyWorkspaceKey, setBusyWorkspaceKey] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [openPathDialogOpen, setOpenPathDialogOpen] = useState(false);
  const [projectToRemove, setProjectToRemove] = useState<{ projectPath: string; projectName: string } | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [
    currentProjectPath,
    currentProjectName,
    workspaces,
    activeWorkspaceId,
    recentProjects,
    workspaceDefaultById,
    workspaceBranchById,
    workspaceRuntimeCacheById,
    tasks,
    activeTurnIdsByTask,
    activeWorkspaceBranch,
    activeWorkspaceCwd,
    newWorkspaceInitCommand,
    createProject,
    openProjectFromPath,
    openProject,
    removeProjectFromList,
    moveProjectInList,
    switchWorkspace,
    moveWorkspaceInProjectList,
    createWorkspace,
    deleteWorkspace,
    setLayout,
  ] = useAppStore(useShallow((state) => [
    state.projectPath,
    state.workspaceRootName,
    state.workspaces,
    state.activeWorkspaceId,
    state.recentProjects,
    state.workspaceDefaultById,
    state.workspaceBranchById,
    state.workspaceRuntimeCacheById,
    state.tasks,
    state.activeTurnIdsByTask,
    state.workspaceBranchById[state.activeWorkspaceId] ?? "main",
    state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? undefined,
    state.settings.newWorkspaceInitCommand,
    state.createProject,
    state.openProjectFromPath,
    state.openProject,
    state.removeProjectFromList,
    state.moveProjectInList,
    state.switchWorkspace,
    state.moveWorkspaceInProjectList,
    state.createWorkspace,
    state.deleteWorkspace,
    state.setLayout,
  ] as const));

  const projects = useMemo(() => {
    const currentProject = currentProjectPath
      ? {
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
        } satisfies ProjectSidebarView
      : null;

    const rememberedProjects = recentProjects.map((project) => ({
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
      } satisfies ProjectSidebarView));

    if (!currentProject) {
      return rememberedProjects;
    }

    const hasCurrentProject = rememberedProjects.some((project) => project.projectPath === currentProjectPath);
    if (!hasCurrentProject) {
      return [...rememberedProjects, currentProject];
    }

    return rememberedProjects.map((project) => (
      project.projectPath === currentProjectPath ? currentProject : project
    ));
  }, [activeWorkspaceId, currentProjectName, currentProjectPath, recentProjects, workspaceBranchById, workspaceDefaultById, workspaces]);
  const collapsedWorkspaceEntries = useMemo(() => projects.flatMap((project) => (
    project.workspaces.map((workspace) => ({
      projectPath: project.projectPath,
      projectName: project.projectName,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      isDefault: workspace.isDefault,
      branch: workspace.branch,
      isActive: project.isCurrent && workspace.id === activeWorkspaceId,
    }))
  )), [activeWorkspaceId, projects]);
  const projectSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const workspaceSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
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

  function getWorkspaceRuntimeState(workspaceId: string) {
    return workspaceId === activeWorkspaceId
      ? { tasks, activeTurnIdsByTask }
      : workspaceRuntimeCacheById[workspaceId];
  }

  function getWorkspaceRespondingTasks(workspaceId: string) {
    const runtimeState = getWorkspaceRuntimeState(workspaceId);
    if (!runtimeState) {
      return [];
    }

    return runtimeState.tasks.filter((task) => Boolean(runtimeState.activeTurnIdsByTask[task.id]));
  }

  function getWorkspaceRespondingTaskCount(workspaceId: string) {
    return getWorkspaceRespondingTasks(workspaceId).length;
  }

  function getWorkspaceRespondingToneClass(workspaceId: string) {
    const providers = Array.from(new Set(getWorkspaceRespondingTasks(workspaceId).map((task) => task.provider)));
    if (providers.length !== 1) {
      return "text-primary";
    }
    const providerId = providers[0];
    return providerId ? getProviderWaveToneClass({ providerId }) : "text-primary";
  }

  async function handleProjectWorkspaceOpen(args: { projectPath: string; workspaceId?: string }) {
    const workspaceKey = args.workspaceId ? `${args.projectPath}:${args.workspaceId}` : null;
    setBusyProjectPath(args.projectPath);
    setBusyWorkspaceKey(workspaceKey);
    try {
      if (args.projectPath !== useAppStore.getState().projectPath) {
        await openProject({ projectPath: args.projectPath });
      }
      if (args.workspaceId && useAppStore.getState().activeWorkspaceId !== args.workspaceId) {
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
    const fromIndex = projects.findIndex((project) => project.projectPath === projectPath);
    const toIndex = projects.findIndex((project) => project.projectPath === String(over.id));
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const direction = toIndex > fromIndex ? "down" : "up";
    const steps = Math.abs(toIndex - fromIndex);
    for (let step = 0; step < steps; step += 1) {
      moveProjectInList({ projectPath, direction });
    }
  }

  function handleWorkspaceDragEnd(args: { projectPath: string; event: DragEndEvent }) {
    const { active, over } = args.event;
    if (!over || active.id === over.id) {
      return;
    }
    const project = projects.find((item) => item.projectPath === args.projectPath);
    if (!project) {
      return;
    }
    const workspaceId = String(active.id);
    const fromIndex = project.workspaces.findIndex((workspace) => workspace.id === workspaceId);
    const toIndex = project.workspaces.findIndex((workspace) => workspace.id === String(over.id));
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
        className="hidden h-full shrink-0 border-r border-border/70 bg-card/80 lg:flex lg:flex-col"
        style={{
          width: `${args.collapsed ? COLLAPSED_PROJECT_SIDEBAR_WIDTH : args.width}px`,
          minWidth: `${args.collapsed ? COLLAPSED_PROJECT_SIDEBAR_WIDTH : args.width}px`,
        }}
      >
        <div className={cn("border-b border-border/70", args.collapsed ? "px-2 py-3" : "flex h-12 items-center px-3")}>
          <TooltipProvider>
            {args.collapsed ? (
              <div className="flex flex-col items-center gap-2">
                <StaveAppMenuButton compact />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 w-10 rounded-md bg-background/70 p-0 hover:bg-secondary/70"
                      onClick={() => setOpenPathDialogOpen(true)}
                      aria-label="open-project"
                    >
                      <FolderOpen className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Open Project</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                      onClick={() => setLayout({ patch: { taskListCollapsed: false } })}
                      aria-label="expand-project-list"
                    >
                      <PanelLeft className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expand Project List</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="flex w-full items-center justify-between gap-2">
                <StaveAppMenuButton compact />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                      onClick={() => setLayout({ patch: { taskListCollapsed: true } })}
                      aria-label="collapse-project-list"
                    >
                      <PanelLeft className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Collapse Project List</TooltipContent>
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
                  const workspaceBusy = busyWorkspaceKey === `${entry.projectPath}:${entry.workspaceId}`;
                  const respondingTaskCount = getWorkspaceRespondingTaskCount(entry.workspaceId);
                  const isResponding = respondingTaskCount > 0;
                  const respondingToneClass = getWorkspaceRespondingToneClass(entry.workspaceId);

                  return (
                    <Tooltip key={`${entry.projectPath}:${entry.workspaceId}`}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-md border transition-colors",
                            entry.isActive
                              ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                              : "border-transparent bg-background/60 text-muted-foreground hover:border-border/70 hover:bg-secondary/70 hover:text-foreground"
                          )}
                          onClick={() => void handleProjectWorkspaceOpen({
                            projectPath: entry.projectPath,
                            workspaceId: entry.workspaceId,
                          })}
                          aria-label={`collapsed-workspace-${entry.workspaceId}`}
                        >
                          {workspaceBusy ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : isResponding ? (
                            <WaveIndicator className={cn("gap-px", respondingToneClass)} barClassName="h-3 w-0.5 rounded-[2px]" />
                          ) : (
                            <WorkspaceIdentityMark workspaceName={entry.workspaceName} isDefault={entry.isDefault} />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[220px]">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{formatWorkspaceName(entry.workspaceName, entry.branch)}</p>
                          <p className="text-xs text-muted-foreground">{entry.projectName}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
        ) : null}
        {!args.collapsed ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <TooltipProvider>
              <div className="mb-3 flex items-center justify-between rounded-md border border-border/60 bg-card/70 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Projects</span>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0"
                        onClick={() => setOpenPathDialogOpen(true)}
                        aria-label="open-project"
                      >
                        <FolderOpen className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Open Project</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 w-8 rounded-md p-0",
                          reorderMode && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        )}
                        onClick={() => setReorderMode((current) => !current)}
                        aria-label="toggle-sidebar-reorder-mode"
                        aria-pressed={reorderMode}
                      >
                        <ArrowUpDown className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{reorderMode ? "Finish reordering" : "Reorder projects and workspaces"}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              {projects.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                  No projects yet.
                </div>
              ) : (
                <>
                  <DndContext sensors={projectSensors} collisionDetection={closestCenter} onDragEnd={handleProjectDragEnd}>
                    <SortableContext items={projects.map((project) => project.projectPath)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                      {projects.map((project) => {
                        const collapsed = collapsedByProjectPath[project.projectPath] ?? false;
                        const projectBusy = busyProjectPath === project.projectPath;
                        const projectReorderingDisabled = !reorderMode || projectBusy || projects.length < 2;

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
                                  "rounded-md border border-border/70 bg-background/70 transition-colors",
                                  isDragging && "ring-1 ring-primary/20"
                                )}
                              >
                                <div className="flex items-center gap-1 px-1.5 py-1.5">
                                  {dragHandle}
                                  <div
                                    className={cn(
                                      "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/70"
                                    )}
                                  >
                                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                                    <span className="truncate font-medium">{project.projectName}</span>
                                    {projectBusy ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
                                  </div>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 rounded-md p-0"
                                        disabled={projectBusy}
                                        onClick={() => void handleCreateWorkspaceRequest(project.projectPath)}
                                        aria-label={`new-workspace-${project.projectPath}`}
                                      >
                                        <Plus className="size-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">New workspace</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 rounded-md p-0 text-muted-foreground hover:text-destructive"
                                        disabled={projectBusy}
                                        onClick={() => setProjectToRemove({
                                          projectPath: project.projectPath,
                                          projectName: project.projectName,
                                        })}
                                        aria-label={`remove-project-${project.projectPath}`}
                                      >
                                        <Trash2 className="size-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">Remove from Stave</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 rounded-md p-0"
                                        onClick={() => {
                                          setCollapsedByProjectPath((current) => ({
                                            ...current,
                                            [project.projectPath]: !collapsed,
                                          }));
                                        }}
                                        aria-label={`toggle-project-${project.projectPath}`}
                                      >
                                        {collapsed ? (
                                          <ChevronRight className="size-4" />
                                        ) : (
                                          <ChevronDown className="size-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">{collapsed ? "Expand project" : "Collapse project"}</TooltipContent>
                                  </Tooltip>
                                </div>
                                {!collapsed ? (
                                  <div className="border-t border-border/60 px-1.5 py-1.5">
                                    <DndContext
                                      sensors={workspaceSensors}
                                      collisionDetection={closestCenter}
                                      onDragEnd={(event) => handleWorkspaceDragEnd({ projectPath: project.projectPath, event })}
                                    >
                                      <SortableContext items={project.workspaces.map((workspace) => workspace.id)} strategy={verticalListSortingStrategy}>
                                        <div className="space-y-1">
                                          {project.workspaces.map((workspace) => {
                                            const workspaceBusy = busyWorkspaceKey === `${project.projectPath}:${workspace.id}`;
                                            const respondingTaskCount = getWorkspaceRespondingTaskCount(workspace.id);
                                            const isResponding = respondingTaskCount > 0;
                                            const respondingToneClass = getWorkspaceRespondingToneClass(workspace.id);
                                            const isActive = project.isCurrent && workspace.id === activeWorkspaceId;
                                            const workspaceReorderingDisabled = !reorderMode || projectBusy || workspaceBusy || project.workspaces.length < 2;

                                            return (
                                              <SortableSidebarItem
                                                key={workspace.id}
                                                id={workspace.id}
                                                disabled={workspaceReorderingDisabled}
                                                handleLabel={`reorder-workspace-${workspace.id}`}
                                                handleVisible={reorderMode}
                                              >
                                                {({ dragHandle, isDragging }) => (
                                                  <div className={cn("flex items-center gap-1", isDragging && "rounded-md bg-secondary/40")}>
                                                    {dragHandle}
                                                    <button
                                                      type="button"
                                                      className={cn(
                                                        "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-secondary/70",
                                                        isActive && "bg-primary/10 text-foreground ring-1 ring-primary/30 shadow-sm"
                                                      )}
                                                      onClick={() => void handleProjectWorkspaceOpen({
                                                        projectPath: project.projectPath,
                                                        workspaceId: workspace.id,
                                                      })}
                                                    >
                                                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                                        {isResponding ? (
                                                          <WaveIndicator
                                                            className={cn("gap-px", respondingToneClass)}
                                                            barClassName="h-3 w-0.5 rounded-[2px]"
                                                          />
                                                        ) : (
                                                          <WorkspaceIdentityMark workspaceName={workspace.name} isDefault={workspace.isDefault} />
                                                        )}
                                                      </span>
                                                      <span className="min-w-0 flex-1 truncate">{formatWorkspaceName(workspace.name, workspace.branch)}</span>
                                                      {isResponding ? (
                                                        <span className="shrink-0 rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary">
                                                          {respondingTaskCount}
                                                        </span>
                                                      ) : null}
                                                      {workspaceBusy ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
                                                    </button>
                                                    {project.isCurrent && !workspace.isDefault ? (
                                                      <Tooltip>
                                                        <TooltipTrigger asChild>
                                                          <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 rounded-md p-0 text-muted-foreground hover:text-destructive"
                                                            disabled={deletingWorkspaceId === workspace.id}
                                                            onClick={() => setWorkspaceToDelete({
                                                              id: workspace.id,
                                                              name: workspace.name,
                                                            })}
                                                            aria-label={`delete-workspace-${workspace.id}`}
                                                          >
                                                            {deletingWorkspaceId === workspace.id ? (
                                                              <LoaderCircle className="size-3.5 animate-spin" />
                                                            ) : (
                                                              <X className="size-3.5" />
                                                            )}
                                                          </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right">Close workspace</TooltipContent>
                                                      </Tooltip>
                                                    ) : null}
                                                  </div>
                                                )}
                                              </SortableSidebarItem>
                                            );
                                          })}
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
      </aside>
      <ConfirmDialog
        open={Boolean(projectToRemove)}
        title="Remove Project"
        description={projectToRemove ? `Remove "${projectToRemove.projectName}" from Stave's project list? This does not delete files on disk.` : ""}
        confirmLabel="Remove Project"
        onCancel={() => setProjectToRemove(null)}
        onConfirm={() => {
          if (!projectToRemove) {
            return;
          }
          void removeProjectFromList({ projectPath: projectToRemove.projectPath });
          setProjectToRemove(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(workspaceToDelete)}
        title="Close Workspace"
        description={workspaceToDelete ? `Close workspace "${workspaceToDelete.name}"? The associated git worktree will be permanently removed. Any uncommitted changes will be lost.` : ""}
        confirmLabel="Close Workspace"
        loading={deletingWorkspaceId !== null}
        onCancel={() => setWorkspaceToDelete(null)}
        onConfirm={() => {
          if (!workspaceToDelete) {
            return;
          }
          setDeletingWorkspaceId(workspaceToDelete.id);
          void deleteWorkspace({ workspaceId: workspaceToDelete.id }).finally(() => {
            setDeletingWorkspaceId(null);
            setWorkspaceToDelete(null);
          });
        }}
      />
      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        activeBranch={activeWorkspaceBranch}
        cwd={activeWorkspaceCwd}
        defaultInitCommand={newWorkspaceInitCommand}
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
