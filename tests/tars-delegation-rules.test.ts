import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DELEGATED_TASK_INSTRUCTIONS, delegatedTaskRulesFor } from "../src/lib/runs/delegated-task";
import { tarsExecutionInstructions } from "../electron/host-service/tars-execution";

const toolSource = readFileSync(new URL("../electron/main/stave-mcp-server.ts", import.meta.url), "utf8");
const description = toolSource.slice(toolSource.indexOf('"stave_delegate_task"'), toolSource.indexOf('inputSchema: DelegateTaskToolInputSchema.shape'));
for (const [name, block] of [["child", DELEGATED_TASK_INSTRUCTIONS], ["execution lead", tarsExecutionInstructions({ model: null })], ["delegate tool", description]]) {
  test(`${name} pins delegation, wait/wake, links and user-input rules`, () => {
    expect(block).toMatch(/do not delegate further|must not delegate further/);
    expect(block).toMatch(/unless.*task.*asks|unless.*task.*delegation/);
    expect(block).toMatch(/Never poll/);
    expect(block).toMatch(/sleep or repeated status calls/);
    expect(block).toContain("wait/wake mechanism");
    expect(block).toMatch(/tasks and workspaces by (their )?links/);
    expect(block).toContain("never bare titles or ids");
    expect(block).toContain("secrets, tokens or logins");
    expect(block).toContain("user-input or secret path, never in chat text");
  });
}

test("the delegate tool keeps its meaning: optional other provider, host-filled defaults, other task ids refused", () => {
  expect(description).toContain("optionally on the other provider");
  expect(description).toContain("the host fills in this task, workspace, provider and effort");
  expect(description).toContain("refuses another task's id");
  expect(description).not.toMatch(/cross-provider child|infer task/);
});

test("the no-further-delegation rule binds children only, never a lead that delegates its stages", () => {
  // A lead reads these; each states the limit belongs to the children it starts.
  expect(description).toContain("this limits them, not you");
  expect(tarsExecutionInstructions({ model: null })).toContain("this limit is theirs, not yours");
  // Child turns of a plain delegation receive the rule; an agent run's own stage turns and root tasks do not.
  expect(delegatedTaskRulesFor({ parentTaskId: "parent" })).toBe(DELEGATED_TASK_INSTRUCTIONS);
  expect(delegatedTaskRulesFor({ parentTaskId: "parent", agentRunStage: { agentRunId: "run" } })).toBeNull();
  expect(delegatedTaskRulesFor({ parentTaskId: null })).toBeNull();
});

test("host injects shared child instructions only through the child-only rule", () => {
  const host = readFileSync(new URL("../electron/host-service/local-mcp-runtime.ts", import.meta.url), "utf8");
  expect(host).toContain("delegatedTaskRulesFor({ parentTaskId: task.parentTaskId, agentRunStage: args.agentRunStage })");
  expect(host).toContain('sourceId: "stave:delegation-rules", title: "Delegation rules", content: delegationRules');
  expect(host).not.toContain('task.parentTaskId ? [{ type: "retrieved_context"');
});
