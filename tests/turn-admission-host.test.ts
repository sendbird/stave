import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";

function runFixture(fixture: string) {
  mkdirSync("test-results", { recursive: true });
  const root = mkdtempSync(path.resolve("test-results/turn-admission-host-"));
  try {
    const output = path.join(root, "check.cjs");
    const built = spawnSync(process.execPath, ["build", fixture, "--outfile", output, "--target=node", "--format=cjs", "--external=better-sqlite3", "--external=electron", "--external=node-pty", '--define=import.meta.env.BASE_URL="/"'], { encoding: "utf8" });
    expect(built.stderr).toBe("");
    expect(built.status).toBe(0);
    const require = createRequire(import.meta.url);
    const executed = spawnSync(require("electron"), [output], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: path.resolve("node_modules") }, encoding: "utf8" });
    if (executed.status !== 0) console.error(executed.stdout, executed.stderr);
    expect(executed.stderr).toBe("");
    expect(executed.status).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("global admission uses the host runtime and real SQLite with fake providers", () => runFixture("tests/fixtures/turn-admission-host-check.ts"), 60_000);

test("real provider and host start routes enter global admission", () => runFixture("tests/fixtures/turn-admission-routing-check.ts"), 60_000);

test("queued turns recover once: renderer starts return to the composer queue, host starts verify their task, failures notify", () => runFixture("tests/fixtures/turn-admission-recovery-check.ts"), 90_000);
