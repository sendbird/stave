import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createWakeUpRuntime } from "../electron/host-service/wake-up-runtime";
import { WakeUpStore } from "../electron/persistence/wake-up-store";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
import {
  DEFAULT_PULL_REQUEST_WATCH_PROMPT,
  PULL_REQUEST_WATCH_LIMITS,
  type PullRequestWatchEvent,
  type PullRequestWatchRead,
  type PullRequestWatchSnapshot,
} from "../src/lib/supervision/pull-request-watch";
import type { WakeUpUpsertInput } from "../src/lib/supervision/wake-up-policy";

const START = Date.parse("2026-10-09T12:00:00.000Z");
const TICK_MS = 15_000;

function pr(patch: Partial<PullRequestWatchSnapshot> = {}): PullRequestWatchSnapshot {
  return {
    number: 7,
    url: "https://github.com/acme/app/pull/7",
    title: "feat: uploads",
    state: "OPEN",
    headRefOid: "aaaaaaa111",
    baseRefName: "main",
    conflicting: false,
    failingChecks: [],
    checksPending: false,
    reviewComments: [],
    ...patch,
  };
}

function input(events: PullRequestWatchEvent[] = ["checks_failed", "merge_conflict"], patch: Partial<WakeUpUpsertInput> = {}): WakeUpUpsertInput {
  return {
    workspaceId: "ws-1",
    taskId: "task-1",
    prompt: DEFAULT_PULL_REQUEST_WATCH_PROMPT,
    trigger: { kind: "pull_request", events },
    maxOccurrences: null,
    expiresAt: null,
    ...patch,
  };
}

function createHarness(args: { omitReader?: boolean } = {}) {
  const store = new WakeUpStore(new Database(":memory:"));
  let now = START;
  let intervalCallback: (() => unknown) | null = null;
  let current: PullRequestWatchRead = { ok: true, pullRequest: null };
  let snapshot: TaskSupervisionSnapshot = {
    workspaceId: "ws-1",
    taskId: "task-1",
    repositoryPath: "/tmp/project",
    exists: true,
    archived: false,
    providerId: "codex",
    model: "gpt-5",
    activeTurnId: null,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
  };
  const reads: Array<{ pullRequestNumber: number | null; events: PullRequestWatchEvent[] }> = [];
  const runs: Array<{ prompt: string; fingerprint?: { providerId: string; model: string }; retrievedContextParts?: unknown[] }> = [];
  let turn = 0;

  const runtime = createWakeUpRuntime({
    persistence: {
      listWakeUps: () => store.list(),
      listActiveWakeUps: () => store.listActive(),
      listWakeUpsForWorkspace: (workspaceId) => store.listForWorkspace(workspaceId),
      getWakeUp: (id) => store.get(id),
      getWakeUpByTaskId: (taskId) => store.getByTaskId(taskId),
      upsertWakeUp: (wakeUp) => store.upsert(wakeUp),
      removeWakeUp: (id) => store.remove(id),
      recordWakeUpOccurrence: (occurrence) => store.recordOccurrence(occurrence),
      attachWakeUpOccurrenceTurn: (attach) => store.attachOccurrenceTurn(attach),
      listWakeUpOccurrences: (list) => store.listOccurrences(list),
      pruneWakeUpOccurrences: (prune) => store.pruneOccurrences(prune),
      completeInterruptedTurn: () => true,
    },
    getTaskSupervisionSnapshot: async () => snapshot,
    ...(args.omitReader
      ? {}
      : {
          readPullRequestWatch: async (readArgs) => {
            reads.push({ pullRequestNumber: readArgs.pullRequestNumber, events: readArgs.events });
            return current;
          },
        }),
    runSupervisedTurn: async (runArgs) => {
      runs.push(runArgs);
      turn += 1;
      return { turnId: `turn-${turn}` };
    },
    now: () => new Date(now),
    setInterval: ((callback: () => unknown) => {
      intervalCallback = callback;
      return 1;
    }) as unknown as typeof globalThis.setInterval,
    clearInterval: (() => {
      intervalCallback = null;
    }) as typeof globalThis.clearInterval,
  });

  return {
    runtime,
    store,
    reads,
    runs,
    setRead: (next: PullRequestWatchRead) => {
      current = next;
    },
    setSnapshot: (patch: Partial<TaskSupervisionSnapshot>) => {
      snapshot = { ...snapshot, ...patch };
    },
    /** Starts the supervisor and lets its first tick (and reads) land. */
    start: async () => {
      runtime.start();
      await runtime.whenIdle();
    },
    /** Advances the clock and runs one interval tick to completion. */
    tick: async (ms = TICK_MS) => {
      now += ms;
      await intervalCallback?.();
      await runtime.whenIdle();
    },
    /** Ticks on the real cadence until `ms` has passed. */
    advance: async (ms: number) => {
      for (let elapsed = 0; elapsed < ms; elapsed += TICK_MS) {
        now += TICK_MS;
        await intervalCallback?.();
        await runtime.whenIdle();
      }
    },
  };
}

