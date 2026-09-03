import { describe, expect, test } from "bun:test";
import { __claudeMcpConfigManagementTest } from "../electron/providers/claude-mcp-config-management";
import { toCodexShareDraft } from "../electron/providers/codex-mcp-config-management";
import { __cursorMcpConfigManagementTest } from "../electron/providers/cursor-mcp-config-management";
import { __kiroMcpConfigManagementTest } from "../electron/providers/kiro-mcp-config-management";

describe("MCP share redaction", () => {
  test.each([
    [
      "Claude",
      () =>
        __claudeMcpConfigManagementTest.toClaudeShareDraft({
          name: "remote",
          scope: "user",
          value: { url: "https://mcp.example.test/mcp?token=hidden" },
        }),
    ],
    [
      "Codex",
      () =>
        toCodexShareDraft({
          name: "remote",
          value: { url: "https://mcp.example.test/mcp?token=hidden" },
        }),
    ],
    [
      "Cursor",
      () =>
        __cursorMcpConfigManagementTest.toCursorShareDraft({
          name: "remote",
          scope: "user",
          value: { url: "https://mcp.example.test/mcp?token=hidden" },
        }),
    ],
    [
      "Kiro",
      () =>
        __kiroMcpConfigManagementTest.toKiroShareDraft({
          name: "remote",
          scope: "user",
          value: { url: "https://mcp.example.test/mcp?token=hidden" },
        }),
    ],
  ])("refuses to copy an opaque %s URL", (_provider, share) => {
    expect(share).toThrow("does not copy an opaque URL");
  });

  test("copies a credential-free remote URL", () => {
    expect(
      __kiroMcpConfigManagementTest.toKiroShareDraft({
        name: "remote",
        scope: "user",
        value: { url: "https://mcp.example.test/mcp" },
      }).draft.url,
    ).toBe("https://mcp.example.test/mcp");
  });
});
