import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type {
  ClaudeCodeMcpRegistrationStatus,
  StaveLocalMcpManifest,
} from "../../src/lib/local-mcp";
import { resolveLoginShellEnvVarValuesAsync } from "../providers/executable-path";
import { getClaudeStateFilePath } from "../providers/mcp-config-refresh";
import {
  STAVE_LOCAL_MCP_SERVER_NAME,
  toClaudeCodeUserMcpServerEntry,
} from "./stave-local-mcp-manifest";

/**
 * Claude Code's user-scope MCP servers live in the `.claude.json` state file
 * inside its config dir, as flat `{ type, url, headers }` records — the same
 * shape `claude mcp add --scope user` writes. `settings.json` `mcpServers` is
 * not read for user-scope servers, so an entry written there is invisible to
 * the CLI even though it parses cleanly.
 */
interface ClaudeCodeUserMcpServerRecord {
  type?: string;
  url?: string;
  headers?: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toStringRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nestedValue]) => (
      typeof nestedValue === "string"
        ? [[key, nestedValue] as const]
        : []
    )),
  );
}

function extractManagedServerRecord(value: unknown): ClaudeCodeUserMcpServerRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    ...(typeof value.type === "string" ? { type: value.type } : {}),
    ...(typeof value.url === "string" ? { url: value.url } : {}),
    ...(isRecord(value.headers) ? { headers: toStringRecord(value.headers) } : {}),
  };
}

function getManagedServerRecord(document: Record<string, unknown>) {
  if (!isRecord(document.mcpServers)) {
    return null;
  }
  return extractManagedServerRecord(document.mcpServers[STAVE_LOCAL_MCP_SERVER_NAME]);
}

function buildExpectedHeaders(manifest: StaveLocalMcpManifest) {
  return {
    Authorization: `Bearer ${manifest.token}`,
  };
}

function matchesManifest(args: {
  current: ClaudeCodeUserMcpServerRecord | null;
  manifest: StaveLocalMcpManifest | null;
}) {
  if (!args.current || !args.manifest) {
    return false;
  }
  const expectedHeaders = buildExpectedHeaders(args.manifest);
  return args.current.type === "http"
    && args.current.url === args.manifest.url
    && args.current.headers?.Authorization === expectedHeaders.Authorization;
}

async function readJsonDocument(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("Claude Code config root must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeJsonDocument(args: {
  filePath: string;
  document: Record<string, unknown>;
}) {
  await fs.mkdir(path.dirname(args.filePath), { recursive: true });
  await fs.writeFile(
    args.filePath,
    `${JSON.stringify(args.document, null, 2)}\n`,
    { mode: 0o600 },
  );
}

/**
 * Resolve Claude Code's explicitly configured config dir the way the CLI does:
 * `CLAUDE_CONFIG_DIR` from the process, then from the login shell. Stave's
 * host process is a GUI app and does not inherit shell exports, so a user who
 * relocated their config dir has done it in the shell. Returns `null` when
 * nothing is set so callers apply the CLI's own defaults, which differ per
 * file: `~/.claude.json` for state, `~/.claude/` for settings.
 */
export async function resolveClaudeCodeConfigDir(): Promise<string | null> {
  const fromProcess = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (fromProcess && path.isAbsolute(fromProcess)) {
    return fromProcess;
  }
  const shellValues = await resolveLoginShellEnvVarValuesAsync({
    keys: ["CLAUDE_CONFIG_DIR"],
  });
  const fromShell = shellValues.CLAUDE_CONFIG_DIR?.trim();
  if (fromShell && path.isAbsolute(fromShell)) {
    return fromShell;
  }
  return null;
}

/** User-scope MCP config file the CLI actually reads. */
export async function getClaudeCodeUserConfigPath() {
  return getClaudeStateFilePath({
    claudeConfigDir: (await resolveClaudeCodeConfigDir()) ?? undefined,
  });
}

/**
 * Files earlier Stave releases wrote the managed entry into. The CLI never
 * read `mcpServers` from these for user-scope servers, so the entry there is
 * dead weight — but it also made the Settings status report success while
 * `claude mcp list` showed nothing. Removing it keeps the two honest.
 */
export async function getLegacyClaudeCodeSettingsPaths() {
  const configDir =
    (await resolveClaudeCodeConfigDir()) ?? path.join(homedir(), ".claude");
  const candidates = [
    path.join(configDir, "settings.json"),
    path.join(homedir(), ".claude", "settings.json"),
  ];
  return Array.from(new Set(candidates));
}

