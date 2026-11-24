import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";

test("cleanup runtime lists, measures and removes sub-agent worktrees with a real registry and Git", () => {
  mkdirSync("test-results", { recursive: true });
  const root = mkdtempSync(path.resolve("test-results/subagent-worktree-runtime-"));
  try {
    const output = path.join(root, "check.cjs");
    const built = spawnSync(process.execPath, ["build", "tests/fixtures/subagent-worktree-runtime-check.ts", "--outfile", output, "--target=node", "--format=cjs", "--external=better-sqlite3", "--external=electron", "--external=node-pty", '--define=import.meta.env.BASE_URL="/"'], { encoding: "utf8" });
    expect(built.stderr).toBe("");
    expect(built.status).toBe(0);
    const require = createRequire(import.meta.url);
    const executed = spawnSync(require("electron"), [output], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: path.resolve("node_modules") }, encoding: "utf8" });
    expect(executed.stderr).toBe("");
    expect(executed.status).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 60_000);
