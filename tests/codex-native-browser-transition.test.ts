import { describe, expect, test } from "bun:test";
import {
  buildCodexNativeBrowserTurnConfigOverrides,
  isCodexNativeBrowserPluginEnabled,
  resolveCodexNativeBrowserPluginEnabled,
} from "../electron/providers/codex-runtime-config";

import { ensureCodexThread } from "../electron/providers/codex-ensure-thread";
import { CodexThreadLifetime } from "../electron/providers/codex-thread-lifetime";

const chrome = { id: "chrome@openai-bundled", installed: true, enabled: true };
const cua = { id: "unified-computer-use@openai-bundled", installed: true, enabled: true };
const inventory = (plugins: unknown[]) => ({ marketplaces: [{ plugins }] });

describe("Codex native browser turn transitions", () => {
  test("restores the browser transport after a turn without web access", () => {
    const previous = buildCodexNativeBrowserTurnConfigOverrides({ requested: false, userEnabled: true });
    const web = buildCodexNativeBrowserTurnConfigOverrides({ requested: true, userEnabled: true });
    expect({ ...previous, ...web }).toEqual({
      "plugins.chrome@openai-bundled.enabled": true,
      "plugins.unified-computer-use@openai-bundled.enabled": true,
    });
    expect(buildCodexNativeBrowserTurnConfigOverrides({ requested: false, userEnabled: true })).toEqual(previous);
  });

  test("requires both the Chrome skill and the CUA transport to be user enabled", () => {
    expect(isCodexNativeBrowserPluginEnabled(inventory([chrome, cua]))).toBe(true);
    for (const plugins of [
      [chrome], [cua],
      [chrome, { ...cua, enabled: false }],
      [chrome, { ...cua, installed: false }],
      [{ ...chrome, enabled: false }, cua],
      [{ ...chrome, installed: false }, cua],
    ]) {
      const userEnabled = isCodexNativeBrowserPluginEnabled(inventory(plugins));
      expect(userEnabled).toBe(false);
      expect(buildCodexNativeBrowserTurnConfigOverrides({ requested: true, userEnabled })).toEqual({
        "plugins.chrome@openai-bundled.enabled": false,
        "plugins.unified-computer-use@openai-bundled.enabled": false,
      });
    }
  });

  test("does not request plugin inventory outside a browser turn", async () => {
    let calls = 0;
    expect(await resolveCodexNativeBrowserPluginEnabled({ requested: false, cwd: "/tmp/project", request: async () => { calls++; return inventory([chrome, cua]); } })).toBe(false);
    expect(calls).toBe(0);
  });
});

// Live App Server reproduction: a warm resume ignores changed plugin config;
// unsubscribing and cold-resuming the same thread refreshes the MCP inventory.
describe("Codex browser inventory on resumed conversations", () => {
  test("reloads on access transitions while preserving the native conversation", async () => {
    let loaded = false;
    let transportEnabled = false;
    let reloads = 0;
    const threadId = "browser-transition-thread";
    const lifetime = new CodexThreadLifetime(async () => {
      reloads++;
      loaded = false;
    }, () => {});
    const calls: string[] = [];
    const client = {
      threadLifetime: lifetime,
      async request<T>(method: string, params: unknown): Promise<T> {
        calls.push(method);
        if (!loaded) {
          const config = (params as { config: Record<string, unknown> }).config;
          transportEnabled = config["plugins.unified-computer-use@openai-bundled.enabled"] === true;
          loaded = true;
        }
        return { thread: { id: threadId } } as T;
      },
    };
    try {
      for (const [requested, expectedReloads] of [[false, 0], [true, 1], [true, 1], [false, 2]] as const) {
        const result = await ensureCodexThread({
          client, executablePath: "/tmp/codex-browser-test",
          taskId: "browser-access-transitions", cwd: "/tmp/project",
          configOverrides: buildCodexNativeBrowserTurnConfigOverrides({ requested, userEnabled: true }),
        });
        expect(result.threadId).toBe(threadId);
        expect(transportEnabled).toBe(requested);
        expect(reloads).toBe(expectedReloads);
        result.releaseThread();
      }
      expect(calls).toEqual(["thread/start", "thread/resume", "thread/resume", "thread/resume"]);
    } finally { lifetime.clear(); }
  });

  test("reloads a restored conversation whose previous browser mode is unknown", async () => {
    const order: string[] = [];
    const lifetime = new CodexThreadLifetime(async () => { order.push("unsubscribe"); }, () => {});
    const client = {
      threadLifetime: lifetime,
      async request<T>(method: string): Promise<T> {
        order.push(method);
        return { thread: { id: "restored-browser-thread" } } as T;
      },
    };
    try {
      const result = await ensureCodexThread({
        client, executablePath: "/tmp/codex-browser-test",
        taskId: "browser-access-restored", cwd: "/tmp/project",
        runtimeOptions: { codexResumeThreadId: "restored-browser-thread" },
        configOverrides: buildCodexNativeBrowserTurnConfigOverrides({ requested: true, userEnabled: true }),
      });
      expect(order).toEqual(["unsubscribe", "thread/resume"]);
      result.releaseThread();
    } finally { lifetime.clear(); }
  });
});
