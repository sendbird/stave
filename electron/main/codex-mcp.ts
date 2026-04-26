import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type {
  CodexMcpRegistrationStatus,
  StaveLocalMcpManifest,
} from "../../src/lib/local-mcp";

export const CODEX_STAVE_MCP_SERVER_NAME = "stave-local";
export const CODEX_STAVE_MCP_TOKEN_ENV_VAR = "STAVE_LOCAL_MCP_TOKEN";

function extractManagedSection(document: string) {
  const header = `[mcp_servers.${CODEX_STAVE_MCP_SERVER_NAME}]`;
  const lines = document.split("\n");
  let startLine = -1;
  let endLine = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === header) {
      startLine = index;
      break;
    }
  }
  if (startLine < 0) {
    return null;
  }
  for (let index = startLine + 1; index < lines.length; index += 1) {
    if (/^\[[^\n]+\]$/.test(lines[index])) {
      endLine = index;
      break;
    }
  }
  const leadingLines = lines.slice(0, startLine);
  const managedLines = lines.slice(startLine, endLine);
  const start = leadingLines.length > 0
    ? leadingLines.join("\n").length + 1
    : 0;
  const end = start + managedLines.join("\n").length;
  return {
    start,
    end,
    content: managedLines.join("\n"),
  };
}

function upsertManagedSection(args: {
  document: string;
  section: string;
}) {
  const existing = extractManagedSection(args.document);
  if (!existing) {
    const prefix = args.document.trimEnd().length > 0 ? `${args.document.trimEnd()}\n\n` : "";
    return `${prefix}${args.section}\n`;
  }
  return `${args.document.slice(0, existing.start)}${args.section}${args.document.slice(existing.end)}`;
}

function removeManagedSection(document: string) {
  const existing = extractManagedSection(document);
  if (!existing) {
    return document;
  }
  return `${document.slice(0, existing.start)}${document.slice(existing.end)}`.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function buildManagedSection(manifest: StaveLocalMcpManifest) {
  return [
    `[mcp_servers.${CODEX_STAVE_MCP_SERVER_NAME}]`,
    `url = ${JSON.stringify(manifest.url)}`,
    `bearer_token_env_var = ${JSON.stringify(CODEX_STAVE_MCP_TOKEN_ENV_VAR)}`,
  ].join("\n");
}

function parseManagedSection(content: string | null) {
  if (!content) {
    return {
      url: null,
      bearerTokenEnvVar: null,
    };
  }
  const url = content.match(/^url\s*=\s*"([^"]*)"/m)?.[1] ?? null;
  const bearerTokenEnvVar = content.match(/^bearer_token_env_var\s*=\s*"([^"]*)"/m)?.[1] ?? null;
  return {
    url,
    bearerTokenEnvVar,
  };
}

function buildRegistrationDetail(args: {
  autoRegister: boolean;
  installed: boolean;
  matchesCurrentManifest: boolean;
  manifest: StaveLocalMcpManifest | null;
}) {
  if (!args.autoRegister) {
    return "Codex auto-registration is off. Stave will not manage the user Codex MCP entry.";
  }
  if (!args.manifest) {
    return "Local MCP is not currently running, so there is no Codex MCP entry to install.";
  }
  if (args.installed && args.matchesCurrentManifest) {
    return "Codex user config includes the current Stave MCP entry.";
  }
  if (args.installed) {
    return "Codex user config includes a stale Stave MCP entry that no longer matches the running server.";
  }
  return "Codex user config does not currently include the Stave MCP entry.";
}

function matchesManifest(args: {
  parsed: ReturnType<typeof parseManagedSection>;
  manifest: StaveLocalMcpManifest | null;
}) {
  if (!args.manifest) {
    return false;
  }
  return args.parsed.url === args.manifest.url
    && args.parsed.bearerTokenEnvVar === CODEX_STAVE_MCP_TOKEN_ENV_VAR;
}

async function readCodexConfig(configPath: string) {
  try {
    return await fs.readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function writeCodexConfig(args: {
  configPath: string;
  document: string;
}) {
  await fs.mkdir(path.dirname(args.configPath), { recursive: true });
  await fs.writeFile(args.configPath, args.document, { mode: 0o600 });
}

export function getCodexConfigPath() {
  return path.join(homedir(), ".codex", "config.toml");
}

export async function getCodexMcpRegistrationStatus(args: {
  autoRegister: boolean;
  manifest: StaveLocalMcpManifest | null;
  configPath?: string;
}): Promise<CodexMcpRegistrationStatus> {
  const configPath = args.configPath ?? getCodexConfigPath();
  try {
    const document = await readCodexConfig(configPath);
    const existing = extractManagedSection(document);
    const parsed = parseManagedSection(existing?.content ?? null);
    const installed = existing !== null;
    const matchesCurrentManifest = matchesManifest({
      parsed,
      manifest: args.manifest,
    });
    return {
      autoRegister: args.autoRegister,
      configPath,
      installed,
      matchesCurrentManifest,
      url: parsed.url,
      bearerTokenEnvVar: parsed.bearerTokenEnvVar,
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
      : "Failed to inspect Codex MCP registration.";
    return {
      autoRegister: args.autoRegister,
      configPath,
      installed: false,
      matchesCurrentManifest: false,
      url: null,
      bearerTokenEnvVar: null,
      detail,
      error: detail,
    };
  }
}

export async function syncCodexMcpRegistration(args: {
  autoRegister: boolean;
  manifest: StaveLocalMcpManifest | null;
  configPath?: string;
}) {
  const configPath = args.configPath ?? getCodexConfigPath();
  try {
    const currentDocument = await readCodexConfig(configPath);
    const nextDocument = args.autoRegister && args.manifest
      ? upsertManagedSection({
          document: currentDocument,
          section: buildManagedSection(args.manifest),
        })
      : removeManagedSection(currentDocument);
    await writeCodexConfig({
      configPath,
      document: nextDocument.length > 0 ? nextDocument : "",
    });
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : "Failed to update Codex MCP registration.";
    return {
      autoRegister: args.autoRegister,
      configPath,
      installed: false,
      matchesCurrentManifest: false,
      url: null,
      bearerTokenEnvVar: null,
      detail,
      error: detail,
    } satisfies CodexMcpRegistrationStatus;
  }

  return getCodexMcpRegistrationStatus({
    autoRegister: args.autoRegister,
    manifest: args.manifest,
    configPath,
  });
}
