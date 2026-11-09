import { ShelfPlan } from "./ShelfPlan";
import { i18n, useTranslation } from "@/i18n";
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
import { cx, sx } from "@/components/aui/utils/stylex";
import { AgentRunBar } from "@/components/agent-runs/AgentRunBar";
import { RunStartNotice, useRunStartPlanned } from "@/components/agent-runs/RunContract";
import type { AgentRunPromptFit } from "@/lib/agent-runs/agent-run";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import {
  TurnActivitySurface,
  useTurnActivityModel,
} from "@/components/session/TurnActivity";
import { useAgentRunProgress } from "@/components/agent-runs/useAgentRunProgress";
import { useTaskSubagentSources } from "../useTaskSubagents";
import { latestStageRecord } from "@/lib/agent-runs/domain";
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
import { ReviewActivityDialog, ShelfReviews } from "./ShelfReviews";
import { ShelfUsageLimit } from "./ShelfUsageLimit";
import { ShelfAccountNotice } from "./ShelfAccountNotice";
import { ShelfProviderSwitch } from "./ShelfProviderSwitch";
import { useProviderSwitchPreview } from "./use-provider-switch-preview";
import { useProviderAccountBlocker } from "@/lib/providers/use-provider-account-blocker";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useShelfReviews } from "./use-shelf-reviews";
import { hasPausedUsageLimitWork } from "@/store/task-work-pause";
import type { ShelfRunDetailToggle, ShelfRunPanelButton } from "./ShelfRunLine";
import { TurnRunLine } from "./TurnRunLine";
import { useShelfDetail } from "./use-shelf-detail";

const NO_TODOS: { content: string; status: "pending" | "in_progress" | "completed" }[] = [];

