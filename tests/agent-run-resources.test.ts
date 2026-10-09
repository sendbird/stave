import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { createAgentRun } from "../src/lib/agent-runs/domain";
import { buildAgentRunStartInput } from "../src/lib/agent-runs/agent-run";
import { AdaptiveRunPolicySchema, AgentResourceRequestSchema } from "../src/lib/agent-runs/resources";
const now = new Date("2026-10-09T00:00:00Z");
const policy = AdaptiveRunPolicySchema.parse({version:1, profile:"balanced", providerId:"codex", allowedModels:["gpt-6.1-sol"], modelLocked:false, effortLocked:false,initialEffort:"medium",teamTurns:30,concurrentHelpers:2,totalHelpers:4,parentReserve:1,maxChanges:2,cooldownTurns:2});
function create(store: AgentRunStore, id: string, resources = true) {
  const change = createAgentRun({id, input:buildAgentRunStartInput({workspaceId:"ws",taskId:id,agent:{name:"Agent"},assignment:"Verify the artifact",now}),repositoryPath:"/tmp/repo",fingerprint:{providerId:"codex",model:"gpt-6.1-sol"},now});
  if(resources) Object.assign(change.events[0]!, {idempotencyKey:`${id}:start`,detail:{...change.events[0]!.detail,resources:policy}});
  store.create(change,now);
  return change;
}
function setup() { const store = new AgentRunStore(new Database(":memory:"));create(store,"parent");return store; }
test("parent and two children cannot reserve the same final capacity", () => {
  const s=setup();s.consumeResourceTurn("parent","p1",now);
  const a=s.reserveChildResources({parentTaskId:"parent",expectedRootRunId:"parent",childRunId:"a",executionId:"ea",requestedTurns:20,now})!;
  const b=s.reserveChildResources({parentTaskId:"parent",expectedRootRunId:"parent",childRunId:"b",executionId:"eb",requestedTurns:20,now})!;
  expect(a.capacity).toBe(20);expect(b.capacity).toBe(8);
  expect(s.readResources("parent")).toMatchObject({spent:1,reserved:28,remaining:1,activeHelpers:2});
  expect(()=>s.reserveChildResources({parentTaskId:"parent",expectedRootRunId:"parent",childRunId:"c",executionId:"ec",requestedTurns:1,now})).toThrow("helper limit");
  expect(s.consumeResourceTurn("parent","p2",now)).toBe(false);
  s.releaseResourceReservation(a.link,now);s.releaseResourceReservation(b.link,now);
  expect(s.consumeResourceTurn("parent","p2",now)).toBe(true);
  expect(s.readResources("parent")?.spent).toBe(2);
});
test("exact child consumption and release survive store reconstruction without double charging", () => {
  const db=new Database(":memory:"),s=new AgentRunStore(db);create(s,"parent");
  const admission=s.reserveChildResources({parentTaskId:"parent",expectedRootRunId:"parent",childRunId:"a",executionId:"ea",requestedTurns:4,now})!;
  const change=createAgentRun({id:"a",input:buildAgentRunStartInput({workspaceId:"ws",taskId:"a",agent:{name:"Helper"},assignment:"Review",now}),repositoryPath:"/tmp/repo",fingerprint:{providerId:"codex",model:"gpt-6.1-sol"},now});
  Object.assign(change.events[0]!,{idempotencyKey:"a:start",detail:{...change.events[0]!.detail,resources:policy,resourceLink:admission.link}});s.create(change,now);
  expect(s.consumeResourceTurn("a","a1",now)).toBe(true);
  const restarted=new AgentRunStore(db);expect(restarted.consumeResourceTurn("a","a1",now)).toBe(true);
  expect(restarted.readResources("a")).toMatchObject({spent:1,reserved:3,remaining:26});
  expect(()=>restarted.releaseResourceReservation({...admission.link,executionId:"stale"},now)).toThrow("stale");
  restarted.releaseResourceReservation(admission.link,now);restarted.releaseResourceReservation(admission.link,now);
  expect(restarted.readResources("a")).toMatchObject({spent:1,reserved:0,remaining:29,helpersLaunched:1,activeHelpers:0});
  expect(restarted.consumeResourceTurn("a","a2",now)).toBe(false);
});
test("released helpers still count toward the cumulative launch ceiling", () => {
  const s=setup();for(let n=0;n<4;n++){const a=s.reserveChildResources({parentTaskId:"parent",expectedRootRunId:"parent",childRunId:`h${n}`,executionId:`e${n}`,requestedTurns:2,now})!;s.releaseResourceReservation(a.link,now);}
  expect(()=>s.reserveChildResources({parentTaskId:"parent",expectedRootRunId:"parent",childRunId:"fifth",executionId:"fifth",requestedTurns:1,now})).toThrow("helper limit");
});
test("legacy runs remain outside shared admission and malformed resource requests fail closed", () => {
  const s=new AgentRunStore(new Database(":memory:"));create(s,"legacy",false);expect(s.readResources("legacy")).toBeNull();
  expect(s.reserveChildResources({parentTaskId:"legacy",childRunId:"a",executionId:"ea",requestedTurns:30,now})).toBeNull();
  expect(AgentResourceRequestSchema.safeParse({model:"x",reason:"capability-mismatch",rationale:"diagnosed",evidenceRefs:["turn-1"],permissionMode:"auto"}).success).toBe(false);
});
