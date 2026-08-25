import { describe, expect, test } from "bun:test";
import {
  STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS,
  toClaudeCodeSettingsMcpServerEntry,
  toClaudeSdkMcpServerConfig,
  withUnattendedAutomationAuthorization,
} from "../electron/main/stave-local-mcp-manifest";
import {
  HOST_SERVICE_ADVISOR_CONSULT_TIMEOUT_MS,
  resolveHostServiceRequestTimeoutMs,
} from "../electron/main/host-service-request-timeouts";
import { resolveAdvisorTimeoutMs } from "../src/lib/providers/advisor";

const manifest = {
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

describe("Stave Local MCP unattended automation authorization", () => {
  test("adds the authorization only to the scoped URL", () => {
    expect(
      withUnattendedAutomationAuthorization({
        url: manifest.url,
        authorizationToken: "authorization-placeholder",
      }),
    ).toBe(
      "http://127.0.0.1:39517/mcp?staveUnattendedAutomation=authorization-placeholder",
    );
    expect(
      withUnattendedAutomationAuthorization({
        url: manifest.url,
      }),
    ).toBe(manifest.url);
  });

  test("keeps the bearer token while scoping Claude's MCP URL", () => {
    expect(
      toClaudeSdkMcpServerConfig(manifest, {
        unattendedAutomationAuthorizationToken: "authorization-placeholder",
      }),
    ).toEqual({
      type: "http",
      url: "http://127.0.0.1:39517/mcp?staveUnattendedAutomation=authorization-placeholder",
      headers: {
        Authorization: "Bearer manifest-token-placeholder",
      },
      timeout: STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS,
    });
  });

  test("always advertises a tool-call deadline to clients", () => {
    // Regression: with no `timeout`, the Claude Agent SDK applies a hard 60s
    // wall clock per tool call. Every Advisor consult slower than a minute
    // finished and billed while the client had already aborted, and the advice
    // was discarded silently.
    const sdkConfig = toClaudeSdkMcpServerConfig(manifest);
    expect(sdkConfig.timeout).toBe(STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS);
    expect(sdkConfig.timeout).toBeGreaterThan(60_000);

    // The settings-file shape stays untouched on purpose: the field is only
    // confirmed for the SDK option, and this entry lives in a file Stave does
    // not own.
    expect(
      toClaudeCodeSettingsMcpServerEntry(manifest).transport,
    ).not.toHaveProperty("timeout");
  });

  test("keeps the timeout ladder ordered innermost-first", () => {
    // Each layer must outlast the one it wraps, so the innermost deadline is
    // the one that reports. Any inversion here means a caller gives up on work
    // that is still legitimately running, which is exactly the bug this
    // ordering was added to prevent.
    const slowestAdvisorCall = Math.max(
      ...(["low", "medium", "high", "xhigh", "max", "ultra"] as const).map(
        (effort) =>
          resolveAdvisorTimeoutMs({
            providerId: "codex",
            model: "gpt-5.6-sol",
            effort,
          }),
      ),
    );
    const backstop = resolveHostServiceRequestTimeoutMs({
      method: "provider.consult-advisor",
    });

    expect(backstop).toBe(HOST_SERVICE_ADVISOR_CONSULT_TIMEOUT_MS);
    expect(slowestAdvisorCall).toBeLessThan(backstop as number);
    expect(backstop as number).toBeLessThan(STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS);
  });
});
