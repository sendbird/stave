import { useTranslation } from "@/i18n";
import { formatDuration } from "@/i18n/format";
import * as stylex from "@stylexjs/stylex";
import { memo, useEffect, useMemo, useRef } from "react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { StateMark } from "@/components/ads/components/StateMark";
import { WORK_STATE } from "@/components/ads/components/state-vocabulary";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ads/components/Table";
import { LoadingSurface } from "@/components/ads/components/LoadingSurface";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { FLEET_TASK_WORK_STATE } from "@/components/layout/fleet-attention-marks";
import { FleetTaskActivityLine } from "@/components/layout/FleetTaskActivityLine";
import {
  FleetProviderIcon,
  formatFleetWorkspaceName,
} from "@/components/layout/FleetWorkspaceCard";
import { ActivityTimestamp } from "@/components/system/ActivityTimestamp";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import { FLEET_ATTENTION_KIND_LABEL } from "@/lib/fleet/fleet-vocabulary";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  buildFleetTaskRows,
  fleetTaskRowSearchText,
  matchesFleetTaskTableFilter,
  shareFleetTaskRows,
  type FleetTaskRow,
  type FleetTaskTableFilter,
  type FleetTaskTableWorkspace,
} from "@/lib/fleet/task-rows";
import {
  fleetSearchMatches,
  normalizeFleetSearchQuery,
} from "@/lib/fleet/card-task-rows";
import { useAppStore } from "@/store/app.store";
import { useFleetAttention } from "@/store/fleet-attention-store";
import {
  retryFleetWorkspaceShells,
  useFleetWorkspaceShells,
  type FleetWorkspaceShellEntry,
} from "@/store/fleet-workspace-shells-store";

export interface FleetTaskTableRepository {
  repositoryPath: string;
  repositoryName: string;
  workspaces: Array<{ id: string; name: string; branch?: string }>;
}

/** Unopened workspaces whose task lists are still being read, or failed. */
export interface FleetTaskTableLoad {
  pending: string[];
  failed: string[];
}

/** Which unopened workspaces the table is still reading, and which failed. */
export function summarizeFleetTaskTableLoad(args: {
  coldWorkspaces: ReadonlyArray<{ workspaceId: string; workspaceName: string }>;
  shells: Readonly<Record<string, FleetWorkspaceShellEntry | undefined>>;
}): FleetTaskTableLoad & { failedWorkspaceIds: string[] } {
  const load = { pending: [] as string[], failed: [] as string[], failedWorkspaceIds: [] as string[] };
  for (const workspace of args.coldWorkspaces) {
    const status = args.shells[workspace.workspaceId]?.status;
    if (status === "failed") {
      load.failed.push(workspace.workspaceName);
      load.failedWorkspaceIds.push(workspace.workspaceId);
    } else if (status !== "loaded") {
      load.pending.push(workspace.workspaceName);
    }
  }
  return load;
}

export interface FleetTaskTableSummary {
  /** Shown workspaces with a turn in flight, as the cards count them. */
  liveWorkspaceCount: number;
  shownRowCount: number;
}

/** The store fields the table's rows are built from. */
type FleetTaskTableState = Pick<
  ReturnType<typeof useAppStore.getState>,
  | "repositoryPath"
  | "activeWorkspaceId"
  | "tasks"
  | "messagesByTask"
  | "activeTurnIdsByTask"
  | "openTaskTabIds"
  | "workspaceRuntimeCacheById"
  | "providerTurnActivityByTask"
  | "workspaceLastActiveAtById"
>;

const EMPTY_ROWS: FleetTaskRow[] = [];

/** Workspaces of `repositories` that have no live session in this window. */
function listColdWorkspaceIds(
  state: Pick<FleetTaskTableState, "repositoryPath" | "activeWorkspaceId" | "workspaceRuntimeCacheById">,
  repositories: readonly FleetTaskTableRepository[],
) {
  return repositories.flatMap((repository) =>
    repository.workspaces
      .filter(
        (workspace) =>
          !(
            repository.repositoryPath === state.repositoryPath &&
            (workspace.id === state.activeWorkspaceId ||
              state.workspaceRuntimeCacheById[workspace.id])
          ),
      )
      .map((workspace) => workspace.id),
  );
}

/**
 * A store selector for the table's rows. It runs on every store change,
 * including every streamed chunk, so it reuses what it can: statuses are
 * cached per messages array, and rows equal to the last ones keep their
 * references, so a chunk that changes no row re-renders nothing.
 */
