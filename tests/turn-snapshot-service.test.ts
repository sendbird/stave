import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

mkdirSync("test-results", { recursive: true });
const root = mkdtempSync(path.resolve("test-results/turn-snapshot-native-"));
const output = path.join(root, "scenarios.cjs");
beforeAll(() => {
  const build = spawnSync(process.execPath, ["build", "tests/fixtures/turn-snapshot-scenarios.ts", "--outfile", output, "--target=node", "--format=cjs", "--external=better-sqlite3", '--define=import.meta.env.BASE_URL="/"'], { encoding: "utf8" });
  expect(build.status, build.stdout + build.stderr).toBe(0);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
for (const scenario of ["non-git", "shared-alias", "attributes-bytes", "ignored-obstruction", "undo-prune", "bytes", "unchanged", "pruning", "undo-restart", "refusals", "undo-intervening-change", "attributes-staged-bytes",
  "capture-submodule", "capture-nested-worktrees", "capture-merge-conflict", "capture-unsaved-task", "capture-failure",
  "restore-differing-only", "restore-large-blob", "restore-file-directory", "restore-modes", "restore-precheck", "restore-terminal-busy",
  "backups-separate", "delete-task", "delete-workspace", "default-restore-while-worktree-runs"]) {
  test(`real git and production SQLite snapshot service: ${scenario}`, () => {
    const run = spawnSync(createRequire(import.meta.url)("electron"), [output, scenario], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8" });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  }, 60_000);
}
for (const scenario of ["bytes", "attributes-bytes", "ignored-obstruction", "capture-submodule", "capture-nested-worktrees", "capture-merge-conflict", "restore-modes"]) {
  test(`real git snapshot service without --attr-source support: ${scenario}`, () => {
    const run = spawnSync(createRequire(import.meta.url)("electron"), [output, scenario, "manual"], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8" });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  }, 60_000);
}
