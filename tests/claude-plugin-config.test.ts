import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  resolveClaudeInstalledPlugins,
  resolveClaudePluginEnablement,
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
  projectSettings?: unknown;
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
  if (args.projectSettings !== undefined) {
    await writeJson(
      path.join(cwd, ".claude", "settings.json"),
      args.projectSettings,
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
      projectSettings: { enabledPlugins: { "fmt@shop": true } },
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
    const projectPath = path.join(root, "project-a");
    const otherProject = path.join(root, "project-b");
    await mkdir(path.join(projectPath, "packages", "app"), {
      recursive: true,
    });
    await mkdir(otherProject, { recursive: true });
    await writeJson(path.join(configDir, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: {
        "repo-tools@shop": [{ scope: "project", projectPath }],
      },
    });

    const insideNested = await resolveClaudeInstalledPlugins({
      cwd: path.join(projectPath, "packages", "app"),
      claudeConfigDir: configDir,
    });
    const outside = await resolveClaudeInstalledPlugins({
      cwd: otherProject,
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
