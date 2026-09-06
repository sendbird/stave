import { Button as AdsButton } from "@/components/ads/components/Button";
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
import { FleetAttentionInbox } from "@/components/layout/FleetAttentionInbox";
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
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  compareFleetWorkspaceActivity,
  FLEET_BOARD_FILTER_OPTIONS,
  isFleetBoardFilterActive,
  type FleetBoardFilter,
} from "@/lib/fleet/workspace-activity";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { sx } from "@/components/ads/utils/stylex";
import { fleetStyles as styles } from "./fleet-view.styles";
import { useAppStore } from "@/store/app.store";
import { setResultReviewed } from "@/lib/reviews/result-review-client";
import { toast } from "@/lib/notifications/toast";

type FleetProjectView = {
  projectPath: string;
  projectName: string;
  isCurrent: boolean;
  workspaces: FleetWorkspaceCardView[];
};

const EMPTY_NEEDS: FleetAttentionItem[] = [];
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
    attentionItemsByWorkspaceId,
    resultReviewError,
    resultReviewTotal,
    resultReviewHasMore,
    refreshResultReviews,
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
  const [selectedAttentionId, setSelectedAttentionId] = useState<string | null>(
    null,
  );
  const [busyAttentionId, setBusyAttentionId] = useState<string | null>(null);
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
      selectedAttentionId &&
      !attentionTargets.some((target) => target.id === selectedAttentionId)
    ) {
      setSelectedAttentionId(null);
    }
  }, [attentionTargets, selectedAttentionId]);

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
      setSelectedAttentionId(null);
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
      setSelectedAttentionId(null);
      setExpandedTaskKey((current) => (current === taskKey ? null : taskKey));
    },
    [],
  );

  const openAttentionItem = useCallback(
    (target: FleetAttentionItem) => {
      if (target.taskId) {
        setExpandedTaskKey(null);
        setSelectedAttentionId((current) =>
          current === target.id ? null : target.id,
        );
        return;
      }
      // PR-only attention items navigate directly and have no inline control panel. Do
      // not select them: selection widens the rail, which would otherwise stay
      // expanded with no control surface to justify the extra space.
      setSelectedAttentionId(null);
      setBusyAttentionId(target.id);
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
        setBusyAttentionId((current) =>
          current === target.id ? null : current,
        );
      });
    },
    [openNotificationContext, openProject, switchWorkspace],
  );

  const markNeedRead = useCallback(
    (target: FleetAttentionItem) => {
      if (!target.notificationId && !target.resultReview) {
        return;
      }
      setBusyAttentionId(target.id);
      const result = target.resultReview;
      const action = result
        ? setResultReviewed({
            projectPath: result.projectPath,
            workspaceId: result.workspaceId,
            taskId: result.taskId,
            turnId: result.turnId,
            reviewed: true,
          })
        : markNotificationRead({ id: target.notificationId! });
      void action
        .catch((error: unknown) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Review was not saved. Retry.",
          );
        })
        .finally(() => {
          setBusyAttentionId((current) =>
            current === target.id ? null : current,
          );
        });
    },
    [markNotificationRead],
  );

  const dismissNeed = useCallback(
    (target: FleetAttentionItem) => {
      if (!target.notificationId) {
        return;
      }
      setBusyAttentionId(target.id);
      // Resolving (not just reading) is what makes the notification eligible
      // for expiry-based pruning and removes it from the attention projection.
      void markNotificationRead({
        id: target.notificationId,
        resolvedAt: new Date().toISOString(),
      }).finally(() => {
        setBusyAttentionId((current) =>
          current === target.id ? null : current,
        );
      });
    },
    [markNotificationRead],
  );

  const openAttentionItemPr = useCallback((target: FleetAttentionItem) => {
    if (!target.prUrl) {
      return;
    }
    void window.api?.shell?.openExternal?.({ url: target.prUrl });
  }, []);

  const openNextAttentionItem = useCallback(() => {
    const queue = blockingItems.length > 0 ? blockingItems : attentionTargets;
    if (queue.length === 0) {
      return;
    }
    const selectedIndex = queue.findIndex(
      (target) => target.id === selectedAttentionId,
    );
    const nextTarget =
      queue[selectedIndex >= 0 ? (selectedIndex + 1) % queue.length : 0];
    if (nextTarget) {
      openAttentionItem(nextTarget);
    }
  }, [attentionTargets, blockingItems, openAttentionItem, selectedAttentionId]);

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
        openNextAttentionItem();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeFleetView, openNextAttentionItem]);

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
    <div className={sx(styles.root)}>
      <header className={sx(styles.header)}>
        <div className={sx(styles.headerIdentity)}>
          <Radar className={sx(styles.headerIcon)} aria-hidden="true" />
          <h1 className={sx(styles.headerTitle)}>Fleet View</h1>
          <span className={sx(styles.headerSummary)}>
            {liveCount > 0
              ? `${liveCount} workspace${liveCount === 1 ? "" : "s"} in flight`
              : "No agent turns in flight"}
            {visibleCount > 0 ? ` · ${visibleCount} shown` : ""}
          </span>
        </div>
        <div className={sx(styles.headerActions)}>
          <Button
            type="button"
            size="sm"
            variant={blockingItems.length > 0 ? "default" : "ghost"}
            xstyle={styles.headerAction}
            disabled={attentionTargets.length === 0}
            onClick={openNextAttentionItem}
          >
            {blockingItems.length > 0 ? (
              <ArrowRight className={sx(styles.actionIcon)} aria-hidden="true" />
            ) : (
              <ShieldCheck
                className={sx(styles.actionIcon)}
                aria-hidden="true"
              />
            )}
            {blockingItems.length > 0
              ? "Open next item"
              : attentionTargets.length > 0
                ? "Review queue"
                : "All clear"}
            {blockingItems.length > 0 ? (
              <kbd className={sx(styles.shortcut)}>N</kbd>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            xstyle={styles.headerIconAction}
            aria-label="close-fleet-view"
            title="Close Fleet View"
            onClick={closeFleetView}
          >
            <X className={sx(styles.closeIcon)} />
          </Button>
        </div>
      </header>

      {resultReviewError ? (
        <div
          role="alert"
          className={sx(styles.notice)}
        >
          <span>{resultReviewError}</span>
          <Button size="sm" variant="outline" onClick={refreshResultReviews}>
            Retry result reviews
          </Button>
        </div>
      ) : resultReviewHasMore ? (
        <p
          role="status"
          className={sx(styles.noticeMuted)}
        >
          Showing the latest 200 of {resultReviewTotal} pending results. Open a
          task to review its full result history.
        </p>
      ) : null}
      <div
        data-fleet-view-root="true"
        className={sx(styles.body)}
      >
        {/* On narrow screens the inbox becomes a compact top rail; from the
            small breakpoint up it remains a layout-level column and widens
            while an inline task control surface is open. */}
        <aside
          className={sx(
            styles.inbox,
            selectedAttentionId ? styles.inboxExpanded : styles.inboxRested,
          )}
        >
          <FleetAttentionInbox
            items={attentionTargets}
            selectedAttentionId={selectedAttentionId}
            busyAttentionId={busyAttentionId}
            onOpen={openAttentionItem}
            onOpenTask={handleOpenTask}
            onMarkRead={markNeedRead}
            onDismiss={dismissNeed}
            onOpenPr={openAttentionItemPr}
            onClearSelection={() => setSelectedAttentionId(null)}
          />
        </aside>

        <div className={sx(styles.board)}>
          <div className={sx(styles.toolbar)}>
            <div className={sx(styles.filterGroup)}>
              {FLEET_BOARD_FILTER_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={boardFilter === option.value ? "secondary" : "ghost"}
                  xstyle={[
                    styles.filterChip,
                    boardFilter === option.value && styles.filterChipActive,
                  ]}
                  aria-pressed={boardFilter === option.value}
                  title={option.hint}
                  onClick={() => setBoardFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className={sx(styles.searchField)}>
              <Search className={sx(styles.searchIcon)} aria-hidden="true" />
              <Input
                ref={filterInputRef}
                data-fleet-filter-input="true"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Find workspace, branch, or task…"
                aria-label="Search workspaces, branches, or tasks"
                xstyle={styles.searchInput}
              />
              {searchQuery ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  xstyle={styles.searchClear}
                  aria-label="Clear search"
                  title="Clear search"
                  onClick={() => setSearchQuery("")}
                >
                  <X className={sx(styles.actionIcon)} />
                </Button>
              ) : null}
            </div>
            {isFilterActive ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                xstyle={styles.filterChip}
                onClick={clearFilters}
              >
                Reset
              </Button>
            ) : null}
          </div>

          <div
            data-fleet-board-scroll="true"
            className={sx(styles.scroller)}
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
                  <div className={sx(styles.boardEmpty)}>
                    <p className={sx(styles.boardEmptyTitle)}>Nothing active</p>
                    <p className={sx(styles.boardEmptyHint)}>
                      {hiddenDormantCount > 0
                        ? `${hiddenDormantCount} dormant workspace${hiddenDormantCount === 1 ? "" : "s"} hidden.`
                        : "No workspaces match the current filter."}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      xstyle={styles.boardEmptyAction}
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
                      className={sx(styles.projectSection)}
                      hidden={hideProject}
                    >
                      <AdsButton
                        layout="host"
                        type="button"
                        xstyle={[styles.projectHeader, focusRing.ringInset]}
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${project.projectName} project`}
                        onClick={() => toggleProject(project.projectPath)}
                      >
                        {isCollapsed ? (
                          <ChevronRight
                            className={sx(styles.projectChevron)}
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronDown
                            className={sx(styles.projectChevron)}
                            aria-hidden="true"
                          />
                        )}
                        <span className={sx(styles.projectName)}>
                          {project.projectName}
                        </span>
                        <span className={sx(styles.projectCount)}>
                          {projectVisibleCount}
                        </span>
                        {project.isCurrent ? (
                          <span className={sx(styles.projectCurrent)}>
                            Current
                          </span>
                        ) : null}
                      </AdsButton>
                      <div
                        hidden={isCollapsed}
                        // Width-driven rather than breakpoint-driven: the board
                        // sits between two sidebars, so viewport breakpoints
                        // would size cards against space the board never has.
                        //
                        // Capped at three columns per row: past that the cards
                        // are too narrow to read a task list in, and a wide
                        // monitor otherwise fans out to five or six. The track
                        // floor is the larger of the 17rem card minimum and an
                        // exact third of the row (minus the two 0.625rem gaps),
                        // so wide rows land on exactly three and narrow rows
                        // still collapse to two and then one.
                        className={sx(styles.cardGrid)}
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
                              attentionItems={
                                attentionItemsByWorkspaceId[workspace.id] ??
                                EMPTY_NEEDS
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
                  <div className={sx(styles.footnote)}>
                    <CircleDashed
                      className={sx(styles.footnoteIcon)}
                      aria-hidden="true"
                    />
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
                        xstyle={styles.footnoteAction}
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
