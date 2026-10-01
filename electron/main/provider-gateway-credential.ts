import { getProviderAccountRegistry } from "../provider-accounts/registry";
import type { GatewayCredential } from "../provider-accounts/gateway-runtime";
import { revealSecret } from "./browser/secret-service";

/** Resolve only in Electron main; the host runs as Node and cannot open safeStorage. */
export async function resolveHostGatewayCredential(params: unknown, resolveSecret = revealSecret): Promise<GatewayCredential | undefined> {
  const record = params as { providerId?: string; runtimeOptions?: { claudeAccountProfileId?: string };
    claudeAccountProfileId?: string; input?: { providerId?: string; runtimeHints?: { claudeAccountProfileId?: string } } } | null;
  if (!record || typeof record !== "object") return undefined;
  const providerId = record.providerId ?? record.input?.providerId;
  if (providerId && providerId !== "claude-code") return undefined;
  const profileId = record.runtimeOptions?.claudeAccountProfileId ?? record.input?.runtimeHints?.claudeAccountProfileId ?? record.claudeAccountProfileId;
  if (!profileId || profileId === "system-default") return undefined;
  const gateway = getProviderAccountRegistry().resolveGateway(profileId);
  if (!gateway) return undefined;
  try {
    const secret = await resolveSecret(gateway.secretId);
    const token = secret?.value.trim();
    if (token && !/[\r\n\0]/.test(token)) return { profileId, token };
  } catch { /* Only a generic missing-credential state crosses the host boundary. */ }
  return { profileId };
}
