import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTurnDiffTracker, resolveSnapshotRoot } from "../electron/providers/turn-diff-tracker";

async function withTempWorkspace(run: (cwd: string) => Promise<void>) {
  const cwd = await mkdtemp(path.join(tmpdir(), "stave-diff-tracker-"));
  try {
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

describe("resolveSnapshotRoot", () => {
  test("rejects roots that would scan the whole machine", () => {
    for (const cwd of ["/", "/Users", "/Applications", "/System/Volumes/Data", "/var"]) {
      expect(resolveSnapshotRoot({ cwd })).toMatchObject({ ok: false });
    }
  });

  test("rejects a missing, empty, or relative cwd", () => {
    expect(resolveSnapshotRoot({ cwd: undefined })).toMatchObject({ ok: false });
    expect(resolveSnapshotRoot({ cwd: "   " })).toMatchObject({ ok: false });
    expect(resolveSnapshotRoot({ cwd: "relative/path" })).toMatchObject({ ok: false });
  });

  test("accepts a normal absolute workspace path", () => {
    expect(resolveSnapshotRoot({ cwd: "/Users/someone/projects/app" })).toEqual({
      ok: true,
      root: "/Users/someone/projects/app",
    });
  });
});

describe("createTurnDiffTracker", () => {
  test("marks persisted diffs as accepted", async () => {
    await withTempWorkspace(async (cwd) => {
      const filePath = path.join(cwd, "note.txt");
      await writeFile(filePath, "before\n", "utf8");
      const tracker = await createTurnDiffTracker({ cwd });

      await writeFile(filePath, "after\n", "utf8");
      const { diffEvents, unresolvedPaths } = await tracker.buildDiffEvents({ changedPaths: ["note.txt"] });

      expect(unresolvedPaths).toEqual([]);
      expect(diffEvents).toHaveLength(1);
      expect(diffEvents[0]).toMatchObject({
        type: "diff",
        filePath: "note.txt",
        oldContent: "before\n",
        newContent: "after\n",
        status: "accepted",
      });
    });
  });

  test("returns replay-only tool fallback events when inline diffs cannot be built", async () => {
    await withTempWorkspace(async (cwd) => {
      const tracker = await createTurnDiffTracker({ cwd });
      const fallbackEvents = tracker.buildFallbackEvents({
        appliedPaths: ["dist/output.js"],
        skippedPaths: ["large.bin"],
      });

      expect(fallbackEvents).toEqual([
        {
          type: "tool",
          toolName: "file_change",
          input: JSON.stringify({
            appliedPaths: ["dist/output.js"],
            skippedPaths: ["large.bin"],
          }),
          output: "Applied file change(s): dist/output.js\nSkipped inline diff for file(s): large.bin",
          state: "output-available",
        },
      ]);
    });
  });

  test("detects a newly created file", async () => {
    await withTempWorkspace(async (cwd) => {
      const tracker = await createTurnDiffTracker({ cwd });
      await writeFile(path.join(cwd, "created.txt"), "hello\n", "utf8");

      const { diffEvents } = await tracker.buildDiffEvents({ changedPaths: ["created.txt"] });
      expect(diffEvents).toHaveLength(1);
      expect(diffEvents[0]).toMatchObject({ oldContent: "", newContent: "hello\n" });
    });
  });

  test("skips a large file without reading it, and finishes promptly", async () => {
    await withTempWorkspace(async (cwd) => {
      // 512MB sparse file. If the tracker ever reads before checking the size
      // again, this blows up wall-clock time and RSS the way the incident did.
      const bigPath = path.join(cwd, "huge.bin");
      await writeFile(bigPath, "");
      await truncate(bigPath, 512 * 1024 * 1024);

      const startedAt = Date.now();
      const tracker = await createTurnDiffTracker({ cwd });
      const elapsedMs = Date.now() - startedAt;

      expect(elapsedMs).toBeLessThan(2_000);

      const { diffEvents, unresolvedPaths } = await tracker.buildDiffEvents({ changedPaths: ["huge.bin"] });
      expect(diffEvents).toEqual([]);
      expect(unresolvedPaths).toEqual(["huge.bin"]);
    });
  });

  test("never touches .asar files", async () => {
    await withTempWorkspace(async (cwd) => {
      const asarPath = path.join(cwd, "app.asar");
      await writeFile(asarPath, "");
      await truncate(asarPath, 256 * 1024 * 1024);

      const startedAt = Date.now();
      const tracker = await createTurnDiffTracker({ cwd });
      expect(Date.now() - startedAt).toBeLessThan(2_000);

      const { diffEvents, unresolvedPaths } = await tracker.buildDiffEvents({ changedPaths: ["app.asar"] });
      expect(diffEvents).toEqual([]);
      expect(unresolvedPaths).toEqual(["app.asar"]);
    });
  });

  test("ignores build output and agent-owned state directories", async () => {
    await withTempWorkspace(async (cwd) => {
      for (const directory of ["release", ".stave", "node_modules", "Example.app"]) {
        await mkdir(path.join(cwd, directory), { recursive: true });
        await writeFile(path.join(cwd, directory, "tracked.txt"), "baseline\n", "utf8");
      }

      const tracker = await createTurnDiffTracker({ cwd });

      for (const directory of ["release", ".stave", "node_modules", "Example.app"]) {
        await writeFile(path.join(cwd, directory, "tracked.txt"), "changed\n", "utf8");
      }

      const { diffEvents } = await tracker.buildDiffEvents({
        changedPaths: [
          "release/tracked.txt",
          ".stave/tracked.txt",
          "node_modules/tracked.txt",
          "Example.app/tracked.txt",
        ],
      });

      // No baseline was captured for ignored directories, so they must not be
      // reported as pre-existing content that changed.
      for (const event of diffEvents) {
        expect(event).toMatchObject({ oldContent: "" });
      }
    });
  });

  test("does not follow a symlink that escapes the workspace root", async () => {
    await withTempWorkspace(async (cwd) => {
      await withTempWorkspace(async (outside) => {
        await writeFile(path.join(outside, "secret.txt"), "outside\n", "utf8");
        await symlink(outside, path.join(cwd, "escape"), "dir");

        const tracker = await createTurnDiffTracker({ cwd });
        const { diffEvents, unresolvedPaths } = await tracker.buildDiffEvents({
          changedPaths: ["escape/secret.txt"],
        });

        // Named so the turn still reports the change, but its contents are
        // never read or echoed back.
        expect(diffEvents).toEqual([]);
        expect(unresolvedPaths).toEqual(["escape/secret.txt"]);
      });
    });
  });

  test("refuses to snapshot an unsafe root and reports changes as unresolved", async () => {
    const tracker = await createTurnDiffTracker({ cwd: "/" });
    const { diffEvents, unresolvedPaths } = await tracker.buildDiffEvents({
      changedPaths: ["Applications/Some.app/Contents/Resources/app.asar"],
    });

    expect(diffEvents).toEqual([]);
    expect(unresolvedPaths).toEqual(["Applications/Some.app/Contents/Resources/app.asar"]);
  });

  test("refuses to snapshot when cwd is missing", async () => {
    const tracker = await createTurnDiffTracker({ cwd: "" });
    const { diffEvents, unresolvedPaths } = await tracker.buildDiffEvents({ changedPaths: ["a.txt"] });

    expect(diffEvents).toEqual([]);
    expect(unresolvedPaths).toEqual(["a.txt"]);
  });
});
