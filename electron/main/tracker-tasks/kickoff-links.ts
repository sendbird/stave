import type { CraneDispatchJobUpdate } from "../../../src/lib/crane-connector/types";
import type { LocalMcpTaskTurnUpdate } from "../../../src/lib/local-mcp/task-turn-update";
import type {
  TrackerSourceId,
  TrackerTaskLinkState,
  TrackerTaskListItem,
  TrackerTaskStaveLink,
} from "../../../src/lib/tracker-tasks/types";
import type { TrackerTasksPersistence } from "./persistence";

/**
 * Crane's job lifecycle projected onto our link states.
 *
 * `received`/`awaiting_local_approval` both fold into `running` because the
 * tracker surface only ever creates jobs it has already claimed, so a job it
 * knows about is a job that is on its way to running, never one still waiting
 * for a human to approve it.
 */
const CRANE_STATE_TO_LINK: Record<
  CraneDispatchJobUpdate["state"],
  TrackerTaskLinkState
> = {
  received: "running",
  awaiting_local_approval: "running",
  running: "running",
  needs_local_input: "needs_input",
  completed: "completed",
  failed: "failed",
  declined: "cancelled",
  cancelled: "cancelled",
};

export interface TrackerKickoffLinksDependencies {
  persistence: Pick<
    TrackerTasksPersistence,
    | "listTrackerSourceTasks"
    | "listTrackerTaskKickoffs"
    | "upsertTrackerTaskKickoff"
    | "findTrackerTaskKickoffByCraneJobId"
    | "findTrackerTaskKickoffByStaveTask"
  >;
  emitKickoffUpdated: (link: TrackerTaskStaveLink) => void;
  now: () => Date;
}

/**
 * The read/write bridge between a cached ticket and the Stave runs it started.
 *
 * Split from the polling runtime because the two answer to different clocks:
 * the runtime is driven by a timer and surface visibility, while these methods
 * are driven by external job and turn events. Keeping them apart also keeps the
 * runtime file within its size budget.
 */
export class TrackerKickoffLinks {
  constructor(private readonly deps: TrackerKickoffLinksDependencies) {}

  listItems(source?: TrackerSourceId): TrackerTaskListItem[] {
    const tasks = this.deps.persistence.listTrackerSourceTasks(source);
    const kickoffs = this.deps.persistence.listTrackerTaskKickoffs(
      source ? { source } : undefined,
    );
    const byTask = new Map<string, TrackerTaskStaveLink[]>();
    for (const link of kickoffs) {
      const key = `${link.source}:${link.taskRef}`;
      const bucket = byTask.get(key);
      if (bucket) {
        bucket.push(link);
      } else {
        byTask.set(key, [link]);
      }
    }
    return tasks.map((task) => ({
      task,
      staveLinks: byTask.get(`${task.source}:${task.ref}`) ?? [],
    }));
  }

  noteCraneJobUpdate(update: CraneDispatchJobUpdate): void {
    const kickoff = this.deps.persistence.findTrackerTaskKickoffByCraneJobId(
      update.jobId,
    );
    if (!kickoff) {
      return;
    }
    this.commit({
      ...kickoff,
      state: CRANE_STATE_TO_LINK[update.state],
      errorCode: update.errorCode,
      workspaceId: update.workspaceId ?? kickoff.workspaceId,
      staveTaskId: update.taskId ?? kickoff.staveTaskId,
      updatedAt: this.nowIso(),
    });
  }

  noteTaskTurnUpdate(update: LocalMcpTaskTurnUpdate): void {
    const kickoff = this.deps.persistence.findTrackerTaskKickoffByStaveTask(
      update.taskId,
    );
    if (!kickoff || kickoff.craneJobId) {
      // Crane-backed kickoffs report through `noteCraneJobUpdate`; letting both
      // channels write the same row would let them race.
      return;
    }
    if (kickoff.workspaceId !== update.workspaceId) return;
    const cursor = kickoff.localTurn;
    const isStart = update.eventType === "started";
    if (cursor?.id === update.turnId) {
      if (update.sequence <= cursor.sequence || cursor.ended) return;
    } else if (cursor && !isStart) {
      // A previous turn can finish after a follow-up has already started.
      return;
    }
    let state: TrackerTaskLinkState = kickoff.state;
    let errorCode = kickoff.errorCode;
    let ended = false;
    const activity = update.activityEvents ?? [];
    if (isStart) {
      state = "running";
      errorCode = null;
    } else if (update.eventType === "error") {
      if (activity.some((event) => event.type === "error" && event.recoverable))
        return;
      state = "failed";
      errorCode = "provider_failed";
      ended = true;
    } else if (update.done) {
      const done = activity.find((event) => event.type === "done");
      const cancelled =
        done?.type === "done" &&
        ["user_abort", "aborted", "cancelled"].includes(done.stop_reason ?? "");
      state = cancelled
        ? "cancelled"
        : kickoff.state === "failed"
          ? "failed"
          : "completed";
      errorCode = state === "failed" ? errorCode : null;
      ended = true;
    } else if (
      update.eventType === "approval" ||
      update.eventType === "user_input"
    ) {
      state = "needs_input";
    } else if (
      (kickoff.state === "staged" || kickoff.state === "needs_input") &&
      ["text", "thinking", "tool", "tool_result"].includes(update.eventType)
    ) {
      state = "running";
    } else {
      return;
    }
    this.commit({
      ...kickoff,
      state,
      errorCode,
      localTurn: { id: update.turnId, sequence: update.sequence, ended },
      updatedAt: this.nowIso(),
    });
  }

  attachStaveTask(args: {
    kickoffId: string;
    taskId: string;
  }): TrackerTaskStaveLink | null {
    const kickoff = this.deps.persistence
      .listTrackerTaskKickoffs()
      .find((candidate) => candidate.id === args.kickoffId);
    if (!kickoff) {
      return null;
    }
    return this.commit({
      ...kickoff,
      staveTaskId: args.taskId,
      updatedAt: this.nowIso(),
    });
  }

  private commit(link: TrackerTaskStaveLink): TrackerTaskStaveLink {
    this.deps.persistence.upsertTrackerTaskKickoff(link);
    this.deps.emitKickoffUpdated(link);
    return link;
  }

  private nowIso(): string {
    return this.deps.now().toISOString();
  }
}
