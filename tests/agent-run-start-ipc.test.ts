import { expect, test } from "bun:test";
import { AgentRunStartArgsSchema, AgentRunRequestChangesArgsSchema } from "../electron/main/ipc/agent-run-schemas";
import { buildAgentRunStartInput } from "@/lib/agent-runs/agent-run";

test("the renderer can start an agent run, never a legacy run without an agent", () => {
  const run = buildAgentRunStartInput({
    workspaceId: "ws-1",
    taskId: "task-1",
    agent: { name: "Implementer" },
    assignment: "Add CSV export.",
    now: new Date("2026-10-04T00:00:00.000Z"),
  });
  expect(AgentRunStartArgsSchema.safeParse(run).success).toBe(true);
  const { origin: _origin, ...plain } = run;
  const refused = AgentRunStartArgsSchema.safeParse(plain);
  expect(refused.success).toBe(false);
});

test("a supervised reply accepts bounded stage guidance and refuses caller authority", () => {
  const reply = { agentRunId: "run", stageId: "work", attempt: 1, feedback: "Use CSV." };
  expect(AgentRunRequestChangesArgsSchema.safeParse(reply).success).toBe(true);
  expect(AgentRunRequestChangesArgsSchema.safeParse({ ...reply, runtimeOptions: { codexFileAccess: "danger-full-access" } }).success).toBe(false);
  expect(AgentRunRequestChangesArgsSchema.safeParse({ ...reply, feedback: "x".repeat(100_001) }).success).toBe(false);
});
