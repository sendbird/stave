import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";

test("the persisted Tars delegation tree delivers only user-facing attention", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tars-notify-build-"));
  try {
    const output = path.join(root, "check.cjs");
    const build = spawnSync(process.execPath, ["build", "tests/fixtures/tars-notification-host-check.ts", "--outfile", output, "--target=node", "--format=cjs", "--external=better-sqlite3", '--define=import.meta.env.BASE_URL="/"'], { encoding: "utf8" });
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const run = spawnSync(createRequire(import.meta.url)("electron"), [output], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: path.resolve("node_modules") }, encoding: "utf8" });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30_000);
