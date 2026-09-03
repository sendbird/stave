import { createCursorMcpOauthLogin } from "../electron/providers/cursor-mcp-oauth";

describe("Cursor MCP OAuth login", () => {
  test("runs the configured Cursor executable with exact MCP login arguments", async () => {
    const calls: unknown[] = [];
    const startLogin = createCursorMcpOauthLogin({
      resolveExecutable: () => "/tmp/cursor-agent",
      run: async (args) => {
        calls.push(args);
        return {
          status: 0,
          signal: null,
          error: "",
          stdout: "authorization completed with token=private",
          stderr: "",
          text: "authorization completed with token=private",
          timedOut: false,
        };
      },
    });

    const result = await startLogin({
      name: "slack",
      cwd: "/tmp/workspace",
      timeoutSecs: 30,
      runtimeOptions: { cursorBinaryPath: "/configured/agent" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      executablePath: "/tmp/cursor-agent",
      commandArgs: ["mcp", "login", "slack"],
      cwd: "/tmp/workspace",
      timeoutMs: 30_000,
      maxBytes: 32 * 1024,
    });
    expect(result).toEqual({
      ok: true,
      detail:
        "Cursor authenticated the slack MCP server. New Cursor/Grok tasks will load it from Cursor's native configuration.",
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });

  test("redacts secrets from failed command output", async () => {
    const startLogin = createCursorMcpOauthLogin({
      resolveExecutable: () => "/tmp/cursor-agent",
      run: async () => ({
        status: 1,
        signal: null,
        error: "",
        stdout: "",
        stderr:
          "Request https://user:password@example.test/oauth?token=private failed; client_secret=hidden",
        text: "",
        timedOut: false,
      }),
    });

    const result = await startLogin({ name: "slack" });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("[redacted]");
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("hidden");
  });

  test("reports a missing Cursor Agent without spawning", async () => {
    let ran = false;
    const startLogin = createCursorMcpOauthLogin({
      resolveExecutable: () => "",
      run: async () => {
        ran = true;
        throw new Error("unexpected");
      },
    });

    const result = await startLogin({ name: "slack" });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("Cursor Agent was not found");
    expect(ran).toBe(false);
  });
});