describe("pull request watch runtime", () => {
  test("refuses a watch when pull requests cannot be read", async () => {
    const harness = createHarness({ omitReader: true });
    await expect(harness.runtime.create(input())).rejects.toThrow("cannot read pull requests");
    expect(harness.store.list()).toEqual([]);
  });

  test("the same failure fires once; a new failing check or a new head fires again", async () => {
    const harness = createHarness();
    const watch = await harness.runtime.create(input());
    harness.setRead({
      ok: true,
      pullRequest: pr({ failingChecks: [{ name: "lint", link: "https://github.com/acme/app/actions/runs/1/job/2" }] }),
    });
    await harness.start();

    expect(harness.runs).toHaveLength(1);
    expect(harness.runs[0]?.prompt).toContain("- lint: https://github.com/acme/app/actions/runs/1/job/2");
    // The woken turn runs as the task itself.
    expect(harness.runs[0]?.fingerprint).toEqual({ providerId: "codex", model: "gpt-5" });
    expect(JSON.stringify(harness.runs[0]?.retrievedContextParts)).toContain("pull request watch");

    // Ten more minutes of polling the same failure: no second turn.
    await harness.advance(10 * 60_000);
    expect(harness.reads.length).toBeGreaterThanOrEqual(5);
    expect(harness.runs).toHaveLength(1);
    // Once locked on, the watch reads its pull request by number.
    expect(harness.reads.at(-1)?.pullRequestNumber).toBe(7);

    // Another check fails on the same head: a new fact.
    harness.setRead({
      ok: true,
      pullRequest: pr({ failingChecks: [{ name: "lint", link: null }, { name: "test", link: null }] }),
    });
    await harness.advance(2 * 60_000);
    expect(harness.runs).toHaveLength(2);
    expect(harness.runs[1]?.prompt).toContain("These checks fail (head aaaaaaa):\n- test");
    expect(harness.runs[1]?.prompt).toContain("Still failing from an earlier report: lint.");

    // The agent pushed and the same check fails on the new head.
    harness.setRead({ ok: true, pullRequest: pr({ headRefOid: "bbbbbbb222", failingChecks: [{ name: "lint", link: null }] }) });
    await harness.advance(2 * 60_000);
    expect(harness.runs).toHaveLength(3);

    const stored = harness.store.get(watch.id);
    expect(stored).toMatchObject({ state: "scheduled", occurrenceCount: 3 });
    expect(stored?.pullRequestWatch?.lastSeen).toMatchObject({ failingChecks: 1 });
    expect(
      harness.store
        .listOccurrences({ wakeUpId: watch.id, limit: 50 })
        .filter((occurrence) => occurrence.outcome === "fired")
        .map((occurrence) => occurrence.turnId),
    ).toEqual(["turn-3", "turn-2", "turn-1"]);
  });

  test("a conflict fires once per head and lists the base", async () => {
    const harness = createHarness();
    await harness.runtime.create(input(["merge_conflict"]));
    harness.setRead({ ok: true, pullRequest: pr({ conflicting: true, failingChecks: [{ name: "lint", link: null }] }) });
    await harness.start();
    await harness.advance(6 * 60_000);
    expect(harness.runs).toHaveLength(1);
    expect(harness.runs[0]?.prompt).toContain("The branch conflicts with main");
    // Not watched, so failing checks are not reported.
    expect(harness.runs[0]?.prompt).not.toContain("These checks fail");
  });

  test("never interrupts a running turn: it queues the wake and fires right after the turn", async () => {
    const harness = createHarness();
    const watch = await harness.runtime.create(input());
    harness.setSnapshot({ activeTurnId: "user-turn" });
    harness.setRead({ ok: true, pullRequest: pr({ failingChecks: [{ name: "lint", link: null }] }) });
    await harness.start();

    expect(harness.runs).toHaveLength(0);
    const deferred = harness.store.listOccurrences({ wakeUpId: watch.id }).filter((occurrence) => occurrence.outcome === "deferred");
    expect(deferred).toHaveLength(1);
    expect(harness.store.get(watch.id)?.pullRequestWatch?.pendingSince).not.toBeNull();

    // While the turn runs, GitHub is read on the interval only.
    const readsBefore = harness.reads.length;
    await harness.tick();
    await harness.tick();
    expect(harness.reads.length).toBe(readsBefore);
    await harness.advance(2 * 60_000);
    expect(harness.runs).toHaveLength(0);
    // Repeated deferrals collapse into one row.
    expect(
      harness.store.listOccurrences({ wakeUpId: watch.id }).filter((occurrence) => occurrence.outcome === "deferred"),
    ).toHaveLength(1);

    // The turn ends: the very next tick re-reads and fires.
    harness.setSnapshot({ activeTurnId: null });
    const readsAtTurnEnd = harness.reads.length;
    await harness.tick();
    expect(harness.reads.length).toBe(readsAtTurnEnd + 1);
    expect(harness.runs).toHaveLength(1);
    expect(harness.store.get(watch.id)?.pullRequestWatch?.pendingSince).toBeNull();
  });

  test("a turn that fixed the failure leaves nothing to fire", async () => {
    const harness = createHarness();
    await harness.runtime.create(input());
    harness.setSnapshot({ activeTurnId: "user-turn" });
    harness.setRead({ ok: true, pullRequest: pr({ failingChecks: [{ name: "lint", link: null }] }) });
    await harness.start();
    harness.setRead({ ok: true, pullRequest: pr({ headRefOid: "ccccccc", checksPending: true }) });
    harness.setSnapshot({ activeTurnId: null });
    await harness.tick();
    await harness.advance(4 * 60_000);
    expect(harness.runs).toHaveLength(0);
  });

  test("stops when the pull request merges or closes", async () => {
    for (const state of ["MERGED", "CLOSED"] as const) {
      const harness = createHarness();
      const watch = await harness.runtime.create(input());
      harness.setRead({ ok: true, pullRequest: pr() });
      await harness.start();
      harness.setRead({ ok: true, pullRequest: pr({ state, failingChecks: [{ name: "lint", link: null }] }) });
      await harness.advance(2 * 60_000);
      expect(harness.store.get(watch.id)).toMatchObject({
        state: "stopped",
        stopReason: state === "MERGED" ? "pull-request-merged" : "pull-request-closed",
      });
      expect(harness.runs).toHaveLength(0);
      // A stopped watch is not read again.
      const readsAtStop = harness.reads.length;
      await harness.advance(10 * 60_000);
      expect(harness.reads.length).toBe(readsAtStop);
    }
  });

  test("backs off on read failures, recovers on a success, and stops after repeated failures", async () => {
    const harness = createHarness();
    const watch = await harness.runtime.create(input());
    harness.setRead({ ok: false, error: "gh: network unreachable" });
    await harness.start();
    expect(harness.reads).toHaveLength(1);
    // The second read waits out a doubled interval (4 minutes), not 2.
    await harness.advance(3 * 60_000);
    expect(harness.reads).toHaveLength(1);
    await harness.advance(60_000);
    expect(harness.reads).toHaveLength(2);
    expect(harness.store.get(watch.id)?.pullRequestWatch).toMatchObject({
      consecutiveReadFailures: 2,
      lastReadError: "gh: network unreachable",
    });

    // One good read resets the count.
    harness.setRead({ ok: true, pullRequest: pr() });
    await harness.advance(8 * 60_000);
    expect(harness.store.get(watch.id)?.pullRequestWatch).toMatchObject({ consecutiveReadFailures: 0, lastReadError: null });

    // Then GitHub stays down long enough to give up.
    harness.setRead({ ok: false, error: "gh: network unreachable" });
    await harness.advance(4 * 60 * 60_000);
    expect(harness.store.get(watch.id)).toMatchObject({ state: "stopped", stopReason: "pull-request-unreadable" });
    expect(harness.reads.length).toBeLessThan(20);
    expect(harness.store.get(watch.id)?.pullRequestWatch?.consecutiveReadFailures).toBe(
      PULL_REQUEST_WATCH_LIMITS.maxConsecutiveReadFailures,
    );
  });

  test("a reader that throws counts as a failed read, not a crashed tick", async () => {
    const harness = createHarness();
    const watch = await harness.runtime.create(input());
    harness.setRead({ ok: true, pullRequest: pr({ title: "x".repeat(10_000) }) } as PullRequestWatchRead);
    await harness.start();
    expect(harness.store.get(watch.id)?.pullRequestWatch?.consecutiveReadFailures).toBe(1);
  });

  test("respects the occurrence cap and expiry", async () => {
    const capped = createHarness();
    const watch = await capped.runtime.create(input(["checks_failed"], { maxOccurrences: 1 }));
    capped.setRead({ ok: true, pullRequest: pr({ failingChecks: [{ name: "lint", link: null }] }) });
    await capped.start();
    expect(capped.store.get(watch.id)).toMatchObject({ state: "stopped", stopReason: "occurrence-cap-reached" });
    capped.setRead({ ok: true, pullRequest: pr({ headRefOid: "new", failingChecks: [{ name: "lint", link: null }] }) });
    await capped.advance(4 * 60_000);
    expect(capped.runs).toHaveLength(1);

    const expiring = createHarness();
    const expiry = await expiring.runtime.create(
      input(["checks_failed"], { expiresAt: new Date(START + 60_000).toISOString() }),
    );
    expiring.setRead({ ok: true, pullRequest: pr() });
    await expiring.start();
    await expiring.advance(2 * 60_000);
    expect(expiring.store.get(expiry.id)).toMatchObject({ state: "stopped", stopReason: "expired" });
  });

  test("pause and resume use the wake-up controls; a paused watch is not read", async () => {
    const harness = createHarness();
    const watch = await harness.runtime.create(input());
    harness.setRead({ ok: true, pullRequest: pr() });
    await harness.start();
    await harness.runtime.pause({ id: watch.id });
    const readsAtPause = harness.reads.length;
    harness.setRead({ ok: true, pullRequest: pr({ failingChecks: [{ name: "lint", link: null }] }) });
    await harness.advance(10 * 60_000);
    expect(harness.reads.length).toBe(readsAtPause);
    expect(harness.runs).toHaveLength(0);
    await harness.runtime.resume({ id: watch.id });
    await harness.advance(2 * 60_000);
    expect(harness.runs).toHaveLength(1);
  });

  test("editing the events keeps what the watch saw, so a reported failure is not reported again", async () => {
    const harness = createHarness();
    const watch = await harness.runtime.create(input(["checks_failed"]));
    harness.setRead({
      ok: true,
      pullRequest: pr({
        failingChecks: [{ name: "lint", link: null }],
        reviewComments: [{ id: "c1", author: "alice", path: "a.ts", line: 1, body: "Rename.", url: "", createdAt: "" }],
      }),
    });
    await harness.start();
    expect(harness.runs).toHaveLength(1);

    const updated = await harness.runtime.update({ id: watch.id, input: input(["review_comments", "checks_failed"]) });
    expect(updated.trigger).toEqual({ kind: "pull_request", events: ["checks_failed", "review_comments"] });
    expect(updated.pullRequestWatch?.pullRequest?.number).toBe(7);
    expect(updated.occurrenceCount).toBe(1);

    await harness.advance(2 * 60_000);
    // Only the comment is new.
    expect(harness.runs).toHaveLength(2);
    expect(harness.runs[1]?.prompt).toContain("New review comments");
    expect(harness.runs[1]?.prompt).not.toContain("These checks fail");
    expect(harness.reads.at(-1)?.events).toEqual(["checks_failed", "review_comments"]);
  });

  test("waits for a pull request to appear on the branch", async () => {
    const harness = createHarness();
    const watch = await harness.runtime.create(input());
    harness.setRead({ ok: true, pullRequest: null });
    await harness.start();
    await harness.advance(4 * 60_000);
    expect(harness.store.get(watch.id)).toMatchObject({ state: "scheduled" });
    expect(harness.reads.every((read) => read.pullRequestNumber === null)).toBe(true);
    harness.setRead({ ok: true, pullRequest: pr({ conflicting: true }) });
    await harness.advance(2 * 60_000);
    expect(harness.runs).toHaveLength(1);
  });
});

