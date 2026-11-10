import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";

function runFixture(fixture: string) {
  mkdirSync("test-results", { recursive: true });
  const root = mkdtempSync(path.resolve("test-results/tars-cleanup-host-"));
  try {
    const output = path.join(root, "check.cjs");
    const built = spawnSync(process.execPath, ["build", fixture, "--outfile", output, "--target=node", "--format=cjs", "--external=better-sqlite3", "--external=electron", "--external=node-pty", '--define=import.meta.env.BASE_URL="/"'], { encoding: "utf8" });
    expect(built.stderr).toBe("");
    expect(built.status).toBe(0);
    const require = createRequire(import.meta.url);
    const executed = spawnSync(require("electron"), [output], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: path.resolve("node_modules") }, encoding: "utf8" });
    expect(executed.stderr).toBe("");
    expect(executed.status).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("Tars cleanup eligibility and Restore use real Git and SQLite across restart", () => runFixture("tests/fixtures/tars-cleanup-host-check.ts"), 60_000);
test("a 3-item cleanup among 20 workspaces looks up each candidate's pull request at most once", () => runFixture("tests/fixtures/tars-cleanup-lookups-check.ts"), 60_000);
