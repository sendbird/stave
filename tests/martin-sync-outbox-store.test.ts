import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { MartinSyncOutboxStore } from "../electron/persistence/martin-sync-outbox-store";

const NOW = "2026-08-09T12:00:00.000Z";

describe("MartinSyncOutboxStore", () => {
  let database: Database;
  let store: MartinSyncOutboxStore;

  beforeEach(() => {
    database = new Database(":memory:");
    store = new MartinSyncOutboxStore(database);
  });

  afterEach(() => database.close());

  test("enqueues durable due entries and respects future schedules", () => {
    const entry = store.enqueue({
      workspaceId: "workspace-1",
      projectRef: "sync-outbox",
      kind: "event",
      payloadJson: '{"kind":"pr_opened"}',
      now: NOW,
    });
    expect(store.listDue({ now: NOW, limit: 10 })).toEqual([entry]);

    store.markRetry(entry.id, 1, "2026-08-09T12:01:00.000Z");
    expect(store.listDue({ now: NOW, limit: 10 })).toEqual([]);
    expect(
      store.listDue({ now: "2026-08-09T12:01:00.000Z", limit: 10 }),
    ).toMatchObject([{ attempts: 1 }]);

    const restarted = new MartinSyncOutboxStore(database);
    expect(
      restarted.listDue({ now: "2026-08-09T12:01:00.000Z", limit: 10 }),
    ).toHaveLength(1);
  });

  test("coalesces one non-terminal links merge per workspace", () => {
    const first = store.upsertLinksMerge({
      workspaceId: "workspace-1",
      projectRef: "sync-outbox",
      payloadJson: '{"links":[1]}',
      nextAttemptAt: "2026-08-09T12:00:01.000Z",
      now: NOW,
    });
    const second = store.upsertLinksMerge({
      workspaceId: "workspace-1",
      projectRef: "sync-outbox",
      payloadJson: '{"links":[2]}',
      nextAttemptAt: "2026-08-09T12:00:02.000Z",
      now: NOW,
    });
    expect(second.id).toBe(first.id);
    expect(
      store.listDue({ now: "2026-08-09T12:00:02.000Z", limit: 10 }),
    ).toMatchObject([
      {
        payloadJson: '{"links":[2]}',
        nextAttemptAt: "2026-08-09T12:00:02.000Z",
      },
    ]);
  });

  test("retries, fails, and explicitly requeues failed entries", () => {
    const entry = store.enqueue({
      workspaceId: "workspace-1",
      projectRef: "sync-outbox",
      kind: "event",
      payloadJson: "{}",
      now: NOW,
    });
    store.markFailed(entry.id);
    expect(
      store.listDue({ now: "9999-01-01T00:00:00.000Z", limit: 10 }),
    ).toEqual([]);
    expect(store.counts()).toEqual({ pending: 0, failed: 1 });
    expect(store.retryFailed()).toBe(1);
    expect(store.counts()).toEqual({ pending: 1, failed: 0 });
    expect(
      store.listDue({ now: "9999-01-01T00:00:00.000Z", limit: 10 }),
    ).toHaveLength(1);
  });

  test("holds and restores one workspace without affecting another", () => {
    for (const workspaceId of ["workspace-1", "workspace-2"]) {
      store.enqueue({
        workspaceId,
        projectRef: "sync-outbox",
        kind: "event",
        payloadJson: "{}",
        now: NOW,
      });
    }
    expect(store.setWorkspaceHeld("workspace-1", true)).toBe(1);
    expect(store.listDue({ now: NOW, limit: 10 })).toMatchObject([
      { workspaceId: "workspace-2" },
    ]);
    expect(store.setWorkspaceHeld("workspace-1", false)).toBe(1);
    expect(store.listDue({ now: NOW, limit: 10 })).toHaveLength(2);
  });

  test("holds and resumes a single project inside one workspace", () => {
    for (const projectRef of ["old-project", "new-project"]) {
      store.enqueue({
        workspaceId: "workspace-1",
        projectRef,
        kind: "event",
        payloadJson: "{}",
        now: NOW,
      });
    }

    expect(store.setWorkspaceHeld("workspace-1", true, "old-project")).toBe(1);
    expect(store.listDue({ now: NOW, limit: 10 })).toMatchObject([
      { projectRef: "new-project" },
    ]);

    expect(store.setWorkspaceHeld("workspace-1", false, "new-project")).toBe(0);
    expect(store.listDue({ now: NOW, limit: 10 })).toMatchObject([
      { projectRef: "new-project" },
    ]);

    expect(store.setWorkspaceHeld("workspace-1", false, "old-project")).toBe(1);
    expect(store.listDue({ now: NOW, limit: 10 })).toHaveLength(2);
  });

  test("discards undelivered rows for a project without touching others", () => {
    for (const projectRef of ["old-project", "new-project"]) {
      store.enqueue({
        workspaceId: "workspace-1",
        projectRef,
        kind: "event",
        payloadJson: "{}",
        now: NOW,
      });
    }
    const other = store.enqueue({
      workspaceId: "workspace-2",
      projectRef: "old-project",
      kind: "event",
      payloadJson: "{}",
      now: NOW,
    });
    const delivered = store.enqueue({
      workspaceId: "workspace-1",
      projectRef: "old-project",
      kind: "event",
      payloadJson: "{}",
      now: NOW,
    });
    store.markDelivered(delivered.id, NOW);

    expect(
      store.discardWorkspaceEntries({
        workspaceId: "workspace-1",
        projectRef: "old-project",
      }),
    ).toBe(1);
    expect(
      store
        .listDue({ now: NOW, limit: 10 })
        .map((entry) => `${entry.workspaceId}/${entry.projectRef}`)
        .sort(),
    ).toEqual(["workspace-1/new-project", "workspace-2/old-project"]);
    expect(store.counts()).toEqual({ pending: 2, failed: 0 });
    expect(other.id).toBeTruthy();
  });

  test("discards every project except the newly linked one, including held rows", () => {
    for (const projectRef of ["stale-a", "stale-b", "new-project"]) {
      store.enqueue({
        workspaceId: "workspace-1",
        projectRef,
        kind: "event",
        payloadJson: "{}",
        now: NOW,
      });
    }
    store.setWorkspaceHeld("workspace-1", true, "stale-a");
    store.markFailed(
      store
        .listDue({ now: NOW, limit: 10 })
        .find((entry) => entry.projectRef === "stale-b")!.id,
    );

    expect(
      store.discardWorkspaceEntries({
        workspaceId: "workspace-1",
        exceptProjectRef: "new-project",
      }),
    ).toBe(2);
    expect(store.counts()).toEqual({ pending: 1, failed: 0 });
    expect(store.listDue({ now: NOW, limit: 10 })).toMatchObject([
      { projectRef: "new-project" },
    ]);
  });

  test("re-points a held links merge to a new project as pending", () => {
    store.upsertLinksMerge({
      workspaceId: "workspace-1",
      projectRef: "old-project",
      payloadJson: '{"links":[]}',
      nextAttemptAt: NOW,
      now: NOW,
    });
    store.setWorkspaceHeld("workspace-1", true, "old-project");
    expect(store.listDue({ now: NOW, limit: 10 })).toEqual([]);

    const repointed = store.upsertLinksMerge({
      workspaceId: "workspace-1",
      projectRef: "new-project",
      payloadJson: '{"links":[]}',
      nextAttemptAt: NOW,
      now: NOW,
    });
    expect(repointed).toMatchObject({
      projectRef: "new-project",
      status: "pending",
    });
    expect(store.listDue({ now: NOW, limit: 10 })).toHaveLength(1);
  });

  test("keeps a held links merge held when the project is unchanged", () => {
    store.upsertLinksMerge({
      workspaceId: "workspace-1",
      projectRef: "old-project",
      payloadJson: '{"links":[]}',
      nextAttemptAt: NOW,
      now: NOW,
    });
    store.setWorkspaceHeld("workspace-1", true, "old-project");

    expect(
      store.upsertLinksMerge({
        workspaceId: "workspace-1",
        projectRef: "old-project",
        payloadJson: '{"links":[1]}',
        nextAttemptAt: NOW,
        now: NOW,
      }),
    ).toMatchObject({ status: "held" });
    expect(store.listDue({ now: NOW, limit: 10 })).toEqual([]);
  });

  test("prunes only delivered rows older than the cutoff", () => {
    const old = store.enqueue({
      workspaceId: "workspace-1",
      projectRef: "sync-outbox",
      kind: "event",
      payloadJson: "{}",
      now: NOW,
    });
    const recent = store.enqueue({
      workspaceId: "workspace-2",
      projectRef: "sync-outbox",
      kind: "event",
      payloadJson: "{}",
      now: NOW,
    });
    store.enqueue({
      workspaceId: "workspace-3",
      projectRef: "sync-outbox",
      kind: "event",
      payloadJson: "{}",
      now: NOW,
    });
    store.markDelivered(old.id, "2026-07-01T00:00:00.000Z");
    store.markDelivered(recent.id, "2026-08-08T00:00:00.000Z");
    expect(store.pruneDeliveredBefore("2026-08-01T00:00:00.000Z")).toBe(1);
    expect(store.counts()).toEqual({ pending: 1, failed: 0 });
  });
});
