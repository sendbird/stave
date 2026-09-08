import { afterEach, expect, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerCollaborationTools } from "../electron/main/stave-collaboration-tools";
import {
  collaborationGrantHeaders,
  readCollaborationGrantHeaders,
  type StaveCollaborationGrants,
} from "../electron/providers/stave-collaboration-grants";
import {
  registerAcpWorkerGrant,
  runAcpWorker,
  clearAcpWorkerGrantsForTest,
} from "../electron/providers/acp/acp-worker-runtime";
import { resolveWorkerProfile } from "../src/lib/providers/worker-mode";

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  clearAcpWorkerGrantsForTest();
});

async function connect(
  grants: StaveCollaborationGrants,
  onConsult = (_key: string) => {},
) {
  const server = new McpServer({ name: "test-stave", version: "1" });
  server.registerTool("stave_workspace_fixture", {}, async () => ({
    content: [],
  }));
  registerCollaborationTools(
    server,
    readCollaborationGrantHeaders(collaborationGrantHeaders(grants)),
    {
      runAcpWorker,
      consultAdvisor: async ({ consultKey }) => {
        onConsult(consultKey);
        return { ok: false, code: "unknown-consult-key", message: "fixture" };
      },
    },
  );
  const client = new Client({ name: "test-primary", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  clients.push(client);
  return client;
}

function grant(workerKey: string, cwd: string) {
  const resolution = resolveWorkerProfile({
    providerId: "cursor",
    primaryModel: "auto",
    runtimeModels: ["auto"],
    intent: {
      mode: "task-executor",
      presetId: "verified-patch",
      workerModel: "auto",
      workerEffort: "auto",
    },
  });
  if (resolution.status !== "ready")
    throw new Error("Missing worker fixture profile");
  return registerAcpWorkerGrant({
    workerKey,
    turnId: workerKey,
    cwd,
    profile: { ...resolution.profile, provider: "cursor" },
    emit: () => {},
    pausePhase: () => {},
    resumePhase: () => {},
    addUsage: () => {},
    registerApprovalResponder: () => () => {},
    runners: {
      runCursor: async (args) => [
        { type: "text", text: args.cwd },
        { type: "done" },
      ],
      runKiro: async () => [],
    },
  });
}

test("catalog follows connection capabilities and preserves ordinary workspace tools", async () => {
  for (const [grants, expected] of [
    [{}, []],
    [{ consultKey: "advisor" }, ["stave_consult_advisor"]],
    [{ workerKey: "worker" }, ["stave_run_worker"]],
    [
      { consultKey: "advisor", workerKey: "worker" },
      ["stave_consult_advisor", "stave_run_worker"],
    ],
  ] as const) {
    const client = await connect(grants);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "stave_workspace_fixture",
      ...expected,
    ]);
    expect(JSON.stringify(tools)).not.toContain("consultKey");
    expect(JSON.stringify(tools)).not.toContain("workerKey");
  }
  const disabled = await connect({});
  expect(
    (
      await disabled.callTool({
        name: "stave_run_worker",
        arguments: { task: "Do work", workerKey: "guessed" },
      })
    ).isError,
  ).toBe(true);
});

test("keyless calls stay with their own concurrent turn and cannot switch to a supplied key", async () => {
  grant("worker-a", "/tmp/workspace-a");
  grant("worker-b", "/tmp/workspace-b");
  const a = await connect({ workerKey: "worker-a" });
  const b = await connect({ workerKey: "worker-b" });
  const results = await Promise.all([
    a.callTool({
      name: "stave_run_worker",
      arguments: { task: "Inspect", workerKey: "worker-b" },
    }),
    b.callTool({ name: "stave_run_worker", arguments: { task: "Inspect" } }),
  ]);
  expect(results[0]?.structuredContent).toMatchObject({
    worker: { ok: true, result: "/tmp/workspace-a" },
  });
  expect(results[1]?.structuredContent).toMatchObject({
    worker: { ok: true, result: "/tmp/workspace-b" },
  });
  const consulted: string[] = [];
  const advisor = await connect({ consultKey: "advisor-a" }, (key) =>
    consulted.push(key),
  );
  await advisor.callTool({
    name: "stave_consult_advisor",
    arguments: { question: "Review this", consultKey: "advisor-b" },
  });
  expect(consulted).toEqual(["advisor-a"]);
});

test("revoked connections cannot run work after completion or cancellation", async () => {
  const handle = grant("worker-old", "/tmp/workspace");
  const client = await connect({ workerKey: "worker-old" });
  handle.revoke();
  grant("worker-new", "/tmp/workspace");
  const result = await client.callTool({
    name: "stave_run_worker",
    arguments: { task: "Late call", workerKey: "worker-new" },
  });
  expect(result.structuredContent).toMatchObject({
    worker: { ok: false, code: "unknown-worker-key" },
  });
});
