import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostTurnAdmission } from "../../electron/host-service/turn-admission-host";
import { createQueuedTurnRecoveryHandlers } from "../../electron/host-service/turn-admission-recovery";
import { ensureHostServicePersistenceReady, resetHostServicePersistence } from "../../electron/host-service/persistence";
import { setProviderTurnAdmission } from "../../electron/providers/runtime";
import { runTask, createIdleTask, resumeQueuedProviderTurn, cleanupLocalMcpRuntime, getTaskSupervisionSnapshot, notifySupervisorProblem } from "../../electron/host-service/local-mcp-runtime";
import { createAutomationRuntime } from "../../electron/host-service/automation-runtime";
import { createWakeUpRuntime } from "../../electron/host-service/wake-up-runtime";
import { runSupervisedTurn } from "../../electron/host-service/supervised-turn";
import { createDefaultAutomationRuntime } from "../../src/lib/automations";
import type { StreamTurnArgs } from "../../electron/providers/types";

// Real host admission, recovery, task runtime, automation and wake-up runtimes
// over real SQLite and a real Git repository. Provider turns stay queued behind
// held slots, so no native provider process ever runs.
// The failures below are deliberate; keep their expected log lines out of stderr.
const expectedLogs: string[] = [];
for (const level of ["error", "warn"] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[turn-admission]")) { expectedLogs.push(args[0]); return; }
    original(...args);
  };
}
// A wait that never settles empties the event loop; only reaching the end passes.
process.exitCode = 1;
const root = mkdtempSync(join(tmpdir(), "admission-recovery-"));
process.env.STAVE_USER_DATA_PATH = root;
const store = ensureHostServicePersistenceReady();
const repo = join(root, "repository");
execFileSync("git", ["init", "-b", "main", repo]);
execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--allow-empty", "-m", "test: initialize"]);
store.upsertWorkspace({ id: "workspace", name: "Workspace", snapshot: { activeTaskId: null, tasks: [], messagesByTask: {} } });
store.saveRepositoryRegistry({ repositories: [{ repositoryPath: repo, repositoryName: "Repository", lastOpenedAt: "2026-11-17", defaultBranch: "main", workspaces: [{ id: "workspace", name: "Workspace", updatedAt: "2026-11-17" }], activeWorkspaceId: "workspace", workspacePathById: { workspace: repo }, workspaceBranchById: { workspace: "main" }, workspaceDefaultById: { workspace: true } }] });
store.delegationPolicies.saveRouteSettings({ routing: { autoRoutingEnabled: false }, classifier: null, globalAgentTurnLimit: 2 });
const settle = async (ms = 20) => { await new Promise(resolve => setTimeout(resolve, ms)); };
const turn = (turnId: string, taskId: string, extra: Partial<StreamTurnArgs> = {}): StreamTurnArgs => ({ turnId, taskId, workspaceId: "workspace", providerId: "codex", prompt: `Prompt of ${turnId}`, runtimeOptions: { model: "gpt-5" }, ...extra });
const ids = () => store.turnAdmission.read().map(row => [row.args.turnId, row.state]);
const notices = () => store.listNotifications({ limit: 100 }).filter(row => row.payload.source === "turn-admission").map(row => `turn-admission.recovery_failed:${String(row.payload.turnId)}`);
const openTurn = (turnId: string) => store.listActiveTurnsForWorkspace({ workspaceId: "workspace", limit: 100 }).some(row => row.id === turnId && !row.completedAt);

