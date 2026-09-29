import { describe, expect, test } from "bun:test";
import { collectAgentsWithWork } from "../src/lib/agents/agent-work";
import type { TaskAgent } from "../src/store/agent-assignments-store";
import type { ChatMessage } from "../src/types/chat";

function agent(id: string, name: string): TaskAgent {
  return {
    assignmentId: `assign-${id}`,
    agentConfigId: id,
    agentName: name,
    agentContentHash: "hash",
    state: "started",
    providerId: "claude-code",
    model: null,
    workspaceMode: "new-worktree",
    branch: null,
    detail: null,
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
  } as unknown as TaskAgent;
}

function task(id: string) {
  return { id, archivedAt: null, updatedAt: "2026-09-29T00:00:00.000Z" };
}

/** A message that leaves the task waiting on the user for an approval. */
function waitingMessage(): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    parts: [
      {
        type: "approval",
        toolName: "Bash",
        description: "run tests",
        requestId: "r1",
        state: "approval-requested",
      },
    ],
  } as unknown as ChatMessage;
}

describe("collectAgentsWithWork", () => {
  test("only tasks with an agent and running/waiting work are grouped", () => {
    const result = collectAgentsWithWork({
      byTaskId: {
        t1: agent("planner", "Planner"),
        t2: agent("planner", "Planner"),
        // t3 has no agent assignment and must be ignored.
      },
      tasks: [task("t1"), task("t2"), task("t3")],
      messagesByTask: { t1: [waitingMessage()], t2: [waitingMessage()] },
      activeTurnIdsByTask: {},
      providerTurnActivityByTask: {},
      limit: 5,
    });
    expect(result.total).toBe(1);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]).toMatchObject({
      agentConfigId: "planner",
      agentName: "Planner",
      count: 2,
      needsYou: true,
    });
  });

  test("an idle task with an agent contributes nothing", () => {
    const result = collectAgentsWithWork({
      byTaskId: { t1: agent("planner", "Planner") },
      tasks: [task("t1")],
      messagesByTask: { t1: [] },
      activeTurnIdsByTask: {},
      providerTurnActivityByTask: {},
      limit: 5,
    });
    expect(result.total).toBe(0);
    expect(result.agents).toHaveLength(0);
  });

  test("the list is capped at the limit but the total counts every agent", () => {
    const byTaskId: Record<string, TaskAgent> = {};
    const tasks = [] as ReturnType<typeof task>[];
    const messagesByTask: Record<string, ChatMessage[]> = {};
    for (let index = 0; index < 7; index += 1) {
      const id = `t${index}`;
      byTaskId[id] = agent(`agent-${index}`, `Agent ${index}`);
      tasks.push(task(id));
      messagesByTask[id] = [waitingMessage()];
    }
    const result = collectAgentsWithWork({
      byTaskId,
      tasks,
      messagesByTask,
      activeTurnIdsByTask: {},
      providerTurnActivityByTask: {},
      limit: 5,
    });
    expect(result.total).toBe(7);
    expect(result.agents).toHaveLength(5);
  });
});
