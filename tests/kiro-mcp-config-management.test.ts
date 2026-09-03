import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  __kiroMcpConfigManagementTest,
  applyKiroMcpServerConfigMutation,
  previewKiroMcpServerConfigMutation,
} from "../electron/providers/kiro-mcp-config-management";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Kiro MCP configuration management", () => {
  test("sanitizes literals and exposes only Kiro env references", () => {
    const snapshot = __kiroMcpConfigManagementTest.toKiroSnapshot({
      name: "slack",
      scope: "user",
      revision: "rev-1",
      value: {
        url: "https://mcp.example.test/api?token=private#callback",
        headers: {
          Authorization: "Bearer ${SLACK_TOKEN}",
          "X-Team": "${SLACK_TEAM}",
          "X-Private": "literal-secret",
        },
        oauth: { clientSecret: "oauth-secret" },
        oauthScopes: ["channels:read"],
      },
    });

    expect(snapshot).toMatchObject({
      provider: "kiro",
      transport: "http",
      url: "https://mcp.example.test/api",
      urlRedacted: true,
      bearerTokenEnvVar: "SLACK_TOKEN",
      headerEnvBindings: [{ name: "X-Team", envVar: "SLACK_TEAM" }],
      hiddenValueCount: 4,
    });
    expect(JSON.stringify(snapshot)).not.toContain("private");
    expect(JSON.stringify(snapshot)).not.toContain("oauth-secret");
  });

  test("writes Kiro env syntax and preserves unrelated file content", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "stave-kiro-mcp-"));
    temporaryDirectories.push(cwd);
    const filePath = path.join(cwd, ".kiro", "settings", "mcp.json");
    await mkdir(path.dirname(filePath), { recursive: true });
    await Bun.write(
      filePath,
      JSON.stringify({
        version: 1,
        mcpServers: { existing: { command: "existing" } },
      }),
    );
    const request = {
      operation: "create" as const,
      cwd,
      draft: {
        provider: "kiro" as const,
        scope: "project" as const,
        name: "slack",
        transport: "http" as const,
        url: "https://mcp.example.test/mcp",
        envVars: [],
        bearerTokenEnvVar: "SLACK_TOKEN",
        headerEnvBindings: [{ name: "X-Team", envVar: "SLACK_TEAM" }],
        enabled: false,
      },
    };

    const preview = await previewKiroMcpServerConfigMutation(request);
    expect(preview.ok).toBe(true);
    const applied = await applyKiroMcpServerConfigMutation({
      ...request,
      expectedRevision: preview.preview!.revision,
    });

    expect(applied.ok).toBe(true);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({
      version: 1,
      mcpServers: {
        existing: { command: "existing" },
        slack: {
          url: "https://mcp.example.test/mcp",
          headers: {
            "X-Team": "${SLACK_TEAM}",
            Authorization: "Bearer ${SLACK_TOKEN}",
          },
          disabled: true,
        },
      },
    });
  });

  test("preserves provider OAuth metadata for same-transport edits", () => {
    const updated = __kiroMcpConfigManagementTest.buildKiroServerEntry({
      operation: "update",
      existing: {
        url: "https://old.example.test/mcp",
        oauth: { clientId: "public-client", clientSecret: "hidden" },
        oauthScopes: ["channels:read"],
        disabled: true,
      },
      draft: {
        provider: "kiro",
        scope: "user",
        name: "slack",
        transport: "http",
        url: "https://new.example.test/mcp",
        envVars: [],
        headerEnvBindings: [],
        enabled: true,
      },
    });

    expect(updated).toEqual({
      url: "https://new.example.test/mcp",
      oauth: { clientId: "public-client", clientSecret: "hidden" },
      oauthScopes: ["channels:read"],
    });
  });

  test("rejects literal project credentials but accepts ${NAME}", () => {
    expect(
      __kiroMcpConfigManagementTest.isSecretLikeKiroEntry({
        url: "https://mcp.example.test",
        oauth: { clientSecret: "literal-secret" },
      }),
    ).toBe(true);
    expect(
      __kiroMcpConfigManagementTest.isSecretLikeKiroEntry({
        url: "https://mcp.example.test",
        oauth: { clientSecret: "${SLACK_MCP_CLIENT_SECRET}" },
      }),
    ).toBe(false);
  });

  test("does not overwrite a malformed native server map", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "stave-kiro-mcp-"));
    temporaryDirectories.push(cwd);
    const userFilePath = path.join(cwd, "user", "mcp.json");
    const projectFilePath = path.join(cwd, "project", "mcp.json");
    await mkdir(path.dirname(userFilePath), { recursive: true });
    await Bun.write(userFilePath, JSON.stringify({ mcpServers: [] }));

    const result =
      await __kiroMcpConfigManagementTest.listKiroMcpServerConfigsWithContext({
        cwd,
        userFilePath,
        projectFilePath,
      });

    expect(result.servers).toEqual([]);
    expect(result.errors.join(" ")).toContain("must be a JSON object");
  });
});
