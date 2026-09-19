import { describe, expect, test } from "bun:test";
import { buildCodexThreadStartParams } from "../electron/providers/codex-app-server-params";
import { buildCodexRouteClassificationThreadStartParams } from "../electron/providers/codex-route-classification";

describe("classification thread context", () => {
  test("narrows execution while preserving model and MCP isolation", () => {
    const mcpServers = { example: { enabled: false } };
    const params = buildCodexRouteClassificationThreadStartParams({
      runtimeOptions: { model: "gpt-5.6-luna" },
      cwd: "/tmp/workspace",
      isolated: false,
      ephemeral: false,
      sandbox: "danger-full-access",
      approvalPolicy: "on-request",
      configOverrides: {
        mcp_servers: mcpServers,
        network_access: true,
        web_search: "live",
        "features.shell_tool": true,
        "features.unified_exec": true,
        "features.apps": true,
        "tools.view_image": true,
      },
    });
    expect(params).toMatchObject({
      model: "gpt-5.6-luna",
      cwd: "/tmp/workspace",
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
    });
    expect(params.developerInstructions).toContain("isolated read-only");
    expect(params.baseInstructions).toContain("text classifier");
    expect(params.config).toMatchObject({
      mcp_servers: mcpServers,
      network_access: false,
      web_search: "disabled",
      project_doc_max_bytes: 0,
      "skills.max_context_tokens": 1,
      "features.shell_tool": false,
      "features.unified_exec": false,
      "features.apps": false,
      "tools.view_image": false,
    });
  });

  test("ordinary isolated analyses keep their existing context settings", () => {
    const params = buildCodexThreadStartParams({
      runtimeOptions: { model: "gpt-5.6-luna" },
      cwd: "/tmp/workspace",
      isolated: true,
    });
    expect("baseInstructions" in params).toBe(false);
    for (const key of ["project_doc_max_bytes", "skills.max_context_tokens", "features.shell_tool", "features.unified_exec", "tools.view_image"]) {
      expect(params.config?.[key]).toBeUndefined();
    }
  });
});
