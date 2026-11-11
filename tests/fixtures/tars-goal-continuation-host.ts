import { expect, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../../electron/persistence/tars-store";
import { TarsConversationStore } from "../../electron/persistence/tars-conversation-store";
import { AgentRunStore } from "../../electron/persistence/agent-run-store";
import { AgentAssignmentStore } from "../../electron/persistence/agent-assignment-store";
import { createAssignRuntime } from "../../electron/host-service/supervision/assign-runtime";
import { createAgentRun, AgentRunStartInputSchema } from "../../src/lib/agent-runs/domain";
import { cancelAgentRun } from "../../src/lib/agent-runs/commands";
import { buildAgentRunReport } from "../../src/lib/agent-runs/report";
import { BUILTIN_AGENTS } from "../../src/lib/agents/starters";
import { tarsWorkflow } from "../../electron/host-service/tars-execution";
import { actTars } from "../../electron/host-service/tars-control";
import { buildTarsOutputs } from "../../src/lib/tars/outputs-model";
import { projectTarsReport } from "../../src/lib/tars/report-model";
import { isTarsPublishable } from "../../src/lib/tars/publish-model";
import { tarsExecutionCriteria, tarsRunIds } from "../../src/lib/tars/continuation";

const cancelCase = process.argv[3]?.startsWith("cancel") ?? false;
const cancelledLocation = process.argv[3];
const provider = process.argv[2] as "codex" | "claude-code";
const directory = mkdtempSync(path.join(tmpdir(), "stave-goal-continuation-"));
const filename = path.join(directory, "store.sqlite");
let clock = Date.parse("2026-11-12T00:00:00.000Z");
const now = () => new Date(clock += 1_000).toISOString();
let db: Database;
let persistence: ReturnType<typeof open>;
function open() {
  db = new Database(filename);
  return { tars: new TarsStore(db), tarsConversations: new TarsConversationStore(db),
    agentAssignments: new AgentAssignmentStore(db), agentRuns: new AgentRunStore(db) };
}
persistence = open();
let archived = false, missing = false, revoke = false, loseAck = false;
const registry = [{ repositoryPath: directory, workspaces: [{ id: "source", path: directory }, { id: "execution", path: directory }] }];
mock.module("../../electron/host-service/persistence", () => ({ ensureHostServicePersistenceReady: () => persistence }));
mock.module("../../electron/host-service/supervision/assign-host", () => ({ hostAgents: () => BUILTIN_AGENTS }));
mock.module("../../electron/providers/runtime", () => ({ providerRuntime: {} }));
mock.module("../../electron/host-service/local-mcp-runtime", () => ({
  listKnownRepositories: async () => missing ? [] : registry,
  getTaskSupervisionSnapshot: async () => ({ exists: true, archived, repositoryPath: directory, providerId: provider, activeTurnId: null }),
}));
const { createHostTarsRuntime } = await import("../../electron/host-service/tars-host");
let starts = 0;
const getDetail = (agentRunId: string) => {
  const aggregate = persistence.agentRuns.getAggregate(agentRunId)!;
  const report = aggregate.agentRun.state === "completed" ? buildAgentRunReport({ aggregate,
    workspace: { branch: null, branchPushed: false, openPullRequest: null }, endedAt: new Date(aggregate.agentRun.updatedAt) }) : null;
  return { ...aggregate, events: [], report };
};
const makeRuntime = () => createHostTarsRuntime({ assignments: createAssignRuntime({ store: persistence.agentAssignments }), agentRuns: {
  get: async ({ agentRunId }: { agentRunId: string }) => getDetail(agentRunId),
  cancel: async ({ agentRunId }: { agentRunId: string }, guard: (run: unknown) => void) => {
    const aggregate = persistence.agentRuns.getAggregate(agentRunId)!;
    guard(aggregate.agentRun);
    persistence.agentRuns.apply(cancelAgentRun({ aggregate, now: new Date(now()) }), new Date(now()));
  },
  startAgentRun: async (raw: unknown, guard: () => void) => {
    if (revoke) createAssignRuntime({ store: persistence.agentAssignments }).releaseTaskAgent("same-task");
    guard();
    const input = AgentRunStartInputSchema.parse(raw);
    const change = createAgentRun({ id: `next-${++starts}`, input, repositoryPath: directory,
      fingerprint: { providerId: provider, model: "fixture" }, now: new Date(now()) });
    const created = persistence.agentRuns.create(change, new Date(now()));
    expect(created.ok).toBe(true);
    if (loseAck) { loseAck = false; throw new Error("Lost acknowledgement after durable run creation"); }
    return getDetail(change.agentRun.id);
  },
} as never });
let runtime = makeRuntime();
const tick = async () => { runtime.requestTick(); await runtime.drain(); };

/** Persist provider stage outcomes; host observation and report projection consume these real records. */
function finish(agentRunId: string) {
  const aggregate = persistence.agentRuns.getAggregate(agentRunId)!;
  const time = now();
  const revision = { status: "known" as const, revision: "verified-revision" };
  const stages = aggregate.agentRun.workflow.stages.map((stage) => ({ ...aggregate.stages[0]!, stageId: stage.id,
    status: "completed" as const, startedAt: time, endedAt: time, reportRevision: 1,
    report: { outcome: "complete" as const, summary: `Verified ${agentRunId}`, decisions: [], evidence: [],
      artifacts: [{ label: `Artifact ${agentRunId}`, url: `https://example.test/artifact/${agentRunId}` }],
      acceptanceCriteria: stage.kind === "ai" ? (stage.acceptanceCriteria ?? []).map((item) => ({ text: item.text, status: "met" as const, required: true })) : [],
      ...(stage.id === "review" ? { reviewVerdict: "passed" as const } : {}),
      workspaceRevision: revision, reportedAt: time, turnId: null },
    facts: { workspaceRevision: revision, diff: null, commands: [], toolCalls: [], action: null, changedPaths: ["artifact.txt"] },
  }));
  persistence.agentRuns.apply({ agentRun: { ...aggregate.agentRun, state: "completed", updatedAt: time }, upserts: stages, events: [] }, new Date(time));
}

try {
  const time = now();
  let row = persistence.tars.create({ requestId: "original", title: "Existing goal", instruction: "Original goal",
    acceptanceCriteria: ["Original criterion"], completionGoal: "pullRequest", branchName: "feat/existing-goal",
    workspaceId: "source", repositoryPath: directory, providerId: provider }, time);
  row = persistence.tars.patch(row.id, row.revision, { taskId: "same-task", executionWorkspaceId: "execution", agentRunId: "original-run", state: "running" }, time);
  createAssignRuntime({ store: persistence.agentAssignments }).recordTaskAgent({ requestId: `tars-${row.id}`, taskId: row.taskId!,
    workspaceId: "execution", repositoryPath: directory, agent: BUILTIN_AGENTS.find(agent => agent.id === "supervisor")!, providerId: provider,
    model: null, assignment: row.instruction });
  persistence.agentRuns.create(createAgentRun({ id: "original-run", input: { workspaceId: "execution", leadTaskId: "same-task", origin: "agent",
    workflow: tarsWorkflow(row, time), assignment: row.instruction, consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } },
    repositoryPath: directory, fingerprint: { providerId: provider, model: "fixture" }, now: new Date(time) }), new Date(time));
  finish("original-run"); await tick();
  row = persistence.tars.get(row.id)!;
  expect(row.state).toBe("resultReady");
  // Publication is a recorded fixture only: this test never calls a remote service.
  row = persistence.tars.patch(row.id, row.revision, { state: "completed", publication: { agentRunId: row.agentRunId!, state: "opened", failedStep: null,
    commit: "abcdef0", branch: row.branchName!, base: "main", commitMessage: "feat: existing goal", title: "feat: existing goal",
    url: "https://example.test/pull/1", number: 1, error: null, reason: null, updatedAt: now() } }, now());
  await tick(); row = persistence.tars.get(row.id)!;
  expect(row.state).toBe("completed");
  writeFileSync(path.join(directory, "artifact.txt"), "original artifact");
  const id = row.id;
  const send = (requestId: string, text: string) => {
    const current = persistence.tars.get(id)!;
    return actTars({ requestId, responsibilityId: id, expectedRevision: current.revision, operation: "message", input: { text }, source: "click" },
      { conversations: persistence.tarsConversations, runtime, now });
  };
  const restart = async () => { runtime.stop(); await runtime.drain(); db.close(); persistence = open(); runtime = makeRuntime(); };
  for (const [index, text] of ["Fix the review finding", "Verify the reverse path"].entries()) {
    const before = persistence.tars.get(id)!;
    const requestId = `revision-${index}`;
    loseAck = true;
    const results = await Promise.all([send(requestId, text), send(requestId, text)]);
    expect(results.every((result) => result.record.status === "applied")).toBe(true);
    await tick(); await restart(); await tick();
    row = persistence.tars.get(id)!;
    expect(starts).toBe(index + 1);
    expect(row).toMatchObject({ id, taskId: "same-task", executionWorkspaceId: "execution", completionGoal: "pullRequest", instruction: "Original goal", state: "running", resultVerifiedRunId: null });
    expect(row.publication).toBeUndefined();
    expect(row.completionConfirmedAt).toBeUndefined();
    expect(isTarsPublishable(row)).toBe(false);
    expect(row.previousRunIds).toContain(before.agentRunId!);
    expect(persistence.agentRuns.getAgentRun(row.agentRunId!)?.assignment).toBe(text);
    expect(persistence.tarsConversations.getAction(requestId)?.delivery).toMatchObject({ status: "delivered", agentRunId: row.agentRunId });
    const stale = await actTars({ requestId: `stale-${index}`, responsibilityId: id, expectedRevision: before.revision,
      operation: "message", input: { text: "stale revision" }, source: "click" }, { conversations: persistence.tarsConversations, runtime, now });
    expect(stale.record.reason).toBe("stale");
    finish(row.agentRunId!); await tick();
    row = persistence.tars.get(id)!;
    expect(row.state).toBe("resultReady");
    expect(row.resultVerifiedRunId).toBe(row.agentRunId);
    expect(isTarsPublishable(row)).toBe(true);
    expect(projectTarsReport(row, getDetail(row.agentRunId!)).criteria.map(item => item.text)).toEqual(tarsExecutionCriteria(row));
  }
  await restart();
  row = persistence.tars.get(id)!;
  const runs = Object.fromEntries(tarsRunIds(row).map(runId => [runId, getDetail(runId)]));
  const outputs = buildTarsOutputs({ responsibilities: [row], runs });
  expect(outputs.filter(item => item.kind === "report").map(item => item.agentRunId)).toEqual(["next-2", "next-1", "original-run"]);
  expect(outputs.filter(item => item.kind === "link")).toHaveLength(3);
  expect(outputs.find(item => item.kind === "pullRequest")).toMatchObject({ agentRunId: "original-run", url: "https://example.test/pull/1" });
  expect(projectTarsReport(row, runs["original-run"]).criteria.map(item => item.text)).toEqual(["Original criterion"]);
  for (const failure of (cancelCase ? [] : ["archived", "missing", "owner"])) {
    archived = failure === "archived"; missing = failure === "missing"; revoke = failure === "owner";
    const response = await send(`denied-${failure}`, "Must not start");
    await tick();
    if (failure === "missing") expect(response.record.status).toBe("rejected");
    else expect(persistence.tarsConversations.getAction(`denied-${failure}`)?.delivery?.status).toBe("failed");
    expect(starts).toBe(2);
    archived = missing = revoke = false;
  }
  if (cancelCase) {
    loseAck = true;
    await send("cancel-after-start", "One more correction"); await tick();
    row = persistence.tars.get(id)!;
    expect(row.executionPending).toBe(true);
    archived = cancelledLocation === "cancel-archived";
    missing = cancelledLocation === "cancel-missing";
    const response = await actTars({ requestId: "cancel-uncertain", responsibilityId: id, expectedRevision: row.revision,
      operation: "cancel", source: "click" }, { conversations: persistence.tarsConversations, runtime, now });
    expect(response.record.status).toBe("applied");
    expect(persistence.tars.get(id)).toMatchObject({ state: "cancelled", agentRunId: "next-3" });
    expect(persistence.agentRuns.getAgentRun("next-3")?.state).toBe("cancelled");
    await restart(); await tick();
    expect(starts).toBe(3);
  }
  const artifact = readFileSync(path.join(directory, "artifact.txt"), "utf8");
  console.log(JSON.stringify({ starts, history: row.previousRunIds!.length, reports: outputs.filter(item => item.kind === "report").length, artifact, provider }));
} finally {
  runtime.stop(); await runtime.drain(); db!.close(); rmSync(directory, { recursive: true, force: true });
}
