import { describe, expect, test } from "bun:test";
import {
  applyProviderBrowserConnectionEvents,
  buildProviderBrowserFallbackPrompt,
  createProviderBrowserConnectionTracker,
  isClaudeChromeToolName,
  isCodexBrowserSelectionTool,
  isPlainWebFetchToolName,
  isProviderBrowserAuthWallOutput,
  parseProviderBrowserDomains,
  promptRequestsProviderBrowser,
  promptTargetsProviderBrowserDomain,
  resolveWebFetchToolUrl,
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

describe("provider browser automatic fallback", () => {
  test("normalizes the shapes people paste into the auto-arm host list", () => {
    expect(
      parseProviderBrowserDomains(
        "https://wiki.corp.example/space/x, *.docs.corp.example\nBUILD.corp.example:8443 dup.example, dup.example",
      ),
    ).toEqual([
      "wiki.corp.example",
      "docs.corp.example",
      "build.corp.example",
      "dup.example",
    ]);
    expect(parseProviderBrowserDomains("")).toEqual([]);
    expect(parseProviderBrowserDomains(undefined)).toEqual([]);
  });

  test("drops wildcard entries that would arm every host", () => {
    expect(parseProviderBrowserDomains("*, *.*, a*.example")).toEqual([]);
  });

  test("matches a prompt URL against a host and its subdomains only", () => {
    const domains = ["corp.example"];
    expect(
      promptTargetsProviderBrowserDomain({
        prompt: "Read https://wiki.corp.example/page/12 for me.",
        domains,
      }),
    ).toBe(true);
    expect(
      promptTargetsProviderBrowserDomain({ prompt: "corp.example", domains }),
    ).toBe(false);
    // Suffix matching must be label-aware in both directions.
    expect(
      promptTargetsProviderBrowserDomain({
        prompt: "Read https://notcorp.example/page",
        domains,
      }),
    ).toBe(false);
    expect(
      promptTargetsProviderBrowserDomain({
        prompt: "Read https://corp.example.attacker.test/page",
        domains,
      }),
    ).toBe(false);
  });

  test("ignores trailing sentence punctuation when reading the host", () => {
    expect(
      promptTargetsProviderBrowserDomain({
        prompt: "Check https://wiki.corp.example/a.",
        domains: ["corp.example"],
      }),
    ).toBe(true);
  });

  test("arms a known auth-walled host only when the setting is on", () => {
    const prompt =
      "Summarize https://claude.ai/code/artifact/8b90a8cf-eb29-463d-8a7b-a426cc840941";
    const base = {
      prompt,
      secondaryReadOnly: false,
      unattendedAutomation: false,
      planMode: false,
    };
    expect(shouldActivateProviderBrowser(base)).toBe(false);
    expect(
      shouldActivateProviderBrowser({ ...base, autoFallbackEnabled: true }),
    ).toBe(true);
  });

  test("keeps the three hard blocks above the auto-arm setting", () => {
    const base = {
      prompt: "Summarize https://claude.ai/code/artifact/abc",
      secondaryReadOnly: false,
      unattendedAutomation: false,
      planMode: false,
      autoFallbackEnabled: true,
      autoFallbackDomains: ["corp.example"],
    };
    for (const blocked of [
      { secondaryReadOnly: true },
      { unattendedAutomation: true },
      { planMode: true },
    ]) {
      expect(shouldActivateProviderBrowser({ ...base, ...blocked })).toBe(false);
    }
  });

  test("arms user-listed hosts alongside the built-in ones", () => {
    expect(
      shouldActivateProviderBrowser({
        prompt: "Read https://wiki.corp.example/x",
        secondaryReadOnly: false,
        unattendedAutomation: false,
        planMode: false,
        autoFallbackEnabled: true,
        autoFallbackDomains: ["corp.example"],
      }),
    ).toBe(true);
    expect(
      shouldActivateProviderBrowser({
        prompt: "Read https://unrelated.example/x",
        secondaryReadOnly: false,
        unattendedAutomation: false,
        planMode: false,
        autoFallbackEnabled: true,
        autoFallbackDomains: ["corp.example"],
      }),
    ).toBe(false);
  });

  test("recognizes the plain fetch tools and nothing else", () => {
    expect(isPlainWebFetchToolName("WebFetch")).toBe(true);
    expect(isPlainWebFetchToolName("web_fetch")).toBe(true);
    expect(isPlainWebFetchToolName("WebSearch")).toBe(false);
    expect(isPlainWebFetchToolName("mcp__claude-in-chrome__navigate")).toBe(
      false,
    );
  });

  test("detects auth walls without firing on ordinary failures", () => {
    for (const blocked of [
      "Request failed with status code 403",
      "HTTP 401 Unauthorized",
      "<title>Just a moment...</title><script>Enable JavaScript and cookies to continue",
      "Attention Required! | Cloudflare",
      "Please sign in to continue reading",
      "Authentication required",
    ]) {
      expect(isProviderBrowserAuthWallOutput(blocked)).toBe(true);
    }
    for (const allowed of [
      "",
      "   ",
      "404 Not Found",
      "The page explains how to sign in to the dashboard from the settings menu.",
      // Long prose about authentication is documentation, not a wall.
      `Chapter 3. Authentication is required for every endpoint. ${"x".repeat(2100)}`,
      "Timed out after 30000ms",
    ]) {
      expect(isProviderBrowserAuthWallOutput(allowed)).toBe(false);
    }
  });

  test("reads the fetched URL from either input shape", () => {
    expect(
      resolveWebFetchToolUrl('{"url":"https://claude.ai/x","prompt":"read"}'),
    ).toBe("https://claude.ai/x");
    expect(resolveWebFetchToolUrl("fetch https://claude.ai/y now")).toBe(
      "https://claude.ai/y",
    );
    expect(resolveWebFetchToolUrl("   ")).toBe(null);
    expect(resolveWebFetchToolUrl('{"prompt":"read"}')).toBe(null);
  });

  test("builds a retry prompt that re-arms the browser and cannot loop", () => {
    const prompt = buildProviderBrowserFallbackPrompt({
      urls: ["https://claude.ai/x", "https://claude.ai/x", " "],
    });
    // The @web token is both the activation trigger and the loop breaker.
    expect(promptRequestsProviderBrowser(prompt)).toBe(true);
    expect(prompt).toContain("- https://claude.ai/x");
    expect(prompt.match(/https:\/\/claude\.ai\/x/g)).toHaveLength(1);
    expect(
      promptRequestsProviderBrowser(
        buildProviderBrowserFallbackPrompt({ urls: [] }),
      ),
    ).toBe(true);
  });
});
