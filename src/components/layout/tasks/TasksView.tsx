import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  setTrackerTasksSurfaceVisible,
  useTrackerTasksClientState,
} from "@/lib/tracker-tasks/client-state";
import {
  countActiveTrackerTaskFilters,
  createTrackerTaskFilter,
  type TrackerTaskFilter,
} from "@/lib/tracker-tasks/filter";
import { trackerTaskKey } from "@/lib/tracker-tasks/client-store";
import {
  readTrackerTasksViewPreference,
  writeTrackerTasksViewPreference,
} from "@/lib/tracker-tasks/view-preference";
import type { TrackerTaskLayout } from "@/lib/tracker-tasks/layout";
import { describeTrackerSources } from "@/lib/tracker-tasks/source-status";
import {
  TRACKER_SOURCE_IDS,
  type TrackerSourceId,
} from "@/lib/tracker-tasks/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { TasksBoard } from "./TasksBoard";
import { TasksPeekPanel } from "./TasksPeekPanel";
import { TasksSurfaceHeader } from "./TasksSurfaceHeader";
import { TasksToolbar } from "./TasksToolbar";
import { TrackerTaskDetailPane } from "./TrackerTaskDetailPane";
import { TrackerTaskKickoffSheet } from "./TrackerTaskKickoffSheet";
import { TrackerTaskList } from "./TrackerTaskList";
import {
  TrackerSourceStatusStrip,
  TrackerTasksEmptyListState,
  TrackerTasksUnavailableState,
} from "./TrackerTasksEmptyState";
import { openTrackerTaskInBrowser } from "./tracker-task-ui";
import { useTrackerTaskActions } from "./useTrackerTaskActions";
import { useTrackerTaskListPipeline } from "./useTrackerTaskListPipeline";
import { useTrackerTasksKeyboard } from "./useTrackerTasksKeyboard";

/** How often the due-date labels are recomputed. */
const CLOCK_TICK_MS = 60_000;

/**
 * How long the header spinner is held after a manual refresh.
 *
 * The per-source `syncing` flag is the real signal, but it arrives on a push a
 * moment later; without this the button looks inert on the click that started
 * the refresh.
 */
const REFRESH_FEEDBACK_MS = 800;

