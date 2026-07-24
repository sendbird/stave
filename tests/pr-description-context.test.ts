import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { collectUntrackedWorkingTreeDiff } from "../electron/host-service/pr-description-context";

describe("collectUntrackedWorkingTreeDiff", () => {
  test("includes new file content in PR drafting evidence", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "stave-pr-context-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd });
      await writeFile(path.join(cwd, "new-feature.ts"), 'export const actualWork = "summarized";\n', "utf8");

      const diff = await collectUntrackedWorkingTreeDiff({ cwd });

      expect(diff).toContain("new-feature.ts");
      expect(diff).toContain('export const actualWork = "summarized";');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
