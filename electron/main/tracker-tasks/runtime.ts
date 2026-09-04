import type { LocalMcpTaskTurnUpdate } from "../../../src/lib/local-mcp/task-turn-update";
import type { CraneDispatchJobUpdate } from "../../../src/lib/crane-connector/types";
import type { TrackerSourceAdapter } from "../../../src/lib/tracker-tasks/source";
import { isTrackerSourceReady } from "../../../src/lib/tracker-tasks/source";
import {
  DEFAULT_TRACKER_TASKS_SETTINGS,
  type TrackerTasksSettings,
} from "../../../src/lib/tracker-tasks/settings";
import type {
  TrackerSourceAvailability,
  TrackerSourceId,
  TrackerTaskDetail,
  TrackerTaskListItem,
  TrackerTaskStaveLink,
  TrackerTasksPublicStatus,
} from "../../../src/lib/tracker-tasks/types";
import { computeCraneConnectorRetryDelay } from "../crane-connector/runtime";
import { applyTrackerDetailToCache } from "./cache";
import { toTrackerErrorCode, trackerRetryAfterMs } from "./errors";
import { TrackerKickoffLinks } from "./kickoff-links";
import type { TrackerTasksPersistence } from "./persistence";
import { TrackerSourceStates } from "./source-state";

export type { TrackerTasksPersistence } from "./persistence";

export interface TrackerTasksRuntimeDependencies {
  persistence: TrackerTasksPersistence;
  sources: TrackerSourceAdapter[];
  emitStatus: (status: TrackerTasksPublicStatus) => void;
  emitCacheUpdated: (payload: { source: TrackerSourceId }) => void;
  emitKickoffUpdated: (link: TrackerTaskStaveLink) => void;
  now?: () => Date;
  random?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
}

/** Base of the exponential retry curve; grown by `computeCraneConnectorRetryDelay`. */
const BASE_RETRY_DELAY_MS = 5_000;

export class TrackerTasksRuntime {
  private settings: TrackerTasksSettings = DEFAULT_TRACKER_TASKS_SETTINGS;
  private visible = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly states: TrackerSourceStates;
  private readonly queues = new Map<TrackerSourceId, Promise<void>>();
  private readonly controllers = new Map<TrackerSourceId, AbortController>();
  private readonly retryTimers = new Map<TrackerSourceId, NodeJS.Timeout>();
  // Kickoff-row bookkeeping lives beside the runtime but is driven by external
  // job/turn events rather than the poll timer, so it is its own unit.
  private readonly links: TrackerKickoffLinks;

  constructor(private readonly deps: TrackerTasksRuntimeDependencies) {
    this.states = new TrackerSourceStates(
      deps.sources.map((adapter) => adapter.sourceId),
    );
    this.links = new TrackerKickoffLinks({
      persistence: deps.persistence,
      emitKickoffUpdated: deps.emitKickoffUpdated,
      now: () => this.now(),
    });
  }

  configure(settings: TrackerTasksSettings): void {
    this.settings = settings;
    // A shorter interval must take effect without waiting out the old one.
    if (this.visible) {
      this.schedulePoll(this.intervalMs());
    }
  }

  getStatus(): TrackerTasksPublicStatus {
    return { sources: this.states.toStatuses() };
  }

  listItems(source?: TrackerSourceId): TrackerTaskListItem[] {
    return this.links.listItems(source);
  }

  async refresh(args: {
    source?: TrackerSourceId;
    reason: string;
  }): Promise<TrackerTasksPublicStatus> {
    const targets = args.source
      ? [args.source]
      : this.deps.sources.map((adapter) => adapter.sourceId);
    // Each source runs on its own queue, so a slow tracker never delays the
    // refresh of another.
    await Promise.all(
      targets.map((id) => this.enqueue(id, () => this.runRefresh(id))),
    );
    return this.getStatus();
  }

