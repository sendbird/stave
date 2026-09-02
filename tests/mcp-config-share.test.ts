import { describe, expect, test } from "bun:test";
import {
  adaptMcpDraftForProvider,
  composeMcpSharePreview,
  decodeMcpShareRevision,
  encodeMcpShareRevision,
  expectedRevisionForProvider,
  normalizeMcpInstallProviders,
  planMcpSharedInstall,
  summarizeMcpShareResults,
} from "@/lib/providers/mcp-config-share";
import type { McpServerConfigDraft } from "@/lib/providers/mcp-config.types";

const stdioDraft: McpServerConfigDraft = {
  provider: "claude-code",
  scope: "project",
  name: "github",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  envVars: ["GITHUB_TOKEN"],
  headerEnvBindings: [],
  enabled: true,
};

describe("shared MCP install planning", () => {
  test("defaults to the draft provider when no targets are selected", () => {
    expect(normalizeMcpInstallProviders(undefined, "codex")).toEqual(["codex"]);
    expect(normalizeMcpInstallProviders([], "claude-code")).toEqual([
      "claude-code",
    ]);
  });

  test("plans Claude and Codex writes from one draft", () => {
    const plan = planMcpSharedInstall({
      draft: stdioDraft,
      installProviders: ["claude-code", "codex"],
    });

    expect(plan.providers).toEqual(["claude-code", "codex"]);
    expect(plan.drafts[0]).toMatchObject({
      provider: "claude-code",
      scope: "project",
      command: "npx",
    });
    expect(plan.drafts[1]).toMatchObject({
      provider: "codex",
      scope: "user",
      command: "npx",
      envVars: ["GITHUB_TOKEN"],
    });
    expect(plan.warnings.join(" ")).toContain("user-scope copy");
  });

  test("refuses to adapt an SSE server for Codex", () => {
    expect(() =>
      adaptMcpDraftForProvider(
        {
          ...stdioDraft,
          transport: "sse",
          url: "https://mcp.example.test/sse",
        },
        "codex",
      ),
    ).toThrow("SSE");
  });

  test("encodes and decodes a multi-provider revision", () => {
    const revision = encodeMcpShareRevision({
      "claude-code": "claude-rev",
      codex: "codex-rev",
    });

    expect(revision.startsWith("share:v1:")).toBeTrue();
    expect(decodeMcpShareRevision(revision)).toEqual({
      "claude-code": "claude-rev",
      codex: "codex-rev",
    });
    expect(
      expectedRevisionForProvider({
        provider: "codex",
        revision,
      }),
    ).toBe("codex-rev");
    expect(
      expectedRevisionForProvider({
        provider: "claude-code",
        revision: "plain-revision",
      }),
    ).toBe("plain-revision");
  });

  test("composes a two-provider review and reports a partial apply", () => {
    const preview = composeMcpSharePreview({
      operation: "create",
      name: "github",
      previews: [
        {
          provider: "claude-code",
          preview: {
            operation: "create",
            revision: "claude-rev",
            title: "Add github",
            changes: ["Provider: Claude"],
            warnings: [],
          },
        },
        {
          provider: "codex",
          preview: {
            operation: "create",
            revision: "codex-rev",
            title: "Add github",
            changes: ["Provider: Codex"],
            warnings: [],
          },
        },
      ],
    });

    expect(preview.title).toBe("Add github on Claude and Codex");
    expect(preview.changes).toEqual([
      "Claude: Provider: Claude",
      "Codex: Provider: Codex",
    ]);
    expect(decodeMcpShareRevision(preview.revision)).toEqual({
      "claude-code": "claude-rev",
      codex: "codex-rev",
    });

    expect(
      summarizeMcpShareResults({
        operation: "create",
        results: [
          { provider: "claude-code", ok: true, detail: "Added Claude." },
          { provider: "codex", ok: false, detail: "Codex write failed." },
        ],
      }),
    ).toMatchObject({
      ok: false,
      detail: expect.stringContaining("Partial MCP update"),
    });
  });
});
