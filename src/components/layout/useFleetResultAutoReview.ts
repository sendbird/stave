import { useEffect } from "react";
import {
  FLEET_RESULT_AUTO_REVIEW_DWELL_MS,
  selectAutoReviewableResults,
} from "@/lib/fleet/result-auto-review";
import type { AppNotification } from "@/lib/notifications/notification.types";
import {
  listResultReviews,
  setResultsReviewed,
} from "@/lib/reviews/result-review-client";
import { useAppStore } from "@/store/app.store";

/** Enough headroom that a timer firing a hair early does not miss the deadline. */
const TIMER_SLACK_MS = 50;
const UNIT_SEPARATOR = "\u001f";

function isWindowFocused() {
  return (
    typeof document !== "undefined" &&
    typeof document.hasFocus === "function" &&
    document.hasFocus()
  );
}

function readSurface() {
  const state = useAppStore.getState();
  const taskId =
    state.activeAppSurface.kind === "workspace" &&
    state.activeSurface.kind === "task"
      ? state.activeSurface.taskId
      : null;
  return {
    workspaceId: state.activeWorkspaceId,
    taskId,
    activeTurnId: taskId ? (state.activeTurnIdsByTask[taskId] ?? null) : null,
    notifications: state.notifications,
  };
}

/**
 * Clears Fleet's `Result ready` and `Run failed` rows for turns the user has
 * demonstrably already looked at.
 *
 * Before this, a finished turn stayed in the Fleet rail until someone pressed
 * `Mark reviewed`, even after opening the task and reading the result — so the
 * rail filled up with work that was, from the user's point of view, done. The
 * durable result row is still the record of that review; this only supplies the
 * acknowledgement the user's own attention already implies.
 *
 * Mount once, at the shell level: the acknowledgement follows the task window,
 * not the Fleet view, and must work whether or not Fleet is open. It reads the
 * store imperatively rather than through a selector so that watching for
 * notifications and turn changes never re-renders the shell.
 */
export function useFleetResultAutoReview() {
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    /** The current uninterrupted viewing session, keyed by workspace and task. */
    let dwell: { key: string; startedAtMs: number } | null = null;
    /** Guards against re-running a pass the store has not invalidated. */
    let lastRunKey = "";
    let lastNotifications: AppNotification[] | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      timer = window.setTimeout(() => void run(), Math.max(0, delayMs));
    };

    const run = async () => {
      timer = null;
      const session = dwell;
      if (cancelled || !session || !isWindowFocused()) {
        return;
      }
      const surface = readSurface();
      // The surface can move between arming the timer and firing it.
      if (
        !surface.taskId ||
        session.key !==
          `${surface.workspaceId}${UNIT_SEPARATOR}${surface.taskId}`
      ) {
        return;
      }

      let pending;
      try {
        pending = await listResultReviews({
          workspaceId: surface.workspaceId,
          taskId: surface.taskId,
          pendingOnly: true,
          includeEvidence: false,
          limit: 200,
        });
      } catch (error) {
        // Opportunistic: an unreadable result list leaves every row listed,
        // which is the safe direction. Explicit `Mark reviewed` still works.
        console.warn("[fleet] result auto-review read failed", error);
        return;
      }
      if (cancelled || dwell !== session) {
        return;
      }

      const nowMs = Date.now();
      const ready = selectAutoReviewableResults({
        results: pending.results,
        surface: {
          activeWorkspaceId: surface.workspaceId,
          visibleTaskId: surface.taskId,
          windowFocused: true,
        },
        activeTurnId: surface.activeTurnId,
        dwellStartedAtMs: session.startedAtMs,
        nowMs,
      });
      if (ready.length > 0) {
        try {
          await setResultsReviewed({
            scopes: ready.map((result) => ({
              projectPath: result.projectPath,
              workspaceId: result.workspaceId,
              taskId: result.taskId,
              turnId: result.turnId,
            })),
            reviewed: true,
          });
        } catch (error) {
          console.warn("[fleet] result auto-review write failed", error);
        }
      }
      if (cancelled || dwell !== session) {
        return;
      }

      /**
       * A result that landed while the user was already watching still owes its
       * own dwell, so it is skipped above. Re-arm for the moment it comes of
       * age instead of polling, which would otherwise be the only way it ever
       * clears without another store update.
       */
      const nextDueMs = pending.results
        .filter(
          (result) =>
            !result.reviewedAt &&
            result.taskId === surface.taskId &&
            result.workspaceId === surface.workspaceId &&
            !(surface.activeTurnId && result.turnId === surface.activeTurnId),
        )
        .map(
          (result) =>
            Date.parse(result.createdAt) + FLEET_RESULT_AUTO_REVIEW_DWELL_MS,
        )
        .filter((dueMs) => Number.isFinite(dueMs) && dueMs > nowMs)
        .sort((left, right) => left - right)[0];
      if (nextDueMs !== undefined) {
        schedule(nextDueMs - nowMs + TIMER_SLACK_MS);
      }
    };

    const sync = () => {
      if (cancelled) {
        return;
      }
      const surface = readSurface();
      const notificationsChanged =
        lastNotifications !== null && surface.notifications !== lastNotifications;
      lastNotifications = surface.notifications;

      /**
       * The dwell survives unrelated store updates and even a new turn on the
       * same task, but not a change of task, workspace, or focus — those end the
       * viewing session this dwell was evidence for.
       */
      const dwellKey =
        isWindowFocused() && surface.taskId
          ? `${surface.workspaceId}${UNIT_SEPARATOR}${surface.taskId}`
          : "";
      if (!dwellKey) {
        dwell = null;
        lastRunKey = "";
        clearTimer();
        return;
      }
      if (dwell?.key !== dwellKey) {
        dwell = { key: dwellKey, startedAtMs: Date.now() };
      }

      // Only a change the store actually reported may cost another read.
      const runKey = `${dwellKey}${UNIT_SEPARATOR}${surface.activeTurnId ?? ""}`;
      if (runKey === lastRunKey && !notificationsChanged) {
        return;
      }
      lastRunKey = runKey;
      schedule(
        FLEET_RESULT_AUTO_REVIEW_DWELL_MS -
          (Date.now() - dwell.startedAtMs) +
          TIMER_SLACK_MS,
      );
    };

    const unsubscribe = useAppStore.subscribe(sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      cancelled = true;
      clearTimer();
      unsubscribe();
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
}
