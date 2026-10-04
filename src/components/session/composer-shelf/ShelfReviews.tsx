import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleAlert,
  CircleSlash,
  FileCheck2,
  PanelTopOpen,
  Paperclip,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { useNow } from "@/components/agent-runs/useAgentRun";
import { ActivityDetailDialog } from "@/components/session/ActivityDetailDialog";
import { Loader, toast } from "@/components/ui";
import type { DelegationActionId } from "@/lib/delegation/exchange";
import type { ReviewShelfItem } from "@/lib/reviews/review-task";
import { useAppStore } from "@/store/app.store";
import { readAttachedTaskMessages } from "@/store/attached-task-context-runtime";
import { rerunReviewTask } from "@/store/review-task-runtime";
import {
  buildReviewExchange,
  describeReviewShelfLine,
  summarizeReviewTranscript,
  type ReviewTranscript,
} from "./composer-shelf.utils";
import { shelfStyles as styles } from "./composer-shelf.styles";
import type { ShelfReviewActions } from "./use-shelf-reviews";

export interface ShelfReviewsProps {
  items: readonly ReviewShelfItem[];
  attachedTaskIds: ReadonlySet<string>;
  actions: ShelfReviewActions;
  onView: (item: ReviewShelfItem) => void;
}

const TONE_INK = {
  active: styles.labelAccent,
  ready: styles.labelAccent,
  danger: styles.labelDanger,
  muted: styles.strong,
} as const;

/**
 * Reviews this task started in their own read-only task: one line each while
 * it runs (View, Stop) and once it settles (Attach the findings to the next
 * message, View, Dismiss). View opens `ReviewActivityDialog` over the current
 * task, so checking how it reviewed never leaves this one.
 */
export const ShelfReviews = memo(function ShelfReviews(props: ShelfReviewsProps) {
  const running = props.items.some((item) => item.status === "running");
  // Elapsed time reads in seconds under a minute; a 5s tick keeps it honest.
  const now = useNow(running, 5_000);
  return (
    <div role="group" aria-label="Reviews" data-testid="composer-shelf-reviews">
      {props.items.map((item) => (
        <ReviewLine
          key={item.child.delegationKey}
          item={item}
          now={now}
          attached={props.attachedTaskIds.has(item.child.delegatedTaskId)}
          actions={props.actions}
          onView={props.onView}
        />
      ))}
    </div>
  );
});

/**
 * A review's answer, assignment and activity over the current task. The shelf
 * owns it, not the review's row, so it stays open when the row leaves.
 */
