import { expect, test } from "bun:test";
import { AgentRunStartArgsSchema } from "../electron/main/ipc/agent-run-schemas";
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
