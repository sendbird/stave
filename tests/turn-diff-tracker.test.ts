import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTurnDiffTracker } from "../electron/providers/turn-diff-tracker";

describe("createTurnDiffTracker", () => {
  test("marks persisted diffs as accepted", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "stave-diff-tracker-"));
    const filePath = path.join(cwd, "note.txt");

    try {
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
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("returns replay-only tool fallback events when inline diffs cannot be built", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "stave-diff-tracker-"));

    try {
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
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