/**
 * The composer shelf: one surface over the prompt input whose rows — the run
 * line, a usage-limit line, review lines and the queue line — are divided by a
 * hairline. It shows while
 * anything is in flight — a turn, an agent run (between its turns too), or a
 * queued message — whatever `settings.turnActivityPlacement` says, and it is
 * the one place a run's state is written while it runs.
 *
 * The placement only decides where the details open: the chevron unfolds the
 * plan and the turn's list under the line (`docked`), shows the floating card
 * (`floating`), or unfolds only the plan while the panel button is the way to
 * the activity (`panel`). The plan has no row of its own: the run line already
 * names its current step and count, so a second summary would repeat it.
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
  /** The provider the next send uses; its account decides whether the account line shows. */
  providerId?: ProviderId;
  /** The model the next send uses, for the usage-limit test the send guard runs. */
  model?: string;
  /** Stave Auto picks the route on send, so no usage-limit line is shown for it. */
  autoRouting?: boolean;
  /**
   * The draft, as primitives, for the line that says the send starts an agent
   * run: whether it can be an assignment and what it attaches.
   */
  draftPromptFit?: AgentRunPromptFit;
  draftFilePaths?: number;
  draftContextAttachments?: number;
  /**
   * The composer's approval row is showing this turn's request. The turn is
   * waiting on that row, which already says so with its decisions, so the
   * turn's own line steps aside instead of repeating it above the composer.
   */
  approvalShown?: boolean;
}) {
  useTranslation();
  const taskId = useScopedTaskId();
  const accountBlocker = useProviderAccountBlocker(props.providerId ?? "claude-code", { model: props.model, autoRouting: props.autoRouting });
  const blocker = props.providerId ? accountBlocker : null;
  const liveTurnId = useAppStore((state) => state.activeTurnIdsByTask[taskId]);
  const placement = useAppStore((state) => state.settings.turnActivityPlacement);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const setLayout = useAppStore((state) => state.setLayout);
  const abortTaskTurn = useAppStore((state) => state.abortTaskTurn);
  const detailHost = resolveShelfDetailHost(placement);
  const { open, setOpen, agentRun } = useShelfDetail(taskId);
  const inlineOpen = detailHost === "inline" && open;
  const turn = useTurnActivityModel({ host: "docked", detail: inlineOpen });
  const turnProps = turn.props;
  const runSource = resolveShelfRunSource({
    agentRunActive: agentRun != null,
    turnVisible: turnProps != null,
  });
  const runRowSource = props.approvalShown && runSource === "turn" ? null : runSource;
  const queueCount = props.queue?.items.length ?? 0;
  const usageLimitPause = useAppStore((state) => state.usageLimitPauseByTask[taskId]);
  const resumePausedTaskWork = useAppStore((state) => state.resumePausedTaskWork);
  const setUsageLimitAutoResume = useAppStore((state) => state.setUsageLimitAutoResume);
  const dismissUsageLimitPause = useAppStore((state) => state.dismissUsageLimitPause);
  // A turn running again means the limit no longer holds this task.
  const runLive = runSource === "agentRun" || (runSource === "turn" && !turn.isLeaving);
  const limited =
    !runLive &&
    hasPausedUsageLimitWork({ pause: usageLimitPause, queuedTurnCount: queueCount });
  const reviews = useShelfReviews(taskId);
  const reviewCount = reviews.items.length;
  const providerSwitch = useProviderSwitchPreview({
    taskId,
    providerId: props.providerId,
    enabled: runSource == null && !props.autoRouting,
  });
  const runStart = useRunStartPlanned({ taskId, providerId: props.providerId, promptFit: props.draftPromptFit ?? "empty" });
  const runStartAttachments = useMemo(
    () => ({ filePaths: props.draftFilePaths ?? 0, context: props.draftContextAttachments ?? 0 }),
    [props.draftFilePaths, props.draftContextAttachments],
  );
  const rows = selectComposerShelfRows({
    run: runRowSource,
    queueCount,
    limited,
    reviewCount,
    accountBlocked: blocker != null,
    providerSwitch: providerSwitch != null,
    runStart,
  });
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
  const turnTodos = turnProps?.todos ?? NO_TODOS;
  // A run's text and segments share the live plan, or saved facts between turns.
  const plan = useAgentRunProgress(agentRun);
  const planItems = agentRun ? (plan?.items ?? NO_TODOS) : turnTodos;
  const controls = resolveShelfRunControls({
    detailHost,
    canExpand,
    canOpenPanel: true,
    hasPlan: planItems.length > 0,
  });
  const detailToggle = useMemo<ShelfRunDetailToggle | null>(
    () =>
      controls.detailToggle
        ? { kind: controls.detailToggle, open, onToggle: () => setOpen(!open), planOnly: controls.planOnly }
        : null,
    [controls.detailToggle, controls.planOnly, open, setOpen],
  );
  const agentRunHeads = runSource === "agentRun";
  const openPanel = useCallback(
    () => setLayout({ patch: taskPanelLayoutPatch(agentRunHeads ? "progress" : "activity") }),
    [agentRunHeads, setLayout],
  );
  const panel = useMemo<ShelfRunPanelButton | null>(
    () =>
      controls.panelButton
        ? { label: i18n.t("composer:composerShelf.label"), onOpen: openPanel, keep: controls.panelButton }
        : null,
    [controls.panelButton, openPanel, i18n.language],
  );
  const onStop = useCallback(() => abortTaskTurn({ taskId }), [abortTaskTurn, taskId]);
  const delegates = useTaskSubagentSources(taskId, agentRun);
  const todo = useMemo<ShelfTodoProgress | null>(
    () => summarizeShelfTodos(planItems),
    [planItems],
  );
  // The open details: the plan first, then the activity list without the
  // to-dos the plan already lists.
  const detailOpenInline = open && controls.detailToggle === "inline";
  // With the to-dos gone, a list with no work of its own would be an empty band.
  const activityBeyondPlan =
    planItems.length === 0 ||
    (turnProps != null && (turnProps.workItems.length > 0 || turnProps.autoRouting != null));
  const activityInline =
    detailOpenInline && !controls.planOnly && turnProps != null && activityBeyondPlan;
  // A stage waiting for sign-off already asks in its card above the shelf.
  const currentStage = agentRun?.agentRun.workflow.stages[agentRun.agentRun.currentStageIndex];
  const signOffShown =
    agentRun?.agentRun.state === "running" &&
    currentStage != null &&
    latestStageRecord(agentRun.stages, currentStage.id)?.status === "awaiting-sign-off";

  const surfaceVisible = rows.length > 0;
  const shownBefore = useRef(false);
  useEffect(() => {
    shownBefore.current = surfaceVisible;
  }, [surfaceVisible]);
  // Outside the rows, so an open review stays open when its row leaves.
  const reviewDialog = reviews.viewing ? (
    <ReviewActivityDialog
      item={reviews.viewing}
      attached={reviews.attachedTaskIds.has(reviews.viewing.child.delegatedTaskId)}
      actions={reviews.actions}
      onClose={reviews.closeView}
    />
  ) : null;
  if (!surfaceVisible) {
    return reviewDialog;
  }
  // Only the run line is left and it is on its way out: the whole shelf goes.
  const surfaceLeaving =
    runSource === "turn" && turn.isLeaving && queueCount === 0 && !limited && reviewCount === 0 && !rows.includes("account");

  return (
    <section
      aria-label={i18n.t("composer:composerShelf.ariaLabel")}
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
      {blocker && rows.includes("account") ? (
        <ShelfRow joining={shownBefore.current}>
          <ShelfAccountNotice blocker={blocker} />
        </ShelfRow>
      ) : null}
      {providerSwitch && rows.includes("switch") ? (
        <ShelfRow joining={shownBefore.current}>
          <ShelfProviderSwitch preview={providerSwitch} workspaceId={activeWorkspaceId} taskId={taskId} />
        </ShelfRow>
      ) : null}
      {rows.includes("start") ? (
        <ShelfRow joining={shownBefore.current}>
          <RunStartNotice taskId={taskId} attachments={runStartAttachments} />
        </ShelfRow>
      ) : null}
      {runRowSource ? (
        <ShelfRow joining={shownBefore.current} leaving={runSource === "turn" && turn.isLeaving && !surfaceLeaving}>
          {runSource === "agentRun" ? (
            <AgentRunBar
              panelKeep={panel?.keep}
              detailToggle={detailToggle}
              todo={todo}
              plan={plan}
              subagents={delegates.rows}
              delegatedChildren={delegates.children}
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
          {detailOpenInline ? (
            <ShelfPlan
              key={`${taskId}:${plan?.turnId ?? turn.surfaceKey}`}
              items={planItems}
              live={Boolean(liveTurnId) && !turnProps?.activity?.pendingInteraction}
            />
          ) : null}
          {activityInline && turnProps ? (
            <TurnActivitySurface
              key={turn.surfaceKey}
              {...turnProps}
              todos={planItems.length > 0 ? NO_TODOS : turnProps.todos}
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
      {reviewCount > 0 ? (
        <ShelfRow joining={shownBefore.current}>
          <ShelfReviews
            items={reviews.items}
            attachedTaskIds={reviews.attachedTaskIds}
            actions={reviews.actions}
            onView={reviews.view}
          />
        </ShelfRow>
      ) : null}
      {reviewDialog}
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
  useTranslation();
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
  useTranslation();
  return (
    <section className={cx("turn-activity-surface", sx(styles.surface, styles.standalone))}>
      {Children.map(props.children, (child) =>
        child == null ? null : <div className={sx(styles.row)}>{child}</div>,
      )}
    </section>
  );
}
