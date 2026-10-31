import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { noteClaudePluginMcpDocumentPath } from "./mcp-env";

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

/** Same "no signal" contract as `readJsonFile`, for synchronous env builders. */
function readJsonFileSync(filePath: string) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
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
    // Project and local installs both record the repository they were made
    // for and only apply inside it; otherwise a plugin installed for one repo
    // would leak into every other workspace. User and managed installs (and a
    // pre-scope record without a `scope`) apply everywhere.
    const scope: ClaudePluginInstallScope =
      record.scope === "project" || record.scope === "local"
        ? "project"
        : "user";
    const projectPath =
      typeof record.projectPath === "string" ? record.projectPath : undefined;
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

type ClaudePluginRegistryDocuments = {
  installed: unknown;
  user: unknown;
  project: unknown;
  local: unknown;
};

function claudePluginRegistryPaths(args: { configDir: string; cwd: string }) {
  return {
    installed: path.join(args.configDir, "plugins", "installed_plugins.json"),
    user: path.join(args.configDir, "settings.json"),
    project: path.join(args.cwd, ".claude", "settings.json"),
    local: path.join(args.cwd, ".claude", "settings.local.json"),
  };
}

type ApplicableClaudePlugin = {
  id: string;
  entries: InstalledEntry[];
  decision?: { enabled: boolean; source: ClaudePluginSettingsSource };
};

/**
 * Every plugin that applies to `cwd`: installs recorded for this workspace,
 * plus ids the settings cascade names, with the cascade's enable decision.
 */
