import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DELEGATED_TASK_INSTRUCTIONS } from "../src/lib/runs/delegated-task";
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
test("host injects shared child instructions on child turns", () => {
  const host = readFileSync(new URL("../electron/host-service/local-mcp-runtime.ts", import.meta.url), "utf8");
  expect(host).toContain('task.parentTaskId ? [{ type: "retrieved_context"');
  expect(host).toContain("content: DELEGATED_TASK_INSTRUCTIONS");
});
