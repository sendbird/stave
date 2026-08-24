import { promises as fs, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { StaveLocalMcpManifest } from "../../src/lib/local-mcp";
import { HOST_SERVICE_ADVISOR_CONSULT_TIMEOUT_MS } from "./host-service-request-timeouts";

export const STAVE_LOCAL_MCP_SERVER_NAME = "stave-local-mcp";

/**
 * Per-tool-call deadline advertised to MCP clients for this server.
 *
 * Supplied explicitly because the client default is both short and *hard*: the
 * Claude Agent SDK falls back to a 60s wall clock per tool call that progress
 * notifications do not extend. Omitting this silently capped every Stave tool
 * at a minute — an Advisor consult, whose own deadline runs from 2 to 10
 * minutes by effort tier, would finish and bill normally while the client had
 * already walked away, and its advice was discarded with no error anywhere.
 *
 * Sits one minute above the host-service backstop so the ladder stays ordered
 * innermost-first: advisor deadline < host-service backstop < this. That way a
 * slow consult surfaces Stave's own `advisor-timeout` explanation instead of a
 * transport abort the primary cannot interpret. Note the SDK also clamps this
 * *up* to 60s, so it can never be configured below the old effective value.
 */
export const STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS =
  HOST_SERVICE_ADVISOR_CONSULT_TIMEOUT_MS + 60_000;
export const STAVE_UNATTENDED_AUTOMATION_QUERY_PARAM =
  "staveUnattendedAutomation";

export function withUnattendedAutomationAuthorization(args: {
  url: string;
  authorizationToken?: string;
}) {
  const authorizationToken = args.authorizationToken?.trim();
  if (!authorizationToken) {
    return args.url;
  }
  const url = new URL(args.url);
  url.searchParams.set(
    STAVE_UNATTENDED_AUTOMATION_QUERY_PARAM,
    authorizationToken,
  );
  return url.toString();
}

export function getPrimaryStaveLocalMcpManifestPath() {
  return path.join(homedir(), ".stave", "local-mcp.json");
}

export async function readPrimaryStaveLocalMcpManifest() {
  try {
    const raw = await fs.readFile(
      getPrimaryStaveLocalMcpManifestPath(),
      "utf8",
    );
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

/** The connection itself, without any client-side policy attached. */
function toStaveLocalMcpTransport(
  manifest: StaveLocalMcpManifest,
  options?: { unattendedAutomationAuthorizationToken?: string },
) {
  return {
    type: "http" as const,
    url: withUnattendedAutomationAuthorization({
      url: manifest.url,
      authorizationToken: options?.unattendedAutomationAuthorizationToken,
    }),
    headers: {
      Authorization: `Bearer ${manifest.token}`,
    },
  };
}

export function toClaudeSdkMcpServerConfig(
  manifest: StaveLocalMcpManifest,
  options?: { unattendedAutomationAuthorizationToken?: string },
) {
  return {
    ...toStaveLocalMcpTransport(manifest, options),
    timeout: STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS,
  };
}

/**
 * Entry for a user's Claude Code settings file.
 *
 * Deliberately carries no `timeout`. The field is confirmed only for the SDK's
 * `mcpServers` option, where the client reads it directly off the server config
 * object. This shape nests the connection under `transport`, and whether the
 * CLI reads a per-server timeout from inside or beside that wrapper is
 * unverified — writing it at the wrong level would either be silently ignored
 * or risk the CLI rejecting a settings file Stave does not own, which is a
 * worse outcome than the deadline it would have fixed.
 */
export function toClaudeCodeSettingsMcpServerEntry(
  manifest: StaveLocalMcpManifest,
) {
  return {
    transport: toStaveLocalMcpTransport(manifest),
  };
}
