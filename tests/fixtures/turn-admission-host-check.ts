import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import { createHostTurnAdmission } from "../../electron/host-service/turn-admission-host";
import { withProviderAccountScope } from "../../electron/provider-accounts/runtime-scope";
import type { StreamTurnArgs } from "../../electron/providers/types";

const root = mkdtempSync(join(tmpdir(), "turn-admission-"));
const dbPath = join(root, "state.sqlite");
let store = new SqliteStore({ dbPath, runMaintenance: false });
const args = (id: string, automatic = false): StreamTurnArgs => ({ turnId: id, taskId: id, workspaceId: "workspace", providerId: "codex", prompt: "Work", admissionPriority: automatic ? "automatic" : "user" });
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function cap(limit: number | null) { store.delegationPolicies.saveRouteSettings({ routing: { autoRoutingEnabled: false }, classifier: null, ...store.delegationPolicies.loadRouteSettings(), globalAgentTurnLimit: limit }); }
async function main() {
  cap(2);
  let host = createHostTurnAdmission(store);
  const started: string[] = [];
  const start = (id: string, automatic = false) => host.admission.acquire(args(id, automatic)).then(() => { started.push(id); });
  const pending = [start("1"), start("2"), start("3"), start("4"), start("5")];
  await settle();
  assert.deepEqual(started, ["1", "2"]);
  assert.equal(host.snapshot().queued.length, 3);
  host.admission.release("1"); await settle(); assert.deepEqual(started, ["1", "2", "3"]);
  host.admission.release("2"); host.admission.release("3"); await Promise.all(pending);
  for (const id of started) host.admission.release(id);
  cap(1);
  const first = start("blocker"); await first;
  const automatic = start("automatic", true); const user = start("user");
  host.admission.release("blocker"); await user;
  assert.equal(started.at(-1), "user");
  host.admission.release("user"); await automatic; host.admission.release("automatic");

  const parentStates: string[] = [];
  await host.admission.acquire(args("parent"), event => parentStates.push(event.state));
  const children = [start("child1", true), start("child2", true)];
  await host.wait({ taskId: "parent", waiting: true }); await settle();
  assert.deepEqual(host.snapshot().running, ["child1"]);
  host.admission.release("child1"); await settle();
  assert.deepEqual(host.snapshot().running, ["child2"]);
  host.admission.release("child2"); await Promise.all(children);
  await start("reacquire-blocker");
  const resumedParent = host.wait({ taskId: "parent", waiting: false });
  await settle();
  assert.deepEqual(parentStates, ["running", "queued"]);
  host.admission.release("reacquire-blocker");
  await resumedParent;
  assert.deepEqual(parentStates, ["running", "queued", "running"]);
  assert.deepEqual(host.snapshot().running, ["parent"]); host.admission.release("parent");

  await start("running");
  const stopped = start("stopped").then(() => { throw new Error("cancelled start ran"); }, error => assert.equal(error.message, "turnAdmissionCancelled"));
  assert.equal(host.admission.cancel("stopped"), true); await stopped;
  const profileId = "11111111-1111-4111-8111-111111111111";
  const recoveryArgs: StreamTurnArgs = { ...args("recover", true), admissionOwner: "host-task", freshSession: true, managedTask: true,
    unattendedAutomation: { authorizationToken: "transient-test-token" }, agentRunStage: { agentRunId: "run", stageId: "work", attempt: 2 } };
  const recovered = withProviderAccountScope({ codexAccountProfileId: profileId }, () => host.admission.acquire(recoveryArgs));
  void recovered;
  const recoverSecond = host.admission.acquire({ ...args("recover-second", true), admissionOwner: "host-task" }); void recoverSecond;
  assert.deepEqual(store.turnAdmission.read().map(row => [row.args.turnId, row.state]), [["recover", "queued"], ["recover-second", "queued"], ["running", "running"]]);
  store.close();
  store = new SqliteStore({ dbPath, runMaintenance: false });
  host = createHostTurnAdmission(store);
  const recoveredStarts: StreamTurnArgs[] = [];
  await host.recover({ taskExists: () => true, restore: () => false, failed: (row) => { throw new Error(`unexpected recovery failure ${row.args.turnId}`); }, start: async (request, unattended) => {
    await new Promise(resolve => setTimeout(resolve, 5));
    if (request.turnId === "recover") {
      assert.equal(unattended, true);
      assert.equal(request.runtimeOptions?.codexAccountProfileId, profileId);
      assert.equal(request.admissionOwner, "host-task");
      assert.equal(request.freshSession, true);
      assert.equal(request.managedTask, true);
      assert.deepEqual(request.agentRunStage, { agentRunId: "run", stageId: "work", attempt: 2 });
      assert.equal(request.unattendedAutomation, undefined);
      assert.equal(store.turnAdmission.read().some(row => row.args.turnId === "recover-second"), true);
    }
    recoveredStarts.push(request); void host.admission.acquire(request);
  } });
  await settle();
  assert.deepEqual(recoveredStarts.map(row => row.turnId), ["recover", "recover-second"]);
  assert.deepEqual(host.snapshot().running, ["recover"]);
  host.admission.release("recover"); await settle();
  assert.deepEqual(host.snapshot().running, ["recover-second"]);
  host.admission.release("recover-second");
  assert.deepEqual(store.turnAdmission.read(), []);
  cap(null);
  host = createHostTurnAdmission(store);
  await Promise.all(Array.from({ length: 20 }, (_, i) => host.admission.acquire(args(`uncapped-${i}`))));
  assert.equal(host.snapshot().running.length, 20);
  for (const id of host.snapshot().running) host.admission.release(id);
  console.log("turn-admission host: cap, priority, child wait, cancel, real SQLite reopen, uncapped and six fake-provider paths passed");
}
void main().finally(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
