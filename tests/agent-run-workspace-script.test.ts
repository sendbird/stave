import { expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStageScriptRunner, type WorkspaceCheckDependencies } from "../electron/host-service/supervision/agent-run-workspace-script";
import { currentStageRecord, replaceStageRecord } from "../src/lib/agent-runs/domain";
import { buildAgentRunWorkflow } from "../src/lib/agent-runs/agent-run";
import { withWorkspaceCheck } from "../src/lib/agent-runs/workspace-check";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { agentRunFixture, AGENT_RUN_NOW } from "./fixtures/agent-run-fixtures";
import { workspaceScriptDefinitionHash } from "../electron/host-service/supervision/workspace-script-definition";
import type { ResolvedWorkspaceScript } from "../src/lib/workspace-scripts/types";
import { observeWorkspaceScript } from "../electron/host-service/supervision/workspace-script-verification";

// These tests execute finite shell actions; the terminal service path is unused.
mock.module("node-pty", () => ({ spawn: () => { throw new Error("PTY unused"); } }));

const definitionHash = "a".repeat(64);
const revision = { status: "known" as const, revision: "same" };
const success = { definitionHash, executedCommands: "check", commandsTruncated: false, exitCode: 0, output: "ok", verification: { sourceRevision: revision, completedRevision: revision } };

function harness(run: NonNullable<WorkspaceCheckDependencies["runWorkspaceScript"]>, timer?: typeof setTimeout) {
  const agent = getBuiltinAgent("implementer")!;
  let aggregate = agentRunFixture({ workflow: withWorkspaceCheck(buildAgentRunWorkflow({ agent, now: AGENT_RUN_NOW }), agent, [{ scriptId: "check", definitionHash }]) });
  currentStageRecord(aggregate).status = "running";
  let chain = Promise.resolve();
  const runner = createStageScriptRunner({
    taskAgent: () => agent, listWorkspaceActionScripts: async () => [{ scriptId: "check", definitionHash }], runWorkspaceScript: run,
    enqueue: operation => { const next = chain.then(operation); chain = next.then(() => {}, () => {}); return next; },
    requireGrant: () => ({ aggregate, grant: { agentRunId: aggregate.agentRun.id, taskId: aggregate.agentRun.leadTaskId, stageId: "work", attempt: 1, turnId: "turn-1" } }),
    isDelegated: () => false,
    applyChange: change => { aggregate = { agentRun: change.agentRun, stages: change.upserts.reduce((stages, stage) => replaceStageRecord(stages, stage), aggregate.stages) }; },
    ...(timer ? { setTimeout: timer } : {}),
  });
  return { runner, run: () => runner.run({ agentRunKey: "key", scriptId: "check" }), id: aggregate.agentRun.id, record: () => currentStageRecord(aggregate) };
}

test("the 30-minute timeout aborts execution, releases its reservation and fences a late success", async () => {
  let timeout!: () => void;
  let resolve!: (value: typeof success) => void;
  let entered!: () => void;
  let signal!: AbortSignal;
  const started = new Promise<void>(ready => { entered = ready; });
  let calls = 0;
  const h = harness(async args => {
    if (calls++ > 0) return success;
    signal = args.signal; entered(); return new Promise(done => { resolve = done; });
  }, ((callback: () => void, delay: number) => { expect(delay).toBe(30 * 60_000); timeout = callback; return setTimeout(() => {}, delay); }) as typeof setTimeout);
  const first = h.run().catch(error => error);
  await started; timeout();
  expect(signal.aborted).toBe(true);
  expect((await first).message).toContain("30 minutes");
  expect(await h.run()).toMatchObject({ verified: true });
  resolve(success); await Promise.resolve();
  expect(h.record().facts?.workspaceScripts).toHaveLength(1);
  h.runner.stop();
});

