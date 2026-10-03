import { memo, useMemo } from "react";
import { Button } from "@/components/ads/components/Button";
import { TextShimmer } from "@/components/ads/components/TextShimmer";
import { sx } from "@/components/ads/utils/stylex";
import { toProviderWaveToneClass } from "@/components/ai-elements/provider-wave-tone.styles";
import { usePrefersReducedMotion } from "@/components/missions/useMission";
import {
  TurnRestMark,
  useTurnClock,
  type TurnActivitySurfaceProps,
} from "@/components/session/TurnActivity";
import {
  buildTurnActivityItems,
  countTurnActivityItems,
  formatTurnActivityCountsLabel,
  mergeTurnActivityCounts,
  resolveTurnActivityFeaturedItem,
  resolveTurnActivityLoaderVariant,
  resolveTurnActivityRestMark,
} from "@/components/session/turn-activity.utils";
import { Loader } from "@/components/ui";
import {
  formatProviderTurnElapsedDuration,
  formatProviderTurnIdleDuration,
} from "@/lib/providers/turn-status";
import { summarizeWorkGraph } from "@/lib/work-graph/work-graph-tree";
import {
  describeTurnRunLabel,
  resolveTurnRunHeadline,
  resolveTurnRunTone,
  summarizeShelfTodos,
} from "./composer-shelf.utils";
import { shelfStyles as styles } from "./composer-shelf.styles";
import {
  SHELF_RUN_TONE_INK,
  ShelfRunLine,
  ShelfRunText,
  ShelfTodoProgressView,
  type ShelfRunDetailToggle,
  type ShelfRunPanelButton,
} from "./ShelfRunLine";

/**
 * The run line for a plain turn: `Working · Edit file · ChatInput.tsx`, the
 * to-do progress, elapsed time, Stop, and the way to the details. Stalled,
 * steering, a provider retry and a failure are tones of this one line.
 *
 * Reads the same throttled rows as the list, so the current step named here is
 * always a row the list would show.
 */
export const TurnRunLine = memo(function TurnRunLine(props: {
  surface: TurnActivitySurfaceProps;
  steering: boolean;
  panel: ShelfRunPanelButton | null;
  detail: ShelfRunDetailToggle | null;
  onStop?: () => void;
}) {
  const { surface } = props;
  const activity = surface.activity;
  const completedAt = activity?.completedAt ?? null;
  const pendingInteraction = activity?.pendingInteraction ?? null;
  const turnError = activity?.turnError ?? null;
  const turnErrorRecoverable = activity?.turnErrorRecoverable ?? false;
  const now = useTurnClock(completedAt == null ? surface.activeTurnId : null);
  const reducedMotion = usePrefersReducedMotion();
  const isStalled =
    activity?.stalledAt != null &&
    completedAt == null &&
    pendingInteraction == null;
  const hasActivity = activity != null;
  const turnStartedAt = activity?.startedAt ?? null;
  // Built from primitives: the snapshot gets a fresh identity on every
  // provider flush, and the rows are what the list draws a moment later.
  const items = useMemo(
    () =>
      buildTurnActivityItems({
        activity: hasActivity
          ? {
              completedAt: completedAt ?? undefined,
              pendingInteraction,
              turnError: turnError ?? undefined,
              turnErrorRecoverable,
            }
          : null,
        idleLabel: null,
        isPlanPreparing: surface.isPlanPreparing,
        isStalled,
        todos: surface.todos,
        workItems: surface.workItems,
        turnStartedAt,
        hasPendingInteractionCard: surface.hasPendingInteractionCard,
      }),
    [
      completedAt,
      hasActivity,
      isStalled,
      pendingInteraction,
      surface.hasPendingInteractionCard,
      surface.isPlanPreparing,
      surface.todos,
      surface.workItems,
      turnError,
      turnErrorRecoverable,
      turnStartedAt,
    ],
  );
  const graphSummary = useMemo(
    () => (surface.workGraph ? summarizeWorkGraph(surface.workGraph) : null),
    [surface.workGraph],
  );
  const counts = useMemo(
    () => mergeTurnActivityCounts(countTurnActivityItems(items), graphSummary),
    [graphSummary, items],
  );
  const featured = useMemo(
    () => resolveTurnActivityFeaturedItem(items),
    [items],
  );
  const todo = useMemo(
    () => summarizeShelfTodos(surface.todos),
    [surface.todos],
  );

  const tone = resolveTurnRunTone({
    pendingInteraction,
    isStalled,
    steering: props.steering,
    turnError,
    turnErrorRecoverable,
    completed: completedAt != null,
    replayOutcome: surface.replayOutcome,
  });
  const label = describeTurnRunLabel(tone, pendingInteraction);
  const headline = resolveTurnRunHeadline({
    tone,
    pendingInteraction,
    hasPendingInteractionCard: Boolean(surface.hasPendingInteractionCard),
    turnError,
    idleLabel: isStalled
      ? formatProviderTurnIdleDuration({ activity, now })
      : null,
    featured,
    countsHeadline:
      counts.hasGraphSubagentCounts && counts.subagentRunningCount >= 2
        ? formatTurnActivityCountsLabel(counts)
        : null,
    isPlanPreparing: surface.isPlanPreparing,
  });
  const elapsed = formatProviderTurnElapsedDuration({
    activity,
    now: completedAt ?? now,
  });
  const restMark = resolveTurnActivityRestMark({
    replayOutcome: surface.replayOutcome,
    activity,
  });
  const loaderVariant = resolveTurnActivityLoaderVariant({
    activity,
    isStalled,
    isPlanPreparing: surface.isPlanPreparing,
    workItems: surface.workItems,
  });
  const words = [label, headline.text, headline.detail]
    .filter(Boolean)
    .join(" · ");

  return (
    <ShelfRunLine
      testId="composer-shelf-run"
      dataState={tone}
      ariaLabel="Turn"
      announcement={label}
      mark={
        <span
          data-testid="turn-activity-loader"
          data-rest-mark={restMark ?? undefined}
          className={sx(styles.markSlot)}
        >
          {restMark ? (
            <TurnRestMark outcome={restMark} />
          ) : (
            <Loader
              aria-hidden
              cadence="reduced"
              className={
                activity
                  ? toProviderWaveToneClass({ providerId: activity.providerId })
                  : undefined
              }
              paused={tone !== "active" && tone !== "steering"}
              size="sm"
              variant={loaderVariant}
            />
          )}
        </span>
      }
      text={
        <ShelfRunText
          label={label}
          tone={SHELF_RUN_TONE_INK[tone]}
          title={words}
          narrow={todo ? `${todo.done}/${todo.total}` : null}
          parts={[
            headline.text ? (
              <span className={sx(styles.strong)}>
                {headline.live ? (
                  <TextShimmer active={!reducedMotion}>
                    {headline.text}
                  </TextShimmer>
                ) : (
                  headline.text
                )}
              </span>
            ) : null,
            headline.detail,
          ]}
        />
      }
      progress={todo ? <ShelfTodoProgressView progress={todo} /> : null}
      meta={
        elapsed ? (
          <span title={`Elapsed time: ${elapsed}`}>
            <span className={sx(styles.visuallyHidden)}>Turn elapsed </span>
            {elapsed}
          </span>
        ) : null
      }
      actions={
        props.onStop && completedAt == null ? (
          <Button
            variant="quiet"
            size="xs"
            onClick={props.onStop}
            xstyle={styles.quiet}
          >
            Stop
          </Button>
        ) : null
      }
      panel={props.panel}
      detail={props.detail}
    />
  );
});
