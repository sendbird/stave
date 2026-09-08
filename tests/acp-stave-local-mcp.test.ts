import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import type { CanonicalConversationRequest } from "../src/lib/providers/provider.types";
import { STAVE_WORKSPACE_INFORMATION_SOURCE_ID } from "../src/lib/task-context/current-task-awareness";

const actualManifest = await import("../electron/main/stave-local-mcp-manifest");

const fixtureManifest = {
  version: 1 as const,
  name: "stave-local-mcp" as const,
  mode: "local-only" as const,
  url: "http://127.0.0.1:39517/mcp",
  healthUrl: "http://127.0.0.1:39517/health",
  token: "manifest-token-placeholder",
  host: "127.0.0.1",
  port: 39_517,
  pid: 123,
  appVersion: "0.0.0-test",
  startedAt: "2026-07-30T00:00:00.000Z",
  stdioProxyScript: "/tmp/stave-mcp-stdio-proxy.js",
};

let manifestOverride: typeof fixtureManifest | null = fixtureManifest;

mock.module("../electron/main/stave-local-mcp-manifest", () => ({
  ...actualManifest,
  readPrimaryStaveLocalMcpManifest: async () => manifestOverride,
  resolveAcpStaveLocalMcpServers: async (args?: {
    allowedToolNames?: readonly string[];
  }) => {
    if (!manifestOverride) {
      return [];
    }
    return [
      actualManifest.toAcpStdioMcpServerConfig(manifestOverride, args),
    ];
  },
}));

const { streamCursorWithAcp } = await import(
  "../electron/providers/cursor/cursor-acp-profile"
);
const { streamKiroWithAcp } = await import(
  "../electron/providers/kiro/kiro-acp-profile"
);

const cursorFixturePath = path.join(
  import.meta.dir,
  "fixtures",
  "fake-cursor-acp-agent.ts",
);
const kiroFixturePath = path.join(
  import.meta.dir,
  "fixtures",
  "fake-kiro-acp-agent.ts",
);

function workspaceConversation(
  providerId: "cursor" | "kiro",
): CanonicalConversationRequest {
  return {
    target: { providerId, model: "auto" },
    mode: "chat",
    history: [],
    input: {
      role: "user",
      providerId: "user",
      content: "What is on the Information panel?",
      parts: [
        { type: "text", text: "What is on the Information panel?" },
      ],
    },
    contextParts: [
      {
        type: "retrieved_context",
        sourceId: STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
        title: "Stave Workspace Information",
        content: "Notes: keep the panel compact",
      },
    ],
  };
}

function parseEchoSession(events: Array<{ type: string; text?: string }>) {
  const text = events.find(
    (event) => event.type === "text" && event.text?.startsWith("echo-session:"),
  )?.text;
  expect(text).toBeTruthy();
  return JSON.parse(text!.slice("echo-session:".length)) as {
    mcpServers: Array<{
      name?: string;
      env?: Array<{ name: string; value: string }>;
    }>;
    prompt: string;
  };
}

describe("ACP Stave Local MCP embedding", () => {
  test("Cursor primary turns attach the full Local MCP catalog", async () => {
    manifestOverride = fixtureManifest;
    const echoed = parseEchoSession(
      await streamCursorWithAcp({
        providerId: "cursor",
        prompt: "Read the Information panel",
        cwd: import.meta.dir,
        runtimeOptions: {
          model: "auto",
          cursorMode: "agent",
          cursorBinaryPath: process.execPath,
        },
        acpArgsForTest: [cursorFixturePath, "echo-session"],
        conversation: workspaceConversation("cursor"),
      }),
    );
    const staveServer = echoed.mcpServers.find(
      (server) => server.name === "stave-local-mcp",
    );
    expect(staveServer).toBeTruthy();
    expect(staveServer?.env?.some((entry) => entry.name === "STAVE_MCP_ALLOWED_TOOLS")).toBe(
      false,
    );
    expect(echoed.prompt).toContain("Notes: keep the panel compact");
  });

  test("Kiro primary turns attach the full Local MCP catalog", async () => {
    manifestOverride = fixtureManifest;
    const echoed = parseEchoSession(
      await streamKiroWithAcp({
        providerId: "kiro",
        prompt: "Read the Information panel",
        cwd: import.meta.dir,
        runtimeOptions: {
          model: "auto",
          kiroBinaryPath: process.execPath,
        },
        acpArgsForTest: [kiroFixturePath, "echo-session"],
        conversation: workspaceConversation("kiro"),
      }),
    );
    const staveServer = echoed.mcpServers.find(
      (server) => server.name === "stave-local-mcp",
    );
    expect(staveServer).toBeTruthy();
    expect(staveServer?.env?.some((entry) => entry.name === "STAVE_MCP_ALLOWED_TOOLS")).toBe(
      false,
    );
    expect(echoed.prompt).toContain("Notes: keep the panel compact");
  });

  test("Cursor Worker-armed turns still receive the full catalog", async () => {
    manifestOverride = fixtureManifest;
    const echoed = parseEchoSession(
      await streamCursorWithAcp({
        providerId: "cursor",
        prompt: "Delegate the remaining work",
        cwd: import.meta.dir,
        runtimeOptions: {
          model: "auto",
          cursorMode: "agent",
          cursorBinaryPath: process.execPath,
        },
        staveLocalMcpToolNames: ["stave_run_worker"],
        acpArgsForTest: [cursorFixturePath, "echo-session"],
      }),
    );
    const staveServer = echoed.mcpServers.find(
      (server) => server.name === "stave-local-mcp",
    );
    expect(staveServer).toBeTruthy();
    expect(staveServer?.env?.some((entry) => entry.name === "STAVE_MCP_ALLOWED_TOOLS")).toBe(
      false,
    );
  });

  test("drops MCP-scoped retrieved context when the Local MCP server is down", async () => {
    manifestOverride = null;
    const echoed = parseEchoSession(
      await streamCursorWithAcp({
        providerId: "cursor",
        prompt: "What is on the Information panel?",
        cwd: import.meta.dir,
        runtimeOptions: {
          model: "auto",
          cursorMode: "agent",
          cursorBinaryPath: process.execPath,
        },
        acpArgsForTest: [cursorFixturePath, "echo-session"],
        conversation: workspaceConversation("cursor"),
      }),
    );
    expect(echoed.mcpServers.some((server) => server.name === "stave-local-mcp")).toBe(
      false,
    );
    expect(echoed.prompt).not.toContain("Notes: keep the panel compact");
    expect(echoed.prompt).not.toContain(STAVE_WORKSPACE_INFORMATION_SOURCE_ID);
  });

  test("warns when Worker mode is armed without a Local MCP server", async () => {
    manifestOverride = null;
    const observed: Array<{ type: string; message?: string }> = [];
    await streamCursorWithAcp({
      providerId: "cursor",
      prompt: "Delegate the remaining work",
      cwd: import.meta.dir,
      runtimeOptions: {
        model: "auto",
        cursorMode: "agent",
        cursorBinaryPath: process.execPath,
      },
      staveLocalMcpToolNames: ["stave_run_worker"],
      acpArgsForTest: [cursorFixturePath, "standard"],
      onEvent: (event) => {
        observed.push(event);
      },
    });
    expect(observed).toContainEqual({
      type: "error",
      message:
        "Worker mode is armed, but the Stave Local MCP server is unavailable. Start it in Settings and retry the turn.",
      recoverable: true,
    });
  });
});
