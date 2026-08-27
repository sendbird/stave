import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Claude plugin discovery and enablement.
 *
 * Claude Code installs marketplace plugins with `claude plugin install
 * <name>@<marketplace>`, which writes two files under the Claude config dir:
 *
 * - `plugins/installed_plugins.json` — the on-disk inventory (install path,
 *   version, install scope).
 * - `settings.json` / `.claude/settings.json[.local]` — the `enabledPlugins`
 *   map that decides which of those installs actually load.
 *
 * Stave runs Claude through the Agent SDK with `settingSources` narrowed (the
 * default is `["project"]`), so the `user` layer that `claude plugin install`
 * writes to is not read and CLI-installed plugins silently never load. Rather
 * than widening `settingSources` — which would also pull in user-level hooks,
 * permissions, and MCP entries — Stave reads the inventory itself and re-states
 * the decision in the SDK's inline `settings` (the "flag" layer, which sits
 * above user/project/local and below managed policy). That keeps marketplace
 * identity and versioning with Claude while leaving the enable/disable decision
 * owned by Stave settings.
 */

export type ClaudePluginInstallScope = "user" | "project";

export type ClaudePluginSettingsSource = "user" | "project" | "local";

/** Stave-side policy for CLI/marketplace-installed Claude plugins. */
export type ClaudePluginMode = "off" | "claude-config" | "all";

export const DEFAULT_CLAUDE_PLUGIN_MODE: ClaudePluginMode = "claude-config";

export type ClaudeInstalledPlugin = {
  /** `<name>@<marketplace>` — the id `enabledPlugins` keys off. */
  id: string;
  name: string;
  marketplace: string;
  version?: string;
  installPath?: string;
  description?: string;
  /** Install scopes recorded on disk that apply to the resolved cwd. */
  scopes: ClaudePluginInstallScope[];
  /** True when Claude's own settings cascade would enable this plugin. */
  enabledInClaudeConfig: boolean;
  /** Setting layer that decided `enabledInClaudeConfig`, when any did. */
  enabledSource?: ClaudePluginSettingsSource;
};

export type ClaudePluginInventory = {
  configDir: string;
  plugins: ClaudeInstalledPlugin[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function resolveClaudeConfigDir(value?: string) {
  const configured = value?.trim();
  return configured && path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.join(homedir(), ".claude");
}

async function readJsonFile(filePath: string) {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    // Missing, unreadable, and malformed all mean "no signal from this layer".
    // A broken plugin registry must never fail a turn.
    return null;
  }
}

/**
 * `enabledPlugins` values are `true`/`false` or an extended object form that
 * carries a version constraint. Any object form counts as enabled.
 */
function toEnabledFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (asRecord(value)) {
    return true;
  }
  return undefined;
}

function collectEnabledPluginEntries(document: unknown) {
  const record = asRecord(asRecord(document)?.enabledPlugins);
  if (!record) {
    return [] as Array<[string, boolean]>;
  }
  return Object.entries(record).flatMap(([id, value]) => {
    const flag = toEnabledFlag(value);
    const normalizedId = id.trim();
    return flag === undefined || !normalizedId
      ? []
      : [[normalizedId, flag] as [string, boolean]];
  });
}

