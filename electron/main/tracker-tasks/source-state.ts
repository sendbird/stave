import type {
  TrackerSourceAvailability,
  TrackerSourceId,
  TrackerSourceSyncStatus,
} from "../../../src/lib/tracker-tasks/types";

/**
 * Per-source runtime bookkeeping.
 *
 * `failureCount` is internal to the backoff curve and never leaves the main
 * process; the public status the renderer sees is projected in `toStatuses`,
 * which deliberately drops it.
 */
export interface TrackerSourceRuntimeState {
  availability: TrackerSourceAvailability;
  syncing: boolean;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
  failureCount: number;
  truncated: boolean;
  taskCount: number;
}

/** Holds and projects the per-source state, keyed and ordered by registration. */
export class TrackerSourceStates {
  private readonly states = new Map<
    TrackerSourceId,
    TrackerSourceRuntimeState
  >();

  constructor(sourceIds: TrackerSourceId[]) {
    for (const id of sourceIds) {
      this.states.set(id, {
        // Unknown until the first availability read; corrected by
        // `refreshAvailability` before the surface is shown.
        availability: "not_configured",
        syncing: false,
        lastSyncedAt: null,
        lastErrorCode: null,
        failureCount: 0,
        truncated: false,
        taskCount: 0,
      });
    }
  }

  get(id: TrackerSourceId): TrackerSourceRuntimeState {
    const state = this.states.get(id);
    if (!state) {
      throw new Error(`No tracker state registered for "${id}".`);
    }
    return state;
  }

  toStatuses(): TrackerSourceSyncStatus[] {
    return [...this.states.entries()].map(([source, state]) => ({
      source,
      availability: state.availability,
      syncing: state.syncing,
      lastSyncedAt: state.lastSyncedAt,
      lastErrorCode: state.lastErrorCode,
      taskCount: state.taskCount,
      truncated: state.truncated,
    }));
  }
}
