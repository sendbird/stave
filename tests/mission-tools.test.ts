import { afterEach, expect, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerMissionTools } from "../electron/main/stave-mission-tools";
import {
  turnGrantHeaders,
  readTurnGrantHeaders,
  type StaveTurnGrants,
} from "../electron/providers/stave-turn-grants";
import {
  clearMissionGrantsForTest,
  registerMissionGrant,
  resolveMissionGrant,
} from "../electron/providers/mission-grants";
import type { MissionBriefing } from "../src/lib/missions/briefing";

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  clearMissionGrantsForTest();
});

const BRIEFING = { assignment: "Add CSV export." } as unknown as MissionBriefing;

async function connect(grants: StaveTurnGrants) {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const receipt = { recorded: true as const, stage: "Draft", revision: 1, note: "Recorded." };
  const server = new McpServer({ name: "test-stave", version: "1" });
  server.registerTool("stave_workspace_fixture", {}, async () => ({ content: [] }));
  registerMissionTools(
    server,
    // Round-trip through the transport headers, as a real request does.
    readTurnGrantHeaders(turnGrantHeaders(grants)),
    {
      getMissionForGrant: async (args) => {
        calls.push({ tool: "get", args });
        return BRIEFING;
      },
      reportMissionStage: async (args) => {
        calls.push({ tool: "report", args });
        if ((args.report as { summary?: string }).summary === "refuse") {
          throw new Error("The mission has moved on from this turn's stage.");
        }
        return receipt;
      },
      blockMissionStage: async (args) => {
        calls.push({ tool: "block", args });
        return receipt;
      },
      proposeMissionForGrant: async (args) => {
        calls.push({ tool: "propose", args });
        return { state: "pending", message: "Proposed." };
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

test("mission tools exist only on a connection that carries a mission grant", async () => {
  const plain = await connect({});
  expect(await toolNames(plain.client)).toEqual(["stave_workspace_fixture"]);
  const advisorOnly = await connect({ consultKey: "advisor-live" });
  expect(await toolNames(advisorOnly.client)).toEqual(["stave_workspace_fixture"]);
  const granted = await connect({ missionKey: "mission-live" });
  expect(await toolNames(granted.client)).toEqual([
    "stave_block_stage",
    "stave_get_mission",
    "stave_propose_mission",
    "stave_report_stage",
    "stave_workspace_fixture",
  ]);
});

test("a triage turn proposes under its own grant, never starting work", async () => {
  const { client, calls } = await connect({ missionKey: "mission-live" });
  const result = await client.callTool({
    name: "stave_propose_mission",
    arguments: { title: "Export CSV", assignment: "Add CSV export.", url: "https://slack.example/t/1" },
  });
  expect(result.isError).toBeFalsy();
  expect(calls).toEqual([
    {
      tool: "propose",
      args: { missionKey: "mission-live", input: { title: "Export CSV", assignment: "Add CSV export.", url: "https://slack.example/t/1" } },
    },
  ]);
});

test("the reporting tools take no ids; the connection's key names the stage", async () => {
  const { client, calls } = await connect({ missionKey: "mission-live" });
  const result = await client.callTool({
    name: "stave_report_stage",
    arguments: {
      summary: "Drafted the export.",
      evidence: [{ label: "Tests pass", kind: "check", command: "bun test" }],
      missionId: "someone-elses-mission",
      stageId: "publish",
    },
  });
  expect(result.isError).toBeFalsy();
  expect(calls).toHaveLength(1);
  expect(calls[0]!.args.missionKey).toBe("mission-live");
  const report = calls[0]!.args.report as Record<string, unknown>;
  expect(report.summary).toBe("Drafted the export.");
  expect(report).not.toHaveProperty("missionId");
  expect(report).not.toHaveProperty("stageId");

  await client.callTool({
    name: "stave_block_stage",
    arguments: { missing: "Which plan gets the export?", kind: "input" },
  });
  expect(calls[1]).toMatchObject({ tool: "block", args: { missionKey: "mission-live" } });

  const briefing = await client.callTool({ name: "stave_get_mission", arguments: {} });
  expect(briefing.structuredContent).toEqual({ mission: BRIEFING });
});

test("a refused report comes back as a tool error with the host's sentence", async () => {
  const { client } = await connect({ missionKey: "mission-live" });
  const result = await client.callTool({
    name: "stave_report_stage",
    arguments: { summary: "refuse" },
  });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result.content)).toContain("moved on from this turn's stage");
});

test("a mission grant resolves only while its turn runs", () => {
  const first = registerMissionGrant({
    missionKey: "channel",
    missionId: "mission-1",
    stageId: "draft",
    attempt: 1,
    turnId: "turn-1",
    taskId: "task-1",
  });
  expect(resolveMissionGrant(" channel ")).toMatchObject({ stageId: "draft", turnId: "turn-1" });
  first.revoke();
  expect(resolveMissionGrant("channel")).toBeNull();
  expect(resolveMissionGrant("")).toBeNull();
});

test("revoking an earlier turn's grant keeps a newer grant on a reused channel", () => {
  const earlier = registerMissionGrant({
    missionKey: "codex-channel",
    missionId: "mission-1",
    stageId: "draft",
    attempt: 1,
    turnId: "turn-1",
    taskId: "task-1",
  });
  registerMissionGrant({
    missionKey: "codex-channel",
    missionId: "mission-1",
    stageId: "polish",
    attempt: 1,
    turnId: "turn-2",
    taskId: "task-1",
  });
  earlier.revoke();
  expect(resolveMissionGrant("codex-channel")).toMatchObject({ stageId: "polish", turnId: "turn-2" });
});

test("a renderer turn cannot carry a mission stage, so only the host mints grants", async () => {
  const { StreamTurnArgsSchema } = await import("../electron/main/ipc/provider-conversation-schemas");
  const base = { providerId: "claude-code", prompt: "Continue." };
  expect(StreamTurnArgsSchema.safeParse(base).success).toBe(true);
  expect(
    StreamTurnArgsSchema.safeParse({
      ...base,
      missionStage: { missionId: "mission-1", stageId: "draft", attempt: 1 },
    }).success,
  ).toBe(false);
});
