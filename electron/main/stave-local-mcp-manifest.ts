import {
  turnGrantHeaders,
  ADVISOR_GRANT_ENV,
  MISSION_GRANT_ENV,
  PROJECT_GRANT_ENV,
  CALLER_GRANT_ENV,
  WORKER_GRANT_ENV,
  type StaveTurnGrants,
} from "../providers/stave-turn-grants";
import { existsSync, promises as fs, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * Env var that names the Stave main process owning this process tree.
 *
 * The main process stamps its own pid here at startup (overwriting any value
 * inherited from a parent Stave, e.g. a dev build launched from a Stave
 * terminal), so the host service, provider runtimes, ACP stdio proxies and
 * terminal CLIs all resolve the Local MCP endpoint of the instance that
 * spawned them instead of whichever instance last wrote the shared file.
 */
export const STAVE_LOCAL_MCP_OWNER_PID_ENV = "STAVE_LOCAL_MCP_OWNER_PID";

/**
 * Shared, well-known manifest for clients outside any Stave process tree
 * (Claude Code / Codex CLIs launched from an external terminal, hand-written
 * stdio proxy configs). Several Stave instances can run at once, so this file
 * is last-writer-wins and may name an instance that has since exited — never
 * trust it without {@link isLiveStaveLocalMcpManifest}.
 */
export function getPrimaryStaveLocalMcpManifestPath() {
  return path.join(homedir(), ".stave", "local-mcp.json");
}

export function getStaveLocalMcpInstanceManifestRoot() {
  return path.join(homedir(), ".stave", "local-mcp-instances");
}

/**
 * Per-instance manifest. Only the owning instance writes or deletes it, so it
 * cannot be clobbered by another Stave running side by side.
 */
export function getStaveLocalMcpInstanceManifestPath(
  pid: number,
  instanceRoot = getStaveLocalMcpInstanceManifestRoot(),
) {
  return path.join(instanceRoot, String(pid), "local-mcp.json");
}

export function resolveStaveLocalMcpOwnerPid(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const raw = env[STAVE_LOCAL_MCP_OWNER_PID_ENV]?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  const pid = Number(raw);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

/**
 * The manifest this process should connect through: its owning instance's
 * file when running inside a Stave process tree, otherwise the shared file.
 */
export interface StaveLocalMcpManifestLocations {
  primaryPath?: string;
  instanceRoot?: string;
}

export function resolveStaveLocalMcpManifestPath(
  env: NodeJS.ProcessEnv = process.env,
  locations?: StaveLocalMcpManifestLocations,
) {
  const ownerPid = resolveStaveLocalMcpOwnerPid(env);
  if (ownerPid === null) {
    return locations?.primaryPath ?? getPrimaryStaveLocalMcpManifestPath();
  }
  return getStaveLocalMcpInstanceManifestPath(ownerPid, locations?.instanceRoot);
}

export function isProcessAlive(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the pid exists but belongs to another user — still alive.
    return (error as NodeJS.ErrnoException | undefined)?.code === "EPERM";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isStaveLocalMcpManifest(
  value: unknown,
): value is StaveLocalMcpManifest {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    value.url.trim().length > 0 &&
    typeof value.token === "string" &&
    value.token.trim().length > 0 &&
    typeof value.pid === "number"
  );
}

/**
 * A manifest is only usable while the process that wrote it is running. A
 * crashed or killed instance cannot clean up after itself, and its dead port
 * would otherwise surface as `ECONNREFUSED` in every provider session.
 */
export function isLiveStaveLocalMcpManifest(
  value: unknown,
  options?: { isAlive?: (pid: number) => boolean },
): value is StaveLocalMcpManifest {
  return (
    isStaveLocalMcpManifest(value) &&
    (options?.isAlive ?? isProcessAlive)(value.pid)
  );
}

export interface ReadStaveLocalMcpManifestOptions {
  env?: NodeJS.ProcessEnv;
  isAlive?: (pid: number) => boolean;
  locations?: StaveLocalMcpManifestLocations;
}

function parseLiveManifest(args: {
  raw: string;
  ownerPid: number | null;
  isAlive?: (pid: number) => boolean;
}): StaveLocalMcpManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.raw);
  } catch {
    return null;
  }
  if (!isLiveStaveLocalMcpManifest(parsed, { isAlive: args.isAlive })) {
    return null;
  }
  if (args.ownerPid !== null && parsed.pid !== args.ownerPid) {
    return null;
  }
  return parsed;
}

