import {
  Children,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cx, sx } from "@/components/ads/utils/stylex";
import { MissionBar } from "@/components/missions/MissionBar";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import {
  TurnActivitySurface,
  useTurnActivityModel,
} from "@/components/session/TurnActivity";
import { agentRunStoredPlan } from "@/lib/missions/agent-run-view";
import { latestStageRecord } from "@/lib/missions/domain";
import { taskPanelLayoutPatch } from "@/lib/right-rail-panels";
import { useAppStore } from "@/store/app.store";
import {
  resolveShelfDetailHost,
  resolveShelfRunControls,
  resolveShelfRunSource,
  selectComposerShelfRows,
  summarizeShelfTodos,
  type ShelfTodoProgress,
} from "./composer-shelf.utils";
import { shelfStyles as styles } from "./composer-shelf.styles";
import { ShelfQueue, type ComposerShelfQueueProps } from "./ShelfQueue";
import { ShelfUsageLimit } from "./ShelfUsageLimit";
import { hasPausedUsageLimitWork } from "@/store/task-work-pause";
import type { ShelfRunDetailToggle, ShelfRunPanelButton } from "./ShelfRunLine";
import { TurnRunLine } from "./TurnRunLine";
import { useShelfDetail } from "./use-shelf-detail";

const NO_TODOS: readonly { status: "pending" | "in_progress" | "completed" }[] = [];

/**
 * The composer shelf: one surface over the prompt input with up to two rows,
 * the run line and the queue line, divided by a hairline. It shows while
 * anything is in flight — a turn, an agent run (between its turns too), or a
 * queued message — whatever `settings.turnActivityPlacement` says, and it is
 * the one place a run's state is written while it runs.
 *
 * The placement only decides where the details open: the chevron unfolds the
 * turn's list under the line (`docked`), shows the floating card
 * (`floating`), or there is no chevron and the panel button is the way in
 * (`panel`).
 *
 * Memoized on primitives and a stable queue: the composer around it
 * re-renders on every keystroke, and the shelf's own subscriptions are what
 * should drive it.
 */
