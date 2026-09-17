import { describe, expect, test } from "bun:test";
import {
  assertKiroSlackOAuthClientId,
  CURSOR_SLACK_MCP_CLIENT_ID,
  isPublicOAuthClientId,
  isSlackHostedMcpUrl,
} from "@/lib/providers/slack-hosted-mcp";

describe("Slack hosted MCP helpers", () => {
  test("recognizes the Slack hosted MCP origin", () => {
    expect(isSlackHostedMcpUrl("https://mcp.slack.com/mcp")).toBe(true);
    expect(isSlackHostedMcpUrl("https://MCP.SLACK.COM/mcp")).toBe(true);
    expect(isSlackHostedMcpUrl("http://mcp.slack.com/mcp")).toBe(false);
    expect(isSlackHostedMcpUrl("https://mcp.example.test/mcp")).toBe(false);
  });

  test("treats Slack app client ids as public identifiers", () => {
    expect(isPublicOAuthClientId("1234567890.1234567890")).toBe(true);
    expect(isPublicOAuthClientId(CURSOR_SLACK_MCP_CLIENT_ID)).toBe(true);
    expect(isPublicOAuthClientId("${SLACK_CLIENT_ID}")).toBe(false);
  });

  test("rejects Cursor's published Slack client id for Kiro", () => {
    expect(assertKiroSlackOAuthClientId("9988776655.4433221100")).toBe(
      "9988776655.4433221100",
    );
    expect(() =>
      assertKiroSlackOAuthClientId(CURSOR_SLACK_MCP_CLIENT_ID),
    ).toThrow("cannot reuse Cursor's published Slack client ID");
    expect(() => assertKiroSlackOAuthClientId("")).toThrow(
      "requires a Slack app OAuth client ID",
    );
  });
});
