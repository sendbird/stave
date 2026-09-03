import { AlertCircle, ListTodo, Plug, RefreshCw, SearchX } from "lucide-react";

import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import type {
  TrackerSourceAvailability,
  TrackerSourceSyncStatus,
} from "@/lib/tracker-tasks/types";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";
import { TRACKER_SOURCE_LABELS } from "./tracker-task-ui";

function openIntegrationsSettings() {
  window.dispatchEvent(
    new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
      detail: { section: "integrations" },
    }),
  );
}

/**
 * Why a configured source is still not producing rows.
 *
 * Each string names the next action rather than the internal state, because the
 * only useful thing an empty list can say is what to do about it.
 */
const AVAILABILITY_HINTS: Record<TrackerSourceAvailability, string | null> = {
  ready: null,
  disabled: "Turned off in Settings.",
  unpaired: "Not paired with this installation yet.",
  not_configured: "No credential saved yet.",
  secure_storage_unavailable:
    "The OS keychain is unavailable, so the credential cannot be read.",
};

/**
 * Error codes worth translating.
 *
 * Anything unrecognised is shown verbatim: a code the user can quote in a bug
 * report beats a generic sentence that hides which call failed.
 */
const ERROR_HINTS: Record<string, string> = {
  unauthorized: "The saved credential was rejected.",
  forbidden: "The account cannot see this list.",
  invalid_jql: "The saved JQL query was rejected.",
  rate_limited: "The tracker is rate-limiting requests.",
  network_unavailable: "The tracker could not be reached.",
  response_too_large: "The tracker returned more data than Stave accepts.",
  invalid_response: "The tracker returned an unexpected shape.",
};

export function TrackerTasksUnavailableState() {
  return (
    <Empty className="h-full">
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

export function TrackerTasksNoSourceState(props: {
  statuses: readonly TrackerSourceSyncStatus[];
}) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Plug />
        </EmptyMedia>
        <EmptyTitle>No tracker is connected</EmptyTitle>
        <EmptyDescription>
          Connect Crane or Jira to see the tickets assigned to you and start a
          Stave run from one.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {props.statuses.length > 0 ? (
          <ul className="mb-3 space-y-1 text-left text-xs text-muted-foreground">
            {props.statuses.map((status) => (
              <li key={status.source}>
                <span className="font-medium text-foreground">
                  {TRACKER_SOURCE_LABELS[status.source]}
                </span>
                {" — "}
                {AVAILABILITY_HINTS[status.availability] ?? "Ready."}
              </li>
            ))}
          </ul>
        ) : null}
        <Button type="button" size="sm" onClick={openIntegrationsSettings}>
          Open Settings → Integrations
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function TrackerTasksNoMatchState(props: {
  hasFilters: boolean;
  onReset: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <Empty className="h-full">
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
        <div className="flex items-center justify-center gap-2">
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
              className={props.refreshing ? "size-3.5 animate-spin" : "size-3.5"}
            />
            Refresh
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}

/**
 * Per-source failure banner.
 *
 * Rendered above the list rather than instead of it: a Jira outage must not
 * hide the Crane tickets that loaded fine, and the rows already cached for the
 * failing source stay readable.
 */
export function TrackerSourceErrorBanner(props: {
  statuses: readonly TrackerSourceSyncStatus[];
  onRetry: (source: TrackerSourceSyncStatus["source"]) => void;
}) {
  const failing = props.statuses.filter(
    (status) => status.availability === "ready" && status.lastErrorCode !== null,
  );
  if (failing.length === 0) {
    return null;
  }
  return (
    <div className="shrink-0 space-y-1 border-b border-destructive/25 bg-destructive/5 px-4 py-2">
      {failing.map((status) => (
        <div
          key={status.source}
          className="flex items-center gap-2 text-[11px] text-destructive"
        >
          <AlertCircle className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            {TRACKER_SOURCE_LABELS[status.source]} did not sync:{" "}
            {status.lastErrorCode
              ? (ERROR_HINTS[status.lastErrorCode] ?? status.lastErrorCode)
              : "unknown error"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
            onClick={() => props.onRetry(status.source)}
          >
            Retry
          </Button>
        </div>
      ))}
    </div>
  );
}
