import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { observeWorkspaceScript } from "../electron/host-service/supervision/workspace-script-verification";
import { runCommandArgs } from "../electron/main/utils/command";
import { revisionsMatch } from "../src/lib/agent-runs/verification-contract";

test("real exit codes and before/after work state remain distinct, including failed checks", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "stave-script-evidence-"));
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
    git("init"); writeFileSync(join(cwd, "tracked.txt"), "original"); git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: record workspace");
    const failure = await observeWorkspaceScript({ cwd, run: () => runCommandArgs({ cwd, command: process.execPath, commandArgs: ["-e", "console.log('exit 0'); process.exit(7)"] }) });
    expect(failure.result.code).toBe(7);
    expect(revisionsMatch(failure.verification.sourceRevision, failure.verification.completedRevision)).toBe(true);
    const changed = await observeWorkspaceScript({ cwd, run: async () => {
      writeFileSync(join(cwd, "untracked.txt"), "changed during the check");
      return runCommandArgs({ cwd, command: process.execPath, commandArgs: ["-e", "process.exit(0)"] });
    } });
    expect(changed.result.code).toBe(0);
    expect(revisionsMatch(changed.verification.sourceRevision, changed.verification.completedRevision)).toBe(false);
    const unknown = await observeWorkspaceScript({ cwd, readRevision: async () => ({ status: "unknown", reason: "unavailable" }), run: async () => ({ output: "passed" }) });
    expect(unknown.result).toEqual({ output: "passed" });
    expect(revisionsMatch(unknown.verification.sourceRevision, unknown.verification.completedRevision)).toBe(false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