  async refreshAvailability(): Promise<TrackerTasksPublicStatus> {
    await Promise.all(
      this.deps.sources.map(async (adapter) => {
        const state = this.states.get(adapter.sourceId);
        const previous = state.availability;
        const next = await adapter.availability().catch(() => previous);
        state.availability = next;
        if (next === "disabled" && previous !== "disabled") {
          this.clearSourceCache(adapter.sourceId);
        }
        // A source that just became usable should not wait for the next poll.
        if (next !== previous && isTrackerSourceReady(next)) {
          void this.enqueue(adapter.sourceId, () =>
            this.runRefresh(adapter.sourceId),
          );
        }
      }),
    );
    this.emitStatus();
    return this.getStatus();
  }

  async getDetail(args: {
    source: TrackerSourceId;
    taskRef: string;
  }): Promise<TrackerTaskDetail> {
    const adapter = this.deps.sources.find(
      (candidate) => candidate.sourceId === args.source,
    );
    if (!adapter) {
      throw new Error(`No tracker source registered for "${args.source}".`);
    }
    // Queued so the single-row cache refresh below cannot interleave with a
    // full `replaceTrackerSourceTasks` sweep and lose a row.
    return this.enqueue(args.source, async () => {
      const controller = new AbortController();
      const detail = await adapter.getTask({
        ref: args.taskRef,
        signal: controller.signal,
      });
      applyTrackerDetailToCache(
        this.deps.persistence,
        detail,
        this.now().toISOString(),
      );
      this.deps.emitCacheUpdated({ source: detail.source });
      return detail;
    });
  }

  setSurfaceVisible(visible: boolean): void {
    if (visible === this.visible) {
      return;
    }
    this.visible = visible;
    if (!visible) {
      // The main cost control: a hidden surface makes no requests. Cancel every
      // in-flight fetch and clear every timer so nothing runs off-screen.
      this.clearPollTimer();
      this.clearRetryTimers();
      this.abortAll();
      this.emitStatus();
      return;
    }
    // Shown: refresh straight away when the cache is stale, otherwise wait out
    // the remaining interval before the first poll.
    this.schedulePoll(this.isCacheStale() ? 0 : this.intervalMs());
  }

  noteCraneJobUpdate(update: CraneDispatchJobUpdate): void {
    this.links.noteCraneJobUpdate(update);
  }

  noteTaskTurnUpdate(update: LocalMcpTaskTurnUpdate): void {
    this.links.noteTaskTurnUpdate(update);
  }

  attachStaveTask(args: {
    kickoffId: string;
    taskId: string;
  }): TrackerTaskStaveLink | null {
    return this.links.attachStaveTask(args);
  }

  shutdown(): void {
    this.visible = false;
    this.clearPollTimer();
    this.clearRetryTimers();
    this.abortAll();
  }

  private async runRefresh(id: TrackerSourceId): Promise<void> {
    const adapter = this.adapter(id);
    const state = this.states.get(id);
    const availability = await adapter.availability().catch((error) => {
      state.lastErrorCode = toTrackerErrorCode(error);
      return "not_configured" as TrackerSourceAvailability;
    });
    state.availability = availability;
    // Anything other than `ready` is a setup problem a timer cannot fix, so it
    // is reported but never fetched against.
    if (!isTrackerSourceReady(availability)) {
      state.syncing = false;
      if (availability === "disabled") {
        this.clearSourceCache(id);
      }
      this.emitStatus();
      return;
    }
    state.syncing = true;
    this.emitStatus();
    const controller = new AbortController();
    this.controllers.set(id, controller);
    try {
      const result = await adapter.listTasks({ signal: controller.signal });
      this.deps.persistence.replaceTrackerSourceTasks(
        id,
        result.tasks,
        this.now().toISOString(),
      );
      state.lastSyncedAt = this.now().toISOString();
      state.lastErrorCode = null;
      state.failureCount = 0;
      state.truncated = result.truncated;
      state.taskCount = result.tasks.length;
      state.syncing = false;
      this.emitStatus();
      this.deps.emitCacheUpdated({ source: id });
    } catch (error) {
      state.syncing = false;
      state.failureCount += 1;
      state.lastErrorCode = toTrackerErrorCode(error);
      this.emitStatus();
      // Honour a server-stated retry window over the computed curve: a tracker
      // that says "come back in N ms" is the authority on its own budget.
      const retryAfter = trackerRetryAfterMs(error);
      const delay =
        retryAfter ??
        computeCraneConnectorRetryDelay({
          baseDelayMs: BASE_RETRY_DELAY_MS,
          failureCount: state.failureCount,
          random: this.deps.random,
        });
      this.scheduleRetry(id, delay);
    } finally {
      if (this.controllers.get(id) === controller) {
        this.controllers.delete(id);
      }
    }
  }

