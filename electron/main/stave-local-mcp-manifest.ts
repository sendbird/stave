import { promises as fs, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { StaveLocalMcpManifest } from "../../src/lib/local-mcp";

export const STAVE_LOCAL_MCP_SERVER_NAME = "stave-local-mcp";

export function getPrimaryStaveLocalMcpManifestPath() {
  return path.join(homedir(), ".stave", "local-mcp.json");
}

export async function readPrimaryStaveLocalMcpManifest() {
  try {
    const raw = await fs.readFile(getPrimaryStaveLocalMcpManifestPath(), "utf8");
    return JSON.parse(raw) as StaveLocalMcpManifest;
  } catch {
    return null;
  }
}

export function readPrimaryStaveLocalMcpManifestSync() {
  try {
    const raw = readFileSync(getPrimaryStaveLocalMcpManifestPath(), "utf8");
    return JSON.parse(raw) as StaveLocalMcpManifest;
  } catch {
    return null;
  }
}

export function toClaudeSdkMcpServerConfig(manifest: StaveLocalMcpManifest) {
  return {
    type: "http" as const,
    url: manifest.url,
    headers: {
      Authorization: `Bearer ${manifest.token}`,
    },
  };
}

export function toClaudeCodeSettingsMcpServerEntry(manifest: StaveLocalMcpManifest) {
  return {
    transport: toClaudeSdkMcpServerConfig(manifest),
  };
}