async function main() {
  const host = createHostTurnAdmission(store);
  setProviderTurnAdmission(host.admission);
  const { taskId: rendererTask } = await createIdleTask({ workspaceId: "workspace", title: "Renderer task", provider: "codex", model: "gpt-5" });
  const { taskId: wakeTask } = await createIdleTask({ workspaceId: "workspace", title: "Wake task", provider: "codex", model: "gpt-5" });

  // Two slots: one held by unrelated work, one by a parent that then waits on its helpers.
  await host.admission.acquire(turn("busy", "busy-task"));
  await host.admission.acquire(turn("parent-turn", "parent-task"));
  // Finding 7: one parent, two concurrent delegate waits.
  await host.wait({ taskId: "parent-task", waiting: true });
  await host.wait({ taskId: "parent-task", waiting: true });
  await host.admission.acquire(turn("child-turn", "child-task", { admissionPriority: "automatic" }));
  await host.wait({ taskId: "parent-task", waiting: false });
  assert.deepEqual(host.snapshot().suspended, ["parent-turn"], "the slot comes back only when the parent's last wait ends");
  assert.equal(host.snapshot().queued.some(row => row.turnId === "parent-turn"), false);
  void host.wait({ taskId: "parent-task", waiting: false });
  await settle(5);
  assert.deepEqual(host.snapshot().queued.map(row => row.turnId), ["parent-turn"]);
  // Finding 5: a parent taking its slot back already ran; it is never saved as a fresh queued start.
  assert.deepEqual(ids().sort(), [["busy", "running"], ["child-turn", "running"], ["parent-turn", "running"]]);

  // A renderer start (no host owner) and host-owned starts, all waiting for a slot.
  void host.admission.acquire(turn("renderer-turn", rendererTask, { prompt: "Renderer prompt", cwd: repo })).catch(() => {});
  void host.admission.acquire(turn("orphan-turn", "gone-task", { admissionOwner: "host-task", admissionPriority: "automatic" })).catch(() => {});
  const automation = createAutomationRuntime({ persistence: store, runTask, getTaskStatus: async () => { throw new Error("No completion polling needed"); },
    getWorkspaceInformation: async () => ({ workspaceId: "workspace", workspaceInformation: {} as never }) });
  const spec = await automation.create({ name: "Check", prompt: "Inspect repository", environment: { kind: "repository", workspaceId: "workspace", path: repo, repositoryPath: repo, label: "Repository" },
    runtime: createDefaultAutomationRuntime("codex"), schedule: { every: 1, unit: "hours" }, enabled: false, maxConcurrentRuns: 1, trustPolicy: "review-required", informationReferences: [] });
  const automationRun = await automation.runNow({ id: spec.id });
  const automationTurn = automationRun.turnId!;
  assert.ok(automationTurn);
  let clock = new Date("2026-11-17T00:00:00.000Z");
  let fire: (() => void) | null = null;
  const wakeDeps = { persistence: store, getTaskSupervisionSnapshot, runSupervisedTurn, now: () => new Date(clock),
    setInterval: ((callback: () => void) => { fire = callback; return 1; }) as unknown as typeof globalThis.setInterval, clearInterval: (() => {}) as typeof globalThis.clearInterval };
  const wakeUps = createWakeUpRuntime(wakeDeps);
  const wakeUp = await wakeUps.create({ workspaceId: "workspace", taskId: wakeTask, prompt: "Check back.", trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } }, maxOccurrences: null, expiresAt: null });
  wakeUps.start();
  await wakeUps.list();
  clock = new Date("2026-11-17T01:30:00.000Z");
  (fire as (() => void) | null)?.();
  await wakeUps.whenIdle();
  await settle();
  const wakeTurn = (await wakeUps.get({ id: wakeUp.id })).occurrences.find(row => row.outcome === "fired")?.turnId;
  assert.ok(wakeTurn, "the wake-up fired a turn that waits for a slot");
  wakeUps.stop();
  await settle();
  const queuedBefore = ids().filter(([, state]) => state === "queued").map(([id]) => id);
  for (const id of ["renderer-turn", "orphan-turn", automationTurn, wakeTurn]) assert.ok(queuedBefore.includes(id), `${id} saved as queued`);

  // Rows a boot must not try again: one older than a day, one a boot already tried.
  const saved = store.turnAdmission.read();
  const template = saved.find(row => row.args.turnId === wakeTurn)!;
  store.turnAdmission.write([...saved,
    { ...template, args: { ...template.args, turnId: "expired-turn" }, queuedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
    { ...template, args: { ...template.args, turnId: "exhausted-turn" }, attempts: 1 }]);

  // Restart: the old process is gone; a new host reads the durable queue.
  host.admission.freeze?.();
  await cleanupLocalMcpRuntime();
  const restarted = createHostTurnAdmission(store);
  setProviderTurnAdmission(restarted.admission);
  await restarted.admission.acquire(turn("busy-2", "busy-task-2"));
  await restarted.admission.acquire(turn("busy-3", "busy-task-3"));
  const automationAfter = createAutomationRuntime({ persistence: store, runTask, isQueuedTurn: id => restarted.isQueued(id), getTaskStatus: async () => ({ ok: false, reason: "missing" }) as never,
    getWorkspaceInformation: async () => ({ workspaceId: "workspace", workspaceInformation: {} as never }) });
  automationAfter.start({ deferScheduling: true });
  const started: string[] = [];
  await restarted.recover(createQueuedTurnRecoveryHandlers({
    store,
    authorizationForTurn: id => automationAfter.authorizationForTurn(id),
    requestCredentials: async () => ({ credentials: undefined }),
    resumeQueuedProviderTurn: async (args) => {
      started.push(args.turnId!);
      // The automation's start fails after its row was read, as a credential or gate error would.
      if (args.turnId === automationTurn) throw new Error("fixture start failure");
      return resumeQueuedProviderTurn(args);
    },
    notify: notifySupervisorProblem,
  }));
  await settle();

  // Finding 1: a renderer start is never run by the host; it is back in its composer queue.
  assert.equal(started.includes("renderer-turn"), false);
  assert.equal(started.includes("parent-turn"), false, "a partly run parent never restarts from its prompt");
  assert.equal(restarted.isQueued("renderer-turn"), false);
  const draft = store.loadWorkspaceShell({ workspaceId: "workspace" })?.promptDraftByTask?.[rendererTask];
  assert.deepEqual(draft?.queuedTurns?.map(item => ({ id: item.id, content: item.content, providerId: item.providerId, model: item.model })),
    [{ id: "restored-renderer-turn", content: "Renderer prompt", providerId: "codex", model: "gpt-5" }]);
  assert.ok(Date.parse(draft!.queuedTurns![0]!.queuedAt) < Date.now(), "keeps its original queue time, so the queue opens paused as restored");
  assert.deepEqual(restarted.takeRestored().map(row => row.item.id), ["restored-renderer-turn"]);
  assert.deepEqual(restarted.takeRestored(), [], "the renderer takes a restored start once");
  // Host-owned: a missing task is never started; a failed start is dropped; both tell the user on the task.
  assert.equal(started.includes("orphan-turn"), false);
  for (const id of ["orphan-turn", automationTurn, "expired-turn", "exhausted-turn"]) {
    assert.equal(restarted.isQueued(id), false, `${id} no longer held`);
    assert.ok(!store.turnAdmission.read().some(row => row.args.turnId === id), `${id} row removed`);
  }
  const recorded = notices();
  for (const id of ["orphan-turn", automationTurn, "expired-turn", "exhausted-turn"]) assert.ok(recorded.includes(`turn-admission.recovery_failed:${id}`), `${id} notice on its task`);
  // A wake-up's queued turn comes back through its own runtime and waits for a slot again.
  assert.ok(started.includes(wakeTurn));
  assert.equal(restarted.isQueued(wakeTurn), true);

  // Boot cleanup runs after recovery, as in the host. Finding 4: the failed automation run settles.
  automationAfter.start();
  const run = (await automationAfter.list()).runs.find(row => row.id === automationRun.id);
  assert.equal(run?.status, "failed");
  automationAfter.stop();
  // Finding 2: the wake-up sweep leaves the recovered turn running; it is never both interrupted and running.
  const wakeUpsAfter = createWakeUpRuntime({ ...wakeDeps, isQueuedTurn: id => restarted.isQueued(id) });
  wakeUpsAfter.start();
  await settle();
  assert.equal(openTurn(wakeTurn), true, "the recovered wake-up turn stays open");
  wakeUpsAfter.stop();

  // A row survives one boot attempt only: the next boot drops the still-queued wake-up start with a notice.
  restarted.admission.freeze?.();
  await cleanupLocalMcpRuntime();
  const third = createHostTurnAdmission(store);
  await third.recover(createQueuedTurnRecoveryHandlers({ store, authorizationForTurn: () => undefined, requestCredentials: async () => ({ credentials: undefined }),
    resumeQueuedProviderTurn: async () => { throw new Error("must not start"); }, notify: notifySupervisorProblem }));
  assert.deepEqual(store.turnAdmission.read(), []);
  assert.ok(notices().includes(`turn-admission.recovery_failed:${wakeTurn}`));
  process.exitCode = 0;
  console.log("turn-admission recovery: renderer restore, host recovery, failures, sweeps, waits and one boot attempt passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  setProviderTurnAdmission(null);
  await cleanupLocalMcpRuntime();
  resetHostServicePersistence();
  rmSync(root, { recursive: true, force: true });
});
