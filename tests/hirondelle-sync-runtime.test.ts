import { describe, expect, test } from "bun:test";

import { AtelierConnectorHttpError } from "../electron/main/atelier-connector/http-client";
import {
  HIRONDELLE_LINKS_MERGE_DEBOUNCE_MS,
  HirondelleSyncRuntime,
  MAX_HIRONDELLE_SYNC_ATTEMPTS,
} from "../electron/main/hirondelle-sync/runtime";
import type { HirondelleOutboxEntry } from "../electron/persistence/hirondelle-sync-outbox-store";
import type {
  StaveSyncEventV1,
  StaveSyncLinkV1,
} from "../src/lib/hirondelle-sync/contract";
import { DEFAULT_HIRONDELLE_SYNC_SETTINGS } from "../src/lib/hirondelle-sync/types";

const START_MS = Date.parse("2026-08-09T12:00:00.000Z");

function createEvent(index = 1): StaveSyncEventV1 {
  return {
    staveEventId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    kind: "work_update",
    summary: `Workspace update ${index}`,
    sourceUrl: null,
    tier: "factual",
    workspaceName: "Sync workspace",
    branch: "feat/sync",
  };
}

function createLink(label: string): StaveSyncLinkV1 {
  return {
    kind: "other",
    label,
    url: `https://example.com/${label.toLowerCase()}`,
    note: "",
  };
}

function createHarness(options?: {
  credential?: null | { scopes: Array<"crane" | "hirondelle"> };
  postEvents?: (
    events: StaveSyncEventV1[],
  ) => Promise<Array<{ staveEventId: string; status: "inserted" | "duplicate" }>>;
}) {
  let nowMs = START_MS;
  let sequence = 0;
  const rows = new Map<string, HirondelleOutboxEntry>();
  const statuses: unknown[] = [];
  const mappingStale: unknown[] = [];
  const postCalls: StaveSyncEventV1[][] = [];
  const mergeCalls: StaveSyncLinkV1[][] = [];
  const timers: Array<{ callback: () => void; delayMs: number }> = [];

  const persistence = {
    enqueueHirondelleOutboxEntry(input: {
      workspaceId: string;
      projectRef: string;
      kind: "event";
      payloadJson: string;
      now: string;
    }) {
      sequence += 1;
      const entry: HirondelleOutboxEntry = {
        id: `10000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
        workspaceId: input.workspaceId,
        projectRef: input.projectRef,
        kind: input.kind,
        payloadJson: input.payloadJson,
        attempts: 0,
        nextAttemptAt: input.now,
        createdAt: input.now,
        deliveredAt: null,
        status: "pending",
      };
      rows.set(entry.id, entry);
      return structuredClone(entry);
    },
    upsertHirondelleLinksMergeEntry(input: {
      workspaceId: string;
      projectRef: string;
      payloadJson: string;
      nextAttemptAt: string;
      now: string;
    }) {
      const existing = [...rows.values()].find(
        (row) =>
          row.workspaceId === input.workspaceId &&
          row.kind === "links_merge" &&
          (row.status === "pending" || row.status === "held"),
      );
      if (existing) {
        Object.assign(existing, {
          projectRef: input.projectRef,
          payloadJson: input.payloadJson,
          attempts: 0,
          nextAttemptAt: input.nextAttemptAt,
          deliveredAt: null,
        });
        return structuredClone(existing);
      }
      sequence += 1;
      const entry: HirondelleOutboxEntry = {
        id: `20000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
        workspaceId: input.workspaceId,
        projectRef: input.projectRef,
        kind: "links_merge",
        payloadJson: input.payloadJson,
        attempts: 0,
        nextAttemptAt: input.nextAttemptAt,
        createdAt: input.now,
        deliveredAt: null,
        status: "pending",
      };
      rows.set(entry.id, entry);
      return structuredClone(entry);
    },
    listDueHirondelleOutboxEntries(args: { now: string; limit: number }) {
      return [...rows.values()]
        .filter(
          (row) =>
            row.status === "pending" && row.nextAttemptAt <= args.now,
        )
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id),
        )
        .slice(0, args.limit)
        .map((row) => structuredClone(row));
    },
    markHirondelleOutboxDelivered(id: string, deliveredAt: string) {
      Object.assign(rows.get(id)!, {
        status: "delivered" as const,
        deliveredAt,
      });
    },
    markHirondelleOutboxRetry(
      id: string,
      attempts: number,
      nextAttemptAt: string,
    ) {
      Object.assign(rows.get(id)!, {
        status: "pending" as const,
        attempts,
        nextAttemptAt,
      });
    },
    markHirondelleOutboxFailed(id: string) {
      Object.assign(rows.get(id)!, { status: "failed" as const });
    },
    setHirondelleOutboxWorkspaceHeld(workspaceId: string, held: boolean) {
      let changed = 0;
      for (const row of rows.values()) {
        const source = held ? "pending" : "held";
        if (row.workspaceId === workspaceId && row.status === source) {
          row.status = held ? "held" : "pending";
          changed += 1;
        }
      }
      return changed;
    },
    retryFailedHirondelleOutboxEntries() {
      let changed = 0;
      for (const row of rows.values()) {
        if (row.status !== "failed") continue;
        row.status = "pending";
        row.attempts = 0;
        row.deliveredAt = null;
        row.nextAttemptAt = new Date(nowMs).toISOString();
        changed += 1;
      }
      return changed;
    },
    countHirondelleOutbox() {
      let pending = 0;
      let failed = 0;
      for (const row of rows.values()) {
        if (row.status === "pending" || row.status === "held") pending += 1;
        if (row.status === "failed") failed += 1;
      }
      return { pending, failed };
    },
  };

  const postEvents =
    options?.postEvents ??
    (async (events: StaveSyncEventV1[]) =>
      events.map((event) => ({
        staveEventId: event.staveEventId,
        status: "duplicate" as const,
      })));
  const http = {
    postHirondelleEvents: async (args: { events: StaveSyncEventV1[] }) => {
      postCalls.push(structuredClone(args.events));
      return postEvents(args.events);
    },
    mergeHirondelleLinks: async (args: { links: StaveSyncLinkV1[] }) => {
      mergeCalls.push(structuredClone(args.links));
      return { ok: true as const, inserted: 0, updated: 1, skipped: 0 };
    },
  };
  const credentialOption = options && "credential" in options
    ? options.credential
    : { scopes: ["hirondelle" as const] };
  const runtime = new HirondelleSyncRuntime({
    persistence,
    getCredential: async () =>
      credentialOption
        ? {
            baseUrl: "https://atelier.example.com",
            secret: "stc_test-only",
            scopes: credentialOption.scopes,
          }
        : null,
    createHttpClient: () => http,
    emitStatus: (status: unknown) => statuses.push(status),
    emitMappingStale: (payload: unknown) => mappingStale.push(payload),
    now: () => new Date(nowMs),
    random: () => 0.5,
    setTimer: (callback: () => void, delayMs: number) => {
      const timer = { callback, delayMs };
      timers.push(timer);
      return timer as unknown as NodeJS.Timeout;
    },
    clearTimer: (timer: NodeJS.Timeout) => {
      const index = timers.indexOf(
        timer as unknown as { callback: () => void; delayMs: number },
      );
      if (index >= 0) timers.splice(index, 1);
    },
  } as ConstructorParameters<typeof HirondelleSyncRuntime>[0]);

  async function flush() {
    for (let index = 0; index < 10; index += 1) {
      await Bun.sleep(0);
    }
  }

  async function runNextTimer() {
    const timer = timers.shift();
    if (!timer) throw new Error("Expected a scheduled sync cycle.");
    timer.callback();
    await flush();
    return timer;
  }

  return {
    advance(ms: number) {
      nowMs += ms;
    },
    flush,
    mappingStale,
    mergeCalls,
    persistence,
    postCalls,
    rows,
    runNextTimer,
    runtime,
    statuses,
    timers,
  };
}

