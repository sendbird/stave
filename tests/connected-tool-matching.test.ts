import { describe, expect, test } from "bun:test";
import {
  matchesConnectedTool,
  pickConnectedToolServer,
} from "@/lib/providers/connected-tool-status";
import { buildConnectedToolOverviews } from "@/lib/providers/mcp-management";
import type { McpServerOverview } from "@/lib/providers/mcp-management";

function buildOverview(args: {
  name: string;
  claudeState?: McpServerOverview["claude"]["state"];
  codexState?: McpServerOverview["codex"]["state"];
}): McpServerOverview {
  return {
    name: args.name,
    sources: [],
    transport: "unknown",
    claude: {
      provider: "claude-code",
      configured: true,
      state: args.claudeState ?? "not-configured",
      label: "",
      canAuthenticate: false,
    },
    codex: {
      provider: "codex",
      configured: true,
      state: args.codexState ?? "not-configured",
      label: "",
      canAuthenticate: false,
    },
  };
}

describe("matchesConnectedTool", () => {
  test("recognises the names connectors actually ship under", () => {
    // Exact-id matching reported every one of these as unsupported.
    expect(
      matchesConnectedTool({ toolId: "figma", serverName: "claude_ai_Figma" }),
    ).toBe(true);
    expect(
      matchesConnectedTool({ toolId: "slack", serverName: "claude_ai_Slack" }),
    ).toBe(true);
    expect(
      matchesConnectedTool({
        toolId: "slack",
        serverName: "slack@openai-curated",
      }),
    ).toBe(true);
    expect(
      matchesConnectedTool({
        toolId: "atlassian",
        serverName: "atlassian-rovo@openai-curated",
      }),
    ).toBe(true);
    expect(
      matchesConnectedTool({
        toolId: "figma",
        serverName: "figma-dev-mode-mcp-server",
      }),
    ).toBe(true);
    expect(
      matchesConnectedTool({ toolId: "atlassian", serverName: "mcp-atlassian" }),
    ).toBe(true);
    expect(
      matchesConnectedTool({ toolId: "github", serverName: "claude_ai_Github" }),
    ).toBe(true);
  });

  test("keeps connectors distinct from one another", () => {
    expect(
      matchesConnectedTool({ toolId: "figma", serverName: "claude_ai_Slack" }),
    ).toBe(false);
    expect(
      matchesConnectedTool({ toolId: "slack", serverName: "stave-local-mcp" }),
    ).toBe(false);
    expect(matchesConnectedTool({ toolId: "github", serverName: "  " })).toBe(
      false,
    );
  });
});

describe("pickConnectedToolServer", () => {
  test("prefers the usable instance when a connector is configured twice", () => {
    const servers = [
      { name: "figma", status: "failed" },
      { name: "claude_ai_Figma", status: "connected" },
    ];
    const rank = (server: { status: string }) =>
      server.status === "connected" ? 0 : 1;

    expect(
      pickConnectedToolServer({ toolId: "figma", servers, rank })?.name,
    ).toBe("claude_ai_Figma");
  });

  test("returns undefined when nothing matches", () => {
    expect(
      pickConnectedToolServer({
        toolId: "figma",
        servers: [{ name: "stave-local-mcp" }],
        rank: () => 0,
      }),
    ).toBeUndefined();
  });
});

describe("buildConnectedToolOverviews", () => {
  test("rolls per-server status up to the connector level", () => {
    const overviews = buildConnectedToolOverviews({
      servers: [
        buildOverview({ name: "claude_ai_Figma", claudeState: "connected" }),
        buildOverview({ name: "claude_ai_Slack", claudeState: "starting" }),
        buildOverview({
          name: "atlassian-rovo@openai-curated",
          codexState: "needs-auth",
        }),
      ],
    });
    const byId = new Map(overviews.map((tool) => [tool.id, tool]));

    expect(byId.get("figma")?.state).toBe("connected");
    expect(byId.get("slack")?.state).toBe("starting");
    expect(byId.get("atlassian")?.state).toBe("needs-auth");
    // No server provides it, so the capability is genuinely absent.
    expect(byId.get("github")?.state).toBe("not-configured");
  });

  test("a connector counts as up when either provider has it up", () => {
    const [figma] = buildConnectedToolOverviews({
      servers: [
        buildOverview({
          name: "figma",
          claudeState: "failed",
          codexState: "connected",
        }),
      ],
    }).filter((tool) => tool.id === "figma");

    expect(figma?.state).toBe("connected");
    expect(figma?.serverNames).toEqual(["figma"]);
  });

  test("the best instance decides the connector state", () => {
    const [slack] = buildConnectedToolOverviews({
      servers: [
        buildOverview({ name: "slack-legacy", claudeState: "failed" }),
        buildOverview({ name: "claude_ai_Slack", claudeState: "connected" }),
      ],
    }).filter((tool) => tool.id === "slack");

    expect(slack?.state).toBe("connected");
    expect(slack?.serverNames).toEqual(["claude_ai_Slack", "slack-legacy"]);
  });
});