/**
 * Resolve the Local MCP endpoint for this process. Every in-app consumer
 * (provider runtimes, CLI env builders, mission reachability) must go through
 * this — reading the shared file directly reintroduces the cross-instance and
 * dead-endpoint failures this resolver exists to prevent.
 */
export async function readStaveLocalMcpManifest(
  options?: ReadStaveLocalMcpManifestOptions,
) {
  const env = options?.env ?? process.env;
  try {
    const raw = await fs.readFile(resolveStaveLocalMcpManifestPath(env, options?.locations), "utf8");
    return parseLiveManifest({
      raw,
      ownerPid: resolveStaveLocalMcpOwnerPid(env),
      isAlive: options?.isAlive,
    });
  } catch {
    return null;
  }
}

export function readStaveLocalMcpManifestSync(
  options?: ReadStaveLocalMcpManifestOptions,
) {
  const env = options?.env ?? process.env;
  try {
    const raw = readFileSync(resolveStaveLocalMcpManifestPath(env, options?.locations), "utf8");
    return parseLiveManifest({
      raw,
      ownerPid: resolveStaveLocalMcpOwnerPid(env),
      isAlive: options?.isAlive,
    });
  } catch {
    return null;
  }
}

export const STAVE_MCP_STDIO_PROXY_SCRIPT_NAME = "stave-mcp-stdio-proxy.mjs";

/**
 * Locate the compiled stdio proxy next to the main bundle that is asking.
 *
 * Derived from the bundle's own location, not `app.getAppPath()`: how the app
 * is launched changes the app path (a dev build started on `out/main` reported
 * `out/main/out/main/...`), and a proxy path that does not exist silently
 * removed every Stave tool from stdio-only runtimes such as Cursor and Kiro.
 * Packaged builds execute the copy unpacked beside the ASAR archive, since
 * `node` cannot run a script from inside it.
 */
export function resolveStaveMcpStdioProxyScriptPath(args: {
  moduleUrl: string;
  pathExists?: (filePath: string) => boolean;
}) {
  const pathExists = args.pathExists ?? existsSync;
  const moduleDir = path
    .dirname(fileURLToPath(args.moduleUrl))
    .replace(/\.asar(?=$|[\\/])/, ".asar.unpacked");
  const candidates = [
    path.join(moduleDir, STAVE_MCP_STDIO_PROXY_SCRIPT_NAME),
    // Shared chunks are emitted one level below the entry bundles.
    path.normalize(path.join(moduleDir, "..", STAVE_MCP_STDIO_PROXY_SCRIPT_NAME)),
  ];
  return candidates.find((candidate) => pathExists(candidate)) ?? candidates[0]!;
}

/** The connection itself, without any client-side policy attached. */
function toStaveLocalMcpTransport(
  manifest: StaveLocalMcpManifest,
  options?: {
    unattendedAutomationAuthorizationToken?: string;
    turnGrants?: StaveTurnGrants;
  },
) {
  return {
    type: "http" as const,
    url: withUnattendedAutomationAuthorization({
      url: manifest.url,
      authorizationToken: options?.unattendedAutomationAuthorizationToken,
    }),
    headers: {
      Authorization: `Bearer ${manifest.token}`,
      // Turn-scoped grants only. Persistent Claude Code settings must not
      // receive empty keys that look like live Worker/Advisor/mission capability.
      ...(options?.turnGrants
        ? turnGrantHeaders(options.turnGrants)
        : {}),
    },
  };
}