function buildRegistrationDetail(args: {
  autoRegister: boolean;
  installed: boolean;
  matchesCurrentManifest: boolean;
  manifest: StaveLocalMcpManifest | null;
}) {
  if (!args.autoRegister) {
    return "Claude Code auto-registration is off. Stave will not manage the user MCP entry.";
  }
  if (!args.manifest) {
    return "Local MCP is not currently running, so there is no Claude Code MCP entry to install.";
  }
  if (args.installed && args.matchesCurrentManifest) {
    return "Claude Code user MCP config includes the current Stave MCP entry.";
  }
  if (args.installed) {
    return "Claude Code user MCP config includes a stale Stave MCP entry that no longer matches the running server.";
  }
  return "Claude Code user MCP config does not currently include the Stave MCP entry.";
}

export async function getClaudeCodeMcpRegistrationStatus(args: {
  autoRegister: boolean;
  manifest: StaveLocalMcpManifest | null;
  configPath?: string;
}): Promise<ClaudeCodeMcpRegistrationStatus> {
  const configPath = args.configPath ?? await getClaudeCodeUserConfigPath();
  try {
    const document = await readJsonDocument(configPath);
    const current = getManagedServerRecord(document);
    const installed = current !== null;
    const matchesCurrentManifest = matchesManifest({
      current,
      manifest: args.manifest,
    });
    return {
      autoRegister: args.autoRegister,
      configPath,
      installed,
      matchesCurrentManifest,
      transportType: current?.type ?? null,
      url: current?.url ?? null,
      detail: buildRegistrationDetail({
        autoRegister: args.autoRegister,
        installed,
        matchesCurrentManifest,
        manifest: args.manifest,
      }),
    };
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : "Failed to inspect Claude Code MCP registration.";
    return {
      autoRegister: args.autoRegister,
      configPath,
      installed: false,
      matchesCurrentManifest: false,
      transportType: null,
      url: null,
      detail,
      error: detail,
    };
  }
}

/**
 * Drop the managed entry from a legacy settings file. Only the Stave key is
 * touched; every other value — including other servers a user configured
 * there — is preserved byte-for-byte in structure. A missing or unrelated
 * file is left alone entirely.
 */
export async function removeLegacyClaudeCodeSettingsEntry(settingsPath: string) {
  let settings: Record<string, unknown>;
  try {
    settings = await readJsonDocument(settingsPath);
  } catch {
    // Not ours to fix: a malformed settings file must not block registration.
    return false;
  }
  if (
    !isRecord(settings.mcpServers)
    || !(STAVE_LOCAL_MCP_SERVER_NAME in settings.mcpServers)
  ) {
    return false;
  }
  const remainingServers = { ...settings.mcpServers };
  delete remainingServers[STAVE_LOCAL_MCP_SERVER_NAME];
  const nextSettings: Record<string, unknown> = { ...settings };
  if (Object.keys(remainingServers).length > 0) {
    nextSettings.mcpServers = remainingServers;
  } else {
    delete nextSettings.mcpServers;
  }
  await writeJsonDocument({ filePath: settingsPath, document: nextSettings });
  return true;
}

export async function syncClaudeCodeMcpRegistration(args: {
  autoRegister: boolean;
  manifest: StaveLocalMcpManifest | null;
  configPath?: string;
  legacySettingsPaths?: readonly string[];
}) {
  const configPath = args.configPath ?? await getClaudeCodeUserConfigPath();
  const legacySettingsPaths =
    args.legacySettingsPaths ?? await getLegacyClaudeCodeSettingsPaths();
  try {
    const document = await readJsonDocument(configPath);
    const currentMcpServers = isRecord(document.mcpServers)
      ? { ...document.mcpServers }
      : {};

    if (args.autoRegister && args.manifest) {
      currentMcpServers[STAVE_LOCAL_MCP_SERVER_NAME] = toClaudeCodeUserMcpServerEntry(args.manifest);
    } else {
      delete currentMcpServers[STAVE_LOCAL_MCP_SERVER_NAME];
    }

    const nextDocument: Record<string, unknown> = { ...document };
    if (Object.keys(currentMcpServers).length > 0) {
      nextDocument.mcpServers = currentMcpServers;
    } else {
      delete nextDocument.mcpServers;
    }

    await writeJsonDocument({
      filePath: configPath,
      document: nextDocument,
    });

    for (const settingsPath of legacySettingsPaths) {
      if (settingsPath === configPath) {
        continue;
      }
      await removeLegacyClaudeCodeSettingsEntry(settingsPath);
    }
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : "Failed to update Claude Code MCP registration.";
    return {
      autoRegister: args.autoRegister,
      configPath,
      installed: false,
      matchesCurrentManifest: false,
      transportType: null,
      url: null,
      detail,
      error: detail,
    } satisfies ClaudeCodeMcpRegistrationStatus;
  }

  return getClaudeCodeMcpRegistrationStatus({
    autoRegister: args.autoRegister,
    manifest: args.manifest,
    configPath,
  });
}
