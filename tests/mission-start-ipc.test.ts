import { expect, test } from "bun:test";
import { MissionStartArgsSchema } from "../electron/main/ipc/mission-schemas";
import { buildAgentRunStartInput } from "@/lib/missions/agent-run";

test("the renderer can start an agent run, never a playbook mission without an agent", () => {
  const run = buildAgentRunStartInput({
    workspaceId: "ws-1",
    taskId: "task-1",
    agent: { name: "Implementer" },
    assignment: "Add CSV export.",
    now: new Date("2026-10-04T00:00:00.000Z"),
  });
  expect(MissionStartArgsSchema.safeParse(run).success).toBe(true);
  const { origin: _origin, ...plain } = run;
  const refused = MissionStartArgsSchema.safeParse(plain);
  expect(refused.success).toBe(false);
});
