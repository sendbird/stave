import { describe, expect, test } from "bun:test";
import type { ToolingStatusEntry } from "@/lib/tooling-status";
import type { ProviderId } from "@/lib/providers/provider.types";
import type {
  ProviderReadiness,
  ProviderReadinessMap,
} from "@/lib/providers/provider-readiness-store";
import {
  keepSavedProviderVisible,
  listSettingsVisibleProviderIds,
  optionalProviderSetup,
} from "@/components/layout/settings-provider-visibility";

function tool(patch: Partial<ToolingStatusEntry> = {}): ToolingStatusEntry {
  return {
    id: "cursor",
    label: "Cursor",
    state: "ready",
    available: true,
    authState: "authenticated",
    authDetail: null,
    summary: "",
    detail: "",
    version: "1.0.0",
    executablePath: "/tmp/provider-cli",
    ...patch,
  };
}

/** A probe result for the CLI at `path` (blank: automatic discovery). */
function entry(patch: Partial<ToolingStatusEntry> = {}, path = ""): ProviderReadiness {
  return {
    tool: tool(patch),
    configurationKey: path,
    checkedAt: 1,
    generation: 1,
    stale: false,
  };
}

const NOTHING_AVAILABLE: Record<ProviderId, boolean> = {
  "claude-code": false,
  codex: false,
  cursor: false,
  kiro: false,
  opencode: false,
};
const ALL_AVAILABLE: Record<ProviderId, boolean> = {
  "claude-code": true,
  codex: true,
  cursor: true,
  kiro: true,
  opencode: true,
};

describe("listSettingsVisibleProviderIds", () => {
  test("Claude Code and Codex always show, even before any check or when unavailable", () => {
    expect(
      listSettingsVisibleProviderIds({ availability: NOTHING_AVAILABLE, readiness: {} }),
    ).toEqual(["claude-code", "codex"]);
  });

  test("an optional provider with no answer yet, or reported unavailable, stays hidden", () => {
    const readiness: ProviderReadinessMap = {
      cursor: entry({ id: "cursor" }),
      kiro: entry({ id: "kiro" }),
      opencode: entry({ id: "opencode", authState: "not-required" }),
    };
    expect(
      listSettingsVisibleProviderIds({ availability: ALL_AVAILABLE, readiness: {} }),
    ).toEqual(["claude-code", "codex"]);
    expect(
      listSettingsVisibleProviderIds({ availability: NOTHING_AVAILABLE, readiness }),
    ).toEqual(["claude-code", "codex"]);
  });

  test("a CLI that is not installed hides its provider", () => {
    const readiness: ProviderReadinessMap = {
      cursor: entry({ id: "cursor", state: "warning", available: false, authState: "unknown" }),
    };
    expect(
      listSettingsVisibleProviderIds({ availability: ALL_AVAILABLE, readiness }),
    ).not.toContain("cursor");
  });

  test("an installed CLI that is not signed in, or whose sign-in is unknown, stays hidden", () => {
    for (const authState of ["unauthenticated", "unknown"] as const) {
      const readiness: ProviderReadinessMap = {
        kiro: entry({ id: "kiro", state: "warning", authState }),
      };
      expect(
        listSettingsVisibleProviderIds({ availability: ALL_AVAILABLE, readiness }),
      ).not.toContain("kiro");
    }
  });

  test("a ready CLI shows once signed in, or when its CLI owns sign-in", () => {
    const readiness: ProviderReadinessMap = {
      cursor: entry({ id: "cursor", authState: "authenticated" }),
      opencode: entry({ id: "opencode", authState: "not-required" }),
    };
    expect(
      listSettingsVisibleProviderIds({ availability: ALL_AVAILABLE, readiness }),
    ).toEqual(["claude-code", "codex", "cursor", "opencode"]);
  });

  test("a result for another CLI path does not count after the path changes", () => {
    const readiness: ProviderReadinessMap = {
      cursor: entry({ id: "cursor" }, "/tmp/old-agent"),
    };
    expect(
      listSettingsVisibleProviderIds({
        availability: ALL_AVAILABLE,
        readiness,
        runtimeOptions: { cursorBinaryPath: "/tmp/old-agent" },
      }),
    ).toContain("cursor");
    expect(
      listSettingsVisibleProviderIds({
        availability: ALL_AVAILABLE,
        readiness,
        runtimeOptions: { cursorBinaryPath: "/tmp/new-agent" },
      }),
    ).not.toContain("cursor");
  });

  test("equal results are the same array, so memoized consumers stay put", () => {
    const readiness: ProviderReadinessMap = { kiro: entry({ id: "kiro" }) };
    const first = listSettingsVisibleProviderIds({ availability: ALL_AVAILABLE, readiness });
    const second = listSettingsVisibleProviderIds({
      availability: { ...ALL_AVAILABLE },
      readiness: { ...readiness },
    });
    expect(second).toBe(first);
  });
});

