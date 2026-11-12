import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { createTarsRuntime, type TarsRuntimePorts } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import type { TarsResponsibility } from "../src/lib/tars/types";
import { followUpFixture } from "./tars-follow-up-fixture";

const NOW = "2026-11-05T00:00:00.000Z";
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const input = (requestId: string, repositoryPath: string, priority: number) => ({
  completionGoal: "implementation" as const,
  requestId, title: `Work ${requestId}`, instruction: "Fix and verify it within this repository.", acceptanceCriteria: ["It works."],
  workspaceId: `source-${requestId}`, repositoryPath, providerId: "codex" as const, model: null, priority, maxTurns: 30,
});

/**
 * An execution world whose creation is idempotent by stable identity, like
 * the host's: worktrees by branch name, tasks by id, one run per task. It
 * counts every creation, and `hang` stops a step after its effect, as a crash
 * before the acknowledgement would.
 */
function world() {
  const workspaces = new Map<string, string>();
  const tasks = new Set<string>();
  const runs = new Map<string, { id: string; evidence: string[] }>();
  const created = { workspaces: 0, tasks: 0, runs: 0 };
  const calls: string[] = [];
  let hang: "workspace" | "run" | null = null;
  let reached: () => void = () => {};
  const forever = () => new Promise<never>(() => {});
  const ports = (store: TarsStore): TarsRuntimePorts => ({
    store, now: () => NOW, validateScope: async () => {},
    async prepareWorkspace(row) {
      calls.push(`workspace:${row.requestId}`);
      let id = workspaces.get(`tars/${row.id}`);
      if (!id) { id = `execution-${row.requestId}`; workspaces.set(`tars/${row.id}`, id); created.workspaces++; }
      if (hang === "workspace") { reached(); return forever(); }
      return id;
    },
    async prepareTask(row) { if (!tasks.has(row.taskId!)) { tasks.add(row.taskId!); created.tasks++; } },
    findRun: async (row) => runs.get(row.taskId!)?.id ?? null,
    async startRun(row, assertAdmitted) {
      assertAdmitted();
      calls.push(`run:${row.requestId}`);
      const run = { id: `run-${row.requestId}`, evidence: [`check passed on ${row.requestId}`] };
      runs.set(row.taskId!, run); created.runs++;
      if (hang === "run") { reached(); return forever(); }
      return run.id;
    },
    observe: async (row) => ({ state: row.state === "preparing" ? "running" : row.state as "running", detail: row.detail }),
    controlRun: async () => {},
  });
  return { workspaces, tasks, runs, created, calls, ports,
    crashAt(step: "workspace" | "run") { hang = step; return new Promise<void>((resolve) => { reached = resolve; }); },
    recover() { hang = null; } };
}