export function TasksView(props: { onClose: () => void }) {
  const snapshot = useTrackerTasksClientState();
  const [
    activeWorkspaceId,
    workspaces,
    refreshIntervalSeconds,
    defaultView,
    messageFontSize,
    messageCodeFontSize,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspaces,
          state.settings.trackerTasks.refreshIntervalSeconds,
          state.settings.trackerTasks.defaultView,
          state.settings.messageFontSize,
          state.settings.messageCodeFontSize,
        ] as const,
    ),
  );

  // Read once: the stored view state seeds the surface, and a later write from
  // another window must not yank the list out from under the reader.
  const [preference] = useState(() => readTrackerTasksViewPreference());
  const [filter, setFilter] = useState<TrackerTaskFilter>(() => ({
    ...createTrackerTaskFilter(preference.view ?? defaultView),
    sources: [...preference.sources],
  }));
  const [group, setGroup] = useState(preference.group);
  const [sort, setSort] = useState(preference.sort);
  const [layout, setLayout] = useState<TrackerTaskLayout>(preference.layout);
  const [peekWidth, setPeekWidth] = useState(preference.peekWidth);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<string[]>([]);
  const [kickoffKey, setKickoffKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const actions = useTrackerTaskActions({ closeSurface: props.onClose });
  const supported = Boolean(window.api?.trackerTasks);

  useEffect(() => {
    const interval = window.setInterval(
      () => setNowMs(Date.now()),
      CLOCK_TICK_MS,
    );
    return () => window.clearInterval(interval);
  }, []);

  // Background polling is only worth its round trips while somebody is looking.
  useEffect(() => {
    setTrackerTasksSurfaceVisible(true);
    return () => setTrackerTasksSurfaceVisible(false);
  }, []);

  useEffect(() => {
    writeTrackerTasksViewPreference({
      view: filter.view,
      group,
      sort,
      sources: filter.sources,
      layout,
      peekWidth,
    });
  }, [filter.sources, filter.view, group, layout, peekWidth, sort]);

  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const pipeline = useTrackerTaskListPipeline({
    allItems: snapshot.allItems,
    linksByKey: snapshot.linksByKey,
    filter,
    group,
    sort,
    collapsedGroupIds,
    now,
  });
  const { orderedKeys } = pipeline;
  const boardItems = useMemo(
    () => pipeline.groups.flatMap((entry) => entry.items),
    [pipeline.groups],
  );
  const layoutKeys = useMemo(
    () =>
      layout === "board"
        ? boardItems.map((item) =>
            trackerTaskKey(item.task.source, item.task.ref),
          )
        : orderedKeys,
    [boardItems, layout, orderedKeys],
  );

  // Selection follows the visible set. Opening a ticket is explicit: do not
  // pin the peek to the first row just because the list loaded.
  useEffect(() => {
    if (selectedKey !== null && !layoutKeys.includes(selectedKey)) {
      setSelectedKey(null);
    }
  }, [layoutKeys, selectedKey]);

  const selectedItem = selectedKey
    ? (snapshot.itemByKey[selectedKey] ?? null)
    : null;
  const selectedIndex = selectedKey ? layoutKeys.indexOf(selectedKey) : -1;
  const kickoffItem = kickoffKey
    ? (snapshot.itemByKey[kickoffKey] ?? null)
    : null;
  const activeWorkspaceName =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ??
    null;

  const summaries = useMemo(
    () => describeTrackerSources(snapshot.syncBySource),
    [snapshot.syncBySource],
  );
  const sourceStatuses = useMemo(
    () =>
      TRACKER_SOURCE_IDS.map((source) => snapshot.syncBySource[source]).filter(
        (status): status is NonNullable<typeof status> => status != null,
      ),
    [snapshot.syncBySource],
  );

  const refresh = (source?: TrackerSourceId) => {
    setRefreshing(true);
    actions.refresh(source);
    window.setTimeout(() => setRefreshing(false), REFRESH_FEEDBACK_MS);
  };

  const openStaveTaskForKey = (key: string) => {
    const links = snapshot.linksByKey[key] ?? [];
    const link = links[links.length - 1];
    if (link) {
      actions.openStaveTask({
        workspaceId: link.workspaceId,
        taskId: link.staveTaskId,
      });
    }
  };

  const attachForKey = (key: string) => {
    const task = snapshot.itemByKey[key]?.task;
    if (task) {
      actions.attachToActiveWorkspace(task);
    }
  };

  useTrackerTasksKeyboard({
    orderedKeys: layoutKeys,
    selectedKey,
    onSelect: setSelectedKey,
    onKickoff: setKickoffKey,
    onOpenExternal: (key) => {
      const url = snapshot.itemByKey[key]?.task.url;
      if (url) {
        void window.api?.shell?.openExternal?.({ url }).catch(() => undefined);
      }
    },
    onRefresh: () => refresh(),
    onFocusSearch: () => searchInputRef.current?.focus(),
    enabled: kickoffKey === null,
  });

  // Escape leaves the surface, but only while nothing layered owns the key.
  useEffect(() => {
    if (kickoffKey !== null) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      if (selectedKey !== null) {
        event.preventDefault();
        setSelectedKey(null);
        return;
      }
      props.onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [kickoffKey, props, selectedKey]);

  if (!supported) {
    return <TrackerTasksUnavailableState />;
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <TasksSurfaceHeader
        summaries={summaries}
        statuses={sourceStatuses}
        refreshIntervalSeconds={refreshIntervalSeconds}
        now={now}
        refreshing={refreshing}
        onRefresh={() => refresh()}
        onClose={props.onClose}
      />

      <TasksToolbar
        filter={filter}
        onFilterChange={setFilter}
        group={group}
        onGroupChange={setGroup}
        sort={sort}
        onSortChange={setSort}
        layout={layout}
        onLayoutChange={setLayout}
        projectOptions={pipeline.projectOptions}
        labelOptions={pipeline.labelOptions}
        viewCounts={pipeline.viewCounts}
        searchInputRef={searchInputRef}
      />
      <TrackerSourceStatusStrip
        summaries={summaries}
        onRetry={(source) => refresh(source)}
        // With an empty list the empty state already lists every source, so the
        // strip would say the same thing twice.
        hidden={layoutKeys.length === 0}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-hidden",
            selectedItem ? "max-md:hidden" : null,
          )}
        >
          {layoutKeys.length === 0 ? (
            <TrackerTasksEmptyListState
              summaries={summaries}
              hasFilters={countActiveTrackerTaskFilters(filter) > 0}
              refreshing={refreshing}
              onReset={() => setFilter(createTrackerTaskFilter(filter.view))}
              onRefresh={() => refresh()}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1">
                {layout === "board" ? (
                  <TasksBoard
                    items={boardItems}
                    selectedKey={selectedKey}
                    onSelect={setSelectedKey}
                  />
                ) : (
                  <TrackerTaskList
                    groups={pipeline.groups}
                    now={now}
                    selectedKey={selectedKey}
                    collapsedGroupIds={collapsedGroupIds}
                    onToggleGroup={(groupId) =>
                      setCollapsedGroupIds((current) =>
                        current.includes(groupId)
                          ? current.filter((entry) => entry !== groupId)
                          : [...current, groupId],
                      )
                    }
                    onSelect={setSelectedKey}
                    onKickoff={setKickoffKey}
                    onAttach={attachForKey}
                    onOpenStaveTask={openStaveTaskForKey}
                    attachTargetLabel={activeWorkspaceName}
                  />
                )}
              </div>
              {sourceStatuses.some((status) => status.truncated) ? (
                <p className="shrink-0 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
                  Showing {layoutKeys.length} loaded tickets. A tracker had more
                  than one refresh can load.
                </p>
              ) : null}
            </div>
          )}
        </div>
        <TasksPeekPanel
          dock="split"
          open={selectedItem !== null}
          title={selectedItem?.task.key ?? "Ticket"}
          width={peekWidth}
          onWidthChange={setPeekWidth}
          onClose={() => setSelectedKey(null)}
          onExpand={
            selectedItem
              ? () => openTrackerTaskInBrowser(selectedItem.task.url)
              : undefined
          }
          onNavigate={
            selectedIndex >= 0
              ? (direction) => {
                  const next =
                    direction === "prev"
                      ? selectedIndex - 1
                      : selectedIndex + 1;
                  const key = layoutKeys[next];
                  if (key) {
                    setSelectedKey(key);
                  }
                }
              : undefined
          }
          prevDisabled={selectedIndex <= 0}
          nextDisabled={
            selectedIndex < 0 || selectedIndex >= layoutKeys.length - 1
          }
        >
          {selectedItem ? (
            <TrackerTaskDetailPane
              item={selectedItem}
              now={now}
              messageFontSize={messageFontSize}
              messageCodeFontSize={messageCodeFontSize}
              onKickoff={setKickoffKey}
              onAttach={attachForKey}
              onOpenStaveTask={openStaveTaskForKey}
              attachTargetLabel={activeWorkspaceName}
              embedded
            />
          ) : null}
        </TasksPeekPanel>
      </div>

      <TrackerTaskKickoffSheet
        item={kickoffItem}
        onClose={() => setKickoffKey(null)}
        onKickedOff={(result) => {
          if (kickoffItem) {
            void actions.completeKickoff({ task: kickoffItem.task, result });
          }
        }}
      />
    </div>
  );
}