function listApplicableClaudePlugins(args: {
  documents: ClaudePluginRegistryDocuments;
  cwd: string;
}): ApplicableClaudePlugin[] {
  // Precedence matches Claude Code: user < project < local.
  const enabledById = new Map<
    string,
    { enabled: boolean; source: ClaudePluginSettingsSource }
  >();
  (
    [
      ["user", args.documents.user],
      ["project", args.documents.project],
      ["local", args.documents.local],
    ] as Array<[ClaudePluginSettingsSource, unknown]>
  ).forEach(([source, document]) => {
    collectEnabledPluginEntries(document).forEach(([id, enabled]) => {
      enabledById.set(id, { enabled, source });
    });
  });

  const installedRecord = asRecord(asRecord(args.documents.installed)?.plugins);
  const installedIds = installedRecord ? Object.keys(installedRecord) : [];
  // Plugins the settings cascade names but the inventory does not (installed
  // through another machine's sync, or a stale registry) are still reported so
  // the id can be re-stated to the SDK and shown in Settings.
  const ids = Array.from(
    new Set([...installedIds, ...enabledById.keys()].map((id) => id.trim())),
  ).filter(Boolean);

  return ids.flatMap((id) => {
    const entries = installedRecord
      ? toInstalledEntries({ value: installedRecord[id], cwd: args.cwd })
      : [];
    // Recorded under a scope that does not apply here — treat as absent.
    if (installedRecord?.[id] && entries.length === 0) {
      return [];
    }
    const decision = enabledById.get(id);
    return [{ id, entries, ...(decision ? { decision } : {}) }];
  });
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
  const paths = claudePluginRegistryPaths({ configDir, cwd });

  const [installed, user, project, local] = await Promise.all([
    readJsonFile(paths.installed),
    readJsonFile(paths.user),
    readJsonFile(paths.project),
    readJsonFile(paths.local),
  ]);

  const plugins = await Promise.all(
    listApplicableClaudePlugins({
      documents: { installed, user, project, local },
      cwd,
    }).map(async ({ id, entries, decision }): Promise<ClaudeInstalledPlugin> => {
      const { name, marketplace } = splitPluginId(id);
      const installPath = entries.find(
        (entry) => entry.installPath,
      )?.installPath;
      const version = entries.find((entry) => entry.version)?.version;
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
    plugins: plugins.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

/**
 * The canonical form of `filePath`, through every symlink. A missing tail is
 * kept as written under its nearest existing ancestor, so a file that is not
 * there yet still resolves; a dangling or looping link resolves to null.
 */
function resolveCanonicalPath(filePath: string): string | null {
  const missing: string[] = [];
  let current = filePath;
  for (;;) {
    try {
      return path.join(realpathSync(current), ...missing.reverse());
    } catch {
      // An entry that exists but did not resolve (a dangling or looping link),
      // or one lstat cannot reach (ENOTDIR, EACCES), is not a usable component.
      try {
        if (lstatSync(current, { throwIfNoEntry: false })) {
          return null;
        }
      } catch {
        return null;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return null;
      }
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Whether a plugin component file stays inside its plugin, as Claude Code
 * requires before it loads one: written inside the root, and resolving through
 * symlinks inside the canonical plugin root (so a symlinked plugin root or
 * `plugins` folder still works). The one
 * exception Claude Code documents is a link to another part of the same
 * marketplace, which applies when the plugin loads in place from inside that
 * marketplace's folder; a cached copy has such links already dereferenced.
 */
function isPluginComponentPath(args: {
  root: string;
  filePath: string;
  marketplaceRoot?: string;
}) {
  if (
    args.filePath === args.root ||
    !isPathInside({ parent: args.root, child: args.filePath })
  ) {
    return false;
  }
  const target = resolveCanonicalPath(args.filePath);
  const root = resolveCanonicalPath(args.root);
  if (!target || !root) {
    return false;
  }
  if (isPathInside({ parent: root, child: target })) {
    return true;
  }
  const marketplace = args.marketplaceRoot
    ? resolveCanonicalPath(args.marketplaceRoot)
    : null;
  return Boolean(
    marketplace &&
      isPathInside({ parent: marketplace, child: root }) &&
      isPathInside({ parent: marketplace, child: target }),
  );
}

/**
 * Adds the MCP config files of one installed plugin: `.mcp.json` at its root,
 * then the manifest when it declares `mcpServers` inline or by path, and each
 * `./*.json` file it names. Bundle (`.mcpb`/`.dxt`) entries carry their server
 * config inside an archive and are not read. A file that escapes the plugin is
 * skipped, as Claude Code skips it.
 */
function addClaudePluginMcpConfigPaths(
  target: Set<string>,
  installPath: string,
  marketplaceRoot?: string,
) {
  const root = path.resolve(installPath);
  const defaultFile = path.join(root, ".mcp.json");
  if (
    existsSync(defaultFile) &&
    isPluginComponentPath({ root, filePath: defaultFile, marketplaceRoot })
  ) {
    target.add(defaultFile);
  }
  const manifestPath = path.join(root, ".claude-plugin", "plugin.json");
  const declared = asRecord(readJsonFileSync(manifestPath))?.mcpServers;
  if (declared === undefined || declared === null) {
    return;
  }
  target.add(manifestPath);
  for (const entry of Array.isArray(declared) ? declared : [declared]) {
    if (
      typeof entry !== "string" ||
      !entry.startsWith("./") ||
      !entry.toLowerCase().endsWith(".json") ||
      // Outside Windows, Claude Code rejects a component path with a backslash.
      (process.platform !== "win32" && entry.includes("\\"))
    ) {
      continue;
    }
    const filePath = path.resolve(root, entry);
    if (isPluginComponentPath({ root, filePath, marketplaceRoot })) {
      // The manifest says what this file is; its name does not.
      noteClaudePluginMcpDocumentPath(filePath);
      target.add(filePath);
    }
  }
}

/** Marketplace name to the folder Claude Code fetched or reads it from. */
function readKnownMarketplaceRoots(configDir: string) {
  const known = asRecord(
    readJsonFileSync(path.join(configDir, "plugins", "known_marketplaces.json")),
  );
  const roots = new Map<string, string>();
  for (const [name, value] of Object.entries(known ?? {})) {
    const location = asRecord(value)?.installLocation;
    if (typeof location === "string" && path.isAbsolute(location)) {
      roots.set(name, location);
    }
  }
  return roots;
}

/**
 * Which CLI-installed plugins a Claude process loads, as MCP env discovery and
 * change tracking need it: the `enabledPlugins` map Stave states in the SDK's
 * flag layer, or `false` when the query loads none. Omitted, Claude's own
 * settings cascade decides.
 */
export type ClaudePluginLoadDecision =
  | Readonly<Record<string, boolean>>
  | false;

/**
 * The plugin decision of one query, from the same inputs that decide its
 * flag-layer `enabledPlugins`. A secondary read-only query and plugin mode
 * `off` load no CLI-installed plugin, so their env carries no plugin's
 * variables; with nothing to state otherwise, Claude's settings decide.
 */
export function resolveClaudePluginLoadDecision(args: {
  enabledPlugins?: Readonly<Record<string, boolean>>;
  mode?: ClaudePluginMode;
  secondaryReadOnly?: boolean;
}): ClaudePluginLoadDecision | undefined {
  if (args.secondaryReadOnly) {
    return false;
  }
  if (args.enabledPlugins && Object.keys(args.enabledPlugins).length > 0) {
    return args.enabledPlugins;
  }
  return args.mode === "off" ? false : undefined;
}

/**
 * MCP config files of every Claude plugin that loads for `cwd`, so the env
 * variables their servers reference are forwarded and an install, update, or
 * enable change counts as an MCP config change.
 *
 * `enabledPlugins` is the query's plugin decision when the caller has it;
 * otherwise Claude's own settings cascade decides. Project and local installs
 * count only inside the repository they were installed for, matching the
 * inventory Stave re-states to the SDK. Synchronous because the provider env
 * builders that consume it are.
 */
export function resolveClaudePluginMcpConfigPaths(args: {
  cwd: string;
  claudeConfigDir?: string;
  enabledPlugins?: ClaudePluginLoadDecision;
}): string[] {
  if (args.enabledPlugins === false) {
    return [];
  }
  const enabledPlugins = args.enabledPlugins;
  const configDir = resolveClaudeConfigDir(args.claudeConfigDir);
  const cwd = path.resolve(args.cwd);
  const paths = claudePluginRegistryPaths({ configDir, cwd });
  const documents: ClaudePluginRegistryDocuments = {
    installed: readJsonFileSync(paths.installed),
    user: readJsonFileSync(paths.user),
    project: readJsonFileSync(paths.project),
    local: readJsonFileSync(paths.local),
  };

  const configPaths = new Set<string>();
  const marketplaceRoots = readKnownMarketplaceRoots(configDir);
  for (const plugin of listApplicableClaudePlugins({ documents, cwd })) {
    const override = enabledPlugins?.[plugin.id];
    const enabled =
      typeof override === "boolean" ? override : plugin.decision?.enabled === true;
    if (!enabled) {
      continue;
    }
    for (const entry of plugin.entries) {
      if (entry.installPath) {
        addClaudePluginMcpConfigPaths(
          configPaths,
          entry.installPath,
          marketplaceRoots.get(splitPluginId(plugin.id).marketplace),
        );
      }
    }
  }
  // Sorted so the refresh fingerprint does not move with registry key order.
  return [...configPaths].sort();
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
