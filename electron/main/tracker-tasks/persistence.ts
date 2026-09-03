import type {
  TrackerSourceId,
  TrackerTask,
  TrackerTaskStaveLink,
} from "../../../src/lib/tracker-tasks/types";

/**
 * The persistence surface the tracker runtime, kickoff, and link bookkeeping
 * share, narrowed to the exact façade methods they call.
 *
 * Structural on purpose: a test hands over an in-memory fake with these methods
 * and never constructs a SQLite store, and this side can never reach a
 * credential- or lease-bearing method by mistake.
 */
export interface TrackerTasksPersistence {
  replaceTrackerSourceTasks(
    source: TrackerSourceId,
    tasks: TrackerTask[],
    fetchedAt: string,
  ): void;
  listTrackerSourceTasks(source?: TrackerSourceId): TrackerTask[];
  getTrackerTask(source: TrackerSourceId, taskRef: string): TrackerTask | null;
  upsertTrackerTaskKickoff(link: TrackerTaskStaveLink): void;
  listTrackerTaskKickoffs(args?: {
    source?: TrackerSourceId;
    taskRefs?: string[];
  }): TrackerTaskStaveLink[];
  findTrackerTaskKickoffByCraneJobId(
    craneJobId: string,
  ): TrackerTaskStaveLink | null;
  findTrackerTaskKickoffByStaveTask(
    taskId: string,
  ): TrackerTaskStaveLink | null;
  findLatestTrackerTaskKickoff(
    source: TrackerSourceId,
    taskRef: string,
  ): TrackerTaskStaveLink | null;
  pruneTrackerTaskKickoffs(cutoff: string): number;
}