export function createFleetTaskRowsSelector(args: {
  repositories: readonly FleetTaskTableRepository[];
  nowMs: number;
  attentionItems: readonly FleetAttentionItem[];
  attentionItemsByWorkspaceId: Readonly<Record<string, readonly FleetAttentionItem[] | undefined>>;
  shells: Readonly<Record<string, FleetWorkspaceShellEntry | undefined>>;
  /** The last rows returned, kept across selectors so a new one shares them too. */
  previous?: { current: FleetTaskRow[] };
}) {
  const previous = args.previous ?? { current: EMPTY_ROWS };
  return (state: FleetTaskTableState): FleetTaskRow[] => {
    const workspaces: FleetTaskTableWorkspace[] = args.repositories.flatMap((repository) =>
      repository.workspaces.map((workspace) => {
        const isCurrent = repository.repositoryPath === state.repositoryPath;
        const isActive = isCurrent && workspace.id === state.activeWorkspaceId;
        const cached = isCurrent ? state.workspaceRuntimeCacheById[workspace.id] : undefined;
        const session = isActive
          ? {
              tasks: state.tasks,
              messagesByTask: state.messagesByTask,
              activeTurnIdsByTask: state.activeTurnIdsByTask,
              openTaskTabIds: state.openTaskTabIds,
            }
          : cached
            ? {
                tasks: cached.tasks,
                messagesByTask: cached.messagesByTask,
                activeTurnIdsByTask: cached.activeTurnIdsByTask,
                openTaskTabIds: cached.openTaskTabIds,
              }
            : null;
        const entry = args.shells[workspace.id];
        const stored = entry?.status === "loaded" ? entry.shell : null;
        return {
          repositoryPath: repository.repositoryPath,
          repositoryName: repository.repositoryName,
          workspaceId: workspace.id,
          workspaceName: formatFleetWorkspaceName(workspace.name, workspace.branch),
          workspaceBranch: workspace.branch ?? null,
          isActive,
          lastActiveAt: state.workspaceLastActiveAtById[workspace.id] ?? null,
          hasAttentionItems: (args.attentionItemsByWorkspaceId[workspace.id]?.length ?? 0) > 0,
          session,
          storedTasks: stored?.tasks ?? null,
          storedOpenTaskTabIds: stored?.openTaskTabIds,
        };
      }),
    );
    const rows = buildFleetTaskRows({
      workspaces,
      attentionItems: args.attentionItems,
      providerTurnActivityByTask: state.providerTurnActivityByTask,
      nowMs: args.nowMs,
    });
    previous.current = shareFleetTaskRows(previous.current, rows);
    return previous.current;
  };
}

/**
 * Every open task of every workspace in one table: the task, its workspace,
 * its state, what it needs from you, how long that has waited, and what its
 * running turn last did. Rows come in the Work queue's lanes with the longest
 * wait first, so the oldest approval and the quiet turns are on top without
 * expanding a card. The task name opens the task (Enter on the focused name).
 */
export function FleetTaskTable(props: {
  repositories: readonly FleetTaskTableRepository[];
  filter: FleetTaskTableFilter;
  searchQuery: string;
  nowMs: number;
  onOpenTask: (target: { repositoryPath: string; workspaceId: string; taskId: string }) => void;
  onSummaryChange?: (summary: FleetTaskTableSummary) => void;
}) {
  // References that hold while a turn streams (the snapshot shares them).
  const attentionItems = useFleetAttention((snapshot) => snapshot.items);
  const attentionItemsByWorkspaceId = useFleetAttention(
    (snapshot) => snapshot.attentionItemsByWorkspaceId,
  );

  // Workspaces with no live session read their stored task lists once, from
  // the cache the workspace cards share. A string, so streaming leaves it be.
  const coldKey = useAppStore((state) =>
    listColdWorkspaceIds(state, props.repositories).join("\u0000"),
  );
  const coldWorkspaces = useMemo(() => {
    const cold = new Set(coldKey ? coldKey.split("\u0000") : []);
    return props.repositories.flatMap((repository) =>
      repository.workspaces
        .filter((workspace) => cold.has(workspace.id))
        .map((workspace) => ({
          workspaceId: workspace.id,
          workspaceName: formatFleetWorkspaceName(workspace.name, workspace.branch),
        })),
    );
  }, [coldKey, props.repositories]);
  const coldWorkspaceIds = useMemo(
    () => coldWorkspaces.map((workspace) => workspace.workspaceId),
    [coldWorkspaces],
  );
  const shells = useFleetWorkspaceShells(coldWorkspaceIds);
  const load = summarizeFleetTaskTableLoad({ coldWorkspaces, shells });

  const previousRows = useRef<FleetTaskRow[]>(EMPTY_ROWS);
  const selectRows = useMemo(
    () =>
      createFleetTaskRowsSelector({
        repositories: props.repositories,
        nowMs: props.nowMs,
        attentionItems,
        attentionItemsByWorkspaceId,
        shells,
        previous: previousRows,
      }),
    [attentionItems, attentionItemsByWorkspaceId, props.nowMs, props.repositories, shells],
  );
  const rows = useAppStore(selectRows);

  const query = normalizeFleetSearchQuery(props.searchQuery);
  const shownRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesFleetTaskTableFilter(row, props.filter) &&
          fleetSearchMatches(fleetTaskRowSearchText(row), query),
      ),
    [props.filter, query, rows],
  );
  // As the cards count it: shown workspaces with a turn in flight.
  const liveWorkspaceCount = new Set(
    shownRows
      .filter((row) => row.workspaceActivity === "live")
      .map((row) => JSON.stringify([row.repositoryPath, row.workspaceId])),
  ).size;
  const { onSummaryChange } = props;
  useEffect(() => {
    onSummaryChange?.({ liveWorkspaceCount, shownRowCount: shownRows.length });
  }, [liveWorkspaceCount, onSummaryChange, shownRows.length]);

  return (
    <FleetTaskTableView
      rows={shownRows}
      hasRows={rows.length > 0}
      load={load}
      onRetry={() => retryFleetWorkspaceShells(load.failedWorkspaceIds)}
      nowMs={props.nowMs}
      onOpenTask={props.onOpenTask}
    />
  );
}

