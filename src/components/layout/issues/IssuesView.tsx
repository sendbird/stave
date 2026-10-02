import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  setTrackerIssuesSurfaceVisible,
  useTrackerIssuesClientState,
} from "@/lib/tracker-issues/client-state";
import {
  countActiveTrackerIssueFilters,
  createTrackerIssueFilter,
  type TrackerIssueFilter,
} from "@/lib/tracker-issues/filter";
import { trackerIssueKey } from "@/lib/tracker-issues/client-store";
import {
  readTrackerIssuesViewPreference,
  writeTrackerIssuesViewPreference,
} from "@/lib/tracker-issues/view-preference";
import type { TrackerIssueLayout } from "@/lib/tracker-issues/layout";
import {
  describeTrackerSources,
  hasPendingTrackerSource,
  hasProducingTrackerSource,
} from "@/lib/tracker-issues/source-status";
import {
  TRACKER_SOURCE_IDS,
  type TrackerSourceId,
} from "@/lib/tracker-issues/types";
import { sx } from "@/components/ads/utils/stylex";
import { hasProposedWork, type ProposedMission } from "@/lib/missions/proposed";
import { summarizeWatching } from "@/lib/playbooks/starts-when";
import { useAppStore } from "@/store/app.store";
import { useProposalsStore } from "@/store/proposals-store";
import { IssuesBoard } from "./IssuesBoard";
import { IssuesPeekPanel } from "./IssuesPeekPanel";
import { IssuesSurfaceHeader } from "./IssuesSurfaceHeader";
import { IssuesToolbar, type IssuesSection } from "./IssuesToolbar";
import { ProposedMissionsPanel } from "./ProposedMissionsPanel";
import { TrackerIssueDetailPane } from "./TrackerIssueDetailPane";
import { TrackerIssueKickoffSheet } from "./TrackerIssueKickoffSheet";
import { TrackerIssueList } from "./TrackerIssueList";
import {
  TrackerSourceStatusStrip,
  TrackerIssuesEmptyListState,
  TrackerIssuesUnavailableState,
} from "./TrackerIssuesEmptyState";
import { openTrackerIssueInBrowser } from "./tracker-issue-ui";
import { useProposalActions } from "./useProposalActions";
import { useTrackerIssueActions } from "./useTrackerIssueActions";
import { useTrackerIssueListPipeline } from "./useTrackerIssueListPipeline";
import { useTrackerIssuesKeyboard } from "./useTrackerIssuesKeyboard";
import { taskLayoutStyles } from "./issues-layout.stylex";

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

