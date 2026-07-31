import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  __claudeMcpConfigManagementTest,
  applyClaudeMcpServerConfigMutation,
  previewClaudeMcpServerConfigMutation,
} from "../electron/providers/claude-mcp-config-management";
import { sanitizeMcpDiagnosticText } from "../electron/providers/mcp-config-management-shared";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Claude MCP configuration management", () => {
  test("redacts credential-like values from renderer-facing diagnostics", () => {
    const sanitized = sanitizeMcpDiagnosticText(
      'Request https://alice:password@mcp.example.test/api?token=private failed. Authorization: Bearer abc123. "client_secret":"hidden"',
    );

    expect(sanitized).toContain("https://mcp.example.test/api");
    expect(sanitized).toContain("[redacted]");
    expect(sanitized).not.toContain("alice");
    expect(sanitized).not.toContain("password");
    expect(sanitized).not.toContain("private");
    expect(sanitized).not.toContain("abc123");
    expect(sanitized).not.toContain("hidden");
  });

  test("sanitizes literal values while exposing environment references", () => {
    const snapshot = __claudeMcpConfigManagementTest.toClaudeSnapshot({
      name: "remote",
      scope: "user",
      revision: "rev-1",
      value: {
        type: "http",
        url: "https://mcp.example.test/api?token=private#callback",
        headers: {
          Authorization: "Bearer ${MCP_TOKEN}",
          "X-Workspace": "${WORKSPACE_ID}",
          "X-Private": "literal-value",
        },
      },
    });

    expect(snapshot).toMatchObject({
      url: "https://mcp.example.test/api",
      urlRedacted: true,
      bearerTokenEnvVar: "MCP_TOKEN",
      headerEnvBindings: [{ name: "X-Workspace", envVar: "WORKSPACE_ID" }],
      hiddenValueCount: 2,
    });
    expect(JSON.stringify(snapshot)).not.toContain("private");
    expect(JSON.stringify(snapshot)).not.toContain("literal-value");
  });

  test("preserves opaque values and replaces renderer-safe bindings", () => {
    const updated = __claudeMcpConfigManagementTest.buildClaudeServerEntry({
      operation: "update",
      existing: {
        type: "stdio",
        command: "old-command",
        args: ["--token", "literal-secret"],
        env: {
          SAFE_ENV: "${SAFE_ENV}",
          PRIVATE_TOKEN: "literal-secret",
        },
      },
      draft: {
        provider: "claude-code",
        scope: "user",
        name: "server",
        transport: "stdio",
        command: "new-command",
        envVars: ["NEW_ENV"],
        headerEnvBindings: [],
        enabled: true,
      },
    });

    expect(updated).toEqual({
      type: "stdio",
      command: "new-command",
      args: ["--token", "literal-secret"],
      env: {
        PRIVATE_TOKEN: "literal-secret",
        NEW_ENV: "${NEW_ENV}",
      },
    });
  });

  test("creates a project server after preview and rejects a stale revision", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "stave-claude-mcp-"));
    temporaryDirectories.push(cwd);
    const request = {
      operation: "create" as const,
      cwd,
      draft: {
        provider: "claude-code" as const,
        scope: "project" as const,
        name: "docs",
        transport: "stdio" as const,
        command: "bunx",
        args: ["docs-mcp"],
        envVars: ["DOCS_TOKEN"],
        headerEnvBindings: [],
        enabled: true,
      },
    };

    const preview = await previewClaudeMcpServerConfigMutation(request);
    expect(preview.ok).toBe(true);
    const result = await applyClaudeMcpServerConfigMutation({
      ...request,
      expectedRevision: preview.preview!.revision,
    });

    expect(result.ok).toBe(true);
    expect(
      JSON.parse(await readFile(path.join(cwd, ".mcp.json"), "utf8")),
    ).toEqual({
      mcpServers: {
        docs: {
          type: "stdio",
          command: "bunx",
          args: ["docs-mcp"],
          env: { DOCS_TOKEN: "${DOCS_TOKEN}" },
        },
      },
    });

    const stale = await applyClaudeMcpServerConfigMutation({
      ...request,
      draft: { ...request.draft, name: "other" },
      expectedRevision: preview.preview!.revision,
    });
    expect(stale).toMatchObject({
      ok: false,
      operation: "create",
    });
    expect(stale.detail).toContain("changed after preview");
  });

  test("blocks rewriting a project file with literal credential-like values", () => {
    expect(
      __claudeMcpConfigManagementTest.isSecretLikeProjectEntry({
        type: "stdio",
        command: "server",
        env: { API_TOKEN: "literal-secret" },
      }),
    ).toBe(true);
    expect(
      __claudeMcpConfigManagementTest.isSecretLikeProjectEntry({
        type: "stdio",
        command: "server",
        env: { API_TOKEN: "${API_TOKEN}" },
      }),
    ).toBe(false);
    expect(
      __claudeMcpConfigManagementTest.isSecretLikeProjectEntry({
        type: "stdio",
        command: "server",
        args: ["--api-key", "literal-secret"],
      }),
    ).toBe(true);
    expect(
      __claudeMcpConfigManagementTest.isSecretLikeProjectEntry({
        type: "stdio",
        command: "server",
        args: ["--api-key=${API_TOKEN}"],
      }),
    ).toBe(false);
  });

  test("prepares user scope without reading an invalid project config", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "stave-claude-mcp-"));
    temporaryDirectories.push(cwd);
    const stateFilePath = path.join(cwd, "claude-state.json");
    const projectFilePath = path.join(cwd, ".mcp.json");
    await writeFile(stateFilePath, "{}\n", "utf8");
    await writeFile(projectFilePath, "{ invalid json", "utf8");
    const request = {
      operation: "create" as const,
      cwd,
      draft: {
        provider: "claude-code" as const,
        scope: "user" as const,
        name: "user-docs",
        transport: "stdio" as const,
        command: "docs-server",
        args: [],
        envVars: [],
        headerEnvBindings: [],
        enabled: true,
      },
    };

    const prepared =
      await __claudeMcpConfigManagementTest.prepareClaudeMutation(request, {
        cwd,
        stateFilePath,
        projectFilePath,
      });

    expect(prepared.loaded.filePath).toBe(stateFilePath);
    expect(prepared.document).toMatchObject({
      mcpServers: {
        "user-docs": {
          type: "stdio",
          command: "docs-server",
        },
      },
    });
  });
});
