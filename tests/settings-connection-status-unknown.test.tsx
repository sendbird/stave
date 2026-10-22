import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CodexPluginsCard } from "../src/components/layout/settings-dialog-codex-plugins-card";
import { CraneConnectorSettingsSection } from "../src/components/layout/settings-dialog-crane-connector";
import { JiraConnectorSettingsSection } from "../src/components/layout/settings-dialog-jira-connector";
import { MartinSyncSettingsSection } from "../src/components/layout/settings-dialog-martin-sync";
import { getMcpServerListState } from "../src/components/layout/settings-dialog-mcp-section";
import type { McpServerOverview } from "../src/lib/providers/mcp-management";

const originalWindow = globalThis.window;
const never = () => new Promise<never>(() => {});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

/** Status reads that have not answered yet: nothing may read as "off" or "not connected". */
function installPendingStatusReads() {
  (globalThis as { window?: unknown }).window = {
    ...(originalWindow ?? {}),
    api: {
      martinSync: { getStatus: never },
      atelierConnector: { getStatus: never },
      jiraConnector: { getStatus: never },
      craneConnector: { getStatus: never },
    },
  };
}

describe("connection status before its read answers", () => {
  test("Martin sync says it is loading, not Disabled, Not paired or 0 pending", () => {
    installPendingStatusReads();
    const html = renderToStaticMarkup(createElement(MartinSyncSettingsSection));
    expect(html).toContain("Loading…");
    expect(html).not.toContain(">Disabled<");
    expect(html).not.toContain("Not paired");
    expect(html).not.toContain("0 pending");
  });

  test("Jira says it is loading and holds the credential form back", () => {
    installPendingStatusReads();
    const html = renderToStaticMarkup(createElement(JiraConnectorSettingsSection));
    expect(html).toContain("Loading…");
    expect(html).not.toContain("Not connected");
    expect(html).not.toContain("you@example.com");
  });

  test("Crane says it is loading and holds the pairing panel back", () => {
    installPendingStatusReads();
    const html = renderToStaticMarkup(createElement(CraneConnectorSettingsSection));
    expect(html).toContain("Loading…");
    expect(html).not.toContain("Not paired");
  });
});

describe("MCP server list", () => {
  const server = { name: "docs" } as unknown as McpServerOverview;
  const base = { servers: [] as McpServerOverview[], busy: false, errors: [] as string[], kept: false, refreshedAt: 1 };

  test("a failed read with no servers is an error to retry, not an empty list", () => {
    const state = getMcpServerListState({ ...base, errors: ["MCP discovery: spawn ENOENT"] });
    expect(state.status).toBe("error");
  });

  test("the list is empty only when every read answered with no servers", () => {
    expect(getMcpServerListState(base)).toEqual({ status: "ready", data: [] });
    expect(getMcpServerListState({ ...base, refreshedAt: null }).status).toBe("pending");
    expect(getMcpServerListState({ ...base, busy: true, errors: ["earlier failure"] }).status).toBe("pending");
  });

  test("servers kept from an earlier read stay on screen under a refresh error", () => {
    const state = getMcpServerListState({ ...base, servers: [server], errors: ["MCP configuration: timeout"], kept: true });
    expect(state).toMatchObject({ status: "ready", stale: true });
    // A source that reports a problem but answered (a provider not signed in) is not stale.
    expect(getMcpServerListState({ ...base, servers: [server], errors: ["Codex is not signed in"] })).toEqual({ status: "ready", data: [server] });
  });
});

describe("Codex plugins before the App Server answers", () => {
  test("says it is checking, not that no plugins were reported", () => {
    const html = renderToStaticMarkup(createElement(CodexPluginsCard));
    expect(html).toContain("Checking Codex plugins");
    expect(html).not.toContain("No Codex plugins were reported");
  });
});
