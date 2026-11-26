import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrTools, PrToolInput } from "../electron/main/stave-pr-tools";
import { isAlwaysAllowedStaveLocalMcpTool } from "../electron/providers/stave-local-mcp-approval";
import { READ_ONLY_DELEGATION_STAVE_TOOLS } from "../src/lib/runs/read-only-delegation";

test("PR evidence is read-only and bounds failed-check log requests", async () => {
  const name = "stave_get_pull_request_context";
  expect(PrToolInput.parse({})).toEqual({ checks: 3, threads: true });
  expect(PrToolInput.safeParse({ checks: 5 }).success).toBe(true);
  expect(PrToolInput.safeParse({ checks: 6 }).success).toBe(false);
  expect(READ_ONLY_DELEGATION_STAVE_TOOLS).toContain(name);
  expect(isAlwaysAllowedStaveLocalMcpTool(name)).toBe(true);
  const server = new McpServer({ name: "server", version: "1" });
  const calls: string[] = [];
  registerPrTools(server, async method => { calls.push(method); throw new Error("Unavailable"); }, async () => "/workspace");
  const client = new Client({ name: "client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name)).toEqual([name]);
    expect(tools[0]?.annotations?.readOnlyHint).toBe(true);
    await client.callTool({ name, arguments: { checks: 6 } });
    expect(calls).toEqual([]);
    await client.callTool({ name, arguments: {} });
    expect(calls).toEqual(["scm.get-pr-status"]);
  } finally { await client.close(); }
});
