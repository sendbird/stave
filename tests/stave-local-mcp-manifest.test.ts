import { describe, expect, test } from "bun:test";
import {
  toClaudeSdkMcpServerConfig,
  withUnattendedAutomationAuthorization,
} from "../electron/main/stave-local-mcp-manifest";

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
    });
  });
});