const ENABLED_SETTINGS = {
  ...DEFAULT_HIRONDELLE_SYNC_SETTINGS,
  enabled: true,
};

describe("HirondelleSyncRuntime", () => {
  test("durably queues while disabled and drains duplicate events once enabled", async () => {
    const harness = createHarness();

    harness.runtime.enqueueEvent({
      workspaceId: "workspace-1",
      projectRef: "project-1",
      event: createEvent(),
    });

    expect(harness.rows).toHaveLength(1);
    expect(harness.timers).toHaveLength(0);

    harness.runtime.configure(ENABLED_SETTINGS);
    await harness.runNextTimer();

    expect(harness.postCalls).toHaveLength(1);
    expect([...harness.rows.values()][0]).toMatchObject({
      status: "delivered",
      deliveredAt: new Date(START_MS).toISOString(),
    });
    expect(harness.runtime.getStatus()).toEqual({
      runtimeState: "idle",
      lastErrorCode: null,
      pendingCount: 0,
      failedCount: 0,
      lastDeliveredAt: new Date(START_MS).toISOString(),
    });
  });

  test("retries network failures with backoff and ignores stale timers after shutdown", async () => {
    let attempts = 0;
    const harness = createHarness({
      postEvents: async () => {
        attempts += 1;
        throw new AtelierConnectorHttpError("network_unavailable", 0);
      },
    });
    harness.runtime.configure(ENABLED_SETTINGS);
    harness.runtime.enqueueEvent({
      workspaceId: "workspace-1",
      projectRef: "project-1",
      event: createEvent(),
    });

    await harness.runNextTimer();

    expect([...harness.rows.values()][0]).toMatchObject({
      attempts: 1,
      nextAttemptAt: new Date(START_MS + 5_000).toISOString(),
      status: "pending",
    });
    expect(harness.runtime.getStatus()).toMatchObject({
      runtimeState: "offline",
      lastErrorCode: "network_unavailable",
    });
    expect(harness.timers).toMatchObject([{ delayMs: 5_000 }]);

    const staleTimer = harness.timers[0];
    harness.runtime.shutdown();
    staleTimer.callback();
    await harness.flush();
    expect(attempts).toBe(1);
  });

  test("dead-letters after eight attempts and explicitly retries failed rows", async () => {
    let shouldFail = true;
    const harness = createHarness({
      postEvents: async (events) => {
        if (shouldFail) {
          throw new AtelierConnectorHttpError("network_unavailable", 0);
        }
        return events.map((event) => ({
          staveEventId: event.staveEventId,
          status: "inserted" as const,
        }));
      },
    });
    harness.runtime.enqueueEvent({
      workspaceId: "workspace-1",
      projectRef: "project-1",
      event: createEvent(),
    });
    [...harness.rows.values()][0].attempts =
      MAX_HIRONDELLE_SYNC_ATTEMPTS - 1;
    harness.runtime.configure(ENABLED_SETTINGS);

    await harness.runNextTimer();
    expect([...harness.rows.values()][0].status).toBe("failed");
    expect(harness.runtime.getStatus()).toMatchObject({
      failedCount: 1,
      pendingCount: 0,
    });

    shouldFail = false;
    harness.runtime.retryFailed();
    await harness.runNextTimer();
    expect([...harness.rows.values()][0].status).toBe("delivered");
    expect(harness.runtime.getStatus()).toMatchObject({
      runtimeState: "idle",
      failedCount: 0,
    });
  });

  test("stops on unauthorized responses without scheduling a retry", async () => {
    const harness = createHarness({
      postEvents: async () => {
        throw new AtelierConnectorHttpError("unauthorized", 401);
      },
    });
    harness.runtime.configure(ENABLED_SETTINGS);
    harness.runtime.enqueueEvent({
      workspaceId: "workspace-1",
      projectRef: "project-1",
      event: createEvent(),
    });

    await harness.runNextTimer();

    expect(harness.runtime.getStatus()).toMatchObject({
      runtimeState: "unauthorized",
      lastErrorCode: "unauthorized",
      pendingCount: 1,
    });
    expect(harness.timers).toHaveLength(0);
  });

  test.each([
    [404, "project_not_found"],
    [409, "project_archived"],
  ] as const)("holds stale mappings after HTTP %i", async (status, code) => {
    const harness = createHarness({
      postEvents: async () => {
        throw new AtelierConnectorHttpError(code, status);
      },
    });
    harness.runtime.configure(ENABLED_SETTINGS);
    harness.runtime.enqueueEvent({
      workspaceId: "workspace-1",
      projectRef: "project-1",
      event: createEvent(),
    });

    await harness.runNextTimer();

    expect([...harness.rows.values()][0].status).toBe("held");
    expect(harness.mappingStale).toEqual([
      { workspaceId: "workspace-1", projectRef: "project-1", code },
    ]);
  });

  test("trailing-debounces resource links and sends only the latest payload", async () => {
    const harness = createHarness();
    harness.runtime.configure(ENABLED_SETTINGS);
    await harness.runNextTimer();

    harness.runtime.noteLinksChanged({
      workspaceId: "workspace-1",
      projectRef: "project-1",
      links: [createLink("First")],
    });
    harness.advance(5_000);
    harness.runtime.noteLinksChanged({
      workspaceId: "workspace-1",
      projectRef: "project-1",
      links: [createLink("Second")],
    });

    expect(harness.rows).toHaveLength(1);
    expect([...harness.rows.values()][0]).toMatchObject({
      payloadJson: JSON.stringify({ links: [createLink("Second")] }),
      nextAttemptAt: new Date(
        START_MS + 5_000 + HIRONDELLE_LINKS_MERGE_DEBOUNCE_MS,
      ).toISOString(),
    });
    expect(harness.timers).toMatchObject([
      { delayMs: HIRONDELLE_LINKS_MERGE_DEBOUNCE_MS },
    ]);

    harness.advance(HIRONDELLE_LINKS_MERGE_DEBOUNCE_MS);
    await harness.runNextTimer();
    expect(harness.mergeCalls).toEqual([[createLink("Second")]]);
  });

  test("batches at most twenty events per request", async () => {
    const harness = createHarness();
    harness.runtime.configure(ENABLED_SETTINGS);
    for (let index = 1; index <= 45; index += 1) {
      harness.runtime.enqueueEvent({
        workspaceId: "workspace-1",
        projectRef: "project-1",
        event: createEvent(index),
      });
    }

    await harness.runNextTimer();

    expect(harness.postCalls.map((events) => events.length)).toEqual([
      20, 20, 5,
    ]);
    expect(harness.runtime.getStatus()).toMatchObject({ pendingCount: 0 });
  });

  test("stays unpaired when the credential lacks the Hirondelle scope", async () => {
    const harness = createHarness({ credential: { scopes: ["crane"] } });
    harness.runtime.configure(ENABLED_SETTINGS);

    await harness.runNextTimer();

    expect(harness.runtime.getStatus().runtimeState).toBe("unpaired");
    expect(harness.timers).toHaveLength(0);
  });
});
