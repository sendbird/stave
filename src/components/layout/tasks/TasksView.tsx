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
import {
  readTrackerTasksViewPreference,
  writeTrackerTasksViewPreference,
} from "@/lib/tracker-tasks/view-preference";
import { describeTrackerSources } from "@/lib/tracker-tasks/source-status";
import {
  TRACKER_SOURCE_IDS,
  type TrackerSourceId,
} from "@/lib/tracker-tasks/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
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
    });
  }, [filter.sources, filter.view, group, sort]);

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

  // Selection follows the list: a row that a refresh or a filter removed must
  // not keep the detail pane pinned to a ticket that is no longer visible.
  useEffect(() => {
    if (orderedKeys.length === 0) {
      if (selectedKey !== null) {
        setSelectedKey(null);
      }
      return;
    }
    if (!selectedKey || !orderedKeys.includes(selectedKey)) {
      setSelectedKey(orderedKeys[0] ?? null);
    }
  }, [orderedKeys, selectedKey]);

  const selectedItem = selectedKey
    ? (snapshot.itemByKey[selectedKey] ?? null)
    : null;
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
    orderedKeys,
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
      if (event.key === "Escape" && !event.defaultPrevented) {
        props.onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [kickoffKey, props]);

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
        hidden={orderedKeys.length === 0}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div
          className={cn(
            "min-h-0 overflow-hidden",
            // On a narrow window the detail pane replaces the list rather
            // than squeezing both into an unreadable pair of columns.
            selectedItem ? "hidden md:block" : "block",
          )}
        >
          {orderedKeys.length === 0 ? (
            <TrackerTasksEmptyListState
              summaries={summaries}
              hasFilters={countActiveTrackerTaskFilters(filter) > 0}
              refreshing={refreshing}
              onReset={() => setFilter(createTrackerTaskFilter(filter.view))}
              onRefresh={() => refresh()}
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
          />
        ) : null}
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