describe("keepSavedProviderVisible", () => {
  const visible = listSettingsVisibleProviderIds({ availability: NOTHING_AVAILABLE, readiness: {} });

  test("a saved provider that is hidden stays selectable, in provider order", () => {
    expect(keepSavedProviderVisible(visible, "kiro")).toEqual(["claude-code", "codex", "kiro"]);
  });

  test("returns the same list when the saved value is visible, empty, or not a provider", () => {
    for (const saved of ["codex", undefined, null, "", "auto", "any-eligible"]) {
      expect(keepSavedProviderVisible(visible, saved)).toBe(visible);
    }
  });
});

describe("optionalProviderSetup", () => {
  test("checking until a probe for the current path answers", () => {
    expect(optionalProviderSetup({ readiness: {}, providerId: "cursor" })).toBe("checking");
    expect(
      optionalProviderSetup({
        readiness: { cursor: entry({ id: "cursor" }, "/tmp/old-agent") },
        providerId: "cursor",
        runtimeOptions: { cursorBinaryPath: "/tmp/new-agent" },
      }),
    ).toBe("checking");
    expect(
      optionalProviderSetup({
        readiness: { kiro: entry({ id: "kiro", state: "unknown", available: false, authState: "unknown" }) },
        providerId: "kiro",
      }),
    ).toBe("checking");
  });

  test("installed covers a signed-out CLI, because its row is where sign-in starts", () => {
    expect(
      optionalProviderSetup({
        readiness: { kiro: entry({ id: "kiro", state: "warning", authState: "unauthenticated" }) },
        providerId: "kiro",
      }),
    ).toBe("installed");
  });

  test("not-installed once a probe found no CLI", () => {
    expect(
      optionalProviderSetup({
        readiness: { opencode: entry({ id: "opencode", state: "warning", available: false, authState: "unknown" }) },
        providerId: "opencode",
      }),
    ).toBe("not-installed");
  });
});

describe("MCP configuration reads follow provider visibility", () => {
  test("a provider left out of the request keeps its configuration files unread", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { listMcpServerConfigs } = await import("../electron/providers/mcp-config-management");
    const cwd = await mkdtemp(path.join(tmpdir(), "stave-mcp-visibility-"));
    try {
      await Bun.write(
        path.join(cwd, ".cursor", "mcp.json"),
        JSON.stringify({ mcpServers: { "visibility-probe": { command: "probe" } } }),
      );
      const withCursor = await listMcpServerConfigs({ cwd, providers: ["cursor"] });
      expect(
        withCursor.servers.some(
          (server) => server.provider === "cursor" && server.name === "visibility-probe",
        ),
      ).toBe(true);

      const withoutCursor = await listMcpServerConfigs({ cwd, providers: ["kiro"] });
      expect(withoutCursor.servers.some((server) => server.provider === "cursor")).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("the IPC request accepts a provider list and rejects an unknown provider", async () => {
    const { McpServerConfigListArgsSchema } = await import("../electron/main/ipc/schemas");
    expect(McpServerConfigListArgsSchema.safeParse({ providers: ["claude-code", "codex"] }).success).toBe(true);
    expect(McpServerConfigListArgsSchema.safeParse({}).success).toBe(true);
    expect(McpServerConfigListArgsSchema.safeParse({ providers: ["opencode"] }).success).toBe(false);
  });
});

describe("new MCP servers install only to providers that are set up", () => {
  test("the add form starts with just the given providers, and all of them by default", async () => {
    const { createInitialMcpConfigForm } = await import("@/lib/providers/mcp-config-form");
    expect(createInitialMcpConfigForm(undefined, ["claude-code", "codex"]).installProviders).toEqual([
      "claude-code",
      "codex",
    ]);
    expect(createInitialMcpConfigForm().installProviders).toEqual(["claude-code", "codex", "cursor", "kiro"]);
  });
});
