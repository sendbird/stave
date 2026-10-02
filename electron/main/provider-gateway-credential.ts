import { getProviderAccountRegistry } from "../provider-accounts/registry";
import type { GatewayCredential, GatewayCredentials } from "../provider-accounts/gateway-runtime";
import type { ApiConnectionRuntime } from "../../src/lib/providers/api-connections";
import { revealSecret } from "./browser/secret-service";

type Options = { claudeAccountProfileId?: string; codexAccountProfileId?: string; advisorTarget?: { providerId?: string } };
const PROFILE_KEY = { "claude-code": "claudeAccountProfileId", codex: "codexAccountProfileId" } as const;

/**
 * Resolve only in Electron main; the host runs as Node and cannot open
 * safeStorage. A request gets the key of each runtime it may run: its own
 * provider, its advisor's, or both when it names no provider (tooling, CLI).
 */
export async function resolveHostGatewayCredential(params: unknown, resolveSecret = revealSecret): Promise<GatewayCredentials | undefined> {
  const record = params as { providerId?: string; runtimeOptions?: Options;
    claudeAccountProfileId?: string; codexAccountProfileId?: string; input?: { providerId?: string; runtimeHints?: Options } } | null;
  if (!record || typeof record !== "object") return undefined;
  const providerId = record.providerId ?? record.input?.providerId;
  const options = record.runtimeOptions ?? record.input?.runtimeHints;
  const advisorProviderId = options?.advisorTarget?.providerId;
  const credentials: GatewayCredentials = {};
  const tokens = new Map<string, Promise<string | undefined>>();
  for (const runtime of ["claude-code", "codex"] as const satisfies readonly ApiConnectionRuntime[]) {
    if (providerId && providerId !== runtime && advisorProviderId !== runtime) continue;
    const profileId = record.runtimeOptions?.[PROFILE_KEY[runtime]] ?? record.input?.runtimeHints?.[PROFILE_KEY[runtime]] ?? record[PROFILE_KEY[runtime]];
    if (!profileId || profileId === "system-default") continue;
    const credential = await resolveRuntimeCredential(runtime, profileId, tokens, resolveSecret);
    if (credential) credentials[runtime] = credential;
  }
  return Object.keys(credentials).length > 0 ? credentials : undefined;
}

async function resolveRuntimeCredential(
  runtime: ApiConnectionRuntime,
  profileId: string,
  tokens: Map<string, Promise<string | undefined>>,
  resolveSecret: typeof revealSecret,
): Promise<GatewayCredential | undefined> {
  try {
    const gateway = getProviderAccountRegistry().resolveGateway(profileId, runtime);
    if (!gateway) return undefined;
    // One reveal per secret, even when Claude and Codex share the connection.
    const pending = tokens.get(gateway.secretId) ?? resolveSecret(gateway.secretId).then((secret) => secret?.value.trim());
    tokens.set(gateway.secretId, pending);
    const token = await pending;
    if (token && !/[\r\n\0]/.test(token)) return { profileId, token };
  } catch { /* Only a generic missing-credential state crosses the host boundary. */ }
  return { profileId };
}
