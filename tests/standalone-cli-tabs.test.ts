import { describe, expect, test } from "bun:test";
import type { ProviderReadiness } from "@/lib/providers/provider-readiness-store";
import type { ToolingStatusEntry } from "@/lib/tooling-status";
import {
  buildStandaloneCliTab,
  buildStandaloneCliTabs,
  listInstalledStandaloneCliTabIds,
  resolveStandaloneCliActiveTabId,
  resolveStandaloneCliTabAccountProfileId,
} from "@/lib/terminal/standalone-cli";
import { createDefaultProviderAvailability } from "@/store/app-settings";

function readiness(
  id: "cursor" | "kiro",
  overrides: Partial<ToolingStatusEntry> = {},
  configurationKey = "",
): ProviderReadiness {
  return {
    tool: {
      id,
      label: id,
      state: "ready",
      available: true,
      summary: "",
      detail: "",
      version: "1.0.0",
      executablePath: `/usr/local/bin/${id}`,
      authState: "authenticated",
      authDetail: null,
      ...overrides,
    },
    configurationKey,
    checkedAt: 1,
    generation: 1,
    stale: false,
  };
}

describe("standalone cli active tab identity", () => {
  // The terminal memoizes its active tab on these values. Launching a session
  // pins the account, and if that pin changed any of them the in-flight launch
  // would be cancelled and would close the session it had just created.
  test("pinning the account a launch already resolved changes nothing", () => {
    const beforePin = resolveStandaloneCliTabAccountProfileId({
      tabId: "claude-code",
    });
    const afterPin = resolveStandaloneCliTabAccountProfileId({
      tabId: "claude-code",
      pinnedAccountProfileId: beforePin,
    });

    expect(afterPin).toBe(beforePin);
    expect(
      buildStandaloneCliTab({
        tabId: "claude-code",
        folderPath: "/tmp/notes",
        accountProfileId: afterPin,
      }),
    ).toEqual(
      buildStandaloneCliTab({
        tabId: "claude-code",
        folderPath: "/tmp/notes",
        accountProfileId: beforePin,
      }),
    );
  });

  test("a pinned account outlives the resume id that Restart clears", () => {
    const pinned = "11111111-1111-4111-8111-111111111111";

    expect(
      resolveStandaloneCliTabAccountProfileId({
        tabId: "codex",
        nativeSessionId: "codex-1",
        pinnedAccountProfileId: pinned,
      }),
    ).toBe(pinned);
    expect(
      resolveStandaloneCliTabAccountProfileId({
        tabId: "codex",
        pinnedAccountProfileId: pinned,
      }),
    ).toBe(pinned);
  });

  test("builds the same tab the full tab list carries", () => {
    const tabs = buildStandaloneCliTabs({
      folderPath: "/tmp/notes",
      nativeSessionIdByTab: { codex: "codex-1" },
      accountProfileIdByTab: { "claude-code": "system-default" },
    });

    expect(tabs.find((tab) => tab.id === "codex")).toEqual(
      buildStandaloneCliTab({
        tabId: "codex",
        folderPath: "/tmp/notes",
        nativeSessionId: "codex-1",
        accountProfileId: resolveStandaloneCliTabAccountProfileId({
          tabId: "codex",
          nativeSessionId: "codex-1",
        }),
      }),
    );
  });
});

describe("listInstalledStandaloneCliTabIds", () => {
  test("shows Claude Code and Codex before the first probe, and no optional CLI", () => {
    expect(
      listInstalledStandaloneCliTabIds({
        providerAvailability: createDefaultProviderAvailability(),
        optionalProviders: {},
      }),
    ).toEqual(["claude-code", "codex"]);
  });

  test("hides Claude Code or Codex once the probe reports it missing", () => {
    expect(
      listInstalledStandaloneCliTabIds({
        providerAvailability: { "claude-code": false, codex: true },
        optionalProviders: {},
      }),
    ).toEqual(["codex"]);
  });

  test("shows Cursor and Kiro once their executable resolves, signed in or not", () => {
    expect(
      listInstalledStandaloneCliTabIds({
        providerAvailability: { "claude-code": true, codex: true },
        optionalProviders: {
          cursor: readiness("cursor", {
            state: "warning",
            authState: "unauthenticated",
          }),
          kiro: readiness("kiro"),
        },
      }),
    ).toEqual(["claude-code", "codex", "cursor", "kiro"]);
  });

  test("hides an optional CLI the probe could not find", () => {
    expect(
      listInstalledStandaloneCliTabIds({
        providerAvailability: { "claude-code": true, codex: true },
        optionalProviders: {
          cursor: readiness("cursor", {
            state: "error",
            available: false,
            executablePath: null,
          }),
          kiro: readiness("kiro"),
        },
      }),
    ).toEqual(["claude-code", "codex", "kiro"]);
  });

  test("ignores a probe that ran against a different binary path", () => {
    const optionalProviders = {
      cursor: readiness("cursor", {}, "/opt/old/agent"),
    };

    expect(
      listInstalledStandaloneCliTabIds({
        providerAvailability: { "claude-code": false, codex: false },
        optionalProviders,
        runtimeOptions: { cursorBinaryPath: "/opt/new/agent" },
      }),
    ).toEqual([]);
    expect(
      listInstalledStandaloneCliTabIds({
        providerAvailability: { "claude-code": false, codex: false },
        optionalProviders,
        runtimeOptions: { cursorBinaryPath: " /opt/old/agent " },
      }),
    ).toEqual(["cursor"]);
  });
});

describe("resolveStandaloneCliActiveTabId", () => {
  test("keeps the stored tab while its CLI is installed", () => {
    expect(
      resolveStandaloneCliActiveTabId({
        activeTabId: "codex",
        installedTabIds: ["claude-code", "codex"],
      }),
    ).toBe("codex");
  });

  test("falls back to the first installed CLI instead of booting a missing one", () => {
    expect(
      resolveStandaloneCliActiveTabId({
        activeTabId: "kiro",
        installedTabIds: ["codex", "cursor"],
      }),
    ).toBe("codex");
  });
});
