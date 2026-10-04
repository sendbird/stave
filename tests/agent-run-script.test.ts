import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createAgentRunActionExecutor,
  lastPrintedUrl,
  type AgentRunScmPort,
  type AgentRunScriptRun,
} from "../electron/host-service/supervision/agent-run-actions";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { createAgentRun } from "../src/lib/agent-runs/domain";
import { createActionStage } from "../src/lib/workflows/library";
import { WorkflowSchema } from "../src/lib/workflows/schema";

const START = new Date("2026-09-26T10:00:00.000Z");

function scriptAgentRun(store: AgentRunStore, id = "agent-run-1") {
  const workflow = WorkflowSchema.parse({
    version: 1,
    id: "workflow_preview",
    name: "Preview",
    purpose: "Deploy a preview.",
    checkIns: "when-stuck",
    team: "solo",
    stages: [{ id: "deploy", title: "Deploy preview", kind: "action", action: { type: "run-script", scriptId: "preview" } }],
    createdAt: START.toISOString(),
    updatedAt: START.toISOString(),
  });
  const change = createAgentRun({
    id,
    input: {
      workspaceId: "ws-1",
      leadTaskId: "task-1",
      workflow,
      assignment: "Deploy a preview.",
      consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: ["deploy"] },
    },
    repositoryPath: "/tmp/repo",
    fingerprint: { providerId: "claude-code", model: "sonnet" },
    now: START,
  });
  store.create(change, START);
  return store.getAggregate(id)!;
}

function executor(store: AgentRunStore, runScript?: (args: { workspaceId: string; scriptId: string }) => Promise<AgentRunScriptRun>) {
  return createAgentRunActionExecutor({
    store,
    scm: {} as AgentRunScmPort,
    resolveWorkspacePath: async () => "/tmp/repo",
    runScript,
    now: () => START,
  });
}

describe("the Run script action", () => {
  test("starts the script once, waits for it, and turns its last printed address into evidence", async () => {
    const store = new AgentRunStore(new Database(":memory:"));
    const aggregate = scriptAgentRun(store);
    let finish!: (run: AgentRunScriptRun) => void;
    const calls: string[] = [];
    const perform = executor(store, (args) => {
      calls.push(args.scriptId);
      return new Promise((resolve) => (finish = resolve));
    });
    expect(await perform({ aggregate })).toEqual({ status: "in-progress" });
    expect(await perform({ aggregate })).toEqual({ status: "in-progress" });
    expect(calls).toEqual(["preview"]);
    finish({ ok: true, exitCode: 0, output: "Deploying…\nPreview: https://app-git-preview.vercel.app.\nDone" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const outcome = await perform({ aggregate });
    expect(outcome).toMatchObject({
      status: "succeeded",
      result: { type: "run-script", scriptId: "preview", exitCode: 0, url: "https://app-git-preview.vercel.app" },
    });
  });

  test("a failing script fails the stage with its exit code and the end of its output", async () => {
    const store = new AgentRunStore(new Database(":memory:"));
    const aggregate = scriptAgentRun(store);
    const perform = executor(store, async () => ({ ok: true, exitCode: 2, output: "error: missing token" }));
    await perform({ aggregate });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const outcome = await perform({ aggregate });
    expect(outcome).toMatchObject({ status: "failed" });
    expect((outcome as { detail: string }).detail).toBe("“preview” exited with 2. error: missing token");
  });

  test("a run a previous process started is never replayed", async () => {
    const store = new AgentRunStore(new Database(":memory:"));
    const aggregate = scriptAgentRun(store);
    const calls: string[] = [];
    // The first process started it and stopped.
    await executor(store, () => new Promise(() => {}))({ aggregate });
    const outcome = await executor(store, async (args) => {
      calls.push(args.scriptId);
      return { ok: true, exitCode: 0, output: "" };
    })({ aggregate });
    expect(calls).toEqual([]);
    expect(outcome).toMatchObject({ status: "failed" });
    expect((outcome as { detail: string }).detail).toContain("Stave stopped while “preview” ran");
  });

  test("is created with a script to fill in, and reads URLs off output", () => {
    const stage = createActionStage("run-script", []);
    expect(stage).toMatchObject({ title: "Run script", action: { type: "run-script", scriptId: "preview" } });
    expect(lastPrintedUrl("see https://a.test/x and https://b.test/y).")).toBe("https://b.test/y");
    expect(lastPrintedUrl("no address")).toBeUndefined();
    expect(
      WorkflowSchema.safeParse({
        version: 1,
        id: "p",
        name: "P",
        purpose: "P",
        checkIns: "when-stuck",
        team: "solo",
        stages: [{ id: "s", title: "S", kind: "action", action: { type: "run-script", scriptId: " " } }],
        createdAt: START.toISOString(),
        updatedAt: START.toISOString(),
      }).success,
    ).toBe(false);
  });
});
