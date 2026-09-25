import { describe, expect, test } from "bun:test";
import {
  collectCodexAppServerSnapshot,
  listCodexModelCatalogEntries,
  type CodexSnapshotRequester,
} from "../electron/providers/codex-app-server-snapshot";

function fakeClient(
  handle: (method: string, params: unknown) => unknown | Promise<unknown>,
): CodexSnapshotRequester {
  return {
    async request<T>(method: string, params: unknown): Promise<T> {
      return (await handle(method, params)) as T;
    },
  };
}

describe("Codex App Server snapshot requests", () => {
  test("collects paginated model catalog entries and stops after cancellation", async () => {
    const calls: unknown[] = [];
    const client = fakeClient((method, params) => {
      expect(method).toBe("model/list");
      calls.push(params);
      return calls.length === 1
        ? {
            data: [{ model: "first", displayName: "First" }],
            nextCursor: "page-2",
          }
        : { data: [{ model: "second", displayName: "Second" }] };
    });

    const catalog = await listCodexModelCatalogEntries({ client });
    expect(catalog.map(({ model, displayName }) => [model, displayName])).toEqual([
      ["first", "First"],
      ["second", "Second"],
    ]);
    expect(calls).toEqual([
      { includeHidden: false, limit: 100 },
      { includeHidden: false, limit: 100, cursor: "page-2" },
    ]);

    const controller = new AbortController();
    const cancelledCalls: unknown[] = [];
    const cancelledClient = fakeClient((_method, params) => {
      cancelledCalls.push(params);
      controller.abort();
      return {
        data: [{ model: "first" }],
        nextCursor: "page-2",
      };
    });
    const cancelledCatalog = await listCodexModelCatalogEntries({
      client: cancelledClient,
      signal: controller.signal,
    });
    expect(cancelledCatalog.map(({ model }) => model)).toEqual(["first"]);
    expect(cancelledCalls).toHaveLength(1);
  });

  test("preserves successful sections when one request fails and gates hooks by capability", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const client = fakeClient((method, params) => {
      calls.push({ method, params });
      if (method === "plugin/list") {
        throw new Error("marketplace unavailable");
      }
      if (method === "account/read") {
        return { account: { type: "chatgpt", email: "a@example.com" } };
      }
      if (method === "thread/list") {
        return {
          data: [
            {
              id: (params as { archived: boolean }).archived
                ? "archived-1"
                : "active-1",
            },
          ],
        };
      }
      return {};
    });

    const result = await collectCodexAppServerSnapshot({
      client,
      cwd: "/tmp/codex-snapshot-test",
      hooksInventory: false,
    });
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("1 section error");
    expect(Object.keys(result.sectionErrors)).toEqual(["plugins"]);
    expect(result.sectionErrors.plugins).toContain("marketplace unavailable");
    expect(result.snapshot?.account?.email).toBe("a@example.com");
    expect(result.snapshot?.threads.map(({ id }) => id)).toEqual(["active-1"]);
    expect(result.snapshot?.archivedThreads.map(({ id }) => id)).toEqual([
      "archived-1",
    ]);
    expect(calls.some(({ method }) => method === "hooks/list")).toBe(false);
    expect(calls).toContainEqual({
      method: "skills/list",
      params: { cwds: ["/tmp/codex-snapshot-test"], forceReload: false },
    });

    const hooksResult = await collectCodexAppServerSnapshot({
      client: fakeClient((method) => {
        calls.push({ method, params: null });
        return {};
      }),
      cwd: "/tmp/codex-snapshot-test",
      hooksInventory: true,
    });
    expect(hooksResult.ok).toBe(true);
    expect(calls.some(({ method }) => method === "hooks/list")).toBe(true);
  });

  test("reports failure only when every supported section fails", async () => {
    const result = await collectCodexAppServerSnapshot({
      client: fakeClient(() => {
        throw new Error("App Server offline");
      }),
      cwd: "/tmp/codex-snapshot-test",
      hooksInventory: true,
    });
    expect(result.ok).toBe(false);
    expect(result.snapshot).toBeUndefined();
    expect(Object.keys(result.sectionErrors).sort()).toEqual([
      "account",
      "rateLimits",
      "skills",
      "hooks",
      "plugins",
      "apps",
      "experimentalFeatures",
      "mcpServers",
      "threads",
      "archivedThreads",
      "config",
      "configRequirements",
      "externalAgentConfig",
    ].sort());
  });
});
