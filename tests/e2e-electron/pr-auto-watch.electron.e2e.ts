import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("native host persists discovery, stops on merge and lists its branch for cleanup", () => {
  test.setTimeout(120_000);
  const root = mkdtempSync(path.join(tmpdir(), "native-pr-watch-"));
  try {
    const output = path.join(root, "check.cjs");
    execFileSync("bun", ["build", "tests/fixtures/agent-pr-watch-host-check.ts", "--outfile", output, "--target=node", "--format=cjs", "--external=better-sqlite3", "--external=electron", "--external=node-pty", '--define=import.meta.env.BASE_URL="/"'], { stdio: "pipe" });
    const require = createRequire(import.meta.url);
    const stdout = execFileSync(require("electron"), [output], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: path.dirname(path.dirname(require.resolve("better-sqlite3/package.json"))) }, encoding: "utf8", timeout: 90_000 });
    expect(stdout).toBe("");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
