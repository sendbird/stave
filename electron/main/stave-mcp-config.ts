import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import {
  DEFAULT_LOCAL_MCP_PORT,
  LOCAL_MCP_CONFIG_VERSION,
  type StaveLocalMcpConfig,
} from "../../src/lib/local-mcp";

export { DEFAULT_LOCAL_MCP_PORT, LOCAL_MCP_CONFIG_VERSION };

const MAX_PORT = 65_535;

const DEFAULT_LOCAL_MCP_CONFIG: StaveLocalMcpConfig = {
  enabled: true,
  port: DEFAULT_LOCAL_MCP_PORT,
  token: "",
  claudeCodeAutoRegister: false,
  codexAutoRegister: false,
  browserToolsEnabled: true,
  configVersion: LOCAL_MCP_CONFIG_VERSION,
};

function normalizePort(value: unknown) {
  const numeric = typeof value === "number"
    ? value
    : (typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN);
  if (!Number.isInteger(numeric)) {
    return DEFAULT_LOCAL_MCP_PORT;
  }
  return Math.max(0, Math.min(MAX_PORT, numeric));
}

/**
 * Configs written before {@link LOCAL_MCP_CONFIG_VERSION} 2 stored the old
 * `port: 0` default. Move those onto the stable port once; a user who then
 * re-selects automatic port assignment keeps it, because the version has
 * already been recorded.
 */
export function migrateLocalMcpConfigPort(args: {
  port: number;
  configVersion: unknown;
}) {
  const storedVersion =
    typeof args.configVersion === "number" ? args.configVersion : 1;
  if (storedVersion >= LOCAL_MCP_CONFIG_VERSION) {
    return args.port;
  }
  return args.port === 0 ? DEFAULT_LOCAL_MCP_PORT : args.port;
}

function normalizeToken(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, 4096);
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function buildNormalizedConfig(input?: Partial<StaveLocalMcpConfig> | null): StaveLocalMcpConfig {
  const candidate = input ?? {};
  return {
    enabled: typeof candidate.enabled === "boolean"
      ? candidate.enabled
      : DEFAULT_LOCAL_MCP_CONFIG.enabled,
    port: migrateLocalMcpConfigPort({
      port: normalizePort(candidate.port),
      configVersion: candidate.configVersion,
    }),
    configVersion: LOCAL_MCP_CONFIG_VERSION,
    token: normalizeToken(candidate.token) || randomUUID(),
    claudeCodeAutoRegister: normalizeBoolean(
      candidate.claudeCodeAutoRegister,
      DEFAULT_LOCAL_MCP_CONFIG.claudeCodeAutoRegister,
    ),
    codexAutoRegister: normalizeBoolean(
      candidate.codexAutoRegister,
      DEFAULT_LOCAL_MCP_CONFIG.codexAutoRegister,
    ),
    browserToolsEnabled: normalizeBoolean(
      candidate.browserToolsEnabled,
      DEFAULT_LOCAL_MCP_CONFIG.browserToolsEnabled,
    ),
  };
}

export function getStaveLocalMcpConfigPath() {
  return path.join(app.getPath("userData"), "stave-local-mcp-settings.json");
}

async function writeConfig(config: StaveLocalMcpConfig) {
  const configPath = getStaveLocalMcpConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(
    configPath,
    `${JSON.stringify(config, null, 2)}\n`,
    { mode: 0o600 },
  );
}

export async function readStaveLocalMcpConfig() {
  const configPath = getStaveLocalMcpConfigPath();
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StaveLocalMcpConfig>;
    const normalized = buildNormalizedConfig(parsed);
    if (
      normalized.enabled !== parsed.enabled
      || normalized.port !== parsed.port
      || normalized.token !== parsed.token
      || normalized.claudeCodeAutoRegister !== parsed.claudeCodeAutoRegister
      || normalized.codexAutoRegister !== parsed.codexAutoRegister
      || normalized.browserToolsEnabled !== parsed.browserToolsEnabled
      || normalized.configVersion !== parsed.configVersion
    ) {
      await writeConfig(normalized);
    }
    return normalized;
  } catch {
    const normalized = buildNormalizedConfig(DEFAULT_LOCAL_MCP_CONFIG);
    await writeConfig(normalized);
    return normalized;
  }
}

export async function updateStaveLocalMcpConfig(patch: Partial<StaveLocalMcpConfig>) {
  const current = await readStaveLocalMcpConfig();
  const next = buildNormalizedConfig({
    ...current,
    ...patch,
  });
  await writeConfig(next);
  return next;
}