export function ReviewActivityDialog(props: {
  item: ReviewShelfItem;
  attached: boolean;
  actions: ShelfReviewActions;
  onClose: () => void;
}) {
  const { item, actions, onClose } = props;
  const taskTitle = useAppStore(
    (state) => state.tasks.find((task) => task.id === item.child.delegatedTaskId)?.title,
  );
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const title = taskTitle?.trim() || "Review";
  const [transcript, setTranscript] = useState<ReviewTranscript | null>(null);
  const { delegatedTaskId, delegatedWorkspaceId } = item.child;
  // Read again when the review settles, so the full answer replaces the
  // ledger's bounded copy as soon as there is one.
  useEffect(() => {
    let cancelled = false;
    void readAttachedTaskMessages({
      getState: useAppStore.getState,
      attachment: { taskId: delegatedTaskId, workspaceId: delegatedWorkspaceId },
    })
      .then((messages) => {
        if (!cancelled) setTranscript(summarizeReviewTranscript(messages));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [delegatedTaskId, delegatedWorkspaceId, item.status]);
  const exchange = useMemo(
    () => buildReviewExchange({ item, title, transcript }),
    [item, title, transcript],
  );
  const onAction = useCallback(
    (action: DelegationActionId) => {
      if (action === "open") {
        onClose();
        actions.open(item);
      } else if (action === "stop") {
        actions.stop(item);
      }
    },
    [actions, item, onClose],
  );
  const [rerunning, setRerunning] = useState(false);
  const rerun = useCallback(async () => {
    const prompt = transcript?.prompt;
    if (!prompt || rerunning) return;
    setRerunning(true);
    const started = await rerunReviewTask({
      getState: useAppStore.getState,
      review: item.child,
      prompt,
      title,
    });
    setRerunning(false);
    if (!started.ok) {
      toast.error("Could not run the review again", { description: started.error });
      return;
    }
    toast.success("Review started again in its own task");
    onClose();
  }, [item.child, onClose, rerunning, title, transcript?.prompt]);
  const renderExtraActions = useCallback(
    () => (
      <>
        {item.status !== "ready" ? null : props.attached ? (
          <span className={sx(styles.meta)}>
            <Check aria-hidden className={sx(styles.markIcon)} /> Attached to your message
          </span>
        ) : (
          <Button
            variant="quiet"
            size="sm"
            title="Attach the review's findings to your next message, with your follow-up prompt when the message is empty"
            onClick={() => {
              actions.attach(item);
              onClose();
            }}
            xstyle={styles.itemAccent}
          >
            <Paperclip aria-hidden />
            Attach to message
          </Button>
        )}
        {item.status !== "running" && transcript?.prompt ? (
          <Button
            variant="quiet"
            size="sm"
            disabled={rerunning}
            title="Run the same review again, on the same model, against the workspace as it is now"
            onClick={() => void rerun()}
          >
            <RotateCcw aria-hidden />
            Run again
          </Button>
        ) : null}
      </>
    ),
    [actions, item, onClose, props.attached, rerun, rerunning, transcript?.prompt],
  );
  return (
    <ActivityDetailDialog
      key={item.child.delegationKey}
      selection={{ title, exchange }}
      taskId={item.child.parentTaskId}
      repositoryPath={repositoryPath ?? undefined}
      onClose={onClose}
      onAction={onAction}
      renderExtraActions={renderExtraActions}
    />
  );
}

function ReviewMark(props: { item: ReviewShelfItem }) {
  if (props.item.status === "running") {
    return <Loader aria-hidden cadence="reduced" size="sm" variant="verify" />;
  }
  const Icon =
    props.item.status === "ready"
      ? FileCheck2
      : props.item.status === "stopped"
        ? CircleSlash
        : CircleAlert;
  const ink =
    props.item.status === "ready"
      ? styles.labelAccent
      : props.item.status === "stopped"
        ? styles.quiet
        : styles.labelDanger;
  return <Icon aria-hidden className={sx(styles.markIcon, ink)} />;
}

function ReviewLine(props: {
  item: ReviewShelfItem;
  now: number;
  attached: boolean;
  actions: ShelfReviewActions;
  onView: (item: ReviewShelfItem) => void;
}) {
  const { item, actions } = props;
  const line = describeReviewShelfLine({ item, now: props.now });
  return (
    <div
      className={sx(styles.line)}
      data-testid="composer-shelf-review"
      data-status={item.status}
    >
      <span className={sx(styles.mark)}>
        <span className={sx(styles.markSlot)}>
          <ReviewMark item={item} />
        </span>
      </span>
      <p className={sx(styles.text)} title={`${line.label} · ${line.detail}`}>
        <span className={sx(styles.label, TONE_INK[line.tone])}>{line.label}</span>
        <span>{` · ${line.detail}`}</span>
      </p>
      <span className={sx(styles.actions)}>
        {item.status === "ready" ? (
          props.attached ? (
            <span className={sx(styles.meta)} title="Sent with your next message">
              <Check aria-hidden className={sx(styles.markIcon)} /> Attached
            </span>
          ) : (
            <Button
              variant="quiet"
              size="xs"
              title="Attach the review's findings to your next message, with your follow-up prompt when the message is empty"
              onClick={() => actions.attach(item)}
              xstyle={styles.itemAccent}
            >
              <Paperclip aria-hidden />
              <span className={sx(styles.actionWord)}>Attach</span>
            </Button>
          )
        ) : null}
        <Button
          variant="quiet"
          size="xs"
          title="See the review's result and how it reviewed, without leaving this task"
          onClick={() => props.onView(item)}
          xstyle={styles.quiet}
        >
          <PanelTopOpen aria-hidden />
          <span className={sx(styles.actionWord)}>View</span>
        </Button>
        {item.status === "running" ? (
          <Button
            variant="quiet"
            size="xs"
            iconOnly
            aria-label="Stop the review"
            title="Stop the review"
            onClick={() => actions.stop(item)}
            xstyle={styles.quiet}
          >
            <Square aria-hidden />
          </Button>
        ) : (
          <Button
            variant="quiet"
            size="xs"
            iconOnly
            aria-label="Dismiss"
            title="Dismiss"
            onClick={() => actions.dismiss(item)}
            xstyle={styles.quiet}
          >
            <X aria-hidden />
          </Button>
        )}
      </span>
    </div>
  );
}