export function IssuesView(props: { onClose: () => void }) {
  const snapshot = useTrackerIssuesClientState();
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
          state.settings.trackerIssues.refreshIntervalSeconds,
          state.settings.trackerIssues.defaultView,
          state.settings.messageFontSize,
          state.settings.messageCodeFontSize,
        ] as const,
    ),
  );

  // Read once: the stored view state seeds the surface, and a later write from
  // another window must not yank the list out from under the reader.
  const [preference] = useState(() => readTrackerIssuesViewPreference());
  const [filter, setFilter] = useState<TrackerIssueFilter>(() => ({
    ...createTrackerIssueFilter(preference.view ?? defaultView),
    sources: [...preference.sources],
  }));
  const [group, setGroup] = useState(preference.group);
  const [sort, setSort] = useState(preference.sort);
  const [layout, setLayout] = useState<TrackerIssueLayout>(preference.layout);
  const [peekWidth, setPeekWidth] = useState(preference.peekWidth);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<string[]>([]);
  const [kickoffKey, setKickoffKey] = useState<string | null>(null);
  /** The proposal a kickoff fulfils, when it started from Proposed. */
  const [kickoffProposal, setKickoffProposal] =
    useState<ProposedMission | null>(null);
  const [section, setSection] = useState<IssuesSection>(() =>
    useProposalsStore.getState().consumeProposedTabRequest()
      ? "proposed"
      : "issues",
  );
  const pendingProposals = useProposalsStore((state) => state.pending);
  const recentProposals = useProposalsStore((state) => state.recent);
  const proposalsLoaded = useProposalsStore((state) => state.loaded);
  const proposedTabRequested = useProposalsStore(
    (state) => state.proposedTabRequested,
  );
  const playbooks = useAppStore((state) => state.settings.playbooks);
  const watching = useMemo(() => summarizeWatching(playbooks), [playbooks]);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const actions = useTrackerIssueActions({ closeSurface: props.onClose });
  const supported = Boolean(window.api?.trackerIssues);
  const proposalActions = useProposalActions({
    items: snapshot.allItems,
    closeSurface: props.onClose,
    openKickoff: (itemKey, proposal) => {
      setKickoffProposal(proposal);
      setKickoffKey(itemKey);
    },
    openStaveTask: actions.openStaveTask,
  });

  // "N proposed" in Fleet asks for this tab, also while Issues is open.
  useEffect(() => {
    if (
      proposedTabRequested &&
      useProposalsStore.getState().consumeProposedTabRequest()
    ) {
      setSection("proposed");
    }
  }, [proposedTabRequested]);

  useEffect(() => {
    const interval = window.setInterval(
      () => setNowMs(Date.now()),
      CLOCK_TICK_MS,
    );
    return () => window.clearInterval(interval);
  }, []);

  // Background polling is only worth its round trips while somebody is looking.
  useEffect(() => {
    setTrackerIssuesSurfaceVisible(true);
    return () => setTrackerIssuesSurfaceVisible(false);
  }, []);

  useEffect(() => {
    writeTrackerIssuesViewPreference({
      view: filter.view,
      group,
      sort,
      sources: filter.sources,
      layout,
      peekWidth,
    });
  }, [filter.sources, filter.view, group, layout, peekWidth, sort]);

  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const pipeline = useTrackerIssueListPipeline({
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
            trackerIssueKey(item.task.source, item.task.ref),
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

  // A cold start on the board draws the column shape with placeholder cards
  // instead of a centred spinner that then jumps into a five-column board.
  // Only the pending case qualifies: "no tracker configured" and "no match" are
  // verdicts, and a skeleton would promise rows that are never coming.
  const boardLoading =
    layout === "board" &&
    layoutKeys.length === 0 &&
    !hasProducingTrackerSource(summaries) &&
    hasPendingTrackerSource(summaries);

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

  useTrackerIssuesKeyboard({
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
    enabled: kickoffKey === null && section === "issues",
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
    return <TrackerIssuesUnavailableState />;
  }

  return (
    <div className={sx(taskLayoutStyles.surface)}>
      <IssuesSurfaceHeader
        summaries={summaries}
        statuses={sourceStatuses}
        refreshIntervalSeconds={refreshIntervalSeconds}
        now={now}
        refreshing={refreshing}
        onRefresh={() => refresh()}
        onClose={props.onClose}
      />

      <IssuesToolbar
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
        section={section}
        onSectionChange={(next) => {
          setSection(next);
          setSelectedKey(null);
        }}
        showProposed={
          section === "proposed" ||
          hasProposedWork({
            pendingCount: pendingProposals.length,
            recentCount: recentProposals.length,
            watching,
          })
        }
        proposedCount={pendingProposals.length}
      />
      {section === "proposed" ? (
        <div className={sx(taskLayoutStyles.content)}>
          <ProposedMissionsPanel
            pending={pendingProposals}
            recent={recentProposals}
            loaded={proposalsLoaded}
            now={now}
            watching={watching}
            startTarget={proposalActions.startTarget}
            onStart={proposalActions.start}
            onDismiss={proposalActions.dismiss}
            onOpenLink={(url) =>
              void window.api?.shell
                ?.openExternal?.({ url })
                .catch(() => undefined)
            }
            onOpenMission={proposalActions.openMission}
          />
        </div>
      ) : (
        <>
          <TrackerSourceStatusStrip
            summaries={summaries}
            onRetry={(source) => refresh(source)}
            // With an empty list the empty state already lists every source, so the
            // strip would say the same thing twice. A loading board is the
            // exception: it says nothing about the sources, so the strip stays.
            hidden={layoutKeys.length === 0 && !boardLoading}
          />
          <div className={sx(taskLayoutStyles.content)}>
            <div
              className={sx(
                taskLayoutStyles.listPane,
                !selectedItem && taskLayoutStyles.listPaneVisible,
              )}
            >
              {boardLoading ? (
                <IssuesBoard
                  items={[]}
                  now={now}
                  selectedKey={null}
                  onSelect={setSelectedKey}
                  onKickoff={setKickoffKey}
                  onAttach={attachForKey}
                  onOpenStaveTask={openStaveTaskForKey}
                  attachTargetLabel={activeWorkspaceName}
                  loading
                />
              ) : layoutKeys.length === 0 ? (
                <TrackerIssuesEmptyListState
                  summaries={summaries}
                  hasFilters={countActiveTrackerIssueFilters(filter) > 0}
                  refreshing={refreshing}
                  onReset={() =>
                    setFilter(createTrackerIssueFilter(filter.view))
                  }
                  onRefresh={() => refresh()}
                />
              ) : (
                <div className={sx(taskLayoutStyles.listColumn)}>
                  <div className={sx(taskLayoutStyles.listBody)}>
                    {layout === "board" ? (
                      <IssuesBoard
                        items={boardItems}
                        now={now}
                        selectedKey={selectedKey}
                        onSelect={setSelectedKey}
                        onKickoff={setKickoffKey}
                        onAttach={attachForKey}
                        onOpenStaveTask={openStaveTaskForKey}
                        attachTargetLabel={activeWorkspaceName}
                      />
                    ) : (
                      <TrackerIssueList
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
                    <p className={sx(taskLayoutStyles.truncationNotice)}>
                      Showing {layoutKeys.length} loaded tickets. A tracker had
                      more than one refresh can load.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
            <IssuesPeekPanel
              dock="split"
              open={selectedItem !== null}
              title={selectedItem?.task.key ?? "Ticket"}
              width={peekWidth}
              onWidthChange={setPeekWidth}
              onClose={() => setSelectedKey(null)}
              onExpand={
                selectedItem
                  ? () => openTrackerIssueInBrowser(selectedItem.task.url)
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
                <TrackerIssueDetailPane
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
            </IssuesPeekPanel>
          </div>
        </>
      )}

      <TrackerIssueKickoffSheet
        item={kickoffItem}
        onClose={() => {
          setKickoffKey(null);
          setKickoffProposal(null);
        }}
        onKickedOff={(result) => {
          if (!kickoffItem) return;
          void actions.completeKickoff({ task: kickoffItem.task, result });
          // The ticket's task is the proposal's answer.
          if (kickoffProposal) void useProposalsStore.getState().markStarted(kickoffProposal.id, null);
        }}
      />
    </div>
  );
}
