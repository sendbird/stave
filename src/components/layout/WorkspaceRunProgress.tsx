import { useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSharedNow } from "@/components/ads/components/DurationTimer";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { findLatestTodoPart } from "@/components/session/turn-todo.utils";
import { AgentRunMark } from "@/components/system/AgentRunMark";
import {
  buildRunProgress,
  formatRunProgressLabel,
  selectWorkspaceRunTask,
  type RunProgress,
} from "@/lib/fleet/run-progress";
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

const styles = stylex.create({
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
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--state-halted))`,
  },
});
