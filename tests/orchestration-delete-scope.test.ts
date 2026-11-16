import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

for (const scope of ["task", "workspace"]) test(`permanent ${scope} deletion shares task cleanup scope and rollback`, async () => {
  mkdirSync("test-results", { recursive: true });
  const root = mkdtempSync(path.resolve("test-results/orchestration-delete-"));
  try {
    const bundle = spawnSync(process.execPath, ["build", path.resolve("tests/fixtures/orchestration-delete-scope.ts"), "--target=node", "--format=cjs", "--outfile", path.join(root,"check.cjs"), "--external=better-sqlite3", '--define=import.meta.env.BASE_URL="/"'], {encoding:"utf8"});
    if (bundle.status !== 0) throw new Error(bundle.stdout + bundle.stderr);
    const require = createRequire(import.meta.url);
    const result = spawnSync(require("electron"), [path.join(root, "check.cjs"), path.join(root, "store.sqlite"), scope], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: path.resolve("node_modules") }, encoding: "utf8",
    });
    if (result.status !== 0) throw new Error(result.stdout + result.stderr || String(result.error));
    expect(result.status).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
