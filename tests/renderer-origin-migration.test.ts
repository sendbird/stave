// temporary-migration: renderer-origin-storage
import { describe, expect, test } from "bun:test";
import {
  runRendererOriginStorageMigration,
  type RendererOriginMigrationDeps,
  type StorageEntries,
} from "../electron/main/renderer-origin-migration";

/** A profile shaped like 0.25.0: everything lives at the file:// origin. */
function createProfile(args: {
  source: StorageEntries;
  target?: StorageEntries;
  marker?: boolean;
  usedByEarlierStave?: boolean;
}) {
  const source = new Map(args.source);
  const target = new Map(args.target ?? []);
  const calls: string[] = [];
  let marker: { entryCount: number } | null = args.marker
    ? { entryCount: -1 }
    : null;
  const deps: RendererOriginMigrationDeps = {
    hasMarker: () => marker !== null,
    profileMayHaveLegacyStorage: () => args.usedByEarlierStave ?? true,
    readSource: async () => {
      calls.push("readSource");
      return [...source];
    },
    writeTarget: async (entries) => {
      calls.push("writeTarget");
      for (const [key, value] of entries) target.set(key, value);
    },
    readTarget: async () => {
      calls.push("readTarget");
      return [...target];
    },
    flush: async () => {
      calls.push("flush");
    },
    writeMarker: (summary) => {
      calls.push("writeMarker");
      marker = summary;
    },
    dispose: () => {
      calls.push("dispose");
    },
    now: () => new Date("2026-10-06T00:00:00.000Z"),
  };
  return { deps, source, target, calls, marker: () => marker };
}

const OLD_PROFILE: StorageEntries = [
  ["stave-store", JSON.stringify({ state: { repositoryPath: "/tmp/repo" }, version: 0 })],
  ["stave:workspace-fallback:v1", "[]"],
  ["terminal-transcript:ws-1", "line one\nline two — ✓"],
];

describe("renderer origin localStorage migration", () => {
  test("copies every file:// entry, verifies it, then writes the marker", async () => {
    const profile = createProfile({ source: OLD_PROFILE });

    const result = await runRendererOriginStorageMigration(profile.deps, {
      timeoutMs: 1_000,
    });

    expect(result).toEqual({ status: "migrated", entryCount: 3 });
    expect([...profile.target]).toEqual(OLD_PROFILE);
    expect(profile.marker()).toEqual({
      entryCount: 3,
      migratedAt: "2026-10-06T00:00:00.000Z",
    });
    expect(profile.calls.indexOf("readTarget")).toBeLessThan(
      profile.calls.indexOf("writeMarker"),
    );
    expect(profile.calls.at(-1)).toBe("dispose");
  });

  test("does nothing once the marker exists", async () => {
    const profile = createProfile({ source: OLD_PROFILE, marker: true });

    const result = await runRendererOriginStorageMigration(profile.deps, {
      timeoutMs: 1_000,
    });

    expect(result).toEqual({ status: "already-migrated" });
    expect(profile.calls).toEqual(["dispose"]);
    expect(profile.target.size).toBe(0);
  });

  test("marks a profile no earlier Stave used without opening pages", async () => {
    const profile = createProfile({
      source: OLD_PROFILE,
      usedByEarlierStave: false,
    });

    const result = await runRendererOriginStorageMigration(profile.deps, {
      timeoutMs: 1_000,
    });

    expect(result).toEqual({ status: "migrated", entryCount: 0 });
    expect(profile.calls).toEqual(["writeMarker", "dispose"]);
  });

  test("overwrites a stale copy left by an earlier unverified attempt", async () => {
    const profile = createProfile({
      source: OLD_PROFILE,
      target: [["stave-store", "{\"stale\":true}"]],
    });

    const result = await runRendererOriginStorageMigration(profile.deps, {
      timeoutMs: 1_000,
    });

    expect(result.status).toBe("migrated");
    expect(profile.target.get("stave-store")).toBe(OLD_PROFILE[0][1]);
  });

  test("keeps file:// when the copy cannot be read back", async () => {
    const profile = createProfile({ source: OLD_PROFILE });
    profile.deps.readTarget = async () => [OLD_PROFILE[0]];

    const result = await runRendererOriginStorageMigration(profile.deps, {
      timeoutMs: 1_000,
    });

    expect(result).toEqual({
      status: "failed",
      reason: "verification found 2 unmatched key(s)",
    });
    expect(profile.marker()).toBeNull();
  });

  test("keeps file:// when reading the old origin fails", async () => {
    const profile = createProfile({ source: OLD_PROFILE });
    profile.deps.readSource = async () => {
      throw new Error("ERR_FAILED (-2)");
    };

    const result = await runRendererOriginStorageMigration(profile.deps, {
      timeoutMs: 1_000,
    });

    expect(result).toEqual({ status: "failed", reason: "ERR_FAILED (-2)" });
    expect(profile.marker()).toBeNull();
    expect(profile.calls).toEqual(["dispose"]);
  });

  test("a timeout never lets a late verification write the marker", async () => {
    const profile = createProfile({ source: OLD_PROFILE });
    let releaseRead: () => void = () => {};
    profile.deps.readTarget = () =>
      new Promise((resolve) => {
        releaseRead = () => resolve([...profile.target]);
      });

    const result = await runRendererOriginStorageMigration(profile.deps, {
      timeoutMs: 10,
    });
    releaseRead();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result).toEqual({
      status: "failed",
      reason: "timed out after 10ms",
    });
    expect(profile.calls).toContain("dispose");
    expect(profile.marker()).toBeNull();
  });
});