/**
 * The table itself, for rows already built, filtered and ordered. Unopened
 * workspaces whose task lists are still being read, or failed to read, are
 * said, never shown as no tasks: a failure with nothing else to show is an
 * error with Retry, and rows that did load stay under a notice that the list
 * is incomplete.
 */
export function FleetTaskTableView(props: {
  rows: readonly FleetTaskRow[];
  /** Whether any row exists before the filter and search (default: `rows`). */
  hasRows?: boolean;
  load?: FleetTaskTableLoad;
  onRetry?: () => void;
  nowMs: number;
  onOpenTask: (target: { repositoryPath: string; workspaceId: string; taskId: string }) => void;
}) {
  const { t } = useTranslation(["fleet"]);
  const pending = props.load?.pending ?? [];
  const failed = props.load?.failed ?? [];
  const hasRows = props.hasRows ?? props.rows.length > 0;
  const failure =
    failed.length > 0
      ? t("fleet:taskTable.failedRead", { count: failed.length, names: failed.join(", ") })
      : null;
  if (!hasRows && failure) {
    return (
      <AsyncBoundary
        state={{ status: "error", error: failure }}
        errorTitle={t("fleet:taskTable.incompleteTitle")}
        describeError={() => failure}
        onRetry={props.onRetry}
      >
        {() => null}
      </AsyncBoundary>
    );
  }
  if (!hasRows && pending.length > 0) {
    return (
      <AsyncBoundary
        state={{ status: "pending" }}
        pending={<LoadingSurface label={t("fleet:taskTable.readingTasks")} size="sm" />}
      >
        {() => null}
      </AsyncBoundary>
    );
  }
  const reading =
    pending.length > 0 ? (
      <p className={sx(styles.reading)} role="status">
        {t("fleet:taskTable.readingMore", { count: pending.length })}
      </p>
    ) : null;
  const body =
    props.rows.length === 0 ? (
      <p className={sx(styles.empty)} role="status">
        {t("fleet:taskTable.noTasks")}
      </p>
    ) : (
      <FleetTaskRowsTable rows={props.rows} nowMs={props.nowMs} onOpenTask={props.onOpenTask} />
    );
  if (!failure) {
    return (
      <>
        {reading}
        {body}
      </>
    );
  }
  return (
    <AsyncBoundary
      state={{ status: "ready", data: props.rows, stale: true, refreshError: failure }}
      refreshErrorTitle={t("fleet:taskTable.incompleteTitle")}
      staleNotice={t("fleet:taskTable.incompleteNotice")}
      describeError={() => failure}
      onRetry={props.onRetry}
    >
      {() => (
        <>
          {reading}
          {body}
        </>
      )}
    </AsyncBoundary>
  );
}

function FleetTaskRowsTable(props: {
  rows: readonly FleetTaskRow[];
  nowMs: number;
  onOpenTask: (target: { repositoryPath: string; workspaceId: string; taskId: string }) => void;
}) {
  const { t } = useTranslation(["fleet"]);
  return (
    <Table
      density="compact"
      xstyle={styles.table}
      role="region"
      aria-label={t("fleet:taskTable.label")}
      data-fleet-task-table="true"
    >
      <TableHeader sticky>
        <TableRow>
          <TableHead>{t("fleet:taskTable.task")}</TableHead>
          <TableHead>{t("fleet:taskTable.workspace")}</TableHead>
          <TableHead>{t("fleet:taskTable.state")}</TableHead>
          <TableHead>{t("fleet:taskTable.needs")}</TableHead>
          <TableHead>{t("fleet:taskTable.waiting")}</TableHead>
          <TableHead>{t("fleet:taskTable.activity")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.rows.map((row) => (
          <FleetTaskTableRow
            key={row.key}
            nowMs={props.nowMs}
            onOpenTask={props.onOpenTask}
            row={row}
          />
        ))}
      </TableBody>
    </Table>
  );
}

