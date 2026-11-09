import { useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSharedNow } from "@/components/aui/components/DurationTimer";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { findLatestTodoPart } from "@/components/session/turn-todo.utils";
import { AgentRunMark } from "@/components/system/AgentRunMark";
import {
  buildRunProgress,
  formatRunProgressDuration,
  formatRunProgressLabel,
  formatRunProgressSummary,
  selectWorkspaceRunTask,
  type RunProgress,
} from "@/lib/fleet/run-progress";
import type { StyleXValue } from "@/components/aui/utils/stylex";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { ProviderId } from "@/lib/providers/provider.types";
import { getTodoProgress } from "@/lib/todo-progress";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const EMPTY_MESSAGES: ChatMessage[] = [];

/**
 * The live turn a workspace row speaks for, read row-locally. The selector
 * returns only references the store already holds (one task's snapshot and
 * its messages), so a row re-renders when its own run changes, not on every
 * provider flush of every other task.
 */
function useWorkspaceRunTask(workspaceId: string) {
  return useAppStore(
    useShallow((state) => {
      const isActive = state.activeWorkspaceId === workspaceId;
      const runtime = isActive ? null : state.workspaceRuntimeCacheById[workspaceId];
      const tasks = isActive ? state.tasks : runtime?.tasks;
      const activeTurnIdsByTask = isActive ? state.activeTurnIdsByTask : runtime?.activeTurnIdsByTask;
      const run = tasks && activeTurnIdsByTask
        ? selectWorkspaceRunTask({ tasks, activeTurnIdsByTask, activityByTask: state.providerTurnActivityByTask })
        : null;
      const messagesByTask = isActive ? state.messagesByTask : runtime?.messagesByTask;
      return [
        run?.activeTurnId ?? null,
        run?.activity ?? null,
        (run && messagesByTask?.[run.taskId]) || EMPTY_MESSAGES,
      ] as const;
    }),
  );
}

/** One task's live turn, read row-locally like the workspace's. */
function useTaskRun(workspaceId: string, taskId: string) {
  return useAppStore(
    useShallow((state) => {
      const isActive = state.activeWorkspaceId === workspaceId;
      const runtime = isActive ? null : state.workspaceRuntimeCacheById[workspaceId];
      const activeTurnIdsByTask = isActive ? state.activeTurnIdsByTask : runtime?.activeTurnIdsByTask;
      const messagesByTask = isActive ? state.messagesByTask : runtime?.messagesByTask;
      return [
        activeTurnIdsByTask?.[taskId] ?? null,
        state.providerTurnActivityByTask[taskId] ?? null,
        messagesByTask?.[taskId] ?? EMPTY_MESSAGES,
      ] as const;
    }),
  );
}

export interface WorkspaceRunProgressState {
  progress: RunProgress | null;
  providerId: ProviderId | null;
}

/**
 * The row's run progress: current step, to-do count and time. `ticking`
 * subscribes to the one shared one-second clock, so many rows share a single
 * interval and a row with no live turn never ticks.
 */
export function useWorkspaceRunProgress(
  workspaceId: string,
  ticking: boolean,
): WorkspaceRunProgressState {
  const [activeTurnId, activity, messages] = useWorkspaceRunTask(workspaceId);
  return useRunProgress(activeTurnId, activity, messages, ticking);
}

/** One task's run progress, for its own row in the workspace's task list. */
export function useTaskRunProgress(
  workspaceId: string,
  taskId: string,
  ticking: boolean,
): WorkspaceRunProgressState {
  const [activeTurnId, activity, messages] = useTaskRun(workspaceId, taskId);
  return useRunProgress(activeTurnId, activity, messages, ticking);
}

function useRunProgress(
  activeTurnId: string | null,
  activity: ProviderTurnActivitySnapshot | null,
  messages: ChatMessage[],
  ticking: boolean,
): WorkspaceRunProgressState {
  const todo = useMemo(() => {
    if (!activeTurnId) {
      return null;
    }
    const part = findLatestTodoPart(messages, activeTurnId);
    if (!part) {
      return null;
    }
    const counts = getTodoProgress({ input: part.input });
    return { done: counts.completedCount, total: counts.totalCount };
  }, [activeTurnId, messages]);
  const now = useSharedNow(ticking && activity != null);
  const progress = useMemo(
    () => buildRunProgress({ activity, activeTurnId, todo, now }),
    [activity, activeTurnId, todo, now],
  );
  return { progress, providerId: activity?.providerId ?? null };
}

/**
 * The row's leading run mark: one motion while the agent works, its own mark
 * while it waits on helpers, a still warning mark once it goes quiet.
 */
export const WorkspaceRunMark = memo(function WorkspaceRunMark(args: {
  workspaceId: string;
  /** Ink when no live snapshot names a provider yet. */
  fallbackInkClassName: string;
}) {
  const { progress, providerId } = useWorkspaceRunProgress(args.workspaceId, false);
  return (
    <AgentRunMark
      kind={progress?.kind ?? "working"}
      providerId={providerId}
      fallbackInkClassName={args.fallbackInkClassName}
    />
  );
});

/** "Edit file · 2/5 · 3m", "Waiting on 2 helpers · 1m" or "No output · 6m". */
export function WorkspaceRunProgressText(args: {
  progress: RunProgress;
}) {
  useTranslation();
  const label = formatRunProgressLabel(args.progress);
  return (
    <span
      data-run-progress={args.progress.kind}
      className={sx(styles.text, toneStyles[args.progress.kind])}
      title={label}
    >
      {label}
    </span>
  );
}

/**
 * A running task's second line in the workspace's task list: what it is doing
 * (and its to-dos) on the left, its time in a slot of its own on the right, so
 * the time never truncates with the words. Nothing while no turn runs, or
 * while it waits on a person: the row's status mark says that.
 */
export const TaskRunProgressMeta = memo(function TaskRunProgressMeta(args: {
  workspaceId: string;
  taskId: string;
  xstyle?: StyleXValue;
}) {
  useTranslation();
  const { progress } = useTaskRunProgress(args.workspaceId, args.taskId, true);
  if (!progress) {
    return null;
  }
  return (
    <span
      data-task-run-progress={progress.kind}
      className={sx(styles.meta, args.xstyle)}
      title={formatRunProgressLabel(progress)}
    >
      <span className={sx(styles.text, toneStyles[progress.kind])}>
        {formatRunProgressSummary(progress)}
      </span>
      <span className={sx(styles.duration)}>{formatRunProgressDuration(progress)}</span>
    </span>
  );
});

const styles = stylex.create({
  meta: {
    alignItems: "baseline",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    lineHeight: vars["--aui-line-height-normal"],
    minWidth: 0,
  },
  duration: {
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  text: {
    flex: 1,
    fontVariantNumeric: "tabular-nums",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

// Working and waiting keep the meta line's ink, which is tuned for 4.5:1 on the
// sidebar and its selected wash; the mark and the words tell them apart. A
// stall mixes the halted state color with the body ink, as the state
// vocabulary's words do, so it keeps the same contrast.
const toneStyles = stylex.create({
  working: {},
  waiting: {},
  stalled: {
    color: `color-mix(in oklab, ${vars["--aui-color-text"]} 45%, var(--state-halted))`,
  },
});
