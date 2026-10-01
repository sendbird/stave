import type { ToolingStatusEntry } from "../../src/lib/tooling-status";
import type { ToolingAuthState } from "../../src/lib/tooling-status";
import type { ProviderRuntimeOptions } from "../../src/lib/providers/provider.types";
import {
  providerConfigurationKey,
  toolingAllowsProviderReads,
  type OptionalProviderId,
} from "../../src/lib/providers/provider-readiness";
import {
  buildCursorAgentEnv,
  resolveCursorAgentExecutablePath,
} from "./cursor-cli-env";
import { buildKiroCliEnv, resolveKiroExecutablePath } from "./kiro-cli-env";
import { runExecutableProbe } from "./runtime-shared";

const STATUS_TTL_MS = 60_000;
const statuses = new Map<
  string,
  { tool: ToolingStatusEntry; generation: number }
>();
const pending = new Map<string, Promise<ToolingStatusEntry>>();

function statusKey(id: OptionalProviderId, options?: ProviderRuntimeOptions) {
  return JSON.stringify([id, providerConfigurationKey(id, options)]);
}

/** No process spawn: background usage and catalog reads consume discovery. */
export function cachedOptionalProviderStatus(
  id: OptionalProviderId,
  options?: ProviderRuntimeOptions,
) {
  const entry = statuses.get(statusKey(id, options));
  return entry &&
    Date.now() - Date.parse(entry.tool.checkedAt!) <= STATUS_TTL_MS + 5_000
    ? entry
    : undefined;
}

export function optionalProviderReadKey(
  id: OptionalProviderId,
  options?: ProviderRuntimeOptions,
) {
  const entry = cachedOptionalProviderStatus(id, options);
  return toolingAllowsProviderReads(entry?.tool)
    ? `${statusKey(id, options)}:${entry!.generation}`
    : null;
}

export async function inspectOptionalProviderTooling(args: {
  providerId: OptionalProviderId;
  cursorBinaryPath?: string;
  kiroBinaryPath?: string;
  force?: boolean;
}): Promise<ToolingStatusEntry> {
  const id = args.providerId;
  const key = statusKey(id, args);
  const cached = statuses.get(key);
  if (
    !args.force &&
    cached &&
    Date.now() - Date.parse(cached.tool.checkedAt!) < STATUS_TTL_MS
  )
    return cached.tool;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const request = probeOptionalProvider(args)
    .then((tool) => {
      const previous = statuses.get(key);
      const changed =
        previous?.tool.state !== tool.state ||
        previous?.tool.authState !== tool.authState ||
        previous?.tool.available !== tool.available;
      statuses.set(key, {
        tool,
        generation: (previous?.generation ?? 0) + (changed ? 1 : 0),
      });
      return tool;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

async function probeOptionalProvider(args: {
  providerId: OptionalProviderId;
  cursorBinaryPath?: string;
  kiroBinaryPath?: string;
}): Promise<ToolingStatusEntry> {
  const cursor = args.providerId === "cursor";
  const label = cursor ? "Cursor Agent CLI" : "Kiro CLI";
  const login = cursor ? "agent login" : "kiro-cli login";
  const executablePath =
    (cursor
      ? resolveCursorAgentExecutablePath({
          explicitPath: args.cursorBinaryPath,
        })
      : resolveKiroExecutablePath({ explicitPath: args.kiroBinaryPath })) ||
    null;
  const base = {
    id: args.providerId,
    label,
    executablePath,
    checkedAt: new Date().toISOString(),
  };
  if (!executablePath)
    return {
      ...base,
      state: "error",
      available: false,
      version: null,
      summary: `${label} is unavailable.`,
      detail: `Install ${label} or configure its binary path.`,
      authState: "unauthenticated",
      authDetail: `Install ${label} and run \`${login}\`.`,
    };
  const env = cursor
    ? buildCursorAgentEnv({ executablePath })
    : buildKiroCliEnv({ executablePath });
  const [versionProbe, acpProbe, authProbe] = await Promise.all([
    runExecutableProbe({ executablePath, commandArgs: ["--version"], env }),
    runExecutableProbe({ executablePath, commandArgs: ["acp", "--help"], env }),
    runExecutableProbe({
      executablePath,
      commandArgs: [cursor ? "status" : "whoami"],
      env,
    }),
  ]);
  const available = versionProbe.status === 0 && acpProbe.status === 0;
  const transient = [versionProbe, acpProbe].some(
    (probe) => probe.status === null || probe.timedOut,
  );
  const { authState, authDetail } = (
    cursor ? parseCursorAuthState : parseKiroAuthState
  )({
    ok: authProbe.status === 0 && !authProbe.timedOut,
    stdout: authProbe.stdout,
    stderr: authProbe.stderr,
  });
  const version =
    versionProbe.text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? null;
  const state = transient
    ? "unknown"
    : !available
      ? "error"
      : authState === "authenticated"
        ? "ready"
        : "warning";
  const summary =
    state === "unknown"
      ? `${label} status could not be verified.`
      : !available
        ? `${label} does not provide a working ACP runtime.`
        : authState === "authenticated"
          ? `${label} is ready.`
          : authState === "unauthenticated"
            ? `${label} is installed, but login is required.`
            : `${label} authentication could not be verified.`;
  return {
    ...base,
    checkedAt: new Date().toISOString(),
    state,
    available,
    version,
    summary,
    authState,
    authDetail,
    // Auth output can contain account identity. Only normalized diagnostics cross IPC.
    detail: [`Resolved path: ${executablePath}`, summary, authDetail]
      .filter(Boolean)
      .join("\n"),
  };
}

export function parseCursorAuthState(args: {
  ok: boolean;
  stdout: string;
  stderr: string;
}): { authState: ToolingAuthState; authDetail: string | null } {
  const combined = `${args.stderr}\n${args.stdout}`.toLowerCase();
  if (
    combined.includes("not logged in") ||
    combined.includes("agent login") ||
    combined.includes("authentication failed") ||
    combined.includes("unauthorized")
  ) {
    return {
      authState: "unauthenticated",
      authDetail: "Cursor Agent CLI login is required.",
    };
  }
  if (args.ok && combined.includes("logged in")) {
    return {
      authState: "authenticated",
      authDetail: "Cursor Agent CLI is authenticated.",
    };
  }
  return {
    authState: "unknown",
    authDetail: "Unable to determine Cursor Agent CLI authentication state.",
  };
}

export function parseKiroAuthState(args: {
  ok: boolean;
  stdout: string;
  stderr: string;
}): { authState: ToolingAuthState; authDetail: string | null } {
  const combined = `${args.stderr}\n${args.stdout}`.toLowerCase();
  if (
    combined.includes("not logged in") ||
    combined.includes("kiro-cli login") ||
    combined.includes("authentication failed") ||
    combined.includes("unauthorized")
  ) {
    return {
      authState: "unauthenticated",
      authDetail: "Kiro CLI login is required.",
    };
  }
  if (args.ok) {
    return {
      authState: "authenticated",
      authDetail: "Kiro CLI is authenticated.",
    };
  }
  return {
    authState: "unknown",
    authDetail: "Unable to determine Kiro CLI authentication state.",
  };
}