function persisted() {
  const directory = mkdtempSync(path.join(tmpdir(), "tars-scenario-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, "stave.sqlite");
}
function open(filename: string) {
  const database = new Database(filename);
  cleanup.push(() => { if (!database.closed) database.close(); });
  return { database, store: new TarsStore(database) };
}

test("scenario 1: priority orders admission without delaying independent work or recreating its prepared ownership", async () => {
  const { store } = open(persisted());
  const execution = world();
  const ports = execution.ports(store);
  let releaseWorkspace!: () => void;
  const workspaceGate = new Promise<void>((resolve) => { releaseWorkspace = resolve; });
  let started!: () => void;
  const independentStarted = new Promise<void>((resolve) => { started = resolve; });
  const runtime = createTarsRuntime({ ...ports,
    prepareWorkspace: async (row, signal) => {
      const id = await ports.prepareWorkspace(row, signal);
      if (row.requestId === "b") await workspaceGate;
      return id;
    },
    startRun: async (row, assertAdmitted) => {
      const id = await ports.startRun(row, assertAdmitted);
      if (row.requestId === "a") started();
      return id;
    },
  });
  const tick = async () => { runtime.requestTick(); await runtime.drain(); };
  // Repository A's work had started preparing (its next action: start its run) when the host stopped.
  const first = store.create(input("a", "/tmp/repository-a", 60), NOW);
  const preparing = store.patch(first.id, first.revision, { state: "preparing", taskId: `tars-${first.id}`, executionWorkspaceId: "execution-a" }, NOW);
  execution.workspaces.set(`tars/${first.id}`, "execution-a"); execution.tasks.add(`tars-${first.id}`);
  const second = store.create(input("b", "/tmp/repository-b", 40), NOW);
  // The user raises repository B's work above it, as the admitted reprioritize action does.
  store.patch(second.id, second.revision, { priority: 90 }, NOW);
  const ticking = tick();
  await independentStarted;
  // B is admitted first by priority. Its slow preparation must not hold A's recovered run.
  try { expect(execution.calls).toEqual(["workspace:b", "run:a"]); }
  finally { releaseWorkspace(); }
  await ticking;
  expect(execution.calls).toEqual(["workspace:b", "run:a", "run:b"]);
  expect(store.get(second.id)).toMatchObject({ state: "running", agentRunId: "run-b" });
  // A continues its own next action before B ends, retaining its prepared task and worktree.
  expect(store.get(first.id)).toMatchObject({ state: "running", taskId: preparing.taskId, executionWorkspaceId: "execution-a", agentRunId: "run-a", priority: 60 });
  await tick();
  expect(execution.calls).toEqual(["workspace:b", "run:a", "run:b"]);
  expect(execution.created).toEqual({ workspaces: 1, tasks: 1, runs: 2 });
  runtime.stop();
});

test("scenario 1 with a limit: interrupted preparation recovers in its reserved slot; new admission follows priority within the limit", async () => {
  const { store } = open(persisted());
  const execution = world();
  const runtime = createTarsRuntime({ ...execution.ports(store), concurrencyLimit: () => 1 });
  const tick = async () => { runtime.requestTick(); await runtime.drain(); };
  const waits = async () => Object.fromEntries((await runtime.get()).responsibilities
    .filter((row) => row.state === "queued").map((row) => [row.requestId, row.queueWait]));
  // A had started preparing when the host stopped, so it already holds a reservation.
  const first = store.create(input("a", "/tmp/repository-a", 60), NOW);
  const preparing = store.patch(first.id, first.revision, { state: "preparing", taskId: `tars-${first.id}`, executionWorkspaceId: "execution-a" }, NOW);
  execution.workspaces.set(`tars/${first.id}`, "execution-a"); execution.tasks.add(`tars-${first.id}`);
  const second = store.create(input("b", "/tmp/repository-b", 90), NOW);
  store.create(input("c", "/tmp/repository-c", 40), NOW);
  await tick();
  // Recovery is not a new admission: A continues in its own worktree and task although B ranks higher.
  expect(execution.calls).toEqual(["run:a"]);
  expect(store.get(first.id)).toMatchObject({ state: "running", taskId: preparing.taskId, executionWorkspaceId: "execution-a", agentRunId: "run-a" });
  expect(await waits()).toEqual({ b: { code: "capacity", active: 1, limit: 1 }, c: { code: "capacity", active: 1, limit: 1 } });
  // When A's slot frees, the higher-priority B is admitted next and C keeps waiting for the limit.
  const running = store.get(first.id)!;
  store.patch(running.id, running.revision, { state: "completed" }, NOW);
  await tick();
  expect(execution.calls).toEqual(["run:a", "workspace:b", "run:b"]);
  expect(store.get(second.id)).toMatchObject({ state: "running", agentRunId: "run-b" });
  expect(await waits()).toEqual({ c: { code: "capacity", active: 1, limit: 1 } });
  expect(execution.created).toEqual({ workspaces: 1, tasks: 1, runs: 2 });
  runtime.stop();
});

test.each(["workspace", "run"] as const)("scenario 3: a crash after %s creation but before its acknowledgement recovers the same task without a duplicate", async (step) => {
  const filename = persisted();
  const execution = world();
  const before = open(filename);
  const row = before.store.create(input("crash", "/tmp/repository-a", 50), NOW);
  const crashed = createTarsRuntime(execution.ports(before.store));
  const reached = execution.crashAt(step);
  crashed.requestTick();
  await reached;
  // The process dies here: the effect exists, its acknowledgement was never saved.
  crashed.stop(); before.database.close();
  execution.recover();
  const after = open(filename);
  const lost = after.store.get(row.id)!;
  expect(lost).toMatchObject({ state: "preparing", taskId: `tars-${row.id}`, agentRunId: null });
  const recovered = createTarsRuntime(execution.ports(after.store));
  recovered.requestTick(); await recovered.drain();
  recovered.requestTick(); await recovered.drain();
  expect(execution.created).toEqual({ workspaces: 1, tasks: 1, runs: 1 });
  const run = execution.runs.get(`tars-${row.id}`)!;
  expect(after.store.get(row.id)).toMatchObject({ state: "running", taskId: `tars-${row.id}`, executionWorkspaceId: "execution-crash", agentRunId: run.id });
  // The run that was already working keeps its pending evidence.
  expect(run.evidence).toEqual(["check passed on crash"]);
  const events = after.store.events.listRecent(10).filter((event) => event.responsibilityId === row.id);
  // Only an adopted run (the lost run acknowledgement) is a host recovery; a re-found worktree is ordinary preparation.
  expect(events.map((event) => [event.kind, event.status, event.attempt])).toEqual(step === "run" ? [["hostRecovery", "settled", run.id]] : []);
  recovered.stop();
});

test("scenario 4: duplicate completion and a delayed old-attempt event cause one reconciliation, no stale completion and no second writer", async () => {
  const f = followUpFixture();
  cleanup.push(f.close);
  f.service.start();
  const row = f.responsibility("running");
  // The first attempt blocks; Tars follows it up once.
  f.observations.set(row.id, { state: "blocked", detail: "The checks failed." });
  await f.settle();
  const firstBlock = f.responsibilities.get(row.id)!;
  expect(f.planner).toHaveLength(1);
  // The user resumes it; its run continues.
  f.observations.set(row.id, { state: "running", detail: null });
  await actTars({ requestId: "click-resume", responsibilityId: row.id, expectedRevision: firstBlock.revision, operation: "resume", source: "click" },
    { conversations: f.conversations, runtime: f.runtime, now: f.now });
  await f.settle();
  const beforeCompletion: TarsResponsibility = f.responsibilities.get(row.id)!;
  // The second attempt completes; the host observes the completion twice and it is delivered twice.
  f.observations.set(row.id, { state: "completed", detail: null });
  await f.settle(); await f.settle();
  const completed = f.responsibilities.get(row.id)!;
  expect(completed.state).toBe("completed");
  const [completion] = f.responsibilities.events.listRecent(20).filter((event) => event.kind === "completed");
  expect(f.responsibilities.recordEvent({ responsibilityId: row.id, kind: "completed", episode: completion!.episode,
    observedRevision: completion!.observedRevision, observedState: "completed", attempt: completion!.attempt }, f.now())).toEqual(completion!);
  // A second writer working from the view before completion is refused by the revision check.
  expect(() => f.responsibilities.patch(row.id, beforeCompletion.revision, { state: "completed" }, f.now())).toThrow("changed");
  // Late events of the first attempt: its unmet verification, and a completion from an older run.
  const late = [
    f.responsibilities.recordEvent({ responsibilityId: row.id, kind: "verificationFailed", episode: String(firstBlock.revision),
      observedRevision: firstBlock.revision, observedState: "blocked", attempt: firstBlock.agentRunId }, f.now()),
    f.responsibilities.recordEvent({ responsibilityId: row.id, kind: "completed", episode: "earlier-run",
      observedRevision: firstBlock.revision, observedState: "completed", attempt: "run-earlier-attempt" }, f.now()),
  ];
  expect(late.map((event) => event.status)).toEqual(["superseded", "superseded"]);
  await f.settle();
  // One reconciliation for the block; completion is the host's own, recorded once and never reopened.
  expect(f.planner).toHaveLength(1);
  expect(f.responsibilities.get(row.id)).toEqual(completed);
  expect(f.responsibilities.listActivity(100).filter((entry) => entry.responsibilityId === row.id && entry.state === "completed")).toHaveLength(1);
  expect(f.responsibilities.events.listRecent(20).map((event) => [event.kind, event.status])).toEqual([
    ["blocked", "followedUp"], ["completed", "settled"], ["verificationFailed", "superseded"], ["completed", "superseded"]]);
  expect(f.runControls).toEqual(["resume"]);
});
