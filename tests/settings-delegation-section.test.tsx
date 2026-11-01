import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsDelegationSection } from "@/components/layout/settings-dialog-delegation-section";
import type { StaveLocalMcpStatus } from "@/lib/local-mcp";
import {
  resetLocalMcpStatusCacheForTests,
  seedLocalMcpStatusCacheForTests,
} from "@/lib/local-mcp-readiness";

describe("Settings → Providers → Delegation", () => {
  const html = renderToStaticMarkup(createElement(SettingsDelegationSection));

  test("names the capability that has no arming control, in one sentence", () => {
    // Delegation is the one agent-driven capability with no pill to discover,
    // so the card says what it is and how it is triggered.
    expect(html).toContain("Delegated tasks");
    expect(html).toContain(
      "There is no switch to turn on: ask an agent to delegate, and it hands the work to a new Stave task with its own conversation and permissions.",
    );
  });

  test("keeps the helper limits, folded, and drops the parameter reference", () => {
    const triggerAt = html.indexOf("Helper Agent limits for Agent runs.");
    expect(triggerAt).toBeGreaterThan(-1);
    const trigger = html.slice(html.lastIndexOf("<button", triggerAt), triggerAt);
    expect(trigger).toContain('aria-expanded="false"');
    const regionAt = html.indexOf('role="region"', triggerAt);
    expect(html.slice(html.lastIndexOf("<div", regionAt), regionAt)).toContain('hidden=""');
    for (const field of ["team-limit-concurrentHelpers", "team-limit-totalHelpers"]) {
      expect(html.indexOf(`data-testid="${field}"`)).toBeGreaterThan(regionAt);
    }
    expect(html).not.toContain("stave_delegate_task");
    expect(html).not.toContain("Asking for one");
    expect(html).not.toContain("read-only for second opinions");
  });

  test("reports availability in one line per provider rather than claiming readiness", () => {
    // No `window.api` in this environment, so the status read never resolves —
    // the card must say it is checking instead of asserting either state.
    expect(html).toContain("Checking");
    expect(html).toContain("Claude tasks:");
    expect(html).toContain("Codex tasks:");
    expect(html).toContain('data-delegation-provider="claude-code"');
    // No bordered availability block with its own heading and note.
    expect(html).not.toContain(">Availability<");
    expect(html).not.toContain("Delegation reaches the model");
    // The way to the Local MCP server shows only while it is not running.
    expect(html).not.toContain('data-testid="delegation-open-mcp-settings"');
  });
});

describe("Settings → Providers → Delegation while the Local MCP server is stopped", () => {
  afterEach(() => resetLocalMcpStatusCacheForTests());

  test("each provider says it cannot delegate; the reason and the way to fix it show once", () => {
    seedLocalMcpStatusCacheForTests({
      config: { enabled: true },
      running: false,
      manifest: null,
    } as unknown as StaveLocalMcpStatus);
    const html = renderToStaticMarkup(createElement(SettingsDelegationSection));
    expect(html.split("cannot delegate.").length - 1).toBe(2);
    expect(html.split("enabled but not running").length - 1).toBe(1);
    expect(html).toContain('data-testid="delegation-open-mcp-settings"');
    expect(html).toContain("Open Settings → MCP → Local MCP Server.");
  });
});
