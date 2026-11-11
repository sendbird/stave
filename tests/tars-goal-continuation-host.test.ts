import { expect, test } from "bun:test";
import path from "node:path";

// Isolate host module mocks; execute the actual control, delivery, host and SQLite stores together.
test.each(["codex", "claude-code"])("goal continuation through the actual host preserves repeated results (%s)", (provider) => {
  const result = Bun.spawnSync({ cmd: [process.execPath, "tests/fixtures/tars-goal-continuation-host.ts", provider],
    cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({ starts: 2, history: 2, reports: 3, artifact: "original artifact", provider });
});

test.each(["cancel", "cancel-archived", "cancel-missing"])("cancel reconciles an uncertain continuation and stops its actual new Run (%s)", (mode) => {
  const result = Bun.spawnSync({ cmd: [process.execPath, "tests/fixtures/tars-goal-continuation-host.ts", "codex", mode],
    cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString()).starts).toBe(3);
});
