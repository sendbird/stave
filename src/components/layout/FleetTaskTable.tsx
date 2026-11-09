import { useTranslation } from "@/i18n";
import { formatDuration } from "@/i18n/format";
import * as stylex from "@stylexjs/stylex";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { StateMark } from "@/components/aui/components/StateMark";
import { WORK_STATE } from "@/components/aui/components/state-vocabulary";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/aui/components/Table";
import { LoadingSurface } from "@/components/aui/components/LoadingSurface";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { transition } from "@/components/aui/recipes/transition";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { fleetStatusToWorkState } from "@/lib/fleet/task-status";
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
import {
  nextFleetTaskSort,
  sortFleetTaskRows,
  type FleetTaskSort,
  type FleetTaskSortKey,
} from "@/lib/fleet/task-table-sort";
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
 * The rows Fleet's task layouts (the table and the tree) draw, with their
 * whole data path: unopened workspaces read their stored task lists once,
 * from the cache the workspace cards share; rows are built and shared across
 * streamed chunks; the filter and search narrow them. `load` says which
 * unopened workspaces are still being read or failed, and `retry` reads the
 * failed ones again.
 */
export function useFleetTaskRows(args: {
  repositories: readonly FleetTaskTableRepository[];
  filter: FleetTaskTableFilter;
  searchQuery: string;
  nowMs: number;
}) {
  // References that hold while a turn streams (the snapshot shares them).
  const attentionItems = useFleetAttention((snapshot) => snapshot.items);
  const attentionItemsByWorkspaceId = useFleetAttention(
    (snapshot) => snapshot.attentionItemsByWorkspaceId,
  );

  // Workspaces with no live session read their stored task lists once, from
  // the cache the workspace cards share. A string, so streaming leaves it be.
  const coldKey = useAppStore((state) =>
    listColdWorkspaceIds(state, args.repositories).join("\u0000"),
  );
  const coldWorkspaces = useMemo(() => {
    const cold = new Set(coldKey ? coldKey.split("\u0000") : []);
    return args.repositories.flatMap((repository) =>
      repository.workspaces
        .filter((workspace) => cold.has(workspace.id))
        .map((workspace) => ({
          workspaceId: workspace.id,
          workspaceName: formatFleetWorkspaceName(workspace.name, workspace.branch),
        })),
    );
  }, [coldKey, args.repositories]);
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
        repositories: args.repositories,
        nowMs: args.nowMs,
        attentionItems,
        attentionItemsByWorkspaceId,
        shells,
        previous: previousRows,
      }),
    [attentionItems, attentionItemsByWorkspaceId, args.nowMs, args.repositories, shells],
  );
  const rows = useAppStore(selectRows);

  const query = normalizeFleetSearchQuery(args.searchQuery);
  const shownRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesFleetTaskTableFilter(row, args.filter) &&
          fleetSearchMatches(fleetTaskRowSearchText(row), query),
      ),
    [args.filter, query, rows],
  );
  const retry = () => retryFleetWorkspaceShells(load.failedWorkspaceIds);
  return { rows, shownRows, load, retry };
}

/** Reports the header's counts for the shown rows, as the cards count them. */
export function useFleetTaskRowsSummary(
  shownRows: readonly FleetTaskRow[],
  onSummaryChange: ((summary: FleetTaskTableSummary) => void) | undefined,
) {
  // Shown workspaces with a turn in flight.
  const liveWorkspaceCount = new Set(
    shownRows
      .filter((row) => row.workspaceActivity === "live")
      .map((row) => JSON.stringify([row.repositoryPath, row.workspaceId])),
  ).size;
  useEffect(() => {
    onSummaryChange?.({ liveWorkspaceCount, shownRowCount: shownRows.length });
  }, [liveWorkspaceCount, onSummaryChange, shownRows.length]);
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
  const { rows, shownRows, load, retry } = useFleetTaskRows(props);
  useFleetTaskRowsSummary(shownRows, props.onSummaryChange);

  return (
    <FleetTaskTableView
      rows={shownRows}
      hasRows={rows.length > 0}
      load={load}
      onRetry={retry}
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
  /**
   * Draws the shown rows in place of the table: another layout over the same
   * rows, under the same loading, failure and incomplete-list states.
   */
  renderRows?: (rows: readonly FleetTaskRow[]) => ReactNode;
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
    ) : props.renderRows ? (
      props.renderRows(props.rows)
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

/** The table's columns, in order, each a sort key. */
const FLEET_TASK_COLUMNS = [
  { key: "task", label: "fleet:taskTable.task" },
  { key: "workspace", label: "fleet:taskTable.workspace" },
  { key: "state", label: "fleet:taskTable.state" },
  { key: "needs", label: "fleet:taskTable.needs" },
  { key: "waiting", label: "fleet:taskTable.waiting" },
  { key: "activity", label: "fleet:taskTable.activity" },
] as const satisfies ReadonlyArray<{ key: FleetTaskSortKey; label: string }>;

function FleetTaskRowsTable(props: {
  rows: readonly FleetTaskRow[];
  nowMs: number;
  onOpenTask: (target: { repositoryPath: string; workspaceId: string; taskId: string }) => void;
}) {
  const { t } = useTranslation(["fleet"]);
  // Unsorted is the rows' own order (the Work queue's lanes); a header press cycles ascending, descending, unsorted.
  const [sort, setSort] = useState<FleetTaskSort>(null);
  const untitled = t("fleet:fleetWorkspaceCard.untitledTask");
  const rows = useMemo(
    () => sortFleetTaskRows(props.rows, sort, { nowMs: props.nowMs, untitled }),
    [props.rows, sort, props.nowMs, untitled],
  );
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
          {FLEET_TASK_COLUMNS.map((column) => (
            <TableHead
              key={column.key}
              data-fleet-task-column={column.key}
              sortDirection={sort?.key === column.key ? sort.direction : null}
              onSort={() => setSort((current) => nextFleetTaskSort(current, column.key))}
            >
              {t(column.label)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
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
  const state = fleetStatusToWorkState(row.status);
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
          <AuiButton
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
          </AuiButton>
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
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    paddingBlock: vars["--aui-space-4"],
  },
  empty: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    paddingBlock: vars["--aui-space-24"],
    textAlign: "center",
  },
  taskCell: {
    maxWidth: "22rem",
  },
  task: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  taskButton: {
    borderRadius: vars["--aui-radius-mark"],
    color: {
      default: vars["--aui-color-text"],
      ":hover": vars["--aui-color-accent-text"],
    },
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textAlign: "start",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  secondary: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    whiteSpace: "nowrap",
  },
  muted: {
    color: vars["--aui-color-text-muted"],
  },
  numeric: {
    fontVariantNumeric: "tabular-nums",
  },
  activityCell: {
    maxWidth: "26rem",
    minWidth: "12rem",
  },
});
