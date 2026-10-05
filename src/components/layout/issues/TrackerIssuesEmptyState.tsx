import { i18n, useTranslation } from "@/i18n";
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
} from "@/lib/tracker-issues/source-status";
import type { TrackerSourceId } from "@/lib/tracker-issues/types";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";
import * as stylex from "@stylexjs/stylex";
import { taskRowStyles as styles } from "./issues-row.styles";

export function openTrackerIntegrationsSettings() {
  window.dispatchEvent(
    new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
      detail: { section: "integrations" },
    }),
  );
}

export function TrackerIssuesUnavailableState() {
  const { t: tI18n } = useTranslation(["issues"]);
  return (
    <Empty xstyle={styles.emptyFull}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListTodo />
        </EmptyMedia>
        <EmptyTitle>{tI18n("issues:trackerIssuesEmptyState.issuesNeedsTheDesktopApp")}</EmptyTitle>
        <EmptyDescription>
          {tI18n("issues:trackerIssuesEmptyState.trackerCredentialsAreReadInTheDesktop")}</EmptyDescription>
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
export function TrackerIssuesEmptyListState(props: {
  summaries: readonly TrackerSourceSummary[];
  hasFilters: boolean;
  onReset: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { t: tI18n } = useTranslation(["issues"]);
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
          <EmptyTitle>{tI18n("issues:trackerIssuesEmptyState.checkingYourTrackers")}</EmptyTitle>
          <EmptyDescription>
            {tI18n("issues:trackerIssuesEmptyState.readingTheConnectorsThisInstallationIsSet")}</EmptyDescription>
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
          <EmptyTitle>{tI18n("issues:trackerIssuesEmptyState.noTrackerIsSendingTickets")}</EmptyTitle>
          <EmptyDescription>
            {tI18n("issues:trackerIssuesEmptyState.issuesListsTheTicketsAssignedToYou")}</EmptyDescription>
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
              {tI18n("issues:trackerIssuesEmptyState.openSettingsIntegrations")}</Button>
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
              {tI18n("issues:trackerIssuesEmptyState.checkAgain")}</Button>
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
          {props.hasFilters ? tI18n("issues:trackerIssuesEmptyState.noTicketsMatch") : tI18n("issues:trackerIssuesEmptyState.nothingAssignedRightNow")}
        </EmptyTitle>
        <EmptyDescription>
          {props.hasFilters
            ? tI18n("issues:trackerIssuesEmptyState.clearTheFiltersOrRefreshInCase")
            : tI18n("issues:trackerIssuesEmptyState.refreshToCheckTheTrackerAgainOr")}
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
              {tI18n("issues:trackerIssuesEmptyState.resetFilters")}</Button>
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
            {tI18n("issues:trackerIssuesEmptyState.refresh")}</Button>
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
  const { t: tI18n } = useTranslation(["issues"]);
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
              {isError ? tI18n("issues:trackerIssuesEmptyState.didNotSync") : ": "}
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
                {tI18n("issues:trackerIssuesEmptyState.settings")}</Button>
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
                {tI18n("issues:trackerIssuesEmptyState.retry")}</Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
