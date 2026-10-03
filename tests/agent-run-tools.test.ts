import { afterEach, expect, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAgentRunTools } from "../electron/main/stave-agent-run-tools";
import {
  turnGrantHeaders,
  readTurnGrantHeaders,
  type StaveTurnGrants,
} from "../electron/providers/stave-turn-grants";
import {
  clearAgentRunGrantsForTest,
  registerAgentRunGrant,
  resolveAgentRunGrant,
} from "../electron/providers/agent-run-grants";
import type { AgentRunBriefing } from "../src/lib/agent-runs/briefing";

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  clearAgentRunGrantsForTest();
});

const BRIEFING = { assignment: "Add CSV export." } as unknown as AgentRunBriefing;

async function connect(grants: StaveTurnGrants) {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const receipt = { recorded: true as const, stage: "Draft", revision: 1, note: "Recorded." };
  const server = new McpServer({ name: "test-stave", version: "1" });
  server.registerTool("stave_workspace_fixture", {}, async () => ({ content: [] }));
  registerAgentRunTools(
    server,
    // Round-trip through the transport headers, as a real request does.
    readTurnGrantHeaders(turnGrantHeaders(grants)),
    {
      getAgentRunForGrant: async (args) => {
        calls.push({ tool: "get", args });
        return BRIEFING;
      },
      reportAgentRunStage: async (args) => {
        calls.push({ tool: "report", args });
        if ((args.report as { summary?: string }).summary === "refuse") {
          throw new Error("The run has moved on from this turn's stage.");
        }
        return receipt;
      },
      blockAgentRunStage: async (args) => {
        calls.push({ tool: "block", args });
        return receipt;
      },
    },
  );
  const client = new Client({ name: "test-primary", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  clients.push(client);
  return { client, calls };
}

async function toolNames(client: Client) {
  return (await client.listTools()).tools.map((tool) => tool.name).sort();
}

test("run tools exist only on a connection that carries a run grant", async () => {
  const plain = await connect({});
  expect(await toolNames(plain.client)).toEqual(["stave_workspace_fixture"]);
  const advisorOnly = await connect({ consultKey: "advisor-live" });
  expect(await toolNames(advisorOnly.client)).toEqual(["stave_workspace_fixture"]);
  const granted = await connect({ agentRunKey: "agent-run-live" });
  expect(await toolNames(granted.client)).toEqual([
    "stave_block_stage",
    "stave_get_agent_run",
    "stave_report_stage",
    "stave_workspace_fixture",
  ]);
});

test("the reporting tools take no ids; the connection's key names the stage", async () => {
  const { client, calls } = await connect({ agentRunKey: "agent-run-live" });
  const result = await client.callTool({
    name: "stave_report_stage",
    arguments: {
      summary: "Drafted the export.",
      evidence: [{ label: "Tests pass", kind: "check", command: "bun test" }],
      agentRunId: "someone-elses-agent-run",
      stageId: "publish",
    },
  });
  expect(result.isError).toBeFalsy();
  expect(calls).toHaveLength(1);
  expect(calls[0]!.args.agentRunKey).toBe("agent-run-live");
  const report = calls[0]!.args.report as Record<string, unknown>;
  expect(report.summary).toBe("Drafted the export.");
  expect(report).not.toHaveProperty("agentRunId");
  expect(report).not.toHaveProperty("stageId");

  await client.callTool({
    name: "stave_block_stage",
    arguments: { missing: "Which plan gets the export?", kind: "input" },
  });
  expect(calls[1]).toMatchObject({ tool: "block", args: { agentRunKey: "agent-run-live" } });

  const briefing = await client.callTool({ name: "stave_get_agent_run", arguments: {} });
  expect(briefing.structuredContent).toEqual({ agentRun: BRIEFING });
});

test("a refused report comes back as a tool error with the host's sentence", async () => {
  const { client } = await connect({ agentRunKey: "agent-run-live" });
  const result = await client.callTool({
    name: "stave_report_stage",
    arguments: { summary: "refuse" },
  });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result.content)).toContain("moved on from this turn's stage");
});

test("a run grant resolves only while its turn runs", () => {
  const first = registerAgentRunGrant({
    agentRunKey: "channel",
    agentRunId: "agent-run-1",
    stageId: "draft",
    attempt: 1,
    turnId: "turn-1",
    taskId: "task-1",
  });
  expect(resolveAgentRunGrant(" channel ")).toMatchObject({ stageId: "draft", turnId: "turn-1" });
  first.revoke();
  expect(resolveAgentRunGrant("channel")).toBeNull();
  expect(resolveAgentRunGrant("")).toBeNull();
});

test("revoking an earlier turn's grant keeps a newer grant on a reused channel", () => {
  const earlier = registerAgentRunGrant({
    agentRunKey: "codex-channel",
    agentRunId: "agent-run-1",
    stageId: "draft",
    attempt: 1,
    turnId: "turn-1",
    taskId: "task-1",
  });
  registerAgentRunGrant({
    agentRunKey: "codex-channel",
    agentRunId: "agent-run-1",
    stageId: "polish",
    attempt: 1,
    turnId: "turn-2",
    taskId: "task-1",
  });
  earlier.revoke();
  expect(resolveAgentRunGrant("codex-channel")).toMatchObject({ stageId: "polish", turnId: "turn-2" });
});

test("a renderer turn cannot carry a run stage, so only the host mints grants", async () => {
  const { StreamTurnArgsSchema } = await import("../electron/main/ipc/provider-conversation-schemas");
  const base = { providerId: "claude-code", prompt: "Continue." };
  expect(StreamTurnArgsSchema.safeParse(base).success).toBe(true);
  expect(
    StreamTurnArgsSchema.safeParse({
      ...base,
      agentRunStage: { agentRunId: "agent-run-1", stageId: "draft", attempt: 1 },
    }).success,
  ).toBe(false);
});
