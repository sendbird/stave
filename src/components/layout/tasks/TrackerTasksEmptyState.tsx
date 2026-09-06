import {
  AlertCircle,
  Info,
  ListTodo,
  Plug,
  RefreshCw,
  SearchX,
  Settings,
} from "lucide-react";

import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import {
  hasPendingTrackerSource,
  hasProducingTrackerSource,
  listActionableTrackerSources,
  type TrackerSourceSummary,
} from "@/lib/tracker-tasks/source-status";
import type { TrackerSourceId } from "@/lib/tracker-tasks/types";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";
import * as stylex from "@stylexjs/stylex";
import { taskRowStyles as styles } from "./tasks-row.styles";

export function openTrackerIntegrationsSettings() {
  window.dispatchEvent(
    new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
      detail: { section: "integrations" },
    }),
  );
}

export function TrackerTasksUnavailableState() {
  return (
    <Empty xstyle={styles.emptyFull}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListTodo />
        </EmptyMedia>
        <EmptyTitle>Tasks needs the desktop app</EmptyTitle>
        <EmptyDescription>
          Tracker credentials are read in the desktop main process, so this
          surface is unavailable in the browser build.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/**
 * The empty state for "nothing here", which is two different situations.
 *
 * Telling a user with no working tracker that they have no assigned work is the
 * failure this splits apart: the list looked healthy and empty while the actual
 * problem was an unconfigured connector nothing on screen mentioned.
 */
export function TrackerTasksEmptyListState(props: {
  summaries: readonly TrackerSourceSummary[];
  hasFilters: boolean;
  onReset: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const producing = hasProducingTrackerSource(props.summaries);
  const actionable = listActionableTrackerSources(props.summaries);

  // A cold start has an empty cache and no status yet. Announcing either verdict
  // there would be a wrong answer that corrects itself a moment later.
  if (!producing && hasPendingTrackerSource(props.summaries)) {
    return (
      <Empty xstyle={styles.emptyFull}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RefreshCw {...stylex.props(styles.spin)} />
          </EmptyMedia>
          <EmptyTitle>Checking your trackers</EmptyTitle>
          <EmptyDescription>
            Reading the connectors this installation is set up with.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!producing) {
    return (
      <Empty xstyle={styles.emptyFull}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Plug />
          </EmptyMedia>
          <EmptyTitle>No tracker is sending tickets</EmptyTitle>
          <EmptyDescription>
            Tasks lists the tickets assigned to you in Jira Cloud and Crane, and
            starts a local run from one. Neither is producing rows yet.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ul {...stylex.props(styles.summaryList)}>
            {props.summaries.map((summary) => (
              <li key={summary.source} {...stylex.props(styles.summaryItem)}>
                <span {...stylex.props(styles.summarySource)}>
                  {summary.label}
                </span>
                <span {...stylex.props(styles.summaryDetail)}>
                  <span {...stylex.props(styles.summaryHeadline)}>
                    {summary.headline}
                  </span>
                  {" — "}
                  {summary.detail}
                </span>
              </li>
            ))}
          </ul>
          {actionable.some((summary) => summary.fixInSettings) ? (
            <Button
              type="button"
              size="sm"
              onClick={openTrackerIntegrationsSettings}
            >
              <Settings {...stylex.props(styles.buttonIcon)} />
              Open Settings → Integrations
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={props.refreshing}
              onClick={props.onRefresh}
            >
              <RefreshCw
                {...stylex.props(
                  styles.buttonIcon,
                  props.refreshing && styles.spin,
                )}
              />
              Check again
            </Button>
          )}
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <Empty xstyle={styles.emptyFull}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyTitle>
          {props.hasFilters ? "No tickets match" : "Nothing assigned right now"}
        </EmptyTitle>
        <EmptyDescription>
          {props.hasFilters
            ? "Clear the filters, or refresh in case the tracker has moved on."
            : "Refresh to check the tracker again, or switch to All open."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div {...stylex.props(styles.emptyActions)}>
          {props.hasFilters ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={props.onReset}
            >
              Reset filters
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={props.refreshing}
            onClick={props.onRefresh}
          >
            <RefreshCw
              {...stylex.props(
                styles.buttonIcon,
                props.refreshing && styles.spin,
              )}
            />
            Refresh
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}

/**
 * Per-source strip above the list.
 *
 * It reports every source that needs attention, not only the ones that failed
 * while connected. The earlier version filtered to `availability === "ready"`,
 * so a source that was switched off or missing a credential was invisible
 * everywhere except a zero-source empty state — which meant a user whose Crane
 * worked but whose Jira was unconfigured was never told Jira existed.
 */
export function TrackerSourceStatusStrip(props: {
  summaries: readonly TrackerSourceSummary[];
  onRetry: (source: TrackerSourceId) => void;
  /** Hidden while the list is empty, where the empty state says it all. */
  hidden?: boolean;
}) {
  const actionable = listActionableTrackerSources(props.summaries);
  if (props.hidden || actionable.length === 0) {
    return null;
  }
  const anyError = actionable.some((summary) => summary.condition === "error");

  return (
    <div
      {...stylex.props(
        styles.sourceStrip,
        anyError ? styles.sourceStripError : styles.sourceStripQuiet,
      )}
    >
      {actionable.map((summary) => {
        const isError = summary.condition === "error";
        return (
          <div
            key={summary.source}
            {...stylex.props(
              styles.sourceRow,
              isError ? styles.danger : styles.muted,
            )}
          >
            {isError ? (
              <AlertCircle {...stylex.props(styles.buttonIcon)} />
            ) : (
              <Info {...stylex.props(styles.buttonIcon)} />
            )}
            <span {...stylex.props(styles.stripText)}>
              <span {...stylex.props(styles.stripLabel)}>{summary.label}</span>
              {isError ? " did not sync: " : ": "}
              {summary.detail}
            </span>
            {summary.fixInSettings ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={stylex.props(styles.filterTrigger).className}
                onClick={openTrackerIntegrationsSettings}
              >
                Settings
              </Button>
            ) : null}
            {summary.retryable ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={
                  stylex.props(styles.filterTrigger, isError && styles.danger)
                    .className
                }
                onClick={() => props.onRetry(summary.source)}
              >
                Retry
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
