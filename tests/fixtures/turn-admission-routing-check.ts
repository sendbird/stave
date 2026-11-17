import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostTurnAdmission } from "../../electron/host-service/turn-admission-host";
import { ensureHostServicePersistenceReady, resetHostServicePersistence } from "../../electron/host-service/persistence";
import { providerRuntime, setProviderTurnAdmission } from "../../electron/providers/runtime";
import { runTask, resumeQueuedProviderTurn, cleanupLocalMcpRuntime } from "../../electron/host-service/local-mcp-runtime";
import { createDefaultAutomationRuntime } from "../../src/lib/automations";
import { createAutomationRuntime } from "../../electron/host-service/automation-runtime";
import { runSupervisedTurn } from "../../electron/host-service/supervised-turn";
import type { StreamTurnArgs } from "../../electron/providers/types";

const root = mkdtempSync(join(tmpdir(), "admission-routing-"));
process.env.STAVE_USER_DATA_PATH = root;
const store = ensureHostServicePersistenceReady();
const repo = join(root, "repository");
execFileSync("git", ["init", "-b", "main", repo]);
execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--allow-empty", "-m", "test: initialize"]);
store.upsertWorkspace({ id: "workspace", name: "Workspace", snapshot: { activeTaskId: null, tasks: [], messagesByTask: {} } });
store.saveRepositoryRegistry({ repositories: [{ repositoryPath: repo, repositoryName: "Repository", lastOpenedAt: "2026-11-17", defaultBranch: "main", workspaces: [{ id: "workspace", name: "Workspace", updatedAt: "2026-11-17" }], activeWorkspaceId: "workspace", workspacePathById: { workspace: repo }, workspaceBranchById: { workspace: "main" }, workspaceDefaultById: { workspace: true } }] });
store.delegationPolicies.saveRouteSettings({ routing: { autoRoutingEnabled: false }, classifier: null, globalAgentTurnLimit: 1 });
const host = createHostTurnAdmission(store);
const seen: StreamTurnArgs[] = [];
setProviderTurnAdmission({
  ...host.admission,
  acquire: async (args, changed) => { seen.push(args); await host.admission.acquire(args, changed); },
});
const held: StreamTurnArgs = { turnId: "held", providerId: "codex", prompt: "Hold" };
const base = { workspaceId: "workspace", prompt: "Inspect the repository", provider: "codex" as const, runtimeOptions: { model: "gpt-5" } };
async function main() {
  await host.admission.acquire(held);
  // All requests remain queued, so the native adapter is never allowed to run.
  // The actual provider entry and task preparation run against real Git and SQLite.
  let lastTaskId = "";
  const supervised = (id: string) => runSupervisedTurn({ workspaceId: "workspace", taskId: lastTaskId, turnId: id, prompt: "Continue", fingerprint: { providerId: "codex", model: "gpt-5" },
    ...(id === "stage" || id === "execution" ? { agentRunStage: { agentRunId: id === "execution" ? "tars-run" : "run", stageId: "work", attempt: 1 } } : {}) });
  const automation = createAutomationRuntime({ persistence: store, runTask, getTaskStatus: async () => { throw new Error("No completion polling needed"); },
    getWorkspaceInformation: async () => ({ workspaceId: "workspace", workspaceInformation: {} as never }) });
  const paths: Array<[string, () => unknown]> = [
    ...(["claude-code", "codex", "cursor", "kiro", "opencode"] as const).map(providerId => [`ordinary-${providerId}`, () => providerRuntime.startTurnStream({ ...held, providerId, turnId: `ordinary-${providerId}`, taskId: `ordinary-${providerId}`, workspaceId: "workspace", cwd: repo })] as [string, () => unknown]),
    ["ordinary", () => providerRuntime.startTurnStream({ ...held, turnId: "ordinary", taskId: "ordinary", workspaceId: "workspace", cwd: repo })],
    ["delegated-child", async () => { const result = await runTask({ ...base, parentTaskId: "parent", turnId: "delegated" }); lastTaskId = result.taskId; return result; }],
    ["agent-stage", () => supervised("stage")],
    ["execution", () => supervised("execution")],
    ["wake-up", () => supervised("wake")],
    ["automation", async () => {
      const spec = await automation.create({ name: "Check", prompt: "Inspect repository", environment: { kind: "repository", workspaceId: "workspace", path: repo, repositoryPath: repo, label: "Repository" },
        runtime: createDefaultAutomationRuntime("codex"), schedule: { every: 1, unit: "hours" }, enabled: false, maxConcurrentRuns: 1, trustPolicy: "review-required", informationReferences: [] });
      return automation.runNow({ id: spec.id });
    }],
  ];
  for (const [name, start] of paths) {
    const before = seen.length;
    await start();
    for (let i = 0; i < 20 && seen.length === before; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(seen.length, before + 1, name);
    assert.equal(host.snapshot().running.length, 1, name);
    const latest = seen.at(-1)!;
    host.admission.cancel(latest.turnId!);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  // Resume the exact queued turn after clearing resident host state. Its earlier
  // admission event already owns sequence 1 in the real SQLite journal.
  const pending = await runTask({ ...base, turnId: "resume-journal" });
  await new Promise(resolve => setTimeout(resolve, 20));
  await cleanupLocalMcpRuntime();
  const beforeResume = store.getStreamEvents({ turnId: pending.turnId });
  assert.equal(beforeResume.length, 1);
  assert.equal(beforeResume[0]!.event?.type, "turn_admission");
  host.admission.freeze?.();
  const restarted = createHostTurnAdmission(store);
  const restoredArgs = store.turnAdmission.read().find(row => row.args.turnId === pending.turnId)!.args;
  await restarted.admission.acquire({ ...held, turnId: "restart-held" });
  setProviderTurnAdmission(restarted.admission);
  await resumeQueuedProviderTurn(restoredArgs);
  await new Promise(resolve => setTimeout(resolve, 20));
  await cleanupLocalMcpRuntime();
  const resumedEvents = store.getStreamEvents({ turnId: pending.turnId });
  assert.deepEqual(resumedEvents.map(row => row.sequence), [1, 2], "resume must append after the durable queued event instead of colliding with it");
  assert.deepEqual(resumedEvents.map(row => row.event?.type), ["turn_admission", "turn_admission"]);
  restarted.admission.freeze?.();
  console.log("Real provider and host task paths reached central admission without native execution.");
}
void main().finally(async () => { host.admission.release("held"); setProviderTurnAdmission(null); await cleanupLocalMcpRuntime(); resetHostServicePersistence(); rmSync(root, { recursive: true, force: true }); });
