import { describe, expect, test } from "bun:test";
import {
  buildMcpConfigDraft,
  createInitialMcpConfigForm,
  parseMcpHeaderBindings,
  resolveMcpInstallProviders,
  validateMcpConfigForm,
} from "@/lib/providers/mcp-config-form";
import type { McpServerConfigSnapshot } from "@/lib/providers/mcp-config.types";

const hiddenSnapshot: McpServerConfigSnapshot = {
  id: "claude-code:user:remote",
  provider: "claude-code",
  scope: "user",
  name: "remote",
  revision: "revision-1",
  transport: "http",
  url: "https://mcp.example.test/api",
  urlRedacted: true,
  envVars: [],
  bearerTokenEnvVar: "MCP_TOKEN",
  headerEnvBindings: [],
  enabled: true,
  argumentCount: 0,
  hiddenValueCount: 1,
  sourceLabel: "Claude user",
  canEdit: true,
  canDelete: true,
};

describe("MCP configuration editor", () => {
  test("preserves a redacted URL unless the user chooses replacement", () => {
    const form = createInitialMcpConfigForm(hiddenSnapshot);
    const draft = buildMcpConfigDraft({ form, editing: true });

    expect(form.replaceUrl).toBe(false);
    expect(draft.url).toBeUndefined();
    expect(JSON.stringify(draft)).not.toContain("mcp.example.test");
  });

  test("parses header bindings as environment-variable references", () => {
    expect(
      parseMcpHeaderBindings("X-Workspace=WORKSPACE_ID\nX-Tenant=TENANT_ID"),
    ).toEqual([
      { name: "X-Workspace", envVar: "WORKSPACE_ID" },
      { name: "X-Tenant", envVar: "TENANT_ID" },
    ]);
    expect(() =>
      parseMcpHeaderBindings("Authorization=literal bearer token"),
    ).toThrow("Header-Name=ENV_VAR");
  });

  test("defaults a new server to all four native providers", () => {
    const form = createInitialMcpConfigForm();
    expect(resolveMcpInstallProviders(form)).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "kiro",
    ]);
    expect(() =>
      validateMcpConfigForm({
        form: {
          ...form,
          name: "github",
          command: "npx",
          installProviders: [],
        },
        editing: false,
      }),
    ).toThrow("at least one provider");
  });

  test("rejects a non-variable bearer token entry", () => {
    const form = {
      ...createInitialMcpConfigForm(),
      transport: "http" as const,
      name: "remote",
      url: "https://mcp.example.test/api",
      bearerTokenEnvVar: "literal token",
    };

    expect(() =>
      validateMcpConfigForm({
        form,
        editing: false,
        workspaceCwd: "/tmp/workspace",
      }),
    ).toThrow("invalid name");
  });
});
