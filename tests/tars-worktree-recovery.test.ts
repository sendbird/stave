import { expect, test } from "bun:test";

test("#13 the actual host reconciles Git's unregistered stable worktree and finishes preparation/registration", () => {
  const result = Bun.spawnSync({ cmd: [process.execPath, "tests/fixtures/tars-worktree-recovery.ts"],
    cwd: new URL("..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({ worktrees: 2, registered: true, prepared: true });
});

test.skipIf(process.platform === "win32").each([false, true])("new host worktrees seed before post-create and continue after a copy failure (%s)", (fallback) => {
  const result = Bun.spawnSync({ cmd: [process.execPath, "tests/fixtures/tars-worktree-recovery.ts", "--fresh", ...(fallback ? ["--fallback"] : [])],
    cwd: new URL("..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({ worktrees: 2, registered: true, prepared: true });
});
