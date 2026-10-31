import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  resolveClaudeInstalledPlugins,
  resolveClaudePluginEnablement,
  resolveClaudePluginLoadDecision,
  resolveClaudePluginMcpConfigPaths,
  type ClaudeInstalledPlugin,
} from "../electron/providers/claude-plugin-config";

const tempDirectories: string[] = [];

async function makeTempDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "stave-claude-plugin-"));
  tempDirectories.push(directory);
  return directory;
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value), "utf8");
}

async function makeFixture(args: {
  installedPlugins?: unknown;
  userSettings?: unknown;
  repositorySettings?: unknown;
  localSettings?: unknown;
  pluginManifests?: Record<string, unknown>;
}) {
  const root = await makeTempDirectory();
  const configDir = path.join(root, "config");
  const cwd = path.join(root, "workspace");
  await mkdir(cwd, { recursive: true });
  if (args.installedPlugins !== undefined) {
    await writeJson(
      path.join(configDir, "plugins", "installed_plugins.json"),
      args.installedPlugins,
    );
  }
  if (args.userSettings !== undefined) {
    await writeJson(path.join(configDir, "settings.json"), args.userSettings);
  }
  if (args.repositorySettings !== undefined) {
    await writeJson(
      path.join(cwd, ".claude", "settings.json"),
      args.repositorySettings,
    );
  }
  if (args.localSettings !== undefined) {
    await writeJson(
      path.join(cwd, ".claude", "settings.local.json"),
      args.localSettings,
    );
  }
  await Promise.all(
    Object.entries(args.pluginManifests ?? {}).map(([installPath, manifest]) =>
      writeJson(
        path.join(installPath, ".claude-plugin", "plugin.json"),
        manifest,
      ),
    ),
  );
  return { root, configDir, cwd };
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("Claude installed plugin discovery", () => {
  test("reports CLI installs with the enable state from the settings cascade", async () => {
    const root = await makeTempDirectory();
    const configDir = path.join(root, "config");
    const cwd = path.join(root, "workspace");
    const installPath = path.join(configDir, "plugins", "cache", "eli5");
    await mkdir(cwd, { recursive: true });
    await writeJson(path.join(configDir, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: {
        "eli5@claude-community": [
          { scope: "user", installPath, version: "1.0.0" },
        ],
      },
    });
    await writeJson(path.join(configDir, "settings.json"), {
      enabledPlugins: { "eli5@claude-community": true },
    });
    await writeJson(path.join(installPath, ".claude-plugin", "plugin.json"), {
      name: "eli5",
      description: "Explain like I'm five.",
    });

    const inventory = await resolveClaudeInstalledPlugins({
      cwd,
      claudeConfigDir: configDir,
    });

    expect(inventory.configDir).toBe(configDir);
    expect(inventory.plugins).toEqual([
      {
        id: "eli5@claude-community",
        name: "eli5",
        marketplace: "claude-community",
        version: "1.0.0",
        installPath,
        description: "Explain like I'm five.",
        scopes: ["user"],
        enabledInClaudeConfig: true,
        enabledSource: "user",
      },
    ]);
  });

  test("local settings outrank project and user layers", async () => {
    const { configDir, cwd } = await makeFixture({
      installedPlugins: {
        version: 2,
        plugins: { "fmt@shop": [{ scope: "user" }] },
      },
      userSettings: { enabledPlugins: { "fmt@shop": true } },
      repositorySettings: { enabledPlugins: { "fmt@shop": true } },
      localSettings: { enabledPlugins: { "fmt@shop": false } },
    });

    const inventory = await resolveClaudeInstalledPlugins({
      cwd,
      claudeConfigDir: configDir,
    });

    expect(inventory.plugins[0]?.enabledInClaudeConfig).toBe(false);
    expect(inventory.plugins[0]?.enabledSource).toBe("local");
  });

  test("treats the extended enabledPlugins object form as enabled", async () => {
    const { configDir, cwd } = await makeFixture({
      installedPlugins: {
        version: 2,
        plugins: { "fmt@shop": [{ scope: "user" }] },
      },
      userSettings: { enabledPlugins: { "fmt@shop": { version: "2.1.0" } } },
    });

    const inventory = await resolveClaudeInstalledPlugins({
      cwd,
      claudeConfigDir: configDir,
    });

    expect(inventory.plugins[0]?.enabledInClaudeConfig).toBe(true);
  });

  test("keeps project-scoped installs inside their project", async () => {
    const root = await makeTempDirectory();
    const configDir = path.join(root, "config");
    const repositoryPath = path.join(root, "project-a");
    const otherRepository = path.join(root, "project-b");
    await mkdir(path.join(repositoryPath, "packages", "app"), {
      recursive: true,
    });
    await mkdir(otherRepository, { recursive: true });
    await writeJson(path.join(configDir, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: {
        "repo-tools@shop": [{ scope: "project", projectPath: repositoryPath }],
      },
    });

    const insideNested = await resolveClaudeInstalledPlugins({
      cwd: path.join(repositoryPath, "packages", "app"),
      claudeConfigDir: configDir,
    });
    const outside = await resolveClaudeInstalledPlugins({
      cwd: otherRepository,
      claudeConfigDir: configDir,
    });

    expect(insideNested.plugins.map((plugin) => plugin.id)).toEqual([
      "repo-tools@shop",
    ]);
    expect(outside.plugins).toEqual([]);
  });

  test("surfaces plugins the settings cascade names but the registry lacks", async () => {
    const { configDir, cwd } = await makeFixture({
      userSettings: { enabledPlugins: { "ghost@shop": true } },
    });

    const inventory = await resolveClaudeInstalledPlugins({
      cwd,
      claudeConfigDir: configDir,
    });

    expect(inventory.plugins).toEqual([
      {
        id: "ghost@shop",
        name: "ghost",
        marketplace: "shop",
        scopes: [],
        enabledInClaudeConfig: true,
        enabledSource: "user",
      },
    ]);
  });

  test("survives a missing or corrupted plugin registry", async () => {
    const { configDir, cwd } = await makeFixture({});
    const registryPath = path.join(
      configDir,
      "plugins",
      "installed_plugins.json",
    );
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(registryPath, "{not json", "utf8");

    const inventory = await resolveClaudeInstalledPlugins({
      cwd,
      claudeConfigDir: configDir,
    });

    expect(inventory.plugins).toEqual([]);
  });

  test("keeps local-scoped installs inside their repository", async () => {
    const root = await makeTempDirectory();
    const configDir = path.join(root, "config");
    const repositoryPath = path.join(root, "project-a");
    const otherRepository = path.join(root, "project-b");
    await mkdir(repositoryPath, { recursive: true });
    await mkdir(otherRepository, { recursive: true });
    await writeJson(path.join(configDir, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: {
        "mine@shop": [{ scope: "local", projectPath: repositoryPath }],
      },
    });

    const inside = await resolveClaudeInstalledPlugins({
      cwd: repositoryPath,
      claudeConfigDir: configDir,
    });
    const outside = await resolveClaudeInstalledPlugins({
      cwd: otherRepository,
      claudeConfigDir: configDir,
    });

    expect(inside.plugins.map((plugin) => plugin.scopes)).toEqual([
      ["project"],
    ]);
    expect(outside.plugins).toEqual([]);
  });
});

describe("Claude plugin MCP config paths", () => {
  async function makePluginFixture(args: {
    enabled?: boolean;
    mcpJson?: unknown;
    manifest?: unknown;
    extraFiles?: Record<string, unknown>;
  }) {
    const root = await makeTempDirectory();
    const configDir = path.join(root, "config");
    const cwd = path.join(root, "workspace");
    const installPath = path.join(
      configDir,
      "plugins",
      "cache",
      "shop",
      "remote",
      "1.0.0",
    );
    await mkdir(cwd, { recursive: true });
    await mkdir(installPath, { recursive: true });
    await writeJson(path.join(configDir, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: {
        "remote@shop": [
          { scope: "user", installPath, version: "1.0.0" },
        ],
      },
    });
    if (args.enabled !== undefined) {
      await writeJson(path.join(configDir, "settings.json"), {
        enabledPlugins: { "remote@shop": args.enabled },
      });
    }
    if (args.mcpJson !== undefined) {
      await writeJson(path.join(installPath, ".mcp.json"), args.mcpJson);
    }
    if (args.manifest !== undefined) {
      await writeJson(
        path.join(installPath, ".claude-plugin", "plugin.json"),
        args.manifest,
      );
    }
    await Promise.all(
      Object.entries(args.extraFiles ?? {}).map(([relativePath, value]) =>
        writeJson(path.join(installPath, relativePath), value),
      ),
    );
    return { root, configDir, cwd, installPath };
  }

  const remoteServer = {
    remote: {
      type: "http",
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer ${ATELIER_MCP_TOKEN}" },
    },
  };

  test("lists the root .mcp.json of an enabled user-scope plugin", async () => {
    const { configDir, cwd, installPath } = await makePluginFixture({
      enabled: true,
      mcpJson: { mcpServers: remoteServer },
    });

    expect(
      resolveClaudePluginMcpConfigPaths({ cwd, claudeConfigDir: configDir }),
    ).toEqual([path.join(installPath, ".mcp.json")]);
  });

  test("skips a plugin the settings cascade disables or never enables", async () => {
    const disabled = await makePluginFixture({
      enabled: false,
      mcpJson: { mcpServers: remoteServer },
    });
    const unset = await makePluginFixture({
      mcpJson: { mcpServers: remoteServer },
    });

    expect(
      resolveClaudePluginMcpConfigPaths({
        cwd: disabled.cwd,
        claudeConfigDir: disabled.configDir,
      }),
    ).toEqual([]);
    expect(
      resolveClaudePluginMcpConfigPaths({
        cwd: unset.cwd,
        claudeConfigDir: unset.configDir,
      }),
    ).toEqual([]);
  });

  test("follows Stave's effective plugin decision when the caller has it", async () => {
    const { configDir, cwd, installPath } = await makePluginFixture({
      enabled: false,
      mcpJson: { mcpServers: remoteServer },
    });

    expect(
      resolveClaudePluginMcpConfigPaths({
        cwd,
        claudeConfigDir: configDir,
        enabledPlugins: { "remote@shop": true },
      }),
    ).toEqual([path.join(installPath, ".mcp.json")]);
    expect(
      resolveClaudePluginMcpConfigPaths({
        cwd,
        claudeConfigDir: configDir,
        enabledPlugins: { "remote@shop": false },
      }),
    ).toEqual([]);
  });

  test("lists the manifest and every JSON file its mcpServers names", async () => {
    const inline = await makePluginFixture({
      enabled: true,
      manifest: { name: "remote", mcpServers: remoteServer },
    });
    const byPath = await makePluginFixture({
      enabled: true,
      manifest: {
        name: "remote",
        mcpServers: [
          "./mcp/servers.json",
          "./bundle.mcpb",
          "../outside.json",
          { inline: { command: "inline-mcp" } },
        ],
      },
      extraFiles: { "mcp/servers.json": remoteServer },
    });
    const withoutServers = await makePluginFixture({
      enabled: true,
      manifest: { name: "skills-only" },
    });

    expect(
      resolveClaudePluginMcpConfigPaths({
        cwd: inline.cwd,
        claudeConfigDir: inline.configDir,
      }),
    ).toEqual([
      path.join(inline.installPath, ".claude-plugin", "plugin.json"),
    ]);
    expect(
      resolveClaudePluginMcpConfigPaths({
        cwd: byPath.cwd,
        claudeConfigDir: byPath.configDir,
      }),
    ).toEqual([
      path.join(byPath.installPath, ".claude-plugin", "plugin.json"),
      path.join(byPath.installPath, "mcp", "servers.json"),
    ]);
    // A skills-only plugin brings no MCP server, so enabling it is not an
    // MCP config change.
    expect(
      resolveClaudePluginMcpConfigPaths({
        cwd: withoutServers.cwd,
        claudeConfigDir: withoutServers.configDir,
      }),
    ).toEqual([]);
  });

  test("counts project and local installs only inside their repository", async () => {
    const { root, configDir, cwd, installPath } = await makePluginFixture({
      enabled: true,
      mcpJson: { mcpServers: remoteServer },
    });
    const otherRepository = path.join(root, "other");
    await mkdir(otherRepository, { recursive: true });
    for (const scope of ["project", "local"]) {
      await writeJson(
        path.join(configDir, "plugins", "installed_plugins.json"),
        {
          version: 2,
          plugins: {
            "remote@shop": [{ scope, projectPath: otherRepository, installPath }],
          },
        },
      );
      expect(
        resolveClaudePluginMcpConfigPaths({ cwd, claudeConfigDir: configDir }),
      ).toEqual([]);

      await writeJson(
        path.join(configDir, "plugins", "installed_plugins.json"),
        {
          version: 2,
          plugins: {
            "remote@shop": [{ scope, projectPath: cwd, installPath }],
          },
        },
      );
      expect(
        resolveClaudePluginMcpConfigPaths({ cwd, claudeConfigDir: configDir }),
      ).toEqual([path.join(installPath, ".mcp.json")]);
    }
  });

  test("reads a registry written before per-scope install lists", async () => {
    const { configDir, cwd, installPath } = await makePluginFixture({
      enabled: true,
      mcpJson: { mcpServers: remoteServer },
    });
    await writeJson(path.join(configDir, "plugins", "installed_plugins.json"), {
      version: 1,
      plugins: { "remote@shop": { version: "1.0.0", installPath } },
    });

    expect(
      resolveClaudePluginMcpConfigPaths({ cwd, claudeConfigDir: configDir }),
    ).toEqual([path.join(installPath, ".mcp.json")]);
  });

  test("returns nothing for a missing or corrupted plugin registry", async () => {
    const missing = await makeFixture({
      userSettings: { enabledPlugins: { "remote@shop": true } },
    });
    const corrupted = await makeFixture({
      userSettings: { enabledPlugins: { "remote@shop": true } },
    });
    const registryPath = path.join(
      corrupted.configDir,
      "plugins",
      "installed_plugins.json",
    );
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(registryPath, "{not json", "utf8");

    expect(
      resolveClaudePluginMcpConfigPaths({
        cwd: missing.cwd,
        claudeConfigDir: missing.configDir,
      }),
    ).toEqual([]);
    expect(
      resolveClaudePluginMcpConfigPaths({
        cwd: corrupted.cwd,
        claudeConfigDir: corrupted.configDir,
      }),
    ).toEqual([]);
  });

  test("skips a symlink that leads outside the plugin, by its canonical target", async () => {
    if (process.platform === "win32") return;
    const { root, configDir, cwd, installPath } = await makePluginFixture({
      enabled: true,
      manifest: { name: "remote", mcpServers: ["./servers.json", "./inside.json"] },
      extraFiles: { "real/inside.json": { mcpServers: remoteServer } },
    });
    const outside = path.join(root, "outside");
    await writeJson(path.join(outside, "servers.json"), { mcpServers: remoteServer });
    await writeJson(path.join(outside, ".mcp.json"), { mcpServers: remoteServer });
    await symlink(path.join(outside, "servers.json"), path.join(installPath, "servers.json"));
    await symlink(path.join(outside, ".mcp.json"), path.join(installPath, ".mcp.json"));
    await symlink(path.join(installPath, "real", "inside.json"), path.join(installPath, "inside.json"));

    // Only the link that stays inside the plugin, and the manifest, remain.
    expect(
      resolveClaudePluginMcpConfigPaths({ cwd, claudeConfigDir: configDir }),
    ).toEqual([
      path.join(installPath, ".claude-plugin", "plugin.json"),
      path.join(installPath, "inside.json"),
    ]);
  });

  test("keeps a plugin whose root or plugins folder is itself a symlink", async () => {
    if (process.platform === "win32") return;
    const { root, configDir, cwd, installPath } = await makePluginFixture({
      enabled: true,
      mcpJson: { mcpServers: remoteServer },
      manifest: { name: "remote", mcpServers: "./servers.json" },
      extraFiles: { "servers.json": { mcpServers: remoteServer } },
    });
    // The registry records the plugin through a link to its folder.
    const linkedInstallPath = path.join(root, "linked-plugin");
    await symlink(installPath, linkedInstallPath);
    await writeJson(path.join(configDir, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: { "remote@shop": [{ scope: "user", installPath: linkedInstallPath }] },
    });

    expect(
      resolveClaudePluginMcpConfigPaths({ cwd, claudeConfigDir: configDir }),
    ).toEqual([
      path.join(linkedInstallPath, ".claude-plugin", "plugin.json"),
      path.join(linkedInstallPath, ".mcp.json"),
      path.join(linkedInstallPath, "servers.json"),
    ]);
  });

  test("allows a link to another plugin of the same marketplace when loaded in place", async () => {
    if (process.platform === "win32") return;
    const root = await makeTempDirectory();
    const configDir = path.join(root, "config");
    const cwd = path.join(root, "workspace");
    const marketplace = path.join(root, "marketplace");
    const installPath = path.join(marketplace, "plugins", "remote");
    await mkdir(cwd, { recursive: true });
    await writeJson(path.join(marketplace, "plugins", "shared", "servers.json"), {
      mcpServers: remoteServer,
    });
    await writeJson(path.join(installPath, ".claude-plugin", "plugin.json"), {
      name: "remote",
      mcpServers: "./servers.json",
    });
    await symlink(
      path.join(marketplace, "plugins", "shared", "servers.json"),
      path.join(installPath, "servers.json"),
    );
    await writeJson(path.join(configDir, "settings.json"), {
      enabledPlugins: { "remote@shop": true },
    });
    await writeJson(path.join(configDir, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: { "remote@shop": [{ scope: "user", installPath }] },
    });
    const paths = () =>
      resolveClaudePluginMcpConfigPaths({ cwd, claudeConfigDir: configDir });
    const linked = path.join(installPath, "servers.json");

    // Without a known marketplace folder the link escapes the plugin.
    expect(paths()).not.toContain(linked);
    await writeJson(path.join(configDir, "plugins", "known_marketplaces.json"), {
      shop: { source: { source: "directory", path: marketplace }, installLocation: marketplace },
    });
    expect(paths()).toContain(linked);
  });

  test("skips a declared path whose parent is a file instead of failing", async () => {
    const { configDir, cwd, installPath } = await makePluginFixture({
      enabled: true,
      manifest: {
        name: "remote",
        mcpServers: ["./package.json/servers.json", "./servers.json"],
      },
      extraFiles: {
        "package.json": { name: "remote" },
        "servers.json": remoteServer,
      },
    });

    expect(
      resolveClaudePluginMcpConfigPaths({ cwd, claudeConfigDir: configDir }),
    ).toEqual([
      path.join(installPath, ".claude-plugin", "plugin.json"),
      path.join(installPath, "servers.json"),
    ]);
  });

  test("skips a declared path with a backslash outside Windows", async () => {
    if (process.platform === "win32") return;
    const { configDir, cwd, installPath } = await makePluginFixture({
      enabled: true,
      manifest: { name: "remote", mcpServers: "./mcp\\servers.json" },
    });

    expect(
      resolveClaudePluginMcpConfigPaths({ cwd, claudeConfigDir: configDir }),
    ).toEqual([path.join(installPath, ".claude-plugin", "plugin.json")]);
  });
});

describe("Claude plugin enablement", () => {
  const plugins: ClaudeInstalledPlugin[] = [
    {
      id: "enabled@shop",
      name: "enabled",
      marketplace: "shop",
      scopes: ["user"],
      enabledInClaudeConfig: true,
    },
    {
      id: "disabled@shop",
      name: "disabled",
      marketplace: "shop",
      scopes: ["user"],
      enabledInClaudeConfig: false,
    },
  ];

  test("claude-config mode mirrors Claude's own decision", () => {
    expect(
      resolveClaudePluginEnablement({ plugins, mode: "claude-config" }),
    ).toEqual({
      "enabled@shop": true,
      "disabled@shop": false,
    });
  });

  test("all mode enables every install and off mode enables none", () => {
    expect(resolveClaudePluginEnablement({ plugins, mode: "all" })).toEqual({
      "enabled@shop": true,
      "disabled@shop": true,
    });
    expect(resolveClaudePluginEnablement({ plugins, mode: "off" })).toEqual({
      "enabled@shop": false,
      "disabled@shop": false,
    });
  });

  test("Stave overrides win over the mode in both directions", () => {
    expect(
      resolveClaudePluginEnablement({
        plugins,
        mode: "claude-config",
        overrides: { "enabled@shop": false, "disabled@shop": true },
      }),
    ).toEqual({
      "enabled@shop": false,
      "disabled@shop": true,
    });
  });

  test("honors overrides for plugins the inventory has not caught up with", () => {
    expect(
      resolveClaudePluginEnablement({
        plugins: [],
        mode: "off",
        overrides: { "fresh-install@shop": true },
      }),
    ).toEqual({ "fresh-install@shop": true });
  });

  test("defaults to Claude's own decision when no mode is given", () => {
    expect(resolveClaudePluginEnablement({ plugins })).toEqual({
      "enabled@shop": true,
      "disabled@shop": false,
    });
  });
});

describe("Claude plugin load decision", () => {
  test("resolves the load decision from the inputs of the flag layer", () => {
    expect(resolveClaudePluginLoadDecision({ secondaryReadOnly: true, enabledPlugins: { a: true } })).toBe(false);
    expect(resolveClaudePluginLoadDecision({ mode: "off" })).toBe(false);
    expect(resolveClaudePluginLoadDecision({ mode: "off", enabledPlugins: { a: true } })).toEqual({ a: true });
    expect(resolveClaudePluginLoadDecision({ mode: "claude-config", enabledPlugins: {} })).toBeUndefined();
    expect(resolveClaudePluginLoadDecision({ mode: "all" })).toBeUndefined();
  });
});
