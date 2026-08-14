import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import {
  reduceProviderTurnActivityEvents,
  retainRetiredTurnActivity,
  type ProviderTurnActivitySnapshot,
  type RetainedTurnActivityByTask,
} from "@/lib/providers/turn-status";

type ProviderTurnActivityByTask = Record<
  string,
  ProviderTurnActivitySnapshot | undefined
>;

/** The two turn-activity maps one provider-event flush can move. */
export interface TurnActivityFlushPatch {
  providerTurnActivityByTask?: ProviderTurnActivityByTask;
  retainedTurnActivityByTask?: RetainedTurnActivityByTask;
}

/**
 * Fold one flush of provider events into the turn-activity store patch, and
 * take the replay copy of the turn if that flush is the one that ended it.
 *
 * Both come out of a single reduce because the finished turn exists nowhere
 * else: `done` arrives batched with the work that preceded it, and a cleanly
 * completed turn is deleted from the live map in the same pass, so re-reading
 * the map afterwards would retain a snapshot one flush stale — or empty, if the
 * whole turn drained in one batch.
 *
 * They also have to land in the same `set()`. Publishing them separately would
 * let the panel render once with the live turn already gone and nothing to
 * replay.
 *
 * Returns `null` when the flush moved neither map — which is most of them, and
 * the caller uses that to skip the store write entirely.
 */
export function buildTurnActivityFlushPatch(args: {
  activityByTask: ProviderTurnActivityByTask;
  retainedByTask: RetainedTurnActivityByTask;
  taskId: string;
  turnId: string;
  providerId: ProviderId;
  events: NormalizedProviderEvent[];
  now?: number;
}): TurnActivityFlushPatch | null {
  const reduced = reduceProviderTurnActivityEvents({
    activityByTask: args.activityByTask,
    taskId: args.taskId,
    turnId: args.turnId,
    providerId: args.providerId,
    events: args.events,
    ...(args.now === undefined ? {} : { now: args.now }),
  });
  const retained = retainRetiredTurnActivity({
    retainedByTask: args.retainedByTask,
    previous: args.activityByTask,
    next: reduced.activityByTask,
    taskId: args.taskId,
    snapshot: reduced.retiredSnapshot,
    ...(args.now === undefined ? {} : { now: args.now }),
  });
  const activityChanged = reduced.activityByTask !== args.activityByTask;
  const retainedChanged = retained !== args.retainedByTask;
  if (!activityChanged && !retainedChanged) {
    return null;
  }
  return {
    ...(activityChanged
      ? { providerTurnActivityByTask: reduced.activityByTask }
      : {}),
    ...(retainedChanged ? { retainedTurnActivityByTask: retained } : {}),
  };
}
