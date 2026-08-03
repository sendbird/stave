import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  FolderTree,
  Radar,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { FleetNeedsInbox } from "@/components/layout/FleetNeedsInbox";
import type { FleetTaskControlTarget } from "@/components/layout/FleetTaskControlPanel";
import {
  getFleetTaskKey,
  getFleetWorkspaceKey,
  MemoizedFleetWorkspaceCard,
  type FleetWorkspaceCardView,
  type FleetWorkspaceCardVisibility,
} from "@/components/layout/FleetWorkspaceCard";
import { useFleetAttentionProjection } from "@/components/layout/useFleetAttentionProjection";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
} from "@/components/ui";
import type { FleetNeedItem } from "@/lib/fleet/attention-projection";
import {
  compareFleetWorkspaceActivity,
  FLEET_BOARD_FILTER_OPTIONS,
  isFleetBoardFilterActive,
  type FleetBoardFilter,
} from "@/lib/fleet/workspace-activity";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

type FleetProjectView = {
  projectPath: string;
  projectName: string;
  isCurrent: boolean;
  workspaces: FleetWorkspaceCardView[];
};

const EMPTY_NEEDS: FleetNeedItem[] = [];
const EMPTY_VISIBILITY: Record<string, FleetWorkspaceCardVisibility> = {};

/** How often dormancy is re-evaluated against the wall clock. */
const FLEET_CLOCK_TICK_MS = 60_000;

function useFleetProjects() {
  const [
    currentProjectPath,
    currentProjectName,
    workspaces,
    recentProjects,
    workspaceDefaultById,
    workspaceBranchById,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.projectPath,
          state.projectName,
          state.workspaces,
          state.recentProjects,
          state.workspaceDefaultById,
          state.workspaceBranchById,
        ] as const,
    ),
  );

  return useMemo(() => {
    const currentProject = currentProjectPath
      ? ({
          projectPath: currentProjectPath,
          projectName: currentProjectName ?? "project",
          isCurrent: true,
          workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(workspaceDefaultById[workspace.id]),
            branch: workspaceBranchById[workspace.id],
          })),
        } satisfies FleetProjectView)
      : null;

    const rememberedProjects = recentProjects.map(
      (project) =>
        ({
          projectPath: project.projectPath,
          projectName: project.projectName,
          isCurrent: project.projectPath === currentProjectPath,
          workspaces: project.workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(project.workspaceDefaultById[workspace.id]),
            branch: project.workspaceBranchById[workspace.id],
          })),
        }) satisfies FleetProjectView,
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
    currentProjectName,
    currentProjectPath,
    recentProjects,
    workspaceBranchById,
    workspaceDefaultById,
    workspaces,
  ]);
}

/**
 * Put live work first and dormant workspaces last, falling back to the stored
 * order for cards that have not reported yet so the board does not reshuffle
 * while it settles.
 */
function orderProjectWorkspaces(
  project: FleetProjectView,
  visibilityByCardKey: Record<string, FleetWorkspaceCardVisibility>,
) {
  return project.workspaces
    .map((workspace, index) => ({
      workspace,
      index,
      reported:
        visibilityByCardKey[
          getFleetWorkspaceKey(project.projectPath, workspace.id)
        ],
    }))
    .sort((left, right) => {
      if (!left.reported || !right.reported) {
        return left.index - right.index;
      }
      const order = compareFleetWorkspaceActivity(
        left.reported,
        right.reported,
      );
      return order !== 0 ? order : left.index - right.index;
    })
    .map((entry) => entry.workspace);
}

/** Re-render on a coarse clock so dormancy thresholds age without a reload. */
function useCoarseClock() {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), FLEET_CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return nowMs;
}

