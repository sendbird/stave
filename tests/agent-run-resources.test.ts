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
/** A helper run admitted under `link`. */
function child(store: AgentRunStore, id: string, link: object, maxTurns = 30) {
  const change=createAgentRun({id,input:buildAgentRunStartInput({workspaceId:"ws",taskId:id,agent:{name:"Helper",tools:{maxTurns}},assignment:"Review",now}),repositoryPath:"/tmp/repo",fingerprint:{providerId:"codex",model:"gpt-6.1-sol"},now});
  Object.assign(change.events[0]!,{idempotencyKey:`${id}:start`,detail:{...change.events[0]!.detail,resources:policy,resourceLink:link}});store.create(change,now);
}
/** Turns a run starts until the budget refuses one. */
function drain(store: AgentRunStore, id: string) {
  let turns=0;while(store.consumeResourceTurn(id,`${id}-${turns}`,now))turns++;return turns;
}
test("helpers asking for the default 30 turns work at once, draw from one budget and leave the parent its turn", () => {
  const s=setup();s.consumeResourceTurn("parent","p1",now);
  const a=s.reserveChildResources({parentTaskId:"parent",expectedRootRunId:"parent",childRunId:"a",executionId:"ea",requestedTurns:30,now})!;
  const b=s.reserveChildResources({parentTaskId:"parent",expectedRootRunId:"parent",childRunId:"b",executionId:"eb",requestedTurns:30,now})!;
  expect(a.capacity).toBe(2);expect(b.capacity).toBe(2);
  expect(s.readResources("parent")).toMatchObject({spent:1,reserved:4,remaining:25,activeHelpers:2});
  expect(()=>s.reserveChildResources({parentTaskId:"parent",expectedRootRunId:"parent",childRunId:"c",executionId:"ec",requestedTurns:1,now})).toThrow("helper limit");
  child(s,"a",a.link);child(s,"b",b.link);
  // A draws past its start turns until one turn is left; B's held start turns stay B's.
  expect(drain(s,"a")).toBe(26);
  expect(s.readResources("parent")).toMatchObject({spent:27,reserved:2,remaining:1});
  expect(drain(s,"b")).toBe(2);
  expect(s.readResources("parent")).toMatchObject({spent:29,reserved:0,remaining:1});
  // The last turn is the parent's, to integrate once the helpers finish.
  expect(s.consumeResourceTurn("parent","p2",now)).toBe(false);
  s.releaseResourceReservation(a.link,now);s.releaseResourceReservation(b.link,now);
  expect(s.consumeResourceTurn("parent","p2",now)).toBe(true);
  expect(s.readResources("parent")).toMatchObject({spent:30,remaining:0,activeHelpers:0});
});
test("a helper drawing from the shared budget never passes its own max turns, replies included", () => {
  const s=setup();
  const a=s.reserveChildResources({parentTaskId:"parent",expectedRootRunId:"parent",childRunId:"a",executionId:"ea",requestedTurns:3,now})!;
  child(s,"a",a.link,3);
  expect(drain(s,"a")).toBe(3);
  expect(s.readResources("parent")).toMatchObject({spent:3,reserved:0,remaining:27,activeHelpers:1});
});
test("exact child consumption and release survive store reconstruction without double charging", () => {
  const db=new Database(":memory:"),s=new AgentRunStore(db);create(s,"parent");
  const admission=s.reserveChildResources({parentTaskId:"parent",expectedRootRunId:"parent",childRunId:"a",executionId:"ea",requestedTurns:4,now})!;
  const change=createAgentRun({id:"a",input:buildAgentRunStartInput({workspaceId:"ws",taskId:"a",agent:{name:"Helper"},assignment:"Review",now}),repositoryPath:"/tmp/repo",fingerprint:{providerId:"codex",model:"gpt-6.1-sol"},now});
  Object.assign(change.events[0]!,{idempotencyKey:"a:start",detail:{...change.events[0]!.detail,resources:policy,resourceLink:admission.link}});s.create(change,now);
  expect(s.consumeResourceTurn("a","a1",now)).toBe(true);
  const restarted=new AgentRunStore(db);expect(restarted.consumeResourceTurn("a","a1",now)).toBe(true);
  expect(restarted.readResources("a")).toMatchObject({spent:1,reserved:1,remaining:28});
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
test("a default team policy takes a helper on another provider unless the parent's model is pinned, and names its own limits", () => {
  const team = (patch: Record<string, unknown>) => AdaptiveRunPolicySchema.parse({ ...policy, version: 2, concurrentHelpers: 1, totalHelpers: 2, ...patch });
  const start = (id: string, resources: ReturnType<typeof team>) => {
    const s = new AgentRunStore(new Database(":memory:"));
    const change = create(new AgentRunStore(new Database(":memory:")), id);
    Object.assign(change.events[0]!, { detail: { ...change.events[0]!.detail, resources } });
    s.create(change, now);
    return s;
  };
  const open = start("parent", team({ modelLocked: false }));
  const claude = open.reserveChildResources({ parentTaskId: "parent", expectedRootRunId: "parent", childRunId: "review", executionId: "er",
    requestedTurns: 5, providerId: "claude-code", model: "claude-opus-5-5", now })!;
  expect(claude.capacity).toBe(2);
  expect(() => open.reserveChildResources({ parentTaskId: "parent", expectedRootRunId: "parent", childRunId: "second", executionId: "e2",
    requestedTurns: 1, now })).toThrow("1 at once / 2 in total");
  const pinned = start("parent", team({ modelLocked: true }));
  expect(() => pinned.reserveChildResources({ parentTaskId: "parent", expectedRootRunId: "parent", childRunId: "review", executionId: "er",
    requestedTurns: 5, providerId: "claude-code", model: "claude-opus-5-5", now })).toThrow("pinned");
});
test("a workflow's later stages done by another agent keep their helper slots from every earlier helper", () => {
  const resources = AdaptiveRunPolicySchema.parse({ ...policy, version: 2, concurrentHelpers: 3, totalHelpers: 3 });
  const review = (id: string) => ({ id, title: "Review", kind: "ai" as const, agentConfigId: "reviewer", pinCommit: true, instruction: "Review the commit.", doneWhen: "The review lists each defect." });
  const workflow = [
    { id: "work", title: "Work", kind: "ai" as const, instruction: "Do the work and commit it.", doneWhen: "The work is done." },
    review("review-a"), review("review-b"),
  ];
  const start = (startStageIndex: number) => {
    const s = new AgentRunStore(new Database(":memory:"));
    const input = { ...buildAgentRunStartInput({ workspaceId: "ws", taskId: "parent", agent: { name: "Agent", workflow }, assignment: "Verify the artifact", now }), startStageIndex };
    const change = createAgentRun({ id: "parent", input, repositoryPath: "/tmp/repo", fingerprint: { providerId: "codex", model: "gpt-6.1-sol" }, now });
    Object.assign(change.events[0]!, { idempotencyKey: "parent:start", detail: { ...change.events[0]!.detail, resources } });
    s.create(change, now);
    return s;
  };
  const reserve = (s: AgentRunStore, childRunId: string) => s.reserveChildResources({ parentTaskId: "parent",
    expectedRootRunId: "parent", childRunId, executionId: `e-${childRunId}`, requestedTurns: 2, now });
  // Work: one helper of its own, then the two review slots are kept.
  const working = start(0);
  working.releaseResourceReservation(reserve(working, "helper-1")!.link, now);
  expect(() => reserve(working, "helper-2")).toThrow("keeps its last 2 helper slot");
  // Review A: its Reviewer runs, but a retry of it cannot take the slot kept for Review B.
  const reviewingA = start(1);
  reviewingA.releaseResourceReservation(reserve(reviewingA, "helper-1")!.link, now);
  reviewingA.releaseResourceReservation(reserve(reviewingA, "reviewer-a")!.link, now);
  expect(() => reserve(reviewingA, "reviewer-a-retry")).toThrow("keeps its last 1 helper slot");
  // Review B takes the last slot.
  const reviewingB = start(2);
  reviewingB.releaseResourceReservation(reserve(reviewingB, "helper-1")!.link, now);
  reviewingB.releaseResourceReservation(reserve(reviewingB, "reviewer-a")!.link, now);
  expect(reserve(reviewingB, "reviewer-b")?.capacity).toBe(2);
});
