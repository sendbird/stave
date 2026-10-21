import type { ResultReview } from "@/lib/reviews/result-review";
import type { ChatMessage } from "@/types/chat";

/**
 * How long the task window has to stay open, focused, and on the same task
 * before Stave treats a finished turn as confirmed.
 *
 * Short enough that reading a result and moving on clears the Fleet row without
 * a second deliberate click; long enough that stepping through tasks with the
 * keyboard, or bouncing off one on the way to another, does not silently
 * acknowledge results the user never actually read.
 */
export const FLEET_RESULT_AUTO_REVIEW_DWELL_MS = 2_500;

export interface FleetResultAutoReviewSurface {
  activeWorkspaceId: string;
  /** The task the workspace surface is currently showing, if it is showing one. */
  visibleTaskId: string | null;
  windowFocused: boolean;
}

/**
 * Which pending results the user has demonstrably seen.
 *
 * The signal is deliberately conservative on both axes. The *viewer* must have
 * dwelled on this exact task, in this exact workspace, with the window focused —
 * a background window or a hidden surface proves nothing. And each *result* must
 * itself be at least one dwell old, so a turn that finishes in the last moment
 * of the dwell gets its own dwell instead of riding out on someone else's.
 *
 * A result belonging to the turn that is running right now is never taken: the
 * turn has not produced its outcome yet from the user's point of view, and
 * acknowledging it would clear a row before there is anything to read.
 *
 * Only the task's latest finished turn counts as read. Opening a task shows its
 * newest turn; results from earlier turns may be far up the conversation, so
 * looking at the task proves nothing about them and they keep their explicit
 * review. When the latest turn is unknown nothing is taken.
 */
export function selectAutoReviewableResults(args: {
  results: readonly ResultReview[];
  surface: FleetResultAutoReviewSurface;
  /** Turn currently running on the visible task, when any. */
  activeTurnId?: string | null;
  /**
   * The newest turn the task window shows as finished. Older turns are never
   * acknowledged by viewing the task; null acknowledges nothing.
   */
  latestResultTurnId: string | null;
  /** When the current uninterrupted dwell on the visible task began. */
  dwellStartedAtMs: number | null;
  nowMs: number;
  dwellMs?: number;
}): ResultReview[] {
  const dwellMs = args.dwellMs ?? FLEET_RESULT_AUTO_REVIEW_DWELL_MS;
  const taskId = args.surface.visibleTaskId?.trim();
  if (
    !taskId ||
    !args.surface.windowFocused ||
    args.dwellStartedAtMs === null ||
    args.nowMs - args.dwellStartedAtMs < dwellMs
  ) {
    return [];
  }
  const workspaceId = args.surface.activeWorkspaceId.trim();
  const activeTurnId = args.activeTurnId?.trim() || null;
  const latestResultTurnId = args.latestResultTurnId?.trim() || null;
  if (!latestResultTurnId) {
    return [];
  }

  return args.results.filter((result) => {
    if (result.reviewedAt) {
      return false;
    }
    if (result.taskId !== taskId || result.workspaceId !== workspaceId) {
      return false;
    }
    if (activeTurnId && result.turnId === activeTurnId) {
      return false;
    }
    if (result.turnId !== latestResultTurnId) {
      return false;
    }
    const createdAtMs = Date.parse(result.createdAt);
    // An unparseable timestamp cannot prove the result is old enough to have
    // been read, so it keeps its explicit review.
    return (
      Number.isFinite(createdAtMs) && args.nowMs - createdAtMs >= dwellMs
    );
  });
}

/**
 * The newest turn the conversation shows as finished: the last assistant
 * message's turn, skipping the one still running. This is what the task window
 * puts in front of the user, so it is the only turn viewing can acknowledge.
 */
export function findLatestFinishedTurnId(
  messages: readonly ChatMessage[] | undefined,
  activeTurnId: string | null,
): string | null {
  if (!messages) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === "assistant" &&
      message.turnId &&
      message.turnId !== activeTurnId
    ) {
      return message.turnId;
    }
  }
  return null;
}
