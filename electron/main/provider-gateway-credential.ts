import { getProviderAccountRegistry } from "../provider-accounts/registry";
import type { GatewayCredential } from "../provider-accounts/gateway-runtime";
import { revealSecret } from "./browser/secret-service";

/** Resolve only in Electron main; the host runs as Node and cannot open safeStorage. */
export async function resolveHostGatewayCredential(params: unknown, resolveSecret = revealSecret): Promise<GatewayCredential | undefined> {
  type Options = { claudeAccountProfileId?: string; advisorTarget?: { providerId?: string } };
  const record = params as { providerId?: string; runtimeOptions?: Options;
    claudeAccountProfileId?: string; input?: { providerId?: string; runtimeHints?: Options } } | null;
  if (!record || typeof record !== "object") return undefined;
  const providerId = record.providerId ?? record.input?.providerId;
  const advisorProviderId = (record.runtimeOptions ?? record.input?.runtimeHints)?.advisorTarget?.providerId;
  if (providerId && providerId !== "claude-code" && advisorProviderId !== "claude-code") return undefined;
  const profileId = record.runtimeOptions?.claudeAccountProfileId ?? record.input?.runtimeHints?.claudeAccountProfileId ?? record.claudeAccountProfileId;
  if (!profileId || profileId === "system-default") return undefined;
  try {
    const gateway = getProviderAccountRegistry().resolveGateway(profileId);
    if (!gateway) return undefined;
    const secret = await resolveSecret(gateway.secretId);
    const token = secret?.value.trim();
    if (token && !/[\r\n\0]/.test(token)) return { profileId, token };
  } catch { /* Only a generic missing-credential state crosses the host boundary. */ }
  return { profileId };
}
