import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type {
  ClaudeCodeMcpRegistrationStatus,
  StaveLocalMcpManifest,
} from "../../src/lib/local-mcp";
import {
  STAVE_LOCAL_MCP_SERVER_NAME,
  toClaudeCodeSettingsMcpServerEntry,
} from "./stave-local-mcp-manifest";

interface ClaudeCodeSettingsTransportRecord {
  type?: string;
  url?: string;
  headers?: Record<string, string>;
}

interface ClaudeCodeSettingsMcpServerRecord {
  transport?: ClaudeCodeSettingsTransportRecord;
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

function extractManagedServerRecord(value: unknown): ClaudeCodeSettingsMcpServerRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const transport = isRecord(value.transport) ? value.transport : null;
  return {
    ...(transport ? {
      transport: {
        ...(typeof transport.type === "string" ? { type: transport.type } : {}),
        ...(typeof transport.url === "string" ? { url: transport.url } : {}),
        ...(isRecord(transport.headers) ? { headers: toStringRecord(transport.headers) } : {}),
      },
    } : {}),
  };
}

function getManagedServerRecord(settings: Record<string, unknown>) {
  if (!isRecord(settings.mcpServers)) {
    return null;
  }
  return extractManagedServerRecord(settings.mcpServers[STAVE_LOCAL_MCP_SERVER_NAME]);
}

function buildExpectedHeaders(manifest: StaveLocalMcpManifest) {
  return {
    Authorization: `Bearer ${manifest.token}`,
  };
}

function matchesManifest(args: {
  current: ClaudeCodeSettingsMcpServerRecord | null;
  manifest: StaveLocalMcpManifest | null;
}) {
  if (!args.current || !args.manifest) {
    return false;
  }
  const transport = args.current.transport;
  if (!transport) {
    return false;
  }
  const expectedHeaders = buildExpectedHeaders(args.manifest);
  return transport.type === "http"
    && transport.url === args.manifest.url
    && transport.headers?.Authorization === expectedHeaders.Authorization;
}

async function readSettingsDocument(settingsPath: string) {
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("Claude Code settings root must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeSettingsDocument(args: {
  settingsPath: string;
  settings: Record<string, unknown>;
}) {
  await fs.mkdir(path.dirname(args.settingsPath), { recursive: true });
  await fs.writeFile(
    args.settingsPath,
    `${JSON.stringify(args.settings, null, 2)}\n`,
    { mode: 0o600 },
  );
}

export function getClaudeCodeSettingsPath() {
  return path.join(homedir(), ".claude", "settings.json");
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
    return "Claude Code user settings include the current Stave MCP entry.";
  }
  if (args.installed) {
    return "Claude Code user settings include a stale Stave MCP entry that no longer matches the running server.";
  }
  return "Claude Code user settings do not currently include the Stave MCP entry.";
}

export async function getClaudeCodeMcpRegistrationStatus(args: {
  autoRegister: boolean;
  manifest: StaveLocalMcpManifest | null;
  settingsPath?: string;
}): Promise<ClaudeCodeMcpRegistrationStatus> {
  const settingsPath = args.settingsPath ?? getClaudeCodeSettingsPath();
  try {
    const settings = await readSettingsDocument(settingsPath);
    const current = getManagedServerRecord(settings);
    const installed = current !== null;
    const matchesCurrentManifest = matchesManifest({
      current,
      manifest: args.manifest,
    });
    return {
      autoRegister: args.autoRegister,
      configPath: settingsPath,
      installed,
      matchesCurrentManifest,
      transportType: current?.transport?.type ?? null,
      url: current?.transport?.url ?? null,
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
      configPath: settingsPath,
      installed: false,
      matchesCurrentManifest: false,
      transportType: null,
      url: null,
      detail,
      error: detail,
    };
  }
}

export async function syncClaudeCodeMcpRegistration(args: {
  autoRegister: boolean;
  manifest: StaveLocalMcpManifest | null;
  settingsPath?: string;
}) {
  const settingsPath = args.settingsPath ?? getClaudeCodeSettingsPath();
  try {
    const settings = await readSettingsDocument(settingsPath);
    const currentMcpServers = isRecord(settings.mcpServers)
      ? { ...settings.mcpServers }
      : {};

    if (args.autoRegister && args.manifest) {
      currentMcpServers[STAVE_LOCAL_MCP_SERVER_NAME] = toClaudeCodeSettingsMcpServerEntry(args.manifest);
    } else {
      delete currentMcpServers[STAVE_LOCAL_MCP_SERVER_NAME];
    }

    const nextSettings: Record<string, unknown> = { ...settings };
    if (Object.keys(currentMcpServers).length > 0) {
      nextSettings.mcpServers = currentMcpServers;
    } else {
      delete nextSettings.mcpServers;
    }

    await writeSettingsDocument({
      settingsPath,
      settings: nextSettings,
    });
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : "Failed to update Claude Code MCP registration.";
    return {
      autoRegister: args.autoRegister,
      configPath: settingsPath,
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
    settingsPath,
  });
}
