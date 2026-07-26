import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CraneJobBindingStore,
  type LocalCraneJobBinding,
} from "../electron/persistence/crane-job-binding-store";

const JOB = {
  version: 1,
  id: "job-1",
  kind: "run_task",
  connectorId: "connector-1",
  issue: {
    id: "issue-1",
    key: "CRANE-42",
    title: "Fix the dispatch",
    description: "Keep results local.",
    href: "https://atelier.delight-tools.ai/apps/crane/task/CRANE-42",
    updatedAt: "2026-07-26T00:00:00.000Z",
  },
  instruction: "Implement the locally approved change.",
  requestedAt: "2026-07-26T00:01:00.000Z",
  expiresAt: "2026-07-27T00:01:00.000Z",
} as const;

function binding(
  patch: Partial<LocalCraneJobBinding> = {},
): LocalCraneJobBinding {
  return {
    jobId: JOB.id,
    connectorId: JOB.connectorId,
    job: JOB,
    leaseExpiresAt: "2026-07-26T00:16:00.000Z",
    state: "awaiting_local_approval",
    lastReceiptSequence: 2,
    pendingReceipt: null,
    workspaceId: null,
    taskId: null,
    turnId: null,
    errorCode: null,
    updatedAt: "2026-07-26T00:02:00.000Z",
    ...patch,
  };
}

describe("CraneJobBindingStore", () => {
  let root = "";
  let database: Database;
  let store: CraneJobBindingStore;

  beforeEach(() => {
    root = path.join(
      tmpdir(),
      `stave-crane-binding-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(root, { recursive: true });
    database = new Database(path.join(root, "bindings.sqlite"));
    store = new CraneJobBindingStore(database);
  });

  afterEach(() => {
    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  test("restores an approval with its exact job and receipt cursor", () => {
    store.upsert(binding());

    expect(store.listActive(JOB.connectorId)).toEqual([binding()]);
  });

  test("updates a binding without changing its remote identity", () => {
    store.upsert(binding());
    const running = binding({
      state: "running",
      lastReceiptSequence: 3,
      workspaceId: "workspace-1",
      taskId: "task-1",
      turnId: "turn-1",
      updatedAt: "2026-07-26T00:03:00.000Z",
    });

    expect(store.upsert(running)).toEqual(running);
    expect(store.get(JOB.id)).toEqual(running);
  });

  test("keeps a terminal binding active until its pending receipt is delivered", () => {
    const completed = binding({
      state: "completed",
      pendingReceipt: {
        version: 1,
        jobId: JOB.id,
        connectorId: JOB.connectorId,
        sequence: 3,
        state: "completed",
        occurredAt: "2026-07-26T00:03:00.000Z",
      },
      updatedAt: "2026-07-26T00:03:00.000Z",
    });
    store.upsert(completed);

    expect(store.listActive(JOB.connectorId)).toEqual([completed]);
    expect(store.pruneTerminalBefore("2026-08-01T00:00:00.000Z")).toBe(
      0,
    );
    expect(store.get(JOB.id)).toEqual(completed);
  });

  test("rejects identity reuse and prunes only old terminal rows", () => {
    store.upsert(binding());
    expect(() =>
      store.upsert(
        binding({
          connectorId: "connector-2",
          job: { ...JOB, connectorId: "connector-2" },
        }),
      ),
    ).toThrow("different identity");

    store.upsert(
      binding({
        state: "completed",
        updatedAt: "2026-06-01T00:00:00.000Z",
      }),
    );
    expect(store.pruneTerminalBefore("2026-07-01T00:00:00.000Z")).toBe(
      1,
    );
    expect(store.get(JOB.id)).toBeNull();
  });
});
