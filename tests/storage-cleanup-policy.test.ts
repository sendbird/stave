import { describe, expect, test } from "bun:test";
import {
  classifyLensPartitionDir,
  isStaleDatabaseFileName,
  planAutomaticStorageCleanup,
  planManualStorageCleanup,
  summarizeStorageCleanup,
  type LensPartitionEntry,
} from "../src/lib/storage-cleanup/storage-cleanup-policy";

const DAY_MS = 24 * 60 * 60 * 1000;

function entry(
  overrides: Partial<LensPartitionEntry> & Pick<LensPartitionEntry, "dirName">,
): LensPartitionEntry {
  return {
    partition: `persist:${overrides.dirName}`,
    kind: "workspace",
    status: "idle",
    bytes: 0,
    modifiedAtMs: 0,
    ...overrides,
  };
}

describe("classifyLensPartitionDir", () => {
  const context = {
    knownWorkspaceIds: new Set(["base:1abc", "worktree:2def"]),
    knownProjectHashes: new Set(["aaaaaaaaaaaaaaaaaaaaaaaa"]),
    activePartitions: new Set(["persist:lens-worktree:2def"]),
  };

  test("decodes percent-encoded workspace ids and detects known/active", () => {
    expect(classifyLensPartitionDir("lens-base%3A1abc", context)).toEqual({
      dirName: "lens-base%3A1abc",
      partition: "persist:lens-base:1abc",
      kind: "workspace",
      status: "idle",
    });
    expect(classifyLensPartitionDir("lens-worktree%3A2def", context)?.status).toBe(
      "active",
    );
    expect(classifyLensPartitionDir("lens-gone", context)?.status).toBe(
      "orphaned",
    );
  });

  test("matches project partitions by profile hash", () => {
    expect(
      classifyLensPartitionDir("lens-project-aaaaaaaaaaaaaaaaaaaaaaaa", context),
    ).toMatchObject({ kind: "project", status: "idle" });
    expect(
      classifyLensPartitionDir("lens-project-bbbbbbbbbbbbbbbbbbbbbbbb", context),
    ).toMatchObject({ kind: "project", status: "orphaned" });
  });

  test("ignores non-Lens partitions and undecodable names", () => {
    expect(classifyLensPartitionDir("other-thing", context)).toBeNull();
    expect(classifyLensPartitionDir("lens-%E0%A4%A", context)).toBeNull();
  });
});

describe("isStaleDatabaseFileName", () => {
  test("keeps the primary database and its sidecars", () => {
    expect(isStaleDatabaseFileName("stave.sqlite")).toBe(false);
    expect(isStaleDatabaseFileName("stave.sqlite-wal")).toBe(false);
    expect(isStaleDatabaseFileName("stave.sqlite-shm")).toBe(false);
  });

  test("flags other sqlite files", () => {
    expect(isStaleDatabaseFileName("stave-before-cleanup-20260727.sqlite")).toBe(
      true,
    );
    expect(isStaleDatabaseFileName("old.sqlite-wal")).toBe(true);
    expect(isStaleDatabaseFileName("Preferences")).toBe(false);
  });
});

describe("storage cleanup plans", () => {
  const now = 100 * DAY_MS;
  const report = summarizeStorageCleanup({
    now,
    partitions: [
      entry({ dirName: "lens-fresh-orphan", status: "orphaned", bytes: 10, modifiedAtMs: now - DAY_MS }),
      entry({ dirName: "lens-old-orphan", status: "orphaned", bytes: 20, modifiedAtMs: now - 30 * DAY_MS }),
      entry({ dirName: "lens-big-live", status: "idle", bytes: 900, modifiedAtMs: now }),
      entry({ dirName: "lens-small-live", status: "active", bytes: 5, modifiedAtMs: now }),
    ],
    staleDatabaseFiles: [{ fileName: "backup.sqlite", bytes: 1000, modifiedAtMs: 0 }],
    oversizedCacheMinBytes: 100,
  });

  test("summarizes totals", () => {
    expect(report.totals).toEqual({
      partitionBytes: 935,
      orphanedPartitionBytes: 30,
      orphanedPartitionCount: 2,
      oversizedCacheBytes: 900,
      oversizedCacheCount: 1,
      staleDatabaseBytes: 1000,
    });
  });

  test("automatic plan respects the orphan grace period and skips databases", () => {
    expect(
      planAutomaticStorageCleanup(report, now, { oversizedCacheMinBytes: 100 }),
    ).toEqual({
      deletePartitionDirNames: ["lens-old-orphan"],
      clearCachePartitions: ["persist:lens-big-live"],
      deleteDatabaseFileNames: [],
    });
  });

  test("manual plan follows the requested options without grace period", () => {
    expect(
      planManualStorageCleanup(
        report,
        {
          deleteOrphanedPartitions: true,
          clearLensCaches: "all",
          deleteStaleDatabaseFiles: true,
        },
        100,
      ),
    ).toEqual({
      deletePartitionDirNames: ["lens-fresh-orphan", "lens-old-orphan"],
      clearCachePartitions: ["persist:lens-big-live", "persist:lens-small-live"],
      deleteDatabaseFileNames: ["backup.sqlite"],
    });
    expect(planManualStorageCleanup(report, {}, 100)).toEqual({
      deletePartitionDirNames: [],
      clearCachePartitions: [],
      deleteDatabaseFileNames: [],
    });
  });
});