describe("wake-up store and pull request watches", () => {
  test("adds the watch column to a database from before watches and round-trips the state", () => {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE wake_ups (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, project_path TEXT NOT NULL,
        prompt TEXT NOT NULL, trigger_json TEXT NOT NULL, fingerprint_json TEXT NOT NULL, state TEXT NOT NULL,
        pause_reason TEXT, stop_reason TEXT, reason_detail TEXT, next_run_at TEXT, last_occurrence_at TEXT,
        occurrence_count INTEGER NOT NULL DEFAULT 0, skipped_count INTEGER NOT NULL DEFAULT 0,
        max_occurrences INTEGER, expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO wake_ups VALUES (
        'old', 'ws-1', 'task-9', '/tmp/project', 'Re-check.', '{"kind":"schedule","schedule":{"every":1,"unit":"hours"}}',
        '{"providerId":"claude-code","model":"sonnet"}', 'scheduled', NULL, NULL, NULL, '2026-10-09T13:00:00.000Z', NULL,
        0, 0, NULL, NULL, '2026-10-09T12:00:00.000Z', '2026-10-09T12:00:00.000Z'
      );
    `);
    const store = new WakeUpStore(database);
    expect(store.get("old")?.pullRequestWatch).toBeNull();
    const old = store.get("old")!;
    const written = store.upsert({
      ...old,
      id: "watch",
      taskId: "task-10",
      trigger: { kind: "pull_request", events: ["checks_failed"] },
      nextRunAt: null,
      pullRequestWatch: {
        pullRequest: { number: 7, url: "https://github.com/acme/app/pull/7", title: "feat" },
        lastCheckedAt: "2026-10-09T12:02:00.000Z",
        lastSeen: { state: "OPEN", failingChecks: 1, conflicting: false, reviewComments: 0, checksPending: false },
        consecutiveReadFailures: 0,
        lastReadError: null,
        pendingSince: null,
      },
    });
    expect(written.pullRequestWatch?.pullRequest?.number).toBe(7);
    // A damaged cache resets rather than poisoning the row.
    database.prepare("UPDATE wake_ups SET watch_state_json = ? WHERE id = ?").run("{not json", "watch");
    expect(store.get("watch")?.pullRequestWatch).toBeNull();
  });
});