  private schedulePoll(delayMs: number): void {
    if (!this.visible) {
      return;
    }
    this.clearPollTimer();
    this.pollTimer = this.setTimer(
      () => {
        this.pollTimer = null;
        if (!this.visible) {
          return;
        }
        void this.refresh({ reason: "poll" }).finally(() => {
          // Chain the next tick only while still visible so hiding the surface
          // ends the loop rather than merely pausing it.
          if (this.visible) {
            this.schedulePoll(this.intervalMs());
          }
        });
      },
      Math.max(0, delayMs),
    );
  }

  private scheduleRetry(id: TrackerSourceId, delayMs: number): void {
    if (!this.visible) {
      return;
    }
    const existing = this.retryTimers.get(id);
    if (existing) {
      this.clearTimer(existing);
    }
    this.retryTimers.set(
      id,
      this.setTimer(
        () => {
          this.retryTimers.delete(id);
          if (!this.visible) {
            return;
          }
          void this.enqueue(id, () => this.runRefresh(id));
        },
        Math.max(0, delayMs),
      ),
    );
  }

  private isCacheStale(): boolean {
    const intervalMs = this.intervalMs();
    const now = this.now().getTime();
    for (const adapter of this.deps.sources) {
      const state = this.states.get(adapter.sourceId);
      if (!isTrackerSourceReady(state.availability)) {
        continue;
      }
      if (
        !state.lastSyncedAt ||
        now - Date.parse(state.lastSyncedAt) >= intervalMs
      ) {
        return true;
      }
    }
    return false;
  }

  private enqueue<T>(
    id: TrackerSourceId,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    this.queues.set(
      id,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  private abortAll(): void {
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    this.controllers.clear();
  }

  private clearPollTimer(): void {
    if (this.pollTimer) {
      this.clearTimer(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private clearRetryTimers(): void {
    for (const timer of this.retryTimers.values()) {
      this.clearTimer(timer);
    }
    this.retryTimers.clear();
  }

  private clearSourceCache(id: TrackerSourceId): void {
    const state = this.states.get(id);
    this.deps.persistence.replaceTrackerSourceTasks(
      id,
      [],
      this.now().toISOString(),
    );
    state.taskCount = 0;
    state.truncated = false;
    state.lastErrorCode = null;
    this.deps.emitCacheUpdated({ source: id });
  }

  private emitStatus(): void {
    this.deps.emitStatus(this.getStatus());
  }

  private intervalMs(): number {
    return this.settings.refreshIntervalSeconds * 1_000;
  }

  private adapter(id: TrackerSourceId): TrackerSourceAdapter {
    const adapter = this.deps.sources.find(
      (candidate) => candidate.sourceId === id,
    );
    if (!adapter) {
      throw new Error(`No tracker source registered for "${id}".`);
    }
    return adapter;
  }

  private setTimer(callback: () => void, delayMs: number): NodeJS.Timeout {
    return (this.deps.setTimer ?? setTimeout)(callback, delayMs);
  }

  private clearTimer(timer: NodeJS.Timeout): void {
    (this.deps.clearTimer ?? clearTimeout)(timer);
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
}
