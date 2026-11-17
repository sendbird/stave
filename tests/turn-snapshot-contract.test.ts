import { expect, test } from "bun:test";
import { TurnSnapshotOwnerSchema, TurnSnapshotRestoreSchema, TurnSnapshotListSchema, TurnSnapshotResultSchema } from "../src/lib/turn-snapshots";

test("snapshot IPC owners cannot supply paths, refs, or foreign fields", () => {
  const owner = { workspaceId: "workspace", taskId: "task" };
  expect(TurnSnapshotOwnerSchema.parse(owner)).toEqual(owner);
  for (const key of ["cwd", "ref", "snapshotId", "providerId"]) {
    expect(TurnSnapshotOwnerSchema.safeParse({ ...owner, [key]: "untrusted" }).success).toBe(false);
    expect(TurnSnapshotRestoreSchema.safeParse({ ...owner, turnId: "turn", [key]: "untrusted" }).success).toBe(false);
  }
  expect(TurnSnapshotRestoreSchema.safeParse({ ...owner, turnId: "" }).success).toBe(false);
});

test("snapshot IPC results reject malformed metadata and unsupported refusal codes", () => {
  expect(TurnSnapshotResultSchema.safeParse({ ok: false, reason: "forceRestore" }).success).toBe(false);
  expect(TurnSnapshotResultSchema.safeParse({ ok: true, overwrite: true }).success).toBe(false);
  expect(TurnSnapshotListSchema.safeParse({ snapshots: [{ turnId: "turn", snapshotId: "id", createdAt: "now", cwd: "/tmp/forbidden" }], skipped: [], canUndo: false }).success).toBe(false);
  expect(TurnSnapshotListSchema.safeParse({ snapshots: [], skipped: [], canUndo: false }).success).toBe(true);
  expect(TurnSnapshotListSchema.safeParse({ snapshots: [], skipped: [{ turnId: "turn", reason: "captureFailed" }], canUndo: false }).success).toBe(true);
  expect(TurnSnapshotListSchema.safeParse({ snapshots: [], skipped: [{ turnId: "turn", reason: "disk path /tmp/x" }], canUndo: false }).success).toBe(false);
});