export const ComposerShelf = memo(function ComposerShelf(props: {
  /** In the composer frame's top slot, which owns the inset and the tuck. */
  framed: boolean;
  /** A steer was sent and the provider has not taken it yet. */
  steering: boolean;
  queue: ComposerShelfQueueProps | null;
}) {
  const taskId = useScopedTaskId();
  const placement = useAppStore((state) => state.settings.turnActivityPlacement);
  const setLayout = useAppStore((state) => state.setLayout);
  const abortTaskTurn = useAppStore((state) => state.abortTaskTurn);
  const detailHost = resolveShelfDetailHost(placement);
  const { open, setOpen, mission } = useShelfDetail(taskId);
  const inlineOpen = detailHost === "inline" && open;
  const turn = useTurnActivityModel({ host: "docked", detail: inlineOpen });
  const turnProps = turn.props;
  const runSource = resolveShelfRunSource({
    missionActive: mission != null,
    turnVisible: turnProps != null,
  });
  const queueCount = props.queue?.items.length ?? 0;
  const usageLimitPause = useAppStore((state) => state.usageLimitPauseByTask[taskId]);
  const resumePausedTaskWork = useAppStore((state) => state.resumePausedTaskWork);
  const setUsageLimitAutoResume = useAppStore((state) => state.setUsageLimitAutoResume);
  const dismissUsageLimitPause = useAppStore((state) => state.dismissUsageLimitPause);
  // A turn running again means the limit no longer holds this task.
  const runLive = runSource === "mission" || (runSource === "turn" && !turn.isLeaving);
  const limited =
    !runLive &&
    hasPausedUsageLimitWork({ pause: usageLimitPause, queuedTurnCount: queueCount });
  const rows = selectComposerShelfRows({ run: runSource, queueCount, limited });
  const onResumeNow = useCallback(
    () => void resumePausedTaskWork({ taskId }),
    [resumePausedTaskWork, taskId],
  );
  const onResumeAtReset = useCallback(
    (enabled: boolean) => setUsageLimitAutoResume({ taskId, enabled }),
    [setUsageLimitAutoResume, taskId],
  );
  const onDismissLimit = useCallback(
    () => dismissUsageLimitPause({ taskId }),
    [dismissUsageLimitPause, taskId],
  );

  // The approval or question card above asks for the composer's attention;
  // the list stays shut behind it, as it always has.
  const cardOwnsFocus = Boolean(
    turnProps?.hasPendingInteractionCard && turnProps.activity?.pendingInteraction,
  );
  const canExpand = turnProps != null && !turn.isLeaving && !cardOwnsFocus;
  const controls = resolveShelfRunControls({ detailHost, canExpand, canOpenPanel: true });
  const detailToggle = useMemo<ShelfRunDetailToggle | null>(
    () =>
      controls.detailToggle
        ? { kind: controls.detailToggle, open, onToggle: () => setOpen(!open) }
        : null,
    [controls.detailToggle, open, setOpen],
  );
  const missionHeads = runSource === "mission";
  const openPanel = useCallback(
    () => setLayout({ patch: taskPanelLayoutPatch(missionHeads ? "progress" : "activity") }),
    [missionHeads, setLayout],
  );
  const panel = useMemo<ShelfRunPanelButton | null>(
    () =>
      controls.panelButton
        ? { label: "Open activity in the Task panel", onOpen: openPanel, keep: controls.panelButton }
        : null,
    [controls.panelButton, openPanel],
  );
  const onStop = useCallback(() => abortTaskTurn({ taskId }), [abortTaskTurn, taskId]);
  const turnTodos = turnProps?.todos ?? NO_TODOS;
  // Between turns a one-stage run keeps showing its plan from the stage record.
  const storedPlanItems = useMemo(() => agentRunStoredPlan(mission)?.items ?? NO_TODOS, [mission]);
  const todo = useMemo<ShelfTodoProgress | null>(
    () => summarizeShelfTodos(turnTodos.length > 0 ? turnTodos : storedPlanItems),
    [turnTodos, storedPlanItems],
  );
  // A stage waiting for sign-off already asks in its card above the shelf.
  const currentStage = mission?.mission.playbook.stages[mission.mission.currentStageIndex];
  const signOffShown =
    mission?.mission.state === "running" &&
    currentStage != null &&
    latestStageRecord(mission.stages, currentStage.id)?.status === "awaiting-sign-off";

  const surfaceVisible = rows.length > 0;
  const shownBefore = useRef(false);
  useEffect(() => {
    shownBefore.current = surfaceVisible;
  }, [surfaceVisible]);
  if (!surfaceVisible) {
    return null;
  }
  // Only the run line is left and it is on its way out: the whole shelf goes.
  const surfaceLeaving = runSource === "turn" && turn.isLeaving && queueCount === 0 && !limited;

  return (
    <section
      aria-label="Turn activity and queue"
      data-testid="composer-shelf"
      data-rows={rows.join(" ")}
      data-detail-host={detailHost}
      className={cx(
        "turn-activity-surface",
        sx(
          styles.surface,
          !props.framed && styles.standalone,
          surfaceLeaving ? styles.leaving : styles.enter,
        ),
      )}
    >
      {runSource ? (
        <ShelfRow joining={shownBefore.current} leaving={runSource === "turn" && turn.isLeaving && !surfaceLeaving}>
          {runSource === "mission" ? (
            <MissionBar
              panelKeep={panel?.keep}
              detailToggle={turnProps ? detailToggle : null}
              todo={todo}
              reasonShownElsewhere={signOffShown}
              turnActivity={turnProps?.activity ?? null}
              steering={props.steering}
            />
          ) : turnProps ? (
            <TurnRunLine
              surface={turnProps}
              steering={props.steering}
              panel={panel}
              detail={detailToggle}
              onStop={onStop}
            />
          ) : null}
          {inlineOpen && canExpand && turnProps ? (
            <TurnActivitySurface
              key={turn.surfaceKey}
              {...turnProps}
              variant="docked"
              chrome="list"
            />
          ) : null}
        </ShelfRow>
      ) : null}
      {limited && usageLimitPause ? (
        <ShelfRow joining={shownBefore.current}>
          <ShelfUsageLimit
            pause={usageLimitPause}
            queuedCount={queueCount}
            onResumeNow={onResumeNow}
            onResumeAtReset={onResumeAtReset}
            onDismiss={onDismissLimit}
          />
        </ShelfRow>
      ) : null}
      {props.queue && queueCount > 0 ? (
        <ShelfRow joining={shownBefore.current}>
          <ShelfQueue {...props.queue} />
        </ShelfRow>
      ) : null}
    </section>
  );
});

/**
 * One row of the shelf. A row that joins a shelf already on screen fades in;
 * one that arrives with the shelf rides its entrance instead. Decided once, at
 * mount, so a re-render never restarts the animation.
 */
function ShelfRow(props: { joining: boolean; leaving?: boolean; children: ReactNode }) {
  const [joined] = useState(props.joining);
  return (
    <div
      className={sx(
        styles.row,
        joined && styles.rowEnter,
        props.leaving && styles.rowLeaving,
      )}
    >
      {props.children}
    </div>
  );
}

/**
 * The shelf's surface around rows a caller already has, for previews of a
 * single line: the classic inset and tuck, one row per child.
 */
export function ComposerShelfSurface(props: { children: ReactNode }) {
  return (
    <section className={cx("turn-activity-surface", sx(styles.surface, styles.standalone))}>
      {Children.map(props.children, (child) =>
        child == null ? null : <div className={sx(styles.row)}>{child}</div>,
      )}
    </section>
  );
}
