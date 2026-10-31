import { describe, expect, test } from "bun:test";
import {
  buildClaudeQueryOptions,
  buildClaudeReadOnlyPromptOptions,
} from "../electron/providers/claude-sdk-runtime";
import {
  makeClaudePluginEnvFixture,
  PLUGIN_ID,
  PLUGIN_TOKEN_ENV_VAR,
  withPluginTokenProfileShell,
} from "./fixtures/claude-plugin-env-fixture";

describe("Claude query env for plugin MCP variables", () => {
  test("forwards a plugin token only when the query loads plugins", async () => {
    if (process.platform === "win32") return;
    // Claude's own settings enable the plugin, so a fallback to that cascade
    // would forward its token.
    const fixture = makeClaudePluginEnvFixture({ enabled: true });
    try {
      await withPluginTokenProfileShell(fixture, () => {
        const tokenFor = (args: Partial<Parameters<typeof buildClaudeQueryOptions>[0]>) =>
          buildClaudeQueryOptions({
            cwd: fixture.cwd,
            claudeExecutablePath: "/tmp/claude",
            ...args,
          }).env?.[PLUGIN_TOKEN_ENV_VAR];

        // A plugin-loading query, with or without a stated map, gets it.
        expect(tokenFor({})).toBe("atl_test");
        expect(tokenFor({ enabledPlugins: { [PLUGIN_ID]: true } })).toBe("atl_test");
        // A secondary read-only query passes `plugins: []` and states no map.
        expect(tokenFor({ secondaryReadOnly: true })).toBeUndefined();
        expect(tokenFor({ secondaryReadOnly: true, enabledPlugins: { [PLUGIN_ID]: true } })).toBeUndefined();
        // Plugin mode `off` loads no CLI-installed plugin.
        expect(tokenFor({ runtimeOptions: { claudePluginMode: "off" } })).toBeUndefined();
        expect(tokenFor({ runtimeOptions: { claudePluginMode: "off" }, enabledPlugins: { [PLUGIN_ID]: true } })).toBe("atl_test");
      });
    } finally {
      fixture.cleanup();
    }
  });

  test("a server-less read-only prompt gets no plugin token", async () => {
    if (process.platform === "win32") return;
    const fixture = makeClaudePluginEnvFixture({ enabled: true });
    try {
      await withPluginTokenProfileShell(fixture, () => {
        const options = buildClaudeReadOnlyPromptOptions({
          cwd: fixture.cwd,
          model: "claude-sonnet-4-5",
          abortController: new AbortController(),
          claudeExecutablePath: "/tmp/claude",
        });
        expect(options.mcpServers).toEqual({});
        expect(options.env?.[PLUGIN_TOKEN_ENV_VAR]).toBeUndefined();
      });
    } finally {
      fixture.cleanup();
    }
  });
});
