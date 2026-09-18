import { afterEach, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerCollaborationTools } from "../electron/main/stave-collaboration-tools";
import { consultAdvisor, registerAdvisorConsultGrant, clearAdvisorConsultGrantsForTest } from "../electron/providers/advisor-consult";
import { rememberCodexThreadSession, resolveCodexThreadSession, forgetCodexThreadSessionsForTask } from "../electron/providers/codex-thread-session";

afterEach(() => {
  clearAdvisorConsultGrantsForTest();
  forgetCodexThreadSessionsForTask("stable-task");
});

test("one MCP connection serves successive grants but rejects stale, missing, disabled and foreign requests", async () => {
  const client = new Client({ name: "primary", version: "1" });
  const server = new McpServer({ name: "stave-test", version: "1" });
  const channel = "task-channel";
  const calls: string[] = [];
  const arm = (turnId: string, consultKey = channel) => registerAdvisorConsultGrant({
    consultKey, turnId, requireTurnId: true, taskId: "stable-task",
    primaryProviderId: "codex", target: { providerId: "claude-code", model: "claude-fable-5-1", effort: "low" },
    cwd: "/tmp/project", consultLimit: 1,
    emit: () => {}, pausePhase: () => {}, resumePhase: () => {}, addUsage: () => {},
    runners: {
      runClaude: async () => { calls.push(turnId); return { ok: true, text: "Advice" }; },
      runCodex: async () => { throw new Error("Unexpected provider"); },
    },
  });
  registerCollaborationTools(server, { consultKey: channel }, {
    consultAdvisor,
    runAcpWorker: async () => { throw new Error("Unexpected worker"); },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  const call = async (turnId?: string, consultKey?: string) => {
    const result = await client.callTool({ name: "stave_consult_advisor", arguments: {
      question: "Review", ...(turnId ? { turnId } : {}), ...(consultKey ? { consultKey } : {}),
    } });
    return result.structuredContent?.consult;
  };
  const session = { threadKey: "stable-task:/tmp/project:astra:chat:none", executablePath: "/tmp/codex", collaborationGrants: { consultKey: channel } };
  try {
    expect((await client.listTools()).tools.map(t => t.name)).toContain("stave_consult_advisor");
    expect(await call("first")).toMatchObject({ ok: false });
    expect(resolveCodexThreadSession({ ...session, fallbackThreadId: "old-no-tools" })).toBeUndefined();
    rememberCodexThreadSession({ ...session, threadId: "with-advisor" });
    const first = arm("first");
    expect(await call("first")).toMatchObject({ ok: true });
    first.revoke();
    expect(await call("first")).toMatchObject({ ok: false });
    expect(resolveCodexThreadSession({ ...session, collaborationGrants: { consultKey: channel, advisorArmed: false } })).toBe("with-advisor");
    const second = arm("second");
    first.revoke(); // Late cleanup must not delete the new grant.
    arm("foreign", "other-task-channel");
    expect(await call("first")).toMatchObject({ ok: false });
    expect(await call()).toMatchObject({ ok: false });
    expect(await call("foreign", "other-task-channel")).toMatchObject({ ok: false });
    expect(resolveCodexThreadSession(session)).toBe("with-advisor");
    expect(await call("second")).toMatchObject({ ok: true });
    expect(await call("second")).toMatchObject({ ok: false, code: "consult-limit-exhausted" });
    second.revoke();
    expect(await call("second")).toMatchObject({ ok: false });
    expect(calls).toEqual(["first", "second"]);
  } finally {
    await client.close();
    await server.close();
  }
});
