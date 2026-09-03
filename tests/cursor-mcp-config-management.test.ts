import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  __cursorMcpConfigManagementTest,
  applyCursorMcpServerConfigMutation,
  previewCursorMcpServerConfigMutation,
} from "../electron/providers/cursor-mcp-config-management";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Cursor MCP configuration management", () => {
  test("sanitizes literals and exposes only Cursor env references", () => {
    const snapshot = __cursorMcpConfigManagementTest.toCursorSnapshot({
      name: "slack",
      scope: "user",
      revision: "rev-1",
      value: {
        url: "https://mcp.example.test/api?token=private#callback",
        headers: {
          Authorization: "Bearer ${env:SLACK_TOKEN}",
          "X-Team": "${env:SLACK_TEAM}",
          "X-Private": "literal-secret",
        },
        auth: {
          CLIENT_ID: "public-client-id",
          CLIENT_SECRET: "${env:SLACK_MCP_CLIENT_SECRET}",
        },
      },
    });

    expect(snapshot).toMatchObject({
      provider: "cursor",
      transport: "http",
      url: "https://mcp.example.test/api",
      urlRedacted: true,
      bearerTokenEnvVar: "SLACK_TOKEN",
      headerEnvBindings: [{ name: "X-Team", envVar: "SLACK_TEAM" }],
      hiddenValueCount: 3,
    });
    expect(JSON.stringify(snapshot)).not.toContain("private");
    expect(JSON.stringify(snapshot)).not.toContain("public-client-id");
    expect(JSON.stringify(snapshot)).not.toContain("literal-secret");
  });

  test("writes Cursor env syntax and preserves unrelated file content", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "stave-cursor-mcp-"));
    temporaryDirectories.push(cwd);
    const cursorDirectory = path.join(cwd, ".cursor");
    const filePath = path.join(cursorDirectory, "mcp.json");
    await Bun.write(
      filePath,
      JSON.stringify({ version: 1, mcpServers: { existing: { command: "existing" } } }),
    );
    const request = {
      operation: "create" as const,
      cwd,
      draft: {
        provider: "cursor" as const,
        scope: "project" as const,
        name: "slack",
        transport: "http" as const,
        url: "https://mcp.example.test/mcp",
        envVars: [],
        bearerTokenEnvVar: "SLACK_TOKEN",
        headerEnvBindings: [{ name: "X-Team", envVar: "SLACK_TEAM" }],
        enabled: true,
      },
    };

    const preview = await previewCursorMcpServerConfigMutation(request);
    expect(preview.ok).toBe(true);
    const applied = await applyCursorMcpServerConfigMutation({
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
            "X-Team": "${env:SLACK_TEAM}",
            Authorization: "Bearer ${env:SLACK_TOKEN}",
          },
        },
      },
    });

    const stale = await applyCursorMcpServerConfigMutation({
      ...request,
      draft: { ...request.draft, name: "other" },
      expectedRevision: preview.preview!.revision,
    });
    expect(stale.ok).toBe(false);
    expect(stale.detail).toContain("changed after preview");
  });

  test("preserves opaque static OAuth metadata during a same-transport update", () => {
    const updated = __cursorMcpConfigManagementTest.buildCursorServerEntry({
      operation: "update",
      existing: {
        url: "https://old.example.test/mcp",
        auth: {
          CLIENT_ID: "client-id",
          CLIENT_SECRET: "${env:SLACK_MCP_CLIENT_SECRET}",
          scopes: ["channels:read"],
        },
      },
      draft: {
        provider: "cursor",
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
      auth: {
        CLIENT_ID: "client-id",
        CLIENT_SECRET: "${env:SLACK_MCP_CLIENT_SECRET}",
        scopes: ["channels:read"],
      },
    });
  });

  test("persists the native disabled flag", () => {
    const disabled = __cursorMcpConfigManagementTest.buildCursorServerEntry({
      operation: "create",
      draft: {
        provider: "cursor",
        scope: "user",
        name: "docs",
        transport: "stdio",
        command: "docs-server",
        args: [],
        envVars: [],
        headerEnvBindings: [],
        enabled: false,
      },
    });

    expect(disabled).toMatchObject({ disabled: true });
  });

  test("rejects literal project credentials but accepts ${env:NAME}", () => {
    expect(
      __cursorMcpConfigManagementTest.isSecretLikeCursorEntry({
        url: "https://mcp.example.test",
        auth: { CLIENT_SECRET: "literal-secret" },
      }),
    ).toBe(true);
    expect(
      __cursorMcpConfigManagementTest.isSecretLikeCursorEntry({
        url: "https://mcp.example.test",
        auth: { CLIENT_SECRET: "${env:SLACK_MCP_CLIENT_SECRET}" },
      }),
    ).toBe(false);
  });

  test("reads user and project Cursor MCP files", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "stave-cursor-mcp-"));
    temporaryDirectories.push(cwd);
    const userFilePath = path.join(cwd, "user-mcp.json");
    const projectFilePath = path.join(cwd, "project-mcp.json");
    await Bun.write(userFilePath, JSON.stringify({
      mcpServers: { userDocs: { command: "user-docs" } },
    }));
    await Bun.write(projectFilePath, JSON.stringify({
      mcpServers: { projectSlack: { url: "https://mcp.example.test/mcp" } },
    }));

    const result =
      await __cursorMcpConfigManagementTest.listCursorMcpServerConfigsWithContext({
        cwd,
        userFilePath,
        projectFilePath,
      });

    expect(result.errors).toEqual([]);
    expect(result.servers.map(({ name, scope }) => ({ name, scope }))).toEqual([
      { name: "userDocs", scope: "user" },
      { name: "projectSlack", scope: "project" },
    ]);
  });

  test("prepares user and project files independently", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "stave-cursor-mcp-"));
    temporaryDirectories.push(cwd);
    const userFilePath = path.join(cwd, "user", "mcp.json");
    const projectFilePath = path.join(cwd, "project", "mcp.json");
    await writeFile(userFilePath, "{}\n", { encoding: "utf8", flag: "w" }).catch(async () => {
      await Bun.write(userFilePath, "{}\n");
    });
    await Bun.write(projectFilePath, "{ invalid json");
    const prepared = await __cursorMcpConfigManagementTest.prepareCursorMutation(
      {
        operation: "create",
        cwd,
        draft: {
          provider: "cursor",
          scope: "user",
          name: "docs",
          transport: "stdio",
          command: "docs-server",
          args: [],
          envVars: ["DOCS_TOKEN"],
          headerEnvBindings: [],
          enabled: true,
        },
      },
      { cwd, userFilePath, projectFilePath },
    );

    expect(prepared.loaded.filePath).toBe(userFilePath);
    expect(prepared.document).toMatchObject({
      mcpServers: {
        docs: {
          command: "docs-server",
          env: { DOCS_TOKEN: "${env:DOCS_TOKEN}" },
        },
      },
    });
  });
});