test("abort, runner failure and process-death result each release the reservation for a later call", async () => {
  for (const failure of ["abort", "throw", "death"]) {
    let entered!: () => void;
    const started = new Promise<void>(ready => { entered = ready; });
    let calls = 0;
    const h = harness(async () => {
      if (calls++ > 0) return success;
      entered();
      if (failure === "throw") throw new Error("runner failed");
      if (failure === "death") return { ...success, exitCode: -1 };
      return new Promise(() => {});
    });
    const first = h.run().catch(error => error);
    await started;
    if (failure === "abort") h.runner.abort(h.id);
    const result = await first;
    if (failure === "death") expect(result).toMatchObject({ verified: false, exitCode: -1 });
    else expect(result).toBeInstanceOf(Error);
    expect(await h.run()).toMatchObject({ verified: true });
    h.runner.stop();
  }
});

test("definition hashes cover commands, effective cwd, shell and configured env, independent of env key order", () => {
  const script: ResolvedWorkspaceScript = { id: "check", kind: "action", label: "Check", description: "", commands: ["check"], targetId: "workspace",
    target: { id: "workspace", label: "Workspace", cwd: "workspace", shell: "/bin/sh", env: { A: "1", B: "2" } }, source: "script" };
  const context = { repositoryPath: "/tmp/repo", workspacePath: "/tmp/workspace", workspaceName: "Workspace", branch: "test" };
  const original = workspaceScriptDefinitionHash(script, context);
  for (const changed of [
    { ...script, commands: ["true"] }, { ...script, target: { ...script.target, cwd: "project" as const } },
    { ...script, target: { ...script.target, shell: "/bin/other" } }, { ...script, target: { ...script.target, env: { A: "changed", B: "2" } } },
  ]) expect(workspaceScriptDefinitionHash(changed, context)).not.toBe(original);
  expect(workspaceScriptDefinitionHash({ ...script, target: { ...script.target, env: { B: "2", A: "1" } } }, context)).toBe(original);
});

test("the real script runner reports tree mutation and kills an aborted process before later writes", async () => {
  const { runScriptEntry } = await import("../electron/main/workspace-scripts/executor");
  const cwd = mkdtempSync(join(tmpdir(), "stave-script-review-"));
  let execution: ReturnType<typeof runScriptEntry> | undefined;
  let abortRunner: ReturnType<typeof harness> | undefined;
  try {
    execFileSync("git", ["init", "-b", "main"], { cwd });
    writeFileSync(join(cwd, "README"), "test");
    execFileSync("git", ["add", "README"], { cwd });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize script checks"], { cwd });
    const script: ResolvedWorkspaceScript = { id: "check", kind: "action", label: "Check", description: "", commands: ["echo generated > generated"], targetId: "workspace",
      target: { id: "workspace", label: "Workspace", cwd: "workspace", env: {} }, source: "script" };
    const h = harness(async args => {
      const observed = await observeWorkspaceScript({ cwd, run: () => runScriptEntry({ workspaceId: "real-check", workspacePath: cwd, repositoryPath: cwd, workspaceName: "test", branch: "main", scriptEntry: script, signal: args.signal }) });
      const result = observed.result;
      if (!("exitCode" in result)) throw new Error("Expected an action exit code");
      return { ...success, exitCode: result.exitCode, executedCommands: script.commands.join("\n"), verification: observed.verification };
    });
    expect(await h.run()).toMatchObject({ verified: false, reason: expect.stringContaining("changed the workspace") });
    expect(h.record().facts?.workspaceScripts?.[0]?.verification.sourceRevision).not.toEqual(h.record().facts?.workspaceScripts?.[0]?.verification.completedRevision);
    let entered!: () => void;
    const started = new Promise<void>(ready => { entered = ready; });
    abortRunner = harness(async args => {
      execution = runScriptEntry({ workspaceId: "abort-check", workspacePath: cwd, repositoryPath: cwd, workspaceName: "test", branch: "main", scriptEntry: { ...script, commands: ["sleep 1; echo late > late"] }, signal: args.signal, onCommandStarted: entered });
      await execution;
      return success;
    });
    const pending = abortRunner.run().catch(error => error);
    await started; abortRunner.runner.abort(abortRunner.id);
    expect(await pending).toBeInstanceOf(Error);
    expect((await execution)!.ok).toBe(false);
    await Bun.sleep(1100);
    expect(existsSync(join(cwd, "late"))).toBe(false);
  } finally {
    abortRunner?.runner.stop();
    await execution;
    rmSync(cwd, { recursive: true, force: true });
  }
});
