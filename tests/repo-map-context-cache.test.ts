import { afterEach, describe, expect, test } from "bun:test";
import {
  getRepoMapContextCache,
  getRepoMapCacheSnapshot,
  setRepoMapContextCache,
  clearRepoMapContextCache,
} from "@/lib/fs/repo-map-context-cache";

const ENTRY_A = {
  text: "# Codebase Map\ncontext-a",
  snapshotUpdatedAt: "2026-03-30T00:00:00.000Z",
  fileCount: 42,
  codeFileCount: 30,
  hotspotCount: 5,
  entrypointCount: 2,
  docCount: 3,
};

const ENTRY_B = {
  text: "# Codebase Map\ncontext-b",
  snapshotUpdatedAt: "2026-03-30T01:00:00.000Z",
  fileCount: 100,
  codeFileCount: 80,
  hotspotCount: 10,
  entrypointCount: 4,
  docCount: 1,
};

afterEach(() => {
  clearRepoMapContextCache();
});

describe("repo-map-context-cache", () => {
  test("returns undefined for unknown workspace", () => {
    expect(getRepoMapContextCache("/tmp/nonexistent")).toBeUndefined();
  });

  test("stores and retrieves context text per workspace", () => {
    setRepoMapContextCache("/tmp/project-a", ENTRY_A);
    setRepoMapContextCache("/tmp/project-b", ENTRY_B);

    expect(getRepoMapContextCache("/tmp/project-a")).toBe(ENTRY_A.text);
    expect(getRepoMapContextCache("/tmp/project-b")).toBe(ENTRY_B.text);
  });

  test("overwrites existing entry for the same workspace", () => {
    setRepoMapContextCache("/tmp/project", ENTRY_A);
    setRepoMapContextCache("/tmp/project", ENTRY_B);

    expect(getRepoMapContextCache("/tmp/project")).toBe(ENTRY_B.text);
  });

  test("clears a single workspace entry", () => {
    setRepoMapContextCache("/tmp/project-a", ENTRY_A);
    setRepoMapContextCache("/tmp/project-b", ENTRY_B);
    clearRepoMapContextCache("/tmp/project-a");

    expect(getRepoMapContextCache("/tmp/project-a")).toBeUndefined();
    expect(getRepoMapContextCache("/tmp/project-b")).toBe(ENTRY_B.text);
  });

  test("clears all entries when no workspace is specified", () => {
    setRepoMapContextCache("/tmp/project-a", ENTRY_A);
    setRepoMapContextCache("/tmp/project-b", ENTRY_B);
    clearRepoMapContextCache();

    expect(getRepoMapContextCache("/tmp/project-a")).toBeUndefined();
    expect(getRepoMapContextCache("/tmp/project-b")).toBeUndefined();
  });

  test("snapshot exposes metadata including auto-set cachedAt", () => {
    setRepoMapContextCache("/tmp/project", ENTRY_A);
    const snapshot = getRepoMapCacheSnapshot();
    const entry = snapshot.get("/tmp/project");

    expect(entry).toBeDefined();
    expect(entry!.fileCount).toBe(42);
    expect(entry!.codeFileCount).toBe(30);
    expect(entry!.hotspotCount).toBe(5);
    expect(entry!.entrypointCount).toBe(2);
    expect(entry!.docCount).toBe(3);
    expect(entry!.snapshotUpdatedAt).toBe("2026-03-30T00:00:00.000Z");
    expect(entry!.cachedAt).toBeTruthy();
  });

  test("snapshot returns all cached workspaces", () => {
    setRepoMapContextCache("/tmp/project-a", ENTRY_A);
    setRepoMapContextCache("/tmp/project-b", ENTRY_B);
    const snapshot = getRepoMapCacheSnapshot();

    expect(snapshot.size).toBe(2);
    expect([...snapshot.keys()]).toEqual(["/tmp/project-a", "/tmp/project-b"]);
  });

  test("evicts the oldest entries when the cache exceeds its cap", () => {
    for (let index = 0; index < 10; index += 1) {
      setRepoMapContextCache(`/tmp/project-${index}`, {
        ...ENTRY_A,
        text: `context-${index}`,
      });
    }

    const snapshot = getRepoMapCacheSnapshot();

    expect(snapshot.size).toBe(8);
    expect(snapshot.has("/tmp/project-0")).toBe(false);
    expect(snapshot.has("/tmp/project-1")).toBe(false);
    expect(snapshot.has("/tmp/project-9")).toBe(true);
  });
});