/** One row; rows the parent kept unchanged do not re-render. */
const FleetTaskTableRow = memo(function FleetTaskTableRow(props: {
  row: FleetTaskRow;
  nowMs: number;
  onOpenTask: (target: { repositoryPath: string; workspaceId: string; taskId: string }) => void;
}) {
  const { t } = useTranslation(["fleet"]);
  const { row } = props;
  // The running turn's snapshot changes with every streamed event, so only
  // this row reads it, and only while the turn is the task's active one.
  const snapshot = useAppStore((state) =>
    row.activeTurnId ? state.providerTurnActivityByTask[row.task.id] : undefined,
  );
  const activity = snapshot && snapshot.turnId === row.activeTurnId ? snapshot : null;
  const state = FLEET_TASK_WORK_STATE[row.status];
  const stateLabel =
    row.status === "stalled"
      ? FLEET_ATTENTION_KIND_LABEL["turn-stalled"]
      : WORK_STATE[state].label;
  const title = row.task.title || t("fleet:fleetWorkspaceCard.untitledTask");
  const waitingMs = row.waitingSince ? props.nowMs - Date.parse(row.waitingSince) : null;
  // Fleet's clock ticks once a minute, so the wait is told in whole minutes.
  const waiting =
    waitingMs === null || !Number.isFinite(waitingMs)
      ? ""
      : waitingMs < 60_000
        ? t("fleet:taskTable.underAMinute")
        : formatDuration(Math.floor(waitingMs / 60_000) * 60_000);
  return (
    <TableRow data-fleet-task-table-row={row.key}>
      <TableCell xstyle={styles.taskCell}>
        <span className={sx(styles.task)}>
          <FleetProviderIcon provider={row.task.provider} />
          <AdsButton
            layout="host"
            type="button"
            xstyle={[styles.taskButton, focusRing.ring, transition.colors]}
            aria-label={t("fleet:taskTable.openTask", { title, workspace: row.workspaceName })}
            onClick={() =>
              props.onOpenTask({
                repositoryPath: row.repositoryPath,
                workspaceId: row.workspaceId,
                taskId: row.task.id,
              })
            }
          >
            {title}
          </AdsButton>
        </span>
      </TableCell>
      <TableCell>
        <span className={sx(styles.secondary)}>
          {row.workspaceName}
          <span className={sx(styles.muted)}> · {row.repositoryName}</span>
        </span>
      </TableCell>
      <TableCell>
        <StateMark label={stateLabel} showLabel size="xs" state={state} />
      </TableCell>
      <TableCell>
        <span className={sx(styles.secondary)}>
          {row.need ? FLEET_ATTENTION_KIND_LABEL[row.need.kind] : ""}
        </span>
      </TableCell>
      <TableCell>
        <span className={sx(styles.secondary, styles.numeric)}>{waiting}</span>
      </TableCell>
      <TableCell xstyle={styles.activityCell}>
        {activity ? (
          <FleetTaskActivityLine activity={activity} status={row.status} />
        ) : (
          <ActivityTimestamp kind="updated" value={row.task.updatedAt} />
        )}
      </TableCell>
    </TableRow>
  );
});

const styles = stylex.create({
  // Bounded by the board's scroller so the table scrolls itself and its
  // header stays in view.
  table: {
    maxBlockSize: "100%",
    minWidth: 0,
  },
  reading: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    margin: 0,
    paddingBlock: vars["--ads-space-4"],
  },
  empty: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    margin: 0,
    paddingBlock: vars["--ads-space-24"],
    textAlign: "center",
  },
  taskCell: {
    maxWidth: "22rem",
  },
  task: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  taskButton: {
    borderRadius: vars["--ads-radius-mark"],
    color: {
      default: vars["--ads-color-text"],
      ":hover": vars["--ads-color-accent-text"],
    },
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textAlign: "start",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  secondary: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    whiteSpace: "nowrap",
  },
  muted: {
    color: vars["--ads-color-text-muted"],
  },
  numeric: {
    fontVariantNumeric: "tabular-nums",
  },
  activityCell: {
    maxWidth: "26rem",
    minWidth: "12rem",
  },
});
