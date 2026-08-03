import { describe, expect, test } from "bun:test";
import { createCodexMcpManagement } from "../electron/providers/codex-mcp-management";

function createManagement(
  handleRequest: (method: string, params: unknown) => unknown,
) {
  return createCodexMcpManagement({
    resolveExecutablePath: () => "/tmp/codex",
    getClient: () => ({
      request: async <T>(method: string, params: unknown) =>
        handleRequest(method, params) as T,
    }),
    formatError: ({ message }) => message,
  });
}

describe("Codex MCP management", () => {
  test("retains a recent error after startup recovers", async () => {
    const management = createManagement((method) => {
      expect(method).toBe("mcpServerStatus/list");
      return {
        data: [
          {
            name: "github",
            transportType: "streamable_http",
            url: "https://mcp.example.test/api?token=private",
            tools: {
              search_code: { name: "search_code" },
            },
          },
        ],
      };
    });

    management.captureNotification("/tmp/codex", {
      method: "mcpServer/startupStatus/updated",
      params: {
        name: "github",
        status: "failed",
        failureReason: "reauthenticationRequired",
        error: { message: "Token expired." },
      },
    });
    management.captureNotification("/tmp/codex", {
      method: "mcpServer/startupStatus/updated",
      params: {
        name: "github",
        status: "ready",
        failureReason: null,
        error: null,
      },
    });

    const result = await management.getRuntimeStatus({});

    expect(result.ok).toBe(true);
    expect(result.servers[0]).toMatchObject({
      name: "github",
      connectionStatus: "connected",
      lastError: "Token expired.",
      url: "https://mcp.example.test/api",
    });
    expect(result.servers[0]?.lastErrorAt).toBeNumber();
    expect(result.servers[0]?.statusUpdatedAt).toBeNumber();
    expect(result.servers[0]?.failureReason).toBeUndefined();
  });

  test("forwards OAuth inputs and accepts a snake-case authorization URL", async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const management = createManagement((method, params) => {
      requests.push({ method, params });
      return { authorization_url: "https://auth.example.test/start" };
    });

    const result = await management.startOauthLogin({
      name: "github",
      scopes: ["repo:read"],
      timeoutSecs: 600,
    });

    expect(result).toEqual({
      ok: true,
      detail: "Started MCP OAuth login for github.",
      authorizationUrl: "https://auth.example.test/start",
    });
    expect(requests).toEqual([
      {
        method: "mcpServer/oauth/login",
        params: {
          name: "github",
          scopes: ["repo:read"],
          timeoutSecs: 600,
        },
      },
    ]);
  });

  test("normalizes MCP resource contents", async () => {
    const management = createManagement(() => ({
      contents: [
        {
          uri: "file:///guide.md",
          mimeType: "text/markdown",
          text: "# Guide",
        },
      ],
    }));

    await expect(
      management.readResource({
        threadId: "thread-1",
        server: "docs",
        uri: "file:///guide.md",
      }),
    ).resolves.toEqual({
      ok: true,
      detail: "Read MCP resource file:///guide.md.",
      contents: [
        {
          uri: "file:///guide.md",
          mimeType: "text/markdown",
          text: "# Guide",
        },
      ],
    });
  });

  test("lists only renderer-safe Codex configuration fields", async () => {
    const management = createManagement((method) => {
      expect(method).toBe("config/read");
      return {
        layers: [
          {
            name: {
              type: "user",
              file: "/tmp/codex-home/config.toml",
              profile: null,
            },
            version: "version-1",
            config: {
              mcp_servers: {
                remote: {
                  url: "https://mcp.example.test/api?token=private",
                  bearer_token_env_var: "MCP_TOKEN",
                  http_headers: { Authorization: "literal-secret" },
                  env_http_headers: { "X-Workspace": "WORKSPACE_ID" },
                },
              },
            },
          },
        ],
      };
    });

    const result = await management.listConfigs({ cwd: "/tmp/workspace" });

    expect(result.errors).toEqual([]);
    expect(result.servers[0]).toMatchObject({
      provider: "codex",
      scope: "user",
      name: "remote",
      revision: "version-1",
      url: "https://mcp.example.test/api",
      urlRedacted: true,
      bearerTokenEnvVar: "MCP_TOKEN",
      headerEnvBindings: [{ name: "X-Workspace", envVar: "WORKSPACE_ID" }],
      hiddenValueCount: 2,
    });
    expect(JSON.stringify(result)).not.toContain("literal-secret");
    expect(JSON.stringify(result)).not.toContain("token=private");
  });

  test("fails safely when App Server omits a readable user layer", async () => {
    const management = createManagement(() => ({
      layers: [
        {
          name: {
            type: "user",
            file: "/tmp/codex-home/config.toml",
          },
          version: "version-1",
          config: null,
        },
      ],
    }));

    const result = await management.listConfigs({ cwd: "/tmp/workspace" });

    expect(result.servers).toEqual([]);
    expect(result.errors[0]).toContain("unreadable user configuration layer");
  });

  test("previews and atomically applies a Codex user configuration edit", async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    let version = "version-1";
    let servers: Record<string, unknown> = {
      existing: { command: "server", args: ["--private"] },
    };
    const management = createManagement((method, params) => {
      requests.push({ method, params });
      if (method === "config/read") {
        return {
          layers: [
            {
              name: {
                type: "user",
                file: "/tmp/codex-home/config.toml",
                profile: null,
              },
              version,
              config: { mcp_servers: servers },
            },
          ],
        };
      }
      if (method === "config/batchWrite") {
        servers = (
          params as {
            edits: Array<{ value: Record<string, unknown> }>;
          }
        ).edits[0]!.value;
        version = "version-2";
        return {};
      }
      if (method === "config/mcpServer/reload") return {};
      throw new Error(`Unexpected request: ${method}`);
    });
    const request = {
      operation: "create" as const,
      cwd: "/tmp/workspace",
      draft: {
        provider: "codex" as const,
        scope: "user" as const,
        name: "remote",
        transport: "http" as const,
        url: "https://mcp.example.test/api",
        envVars: [],
        bearerTokenEnvVar: "MCP_TOKEN",
        headerEnvBindings: [{ name: "X-Workspace", envVar: "WORKSPACE_ID" }],
        enabled: true,
      },
    };

    const preview = await management.previewConfigMutation(request);
    expect(preview).toMatchObject({ ok: true });
    const result = await management.applyConfigMutation({
      ...request,
      expectedRevision: preview.preview!.revision,
    });

    expect(result).toMatchObject({
      ok: true,
      operation: "create",
      server: { name: "remote", revision: "version-2" },
    });
    const write = requests.find(
      (requestEntry) => requestEntry.method === "config/batchWrite",
    );
    expect(write?.params).toEqual({
      edits: [
        {
          keyPath: "mcp_servers",
          value: {
            existing: { command: "server", args: ["--private"] },
            remote: {
              enabled: true,
              url: "https://mcp.example.test/api",
              bearer_token_env_var: "MCP_TOKEN",
              env_http_headers: { "X-Workspace": "WORKSPACE_ID" },
            },
          },
          mergeStrategy: "replace",
        },
      ],
      expectedVersion: "version-1",
      filePath: "/tmp/codex-home/config.toml",
      reloadUserConfig: true,
    });
    expect(
      requests.some(
        (requestEntry) => requestEntry.method === "config/mcpServer/reload",
      ),
    ).toBe(true);
  });

  test("rejects a Codex mutation when the preview revision is stale", async () => {
    let version = "version-1";
    let writeCount = 0;
    const management = createManagement((method) => {
      if (method === "config/read") {
        return {
          layers: [
            {
              name: { type: "user", file: "/tmp/config.toml" },
              version,
              config: { mcp_servers: {} },
            },
          ],
        };
      }
      if (method === "config/batchWrite") writeCount += 1;
      return {};
    });
    const request = {
      operation: "create" as const,
      draft: {
        provider: "codex" as const,
        scope: "user" as const,
        name: "docs",
        transport: "stdio" as const,
        command: "docs-server",
        args: [],
        envVars: [],
        headerEnvBindings: [],
        enabled: true,
      },
    };
    const preview = await management.previewConfigMutation(request);
    version = "version-2";

    const result = await management.applyConfigMutation({
      ...request,
      expectedRevision: preview.preview!.revision,
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("changed after preview");
    expect(writeCount).toBe(0);
  });
});