export function FleetView() {
  const projects = useFleetProjects();
  const [
    focusTaskAttention,
    closeFleetView,
    openProject,
    switchWorkspace,
    openNotificationContext,
    markNotificationRead,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.focusTaskAttention,
          state.closeFleetView,
          state.openProject,
          state.switchWorkspace,
          state.openNotificationContext,
          state.markNotificationRead,
        ] as const,
    ),
  );
  const {
    items: attentionTargets,
    blockingItems,
    needsByWorkspaceId,
  } = useFleetAttentionProjection();

  const nowMs = useCoarseClock();
  const [visibilityByCardKey, setVisibilityByCardKey] =
    useState<Record<string, FleetWorkspaceCardVisibility>>(EMPTY_VISIBILITY);
  const [collapsedProjects, setCollapsedProjects] = useState<
    Record<string, boolean>
  >({});
  const [boardFilter, setBoardFilter] = useState<FleetBoardFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTaskKey, setExpandedTaskKey] = useState<string | null>(null);
  const [selectedNeedId, setSelectedNeedId] = useState<string | null>(null);
  const [busyNeedId, setBusyNeedId] = useState<string | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const allCardKeys = useMemo(
    () =>
      projects.flatMap((project) =>
        project.workspaces.map((workspace) =>
          getFleetWorkspaceKey(project.projectPath, workspace.id),
        ),
      ),
    [projects],
  );
  const allCardKeySet = useMemo(() => new Set(allCardKeys), [allCardKeys]);

  useEffect(() => {
    setVisibilityByCardKey((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => allCardKeySet.has(key)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [allCardKeySet]);

  useEffect(() => {
    if (
      selectedNeedId &&
      !attentionTargets.some((target) => target.id === selectedNeedId)
    ) {
      setSelectedNeedId(null);
    }
  }, [attentionTargets, selectedNeedId]);

  const handleVisibilityChange = useCallback(
    (cardKey: string, visibility: FleetWorkspaceCardVisibility) => {
      setVisibilityByCardKey((current) => {
        const existing = current[cardKey];
        const sameTasks =
          existing?.taskKeys.length === visibility.taskKeys.length &&
          existing.taskKeys.every(
            (taskKey, index) => taskKey === visibility.taskKeys[index],
          );
        if (
          existing?.visible === visibility.visible &&
          existing.isPhantom === visibility.isPhantom &&
          existing.activity === visibility.activity &&
          existing.activityAt === visibility.activityAt &&
          sameTasks
        ) {
          return current;
        }
        return { ...current, [cardKey]: visibility };
      });
    },
    [],
  );

  const handleOpenTask = useCallback(
    (target: { projectPath: string; workspaceId: string; taskId: string }) => {
      setExpandedTaskKey(null);
      setSelectedNeedId(null);
      void focusTaskAttention(target);
    },
    [focusTaskAttention],
  );

  const handleOpenWorkspace = useCallback(
    (target: { projectPath: string; workspaceId: string }) => {
      void (async () => {
        if (useAppStore.getState().projectPath !== target.projectPath) {
          await openProject({ projectPath: target.projectPath });
        }
        if (useAppStore.getState().activeWorkspaceId !== target.workspaceId) {
          await switchWorkspace({ workspaceId: target.workspaceId });
        }
      })();
    },
    [openProject, switchWorkspace],
  );

  const handleToggleTaskControl = useCallback(
    (target: FleetTaskControlTarget) => {
      const taskKey = getFleetTaskKey(
        target.projectPath,
        target.workspaceId,
        target.taskId,
      );
      setSelectedNeedId(null);
      setExpandedTaskKey((current) => (current === taskKey ? null : taskKey));
    },
    [],
  );

  const openNeed = useCallback(
    (target: FleetNeedItem) => {
      if (target.taskId) {
        setExpandedTaskKey(null);
        setSelectedNeedId((current) =>
          current === target.id ? null : target.id,
        );
        return;
      }
      // PR-only needs navigate directly and have no inline control panel. Do
      // not select them: selection widens the rail, which would otherwise stay
      // expanded with no control surface to justify the extra space.
      setSelectedNeedId(null);
      setBusyNeedId(target.id);
      void (async () => {
        if (target.notificationId) {
          await openNotificationContext({
            notificationId: target.notificationId,
            targetSurface: "task",
          });
          return;
        }
        if (useAppStore.getState().projectPath !== target.projectPath) {
          await openProject({ projectPath: target.projectPath });
        }
        if (useAppStore.getState().activeWorkspaceId !== target.workspaceId) {
          await switchWorkspace({ workspaceId: target.workspaceId });
        }
      })().finally(() => {
        setBusyNeedId((current) => (current === target.id ? null : current));
      });
    },
    [openNotificationContext, openProject, switchWorkspace],
  );

  const markNeedRead = useCallback(
    (target: FleetNeedItem) => {
      if (!target.notificationId) {
        return;
      }
      setBusyNeedId(target.id);
      void markNotificationRead({ id: target.notificationId }).finally(() => {
        setBusyNeedId((current) => (current === target.id ? null : current));
      });
    },
    [markNotificationRead],
  );

  const dismissNeed = useCallback(
    (target: FleetNeedItem) => {
      if (!target.notificationId) {
        return;
      }
      setBusyNeedId(target.id);
      // Resolving (not just reading) is what makes the notification eligible
      // for expiry-based pruning and removes it from the attention projection.
      void markNotificationRead({
        id: target.notificationId,
        resolvedAt: new Date().toISOString(),
      }).finally(() => {
        setBusyNeedId((current) => (current === target.id ? null : current));
      });
    },
    [markNotificationRead],
  );

  const openNeedPr = useCallback((target: FleetNeedItem) => {
    if (!target.prUrl) {
      return;
    }
    void window.api?.shell?.openExternal?.({ url: target.prUrl });
  }, []);

  const openNextNeed = useCallback(() => {
    const queue = blockingItems.length > 0 ? blockingItems : attentionTargets;
    if (queue.length === 0) {
      return;
    }
    const selectedIndex = queue.findIndex(
      (target) => target.id === selectedNeedId,
    );
    const nextTarget =
      queue[selectedIndex >= 0 ? (selectedIndex + 1) % queue.length : 0];
    if (nextTarget) {
      openNeed(nextTarget);
    }
  }, [attentionTargets, blockingItems, openNeed, selectedNeedId]);

  const clearFilters = useCallback(() => {
    setBoardFilter("active");
    setSearchQuery("");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      if (event.key === "Escape") {
        const filterInput = filterInputRef.current;
        if (
          document.activeElement === filterInput &&
          filterInput?.value.trim()
        ) {
          event.preventDefault();
          setSearchQuery("");
          return;
        }
        closeFleetView();
        return;
      }
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (!isTyping && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openNextNeed();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeFleetView, openNextNeed]);

  const isFilterActive = isFleetBoardFilterActive({
    filter: boardFilter,
    query: searchQuery,
  });
  const settled = allCardKeys.every(
    (cardKey) => cardKey in visibilityByCardKey,
  );
  const reported = allCardKeys
    .map((cardKey) => visibilityByCardKey[cardKey])
    .filter((entry): entry is FleetWorkspaceCardVisibility => Boolean(entry));
  const visibleCount = reported.filter((entry) => entry.visible).length;
  const liveCount = reported.filter(
    (entry) => entry.visible && entry.activity === "live",
  ).length;
  // Only meaningful when nothing else is narrowing the board. With a search
  // query in play a hidden dormant workspace may simply not match the query,
  // and "Show dormant" would not bring it back.
  const hiddenDormantCount = searchQuery.trim()
    ? 0
    : reported.filter(
        (entry) =>
          !entry.visible && !entry.isPhantom && entry.activity === "dormant",
      ).length;
  const suppressedDefaultCount = reported.filter(
    (entry) => entry.isPhantom,
  ).length;
  const isBoardEmpty = settled && visibleCount === 0 && projects.length > 0;

  const toggleProject = useCallback((projectPath: string) => {
    setCollapsedProjects((current) => ({
      ...current,
      [projectPath]: !current[projectPath],
    }));
  }, []);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-border/65 bg-[linear-gradient(110deg,color-mix(in_oklch,var(--surface)_92%,var(--background)),var(--background))] px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Radar className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <h1 className="font-heading truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
            Fleet View
          </h1>
          <span className="truncate text-[11px] text-muted-foreground">
            {liveCount > 0
              ? `${liveCount} workspace${liveCount === 1 ? "" : "s"} in flight`
              : "No agent turns in flight"}
            {visibleCount > 0 ? ` · ${visibleCount} shown` : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={blockingItems.length > 0 ? "default" : "ghost"}
            className="h-7"
            disabled={attentionTargets.length === 0}
            onClick={openNextNeed}
          >
            {blockingItems.length > 0 ? (
              <ArrowRight className="size-3.5" aria-hidden="true" />
            ) : (
              <ShieldCheck className="size-3.5" aria-hidden="true" />
            )}
            {blockingItems.length > 0
              ? "Open next item"
              : attentionTargets.length > 0
                ? "Review queue"
                : "All clear"}
            {blockingItems.length > 0 ? (
              <kbd className="ml-1 rounded-[0.25rem] border border-primary-foreground/20 bg-primary-foreground/10 px-1 font-mono text-[9px]">
                N
              </kbd>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label="close-fleet-view"
            title="Close Fleet View"
            onClick={closeFleetView}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <div
        data-fleet-view-root="true"
        className="flex min-h-0 flex-1 flex-col sm:flex-row"
      >
        {/* On narrow screens the inbox becomes a compact top rail; from the
            small breakpoint up it remains a layout-level column and widens
            while an inline task control surface is open. */}
        <aside
          className={cn(
            "h-40 min-h-0 w-full shrink-0 border-b border-border/65 sm:h-full sm:border-b-0",
            selectedNeedId ? "sm:w-80 lg:w-112" : "sm:w-64 lg:w-80",
          )}
        >
          <FleetNeedsInbox
            items={attentionTargets}
            selectedNeedId={selectedNeedId}
            busyNeedId={busyNeedId}
            onOpen={openNeed}
            onOpenTask={handleOpenTask}
            onMarkRead={markNeedRead}
            onDismiss={dismissNeed}
            onOpenPr={openNeedPr}
            onClearSelection={() => setSelectedNeedId(null)}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-background/85 px-4 py-2">
            <div className="flex flex-wrap items-center gap-0.5 rounded-md bg-muted/45 p-0.5">
              {FLEET_BOARD_FILTER_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={boardFilter === option.value ? "secondary" : "ghost"}
                  className={cn(
                    "h-6.5 px-2 text-[11px]",
                    boardFilter === option.value &&
                      "border-border/55 bg-background/85 shadow-[0_1px_2px_oklch(0_0_0/0.08)]",
                  )}
                  aria-pressed={boardFilter === option.value}
                  title={option.hint}
                  onClick={() => setBoardFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="relative ml-auto w-full min-w-48 max-w-xs sm:w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={filterInputRef}
                data-fleet-filter-input="true"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Find workspace, branch, or task…"
                aria-label="Search workspaces, branches, or tasks"
                className="h-7 border-transparent bg-muted/35 pl-8 pr-8 text-xs hover:border-border/70"
              />
              {searchQuery ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                  title="Clear search"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="size-3.5" />
                </Button>
              ) : null}
            </div>
            {isFilterActive ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6.5 px-2 text-[11px]"
                onClick={clearFilters}
              >
                Reset
              </Button>
            ) : null}
          </div>

          <div
            data-fleet-board-scroll="true"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {projects.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FolderTree />
                  </EmptyMedia>
                  <EmptyTitle>No Workspaces</EmptyTitle>
                  <EmptyDescription>
                    Open a project or workspace to see agent activity here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                {isBoardEmpty ? (
                  <div className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-foreground">
                      Nothing active
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hiddenDormantCount > 0
                        ? `${hiddenDormantCount} dormant workspace${hiddenDormantCount === 1 ? "" : "s"} hidden.`
                        : "No workspaces match the current filter."}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 rounded-sm"
                      onClick={
                        hiddenDormantCount > 0
                          ? () => setBoardFilter("all")
                          : clearFilters
                      }
                    >
                      {hiddenDormantCount > 0
                        ? "Show dormant"
                        : "Reset filters"}
                    </Button>
                  </div>
                ) : null}

                {projects.map((project) => {
                  const isCollapsed = Boolean(
                    collapsedProjects[project.projectPath],
                  );
                  const projectCardKeys = project.workspaces.map((workspace) =>
                    getFleetWorkspaceKey(project.projectPath, workspace.id),
                  );
                  const projectVisibleCount = projectCardKeys.filter(
                    (cardKey) => visibilityByCardKey[cardKey]?.visible,
                  ).length;
                  const hideProject = settled && projectVisibleCount === 0;

                  return (
                    <section
                      key={project.projectPath}
                      className="border-b border-border/50 last:border-b-0"
                      hidden={hideProject}
                    >
                      <button
                        type="button"
                        className="sticky top-0 z-10 flex min-h-9 w-full items-center gap-1.5 border-b border-border/40 bg-background/95 px-4 py-1.5 text-left backdrop-blur transition-colors hover:bg-accent/15 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55"
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${project.projectName} project`}
                        onClick={() => toggleProject(project.projectPath)}
                      >
                        {isCollapsed ? (
                          <ChevronRight
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronDown
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate text-xs font-semibold text-foreground">
                          {project.projectName}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {projectVisibleCount}
                        </span>
                        {project.isCurrent ? (
                          <span className="ml-1 shrink-0 rounded-sm border border-border/60 px-1 text-[9px] text-muted-foreground">
                            Current
                          </span>
                        ) : null}
                      </button>
                      <div
                        hidden={isCollapsed}
                        // Width-driven rather than breakpoint-driven: the board
                        // sits between two sidebars, so viewport breakpoints
                        // would size cards against space the board never has.
                        className="grid grid-cols-[repeat(auto-fill,minmax(min(17rem,100%),1fr))] items-start gap-2.5 px-4 py-3"
                      >
                        {orderProjectWorkspaces(
                          project,
                          visibilityByCardKey,
                        ).map((workspace) => {
                          const cardKey = getFleetWorkspaceKey(
                            project.projectPath,
                            workspace.id,
                          );
                          return (
                            <MemoizedFleetWorkspaceCard
                              key={cardKey}
                              cardKey={cardKey}
                              projectPath={project.projectPath}
                              projectName={project.projectName}
                              workspace={workspace}
                              isCurrentProject={project.isCurrent}
                              filter={boardFilter}
                              searchQuery={searchQuery}
                              nowMs={nowMs}
                              needs={
                                needsByWorkspaceId[workspace.id] ?? EMPTY_NEEDS
                              }
                              expandedTaskKey={expandedTaskKey}
                              onOpenTask={handleOpenTask}
                              onOpenWorkspace={handleOpenWorkspace}
                              onToggleTaskControl={handleToggleTaskControl}
                              onVisibilityChange={handleVisibilityChange}
                            />
                          );
                        })}
                      </div>
                    </section>
                  );
                })}

                {hiddenDormantCount > 0 || suppressedDefaultCount > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-[11px] text-muted-foreground">
                    <CircleDashed className="size-3.5" aria-hidden="true" />
                    {hiddenDormantCount > 0 ? (
                      <span>
                        {hiddenDormantCount} dormant workspace
                        {hiddenDormantCount === 1 ? "" : "s"} hidden
                      </span>
                    ) : null}
                    {suppressedDefaultCount > 0 ? (
                      <span title="Remembered projects always carry a default workspace row. These have no tasks, no messages, and no recorded activity.">
                        {hiddenDormantCount > 0 ? "· " : ""}
                        {suppressedDefaultCount} unused default
                        {suppressedDefaultCount === 1 ? "" : "s"} suppressed
                      </span>
                    ) : null}
                    {hiddenDormantCount > 0 && boardFilter !== "all" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setBoardFilter("all")}
                      >
                        Show dormant
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
