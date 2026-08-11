import { describe, expect, test } from "bun:test";
import {
  applyProviderBrowserConnectionEvents,
  createProviderBrowserConnectionTracker,
  isClaudeChromeToolName,
  isCodexBrowserSelectionTool,
  promptRequestsProviderBrowser,
  shouldActivateProviderBrowser,
} from "@/lib/provider-browser";

describe("provider browser activation", () => {
  test("matches only a standalone @web reference", () => {
    expect(promptRequestsProviderBrowser("Inspect @web")).toBe(true);
    expect(promptRequestsProviderBrowser("Inspect (@WEB), please")).toBe(true);
    expect(promptRequestsProviderBrowser("Inspect @website")).toBe(false);
    expect(promptRequestsProviderBrowser("mail@web.example")).toBe(false);
  });

  test("activates only for interactive non-plan primary turns", () => {
    expect(
      shouldActivateProviderBrowser({
        prompt: "Inspect @web",
        secondaryReadOnly: false,
        unattendedAutomation: false,
        planMode: false,
      }),
    ).toBe(true);
    for (const blocked of [
      { secondaryReadOnly: true, unattendedAutomation: false, planMode: false },
      { secondaryReadOnly: false, unattendedAutomation: true, planMode: false },
      { secondaryReadOnly: false, unattendedAutomation: false, planMode: true },
    ]) {
      expect(
        shouldActivateProviderBrowser({ prompt: "Inspect @web", ...blocked }),
      ).toBe(false);
    }
  });

  test("recognizes only Claude's native Chrome MCP namespace", () => {
    expect(isClaudeChromeToolName("mcp__claude-in-chrome__read_page")).toBe(
      true,
    );
    expect(isClaudeChromeToolName("mcp__stave-local-mcp__stave_lens_snapshot"))
      .toBe(false);
  });

  test("recognizes Codex native browser selection without matching arbitrary JavaScript", () => {
    expect(
      isCodexBrowserSelectionTool({
        server: "node_repl",
        tool: "js",
        input: "const browser = await agent.browsers.getDefault();",
      }),
    ).toBe(true);
    expect(
      isCodexBrowserSelectionTool({
        server: "node-repl",
        tool: "js",
        input: "await globalThis.agent.browsers.getForUrl('https://example.test')",
      }),
    ).toBe(true);
    expect(
      isCodexBrowserSelectionTool({
        server: "node_repl",
        tool: "js",
        input: "document.title",
      }),
    ).toBe(false);
    expect(
      isCodexBrowserSelectionTool({
        server: "other",
        tool: "js",
        input: "await agent.browsers.getDefault()",
      }),
    ).toBe(false);
  });

  test("tracks Codex connection lifecycle and fails closed when no browser is selected", () => {
    const events: Array<{ status: string }> = [];
    const tracker = createProviderBrowserConnectionTracker({
      providerId: "codex",
      requested: true,
      available: true,
    });
    tracker.emitInitial((event) => events.push(event));
    tracker.settle((event) => events.push(event));
    tracker.settle((event) => events.push(event));

    expect(events.map((event) => event.status)).toEqual([
      "connecting",
      "failed",
    ]);
  });

  test("marks a successful Codex browser selection as connected", () => {
    const events: Array<{ status: string }> = [];
    const tracker = createProviderBrowserConnectionTracker({
      providerId: "codex",
      requested: true,
      available: true,
    });
    const event = tracker.observeCodexMcpCall({
      server: "node_repl",
      tool: "js",
      input: "await agent.browsers.getDefault()",
      failed: false,
    });
    if (event) {
      events.push(event);
    }
    tracker.settle((settled) => events.push(settled));

    expect(events.map((entry) => entry.status)).toEqual(["connected"]);
  });
});

describe("provider browser workspace metadata", () => {
  test("folds connection events without retaining page data", () => {
    const state = applyProviderBrowserConnectionEvents({
      events: [
        {
          type: "browser_connection",
          providerId: "codex",
          status: "connecting",
          at: Date.parse("2026-08-11T05:00:00.000Z"),
        },
        {
          type: "browser_connection",
          providerId: "codex",
          status: "connected",
          at: Date.parse("2026-08-11T05:00:01.000Z"),
        },
      ],
    });

    expect(state).toEqual({
      providerId: "codex",
      status: "connected",
      requestedAt: "2026-08-11T05:00:00.000Z",
      lastUpdatedAt: "2026-08-11T05:00:01.000Z",
    });
    expect(state).not.toHaveProperty("url");
  });

  test("preserves the request time across status updates", () => {
    expect(
      applyProviderBrowserConnectionEvents({
        current: {
          providerId: "claude-code",
          status: "connecting",
          requestedAt: "2026-08-11T05:00:00.000Z",
          lastUpdatedAt: "2026-08-11T05:00:00.000Z",
        },
        events: [
          {
            type: "browser_connection",
            providerId: "claude-code",
            status: "connected",
            at: Date.parse("2026-08-11T05:00:02.000Z"),
          },
        ],
      }),
    ).toMatchObject({
      requestedAt: "2026-08-11T05:00:00.000Z",
      lastUpdatedAt: "2026-08-11T05:00:02.000Z",
    });
  });
});