function isPathInside(args: { parent: string; child: string }) {
  const relative = path.relative(
    path.resolve(args.parent),
    path.resolve(args.child),
  );
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function splitPluginId(id: string) {
  const separator = id.lastIndexOf("@");
  if (separator <= 0 || separator === id.length - 1) {
    return { name: id, marketplace: "" };
  }
  return {
    name: id.slice(0, separator),
    marketplace: id.slice(separator + 1),
  };
}

type InstalledEntry = {
  scope: ClaudePluginInstallScope;
  installPath?: string;
  version?: string;
};

function toInstalledEntries(args: {
  value: unknown;
  cwd: string;
}): InstalledEntry[] {
  const raw = Array.isArray(args.value) ? args.value : [args.value];
  return raw.flatMap((candidate) => {
    const record = asRecord(candidate);
    if (!record) {
      return [];
    }
    const scope: ClaudePluginInstallScope =
      record.scope === "project" ? "project" : "user";
    const projectPath =
      typeof record.projectPath === "string" ? record.projectPath : undefined;
    // A project-scoped install only applies inside the project it was
    // installed for; otherwise a plugin installed for one repo would leak into
    // every other workspace.
    if (
      scope === "project" &&
      (!projectPath || !isPathInside({ parent: projectPath, child: args.cwd }))
    ) {
      return [];
    }
    return [
      {
        scope,
        ...(typeof record.installPath === "string" && record.installPath.trim()
          ? { installPath: record.installPath }
          : {}),
        ...(typeof record.version === "string" && record.version.trim()
          ? { version: record.version }
          : {}),
      },
    ];
  });
}

async function readPluginDescription(installPath?: string) {
  if (!installPath) {
    return undefined;
  }
  const manifest = asRecord(
    await readJsonFile(path.join(installPath, ".claude-plugin", "plugin.json")),
  );
  const description = manifest?.description;
  return typeof description === "string" && description.trim()
    ? description.trim()
    : undefined;
}

/**
 * Reads the Claude plugin inventory for a workspace: every plugin installed by
 * the CLI that applies to `cwd`, plus whether Claude's own settings cascade
 * enables it.
 */
export async function resolveClaudeInstalledPlugins(args: {
  cwd: string;
  claudeConfigDir?: string;
}): Promise<ClaudePluginInventory> {
  const configDir = resolveClaudeConfigDir(args.claudeConfigDir);
  const cwd = path.resolve(args.cwd);

  const [installedDocument, userSettings, projectSettings, localSettings] =
    await Promise.all([
      readJsonFile(path.join(configDir, "plugins", "installed_plugins.json")),
      readJsonFile(path.join(configDir, "settings.json")),
      readJsonFile(path.join(cwd, ".claude", "settings.json")),
      readJsonFile(path.join(cwd, ".claude", "settings.local.json")),
    ]);

  // Precedence matches Claude Code: user < project < local.
  const enabledById = new Map<
    string,
    { enabled: boolean; source: ClaudePluginSettingsSource }
  >();
  (
    [
      ["user", userSettings],
      ["project", projectSettings],
      ["local", localSettings],
    ] as Array<[ClaudePluginSettingsSource, unknown]>
  ).forEach(([source, document]) => {
    collectEnabledPluginEntries(document).forEach(([id, enabled]) => {
      enabledById.set(id, { enabled, source });
    });
  });

  const installedRecord = asRecord(asRecord(installedDocument)?.plugins);
  const installedIds = installedRecord ? Object.keys(installedRecord) : [];
  // Plugins the settings cascade names but the inventory does not (installed
  // through another machine's sync, or a stale registry) are still reported so
  // the id can be re-stated to the SDK and shown in Settings.
  const ids = Array.from(
    new Set([...installedIds, ...enabledById.keys()].map((id) => id.trim())),
  ).filter(Boolean);

  const plugins = await Promise.all(
    ids.map(async (id): Promise<ClaudeInstalledPlugin | null> => {
      const entries = installedRecord
        ? toInstalledEntries({ value: installedRecord[id], cwd })
        : [];
      const isKnownInstall = Boolean(installedRecord?.[id]);
      // Recorded under a scope that does not apply here — treat as absent.
      if (isKnownInstall && entries.length === 0) {
        return null;
      }
      const { name, marketplace } = splitPluginId(id);
      const installPath = entries.find(
        (entry) => entry.installPath,
      )?.installPath;
      const version = entries.find((entry) => entry.version)?.version;
      const decision = enabledById.get(id);
      const scopes = Array.from(new Set(entries.map((entry) => entry.scope)));
      const description = await readPluginDescription(installPath);
      return {
        id,
        name,
        marketplace,
        ...(version ? { version } : {}),
        ...(installPath ? { installPath } : {}),
        ...(description ? { description } : {}),
        scopes,
        enabledInClaudeConfig: decision?.enabled === true,
        ...(decision ? { enabledSource: decision.source } : {}),
      };
    }),
  );

  return {
    configDir,
    plugins: plugins
      .filter((plugin): plugin is ClaudeInstalledPlugin => Boolean(plugin))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

/**
 * Turns the inventory plus Stave policy into the `enabledPlugins` map handed to
 * the SDK's inline settings. Explicit `false` entries matter: the flag layer
 * outranks user/project/local, so that is how Stave switches a plugin off that
 * Claude's own config enables.
 */
export function resolveClaudePluginEnablement(args: {
  plugins: readonly ClaudeInstalledPlugin[];
  mode?: ClaudePluginMode;
  overrides?: Record<string, boolean>;
}): Record<string, boolean> {
  const mode = args.mode ?? DEFAULT_CLAUDE_PLUGIN_MODE;
  const overrides = args.overrides ?? {};
  const enablement: Record<string, boolean> = {};

  args.plugins.forEach((plugin) => {
    const base =
      mode === "off"
        ? false
        : mode === "all"
          ? true
          : plugin.enabledInClaudeConfig;
    const override = overrides[plugin.id];
    enablement[plugin.id] = typeof override === "boolean" ? override : base;
  });

  // Overrides may name a plugin the inventory has not caught up with yet (just
  // installed, or installed on another machine). Honor them anyway.
  Object.entries(overrides).forEach(([id, enabled]) => {
    const normalizedId = id.trim();
    if (normalizedId && !(normalizedId in enablement)) {
      enablement[normalizedId] = enabled;
    }
  });

  return enablement;
}
