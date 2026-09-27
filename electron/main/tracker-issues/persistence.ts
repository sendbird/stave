import type {
  TrackerSourceId,
  TrackerIssue,
  TrackerIssueStaveLink,
} from "../../../src/lib/tracker-issues/types";

/**
 * The persistence surface the tracker runtime, kickoff, and link bookkeeping
 * share, narrowed to the exact façade methods they call.
 *
 * Structural on purpose: a test hands over an in-memory fake with these methods
 * and never constructs a SQLite store, and this side can never reach a
 * credential- or lease-bearing method by mistake.
 */
export interface TrackerIssuesPersistence {
  replaceTrackerSourceTasks(
    source: TrackerSourceId,
    tasks: TrackerIssue[],
    fetchedAt: string,
  ): void;
  listTrackerSourceTasks(source?: TrackerSourceId): TrackerIssue[];
  getTrackerIssue(source: TrackerSourceId, taskRef: string): TrackerIssue | null;
  upsertTrackerIssueKickoff(link: TrackerIssueStaveLink): void;
  listTrackerIssueKickoffs(args?: {
    source?: TrackerSourceId;
    taskRefs?: string[];
  }): TrackerIssueStaveLink[];
  findTrackerIssueKickoffByCraneJobId(
    craneJobId: string,
  ): TrackerIssueStaveLink | null;
  findTrackerIssueKickoffByStaveTask(
    taskId: string,
  ): TrackerIssueStaveLink | null;
  findLatestTrackerIssueKickoff(
    source: TrackerSourceId,
    taskRef: string,
  ): TrackerIssueStaveLink | null;
  pruneTrackerIssueKickoffs(cutoff: string): number;
}