export function toClaudeSdkMcpServerConfig(
  manifest: StaveLocalMcpManifest,
  options?: {
    unattendedAutomationAuthorizationToken?: string;
    turnGrants?: StaveTurnGrants;
  },
) {
  return {
    ...toStaveLocalMcpTransport(manifest, options),
    timeout: STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS,
  };
}

/**
 * ACP v1 stdio server descriptor. Stdio is mandatory for every ACP agent, so
 * this is the portable path for turn-scoped Stave tools even when an agent does
 * not advertise the optional HTTP MCP transport.
 */
export function toAcpStdioMcpServerConfig(
  manifest: StaveLocalMcpManifest,
  options?: {
    allowedToolNames?: readonly string[];
    turnGrants?: StaveTurnGrants;
  },
) {
  const allowedToolNames = Array.from(
    new Set(
      (options?.allowedToolNames ?? [])
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  );
  return {
    name: STAVE_LOCAL_MCP_SERVER_NAME,
    command: process.execPath,
    args: [manifest.stdioProxyScript],
    env: [
      { name: "ELECTRON_RUN_AS_NODE", value: "1" },
      // Pin the proxy to the instance that issued this descriptor, so it never
      // follows the shared manifest to another (or a dead) Stave instance.
      { name: STAVE_LOCAL_MCP_OWNER_PID_ENV, value: String(manifest.pid) },
      {
        name: ADVISOR_GRANT_ENV,
        value: options?.turnGrants?.consultKey ?? "",
      },
      {
        name: WORKER_GRANT_ENV,
        value: options?.turnGrants?.workerKey ?? "",
      },
      {
        name: MISSION_GRANT_ENV,
        value: options?.turnGrants?.missionKey ?? "",
      },
      {
        name: PROJECT_GRANT_ENV,
        value: options?.turnGrants?.projectKey ?? "",
      },
      {
        name: CALLER_GRANT_ENV,
        value: options?.turnGrants?.callerKey ?? "",
      },
      ...(allowedToolNames.length > 0
        ? [
            {
              name: "STAVE_MCP_ALLOWED_TOOLS",
              value: allowedToolNames.join(","),
            },
          ]
        : []),
    ],
  };
}

export function isAcpStaveLocalMcpServer(server: unknown): boolean {
  if (!server || typeof server !== "object" || !("name" in server)) {
    return false;
  }
  const name = (server as { name: unknown }).name;
  return (
    typeof name === "string" &&
    name.trim().toLowerCase() === STAVE_LOCAL_MCP_SERVER_NAME
  );
}

export async function resolveAcpStaveLocalMcpServers(args?: {
  allowedToolNames?: readonly string[];
  turnGrants?: StaveTurnGrants;
}) {
  const manifest = await readStaveLocalMcpManifest();
  const stdioProxyScript = manifest?.stdioProxyScript?.trim();
  if (!manifest || !stdioProxyScript) {
    return [];
  }
  if (!existsSync(stdioProxyScript)) {
    // A descriptor for a missing script makes the agent fail to start the
    // server with no Stave-side signal; report Local MCP as unavailable.
    console.warn("[stave-local-mcp] stdio proxy script is missing; skipping ACP Local MCP", {
      stdioProxyScript,
    });
    return [];
  }
  return [
    toAcpStdioMcpServerConfig(manifest, {
      allowedToolNames: args?.allowedToolNames,
      turnGrants: args?.turnGrants,
    }),
  ];
}

/**
 * User-scope entry for Claude Code's `.claude.json` state file — the same flat
 * `{ type, url, headers }` record `claude mcp add --scope user` writes. The
 * CLI does not read a nested `transport` wrapper, and it does not read
 * `mcpServers` from `settings.json` for user-scope servers at all; either
 * mistake leaves the server absent from `claude mcp list`.
 *
 * Deliberately carries no `timeout`. The field is confirmed only for the SDK's
 * `mcpServers` option; whether the CLI honors it from persisted user config is
 * unverified, and this is a file Stave does not own.
 */
export function toClaudeCodeUserMcpServerEntry(
  manifest: StaveLocalMcpManifest,
) {
  return toStaveLocalMcpTransport(manifest);
}
