import { i18n } from "@/i18n/runtime";
import type {
  ProviderTurnActivitySnapshot,
  ProviderTurnWorkItem,
} from "@/lib/providers/turn-status";

/**
 * What a running task was last seen doing, from its turn's activity snapshot
 * only. Every value is something an event reported: the latest work item with
 * its own time, how long the turn has run, how long an open request has
 * waited (the work graph's `raisedAt`), and how long the turn has been quiet.
 * Nothing is inferred from the transcript and nothing is estimated — no
 * percent, no ETA — so a task with no reported work item shows no activity.
 */
export interface TaskActivityLine {
  last: { label: string; detail: string | null; at: number } | null;
  /** From the turn's start to its end, or to now while it runs. */
  elapsedMs: number;
  /** Since the oldest request still open in the turn, or null. */
  waitingMs: number | null;
  /** Since the turn's last event, while it runs; null once it ended. */
  quietMs: number | null;
}

function latestWorkItem(
  activity: ProviderTurnActivitySnapshot,
): ProviderTurnWorkItem | null {
  let latest: ProviderTurnWorkItem | null = null;
  for (const id of activity.orderedWorkItemIds) {
    const item = activity.workItemsById[id];
    if (item && (!latest || item.updatedAt >= latest.updatedAt)) {
      latest = item;
    }
  }
  return latest;
}

function oldestOpenInteractionAt(activity: ProviderTurnActivitySnapshot) {
  let oldest: number | null = null;
  for (const interaction of Object.values(
    activity.workGraph?.interactionsById ?? {},
  )) {
    if (interaction.resolvedAt != null || !Number.isFinite(interaction.raisedAt)) {
      continue;
    }
    if (oldest === null || interaction.raisedAt < oldest) {
      oldest = interaction.raisedAt;
    }
  }
  return oldest;
}

export function buildTaskActivityLine(args: {
  activity: ProviderTurnActivitySnapshot | null | undefined;
  now: number;
}): TaskActivityLine | null {
  const { activity, now } = args;
  if (!activity) {
    return null;
  }
  const latest = latestWorkItem(activity);
  const end = activity.completedAt ?? now;
  const raisedAt = activity.pendingInteraction
    ? oldestOpenInteractionAt(activity)
    : null;
  return {
    last: latest
      ? {
          label: latest.title,
          detail: latest.detail?.trim() || null,
          at: latest.updatedAt,
        }
      : null,
    elapsedMs: Math.max(0, end - activity.startedAt),
    waitingMs: raisedAt === null ? null : Math.max(0, now - raisedAt),
    quietMs:
      activity.completedAt == null
        ? Math.max(0, now - activity.lastEventAt)
        : null,
  };
}

/** "12s", "2m 10s", "1h 5m": a measured span, never rounded up. */
export function formatActivityDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) {
    return i18n.t("session:duration.seconds", { count: totalSeconds });
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds > 0
      ? i18n.t("session:duration.minutesSeconds", {
          minutes: totalMinutes,
          seconds,
        })
      : i18n.t("session:duration.minutes", { count: totalMinutes });
  }
  return i18n.t("session:duration.hoursMinutes", {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  });
}

/** "Edit file · src/search.ts · 12s ago", or null when no work was reported. */
export function describeLastActivity(
  line: Pick<TaskActivityLine, "last">,
  now: number,
) {
  if (!line.last) {
    return null;
  }
  const activity = line.last.detail
    ? i18n.t("fleet:taskActivity.withDetail", {
        label: line.last.label,
        detail: line.last.detail,
      })
    : line.last.label;
  return i18n.t("fleet:taskActivity.ago", {
    activity,
    duration: formatActivityDuration(now - line.last.at),
  });
}
